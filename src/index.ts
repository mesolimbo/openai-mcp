#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import { loadConfig } from './config.js';

const DEFAULT_MODEL = 'gpt-5.4';

let openai: OpenAI;

try {
  const config = loadConfig();
  openai = new OpenAI({
    apiKey: config.openaiApiKey,
  });
} catch (error) {
  console.error('Failed to load config:', error instanceof Error ? error.message : 'Unknown error');
  console.error('Make sure to create config.json from config.json.example');
  process.exit(1);
}

const server = new Server(
  {
    name: 'openai-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
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
              default: DEFAULT_MODEL,
            },
            max_tokens: {
              type: 'number',
              description: 'Maximum tokens in the response',
              default: 16384,
            },
            max_completion_tokens: {
              type: 'number',
              description: 'Maximum completion tokens (for GPT-5.x models)',
            },
            reasoning_effort: {
              type: 'string',
              description: 'Reasoning effort level for GPT-5.x models',
              enum: ['none', 'low', 'medium', 'high'],
              default: 'low',
            },
            use_responses_api: {
              type: 'boolean',
              description: 'Use Responses API for GPT-5.x (recommended)',
              default: true,
            },
          },
          required: ['prompt'],
        },
      },
      {
        name: 'get_model_info',
        description: 'Get information about an OpenAI model',
        inputSchema: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              description: 'The model to get info for',
              default: DEFAULT_MODEL,
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'query_openai') {
    const {
      prompt,
      model = DEFAULT_MODEL,
      max_tokens = 16384,
      max_completion_tokens,
      reasoning_effort = 'low',
      use_responses_api = true,
    } = request.params.arguments as {
      prompt: string;
      model?: string;
      max_tokens?: number;
      max_completion_tokens?: number;
      reasoning_effort?: string;
      use_responses_api?: boolean;
    };

    try {
      if (model.startsWith('gpt-5') && use_responses_api) {
        const response = await openai.responses.create({
          model,
          input: prompt,
          reasoning: { effort: reasoning_effort as 'low' | 'medium' | 'high' },
          max_output_tokens: max_completion_tokens || max_tokens,
        } as any);

        let text = response.output_text || '';
        if (!text && response.output && Array.isArray(response.output)) {
          for (const item of response.output as any[]) {
            if (item.type === 'message' && Array.isArray(item.content)) {
              for (const part of item.content) {
                if (part.type === 'output_text' || part.type === 'text') {
                  text += part.text || '';
                }
              }
            }
          }
        }

        return {
          content: [{ type: 'text', text: text || 'No response received' }],
        };
      } else {
        const requestOptions: any = {
          model,
          messages: [{ role: 'user', content: prompt }],
        };

        if (model.startsWith('gpt-5')) {
          requestOptions.reasoning_effort = reasoning_effort;
        }

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

  if (request.params.name === 'get_model_info') {
    const { model = DEFAULT_MODEL } = (request.params.arguments || {}) as {
      model?: string;
    };

    try {
      const modelInfo = await openai.models.retrieve(model);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: modelInfo.id,
                object: modelInfo.object,
                created: modelInfo.created,
                owned_by: modelInfo.owned_by,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error retrieving model info: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OpenAI MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
