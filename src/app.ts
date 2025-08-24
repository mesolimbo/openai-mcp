import OpenAI from 'openai';
import { loadConfig } from './config';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export interface McpRequest {
  jsonrpc?: string;
  id?: string | number;
  method: string;
  params?: any;
}

export interface McpResponse {
  jsonrpc?: string;
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
  tools?: any[];  // Legacy support
  content?: Array<{ type: string; text: string }>;  // Legacy support
  isError?: boolean;  // Legacy support
}

let openai: OpenAI;
let initialized = false;
let secretsClient: SecretsManagerClient;

function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });
  }
  return secretsClient;
}

async function getOpenAIApiKeyFromSecrets(): Promise<string> {
  const secretName = process.env.OPENAI_API_KEY_SECRET_NAME || 'openai-mcp-api-key';
  
  try {
    const client = getSecretsClient();
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }
    
    // Parse JSON and extract API key
    const secretData = JSON.parse(response.SecretString);
    if (!secretData.apiKey || typeof secretData.apiKey !== 'string') {
      throw new Error('API key not found in secret');
    }
    
    return secretData.apiKey.trim();
  } catch (error) {
    console.error('Failed to retrieve OpenAI API key from Secrets Manager:', error);
    throw new Error('OpenAI API key configuration error');
  }
}

export async function initializeApp(): Promise<void> {
  if (initialized) return;

  try {
    // Get API key from Secrets Manager in Lambda, config file locally
    let apiKey: string;
    if (process.env.OPENAI_API_KEY_SECRET_NAME) {
      // Running in Lambda - get from Secrets Manager
      apiKey = await getOpenAIApiKeyFromSecrets();
    } else {
      // Running locally - get from config file
      const config = loadConfig();
      apiKey = config.openaiApiKey;
    }

    openai = new OpenAI({
      apiKey: apiKey,
      timeout: 14 * 60 * 1000, // 14 minutes for long GPT-5 calls
      maxRetries: 1,
    });
    initialized = true;
  } catch (error) {
    throw new Error(`Failed to initialize app: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function handleMcpRequest(request: McpRequest): Promise<McpResponse> {
  if (!initialized) {
    throw new Error('App not initialized. Call initializeApp() first.');
  }

  // Handle MCP initialization
  if (request.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          logging: {},
          prompts: {},
          resources: {}
        },
        serverInfo: {
          name: 'OpenAI MCP Server',
          version: '1.0.0'
        }
      }
    };
  }

  // Handle initialization notification
  if (request.method === 'notifications/initialized') {
    if (request.id === undefined) {
      // This is a notification, no response needed
      return {};
    }
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {}
    };
  }

  // Handle ping
  if (request.method === 'ping') {
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        status: 'ok'
      }
    };
  }

  if (request.method === 'tools/list') {
    const tools = [
      {
        name: 'query_openai',
        description: 'Query OpenAI API with a prompt and get a response',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'The prompt to send to OpenAI',
            },
            model: {
              type: 'string',
              description: 'The OpenAI model to use',
              default: 'gpt-5',
            },
            max_tokens: {
              type: 'number',
              description: 'Maximum tokens in the response (use max_completion_tokens for GPT-5)',
              default: 1000,
            },
            max_completion_tokens: {
              type: 'number',
              description: 'Maximum completion tokens (for GPT-5 and newer models)',
            },
            reasoning_effort: {
              type: 'string',
              description: 'Reasoning effort level for GPT-5 models',
              enum: ['minimal', 'low', 'medium', 'high'],
              default: 'medium',
            },
            verbosity: {
              type: 'string',
              description: 'Response verbosity level for GPT-5 models',
              enum: ['low', 'medium', 'high'],
              default: 'medium',
            },
            use_responses_api: {
              type: 'boolean',
              description: 'Use Responses API for GPT-5 (recommended for best performance)',
              default: true,
            },
          },
          required: ['prompt'],
        },
      },
    ];
    
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: { tools }
    };
  }

  if (request.method === 'tools/call' && request.params?.name === 'query_openai') {
    const {
      prompt,
      model = 'gpt-5',
      max_tokens = 1000,
      max_completion_tokens,
      reasoning_effort = 'medium',
      verbosity = 'medium',
      use_responses_api = true,
    } = request.params.arguments;

    try {
      if (model.startsWith('gpt-5')) {
        if (use_responses_api) {
          // GPT-5 with Responses API (recommended)
          const responseOptions: any = {
            model,
            input: prompt,
            reasoning: { effort: reasoning_effort },
            text: { verbosity: verbosity },
          };

          const response = await openai.responses.create(responseOptions);

          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: response.output_text || 'No response received',
                },
              ]
            }
          };
        } else {
          // GPT-5 with Chat Completions API
          const requestOptions: any = {
            model,
            messages: [{ role: 'user', content: prompt }],
            reasoning_effort: reasoning_effort,
            verbosity: verbosity,
          };

          if (max_completion_tokens !== undefined) {
            requestOptions.max_completion_tokens = max_completion_tokens;
          } else {
            requestOptions.max_tokens = max_tokens;
          }

          const response = await openai.chat.completions.create(requestOptions);

          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              content: [
                {
                  type: 'text',
                  text: response.choices[0]?.message?.content || 'No response received',
                },
              ]
            }
          };
        }
      } else {
        // Other models use chat completions API
        const requestOptions: any = {
          model,
          messages: [{ role: 'user', content: prompt }],
        };

        if (max_completion_tokens !== undefined) {
          requestOptions.max_completion_tokens = max_completion_tokens;
        } else {
          requestOptions.max_tokens = max_tokens;
        }

        const response = await openai.chat.completions.create(requestOptions);

        return {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            content: [
              {
                type: 'text',
                text: response.choices[0]?.message?.content || 'No response received',
              },
            ]
          }
        };
      }
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32603,
          message: `Error querying OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id: request.id,
    error: {
      code: -32601,
      message: `Unknown method: ${request.method}`
    }
  };
}