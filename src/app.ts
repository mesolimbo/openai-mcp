import OpenAI from 'openai';
import { loadConfig } from './config';

export interface McpRequest {
  method: string;
  params?: any;
}

export interface McpResponse {
  tools?: any[];
  content?: Array<{ type: string; text: string }>;
  isError?: boolean;
}

let openai: OpenAI;
let initialized = false;

export function initializeApp(): void {
  if (initialized) return;

  try {
    const config = loadConfig();
    openai = new OpenAI({
      apiKey: config.openaiApiKey,
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

  if (request.method === 'tools/list') {
    return {
      tools: [
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
      ],
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
            content: [
              {
                type: 'text',
                text: response.output_text || 'No response received',
              },
            ],
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
            content: [
              {
                type: 'text',
                text: response.choices[0]?.message?.content || 'No response received',
              },
            ],
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
          content: [
            {
              type: 'text',
              text: response.choices[0]?.message?.content || 'No response received',
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error querying OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown method: ${request.method}`);
}