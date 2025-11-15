#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import OpenAI from 'openai';
import { loadConfig } from './config';

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
              default: 'gpt-5.1',
            },
            max_tokens: {
              type: 'number',
              description: 'Maximum tokens in the response (use max_completion_tokens for GPT-5.1)',
              default: 1000,
            },
            max_completion_tokens: {
              type: 'number',
              description: 'Maximum completion tokens (for GPT-5.1 and newer models)',
            },
            reasoning_effort: {
              type: 'string',
              description: 'Reasoning effort level for GPT-5.1 models',
              enum: ['minimal', 'low', 'medium', 'high'],
              default: 'medium',
            },
            verbosity: {
              type: 'string',
              description: 'Response verbosity level for GPT-5.1 models',
              enum: ['low', 'medium', 'high'],
              default: 'medium',
            },
            use_responses_api: {
              type: 'boolean',
              description: 'Use Responses API for GPT-5.1 (recommended for best performance)',
              default: true,
            },
          },
          required: ['prompt'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'query_openai') {
    const {
      prompt,
      model = 'gpt-5.1',
      max_tokens = 1000, 
      max_completion_tokens,
      reasoning_effort = 'medium',
      verbosity = 'medium',
      use_responses_api = true
    } = request.params.arguments as {
      prompt: string;
      model?: string;
      max_tokens?: number;
      max_completion_tokens?: number;
      reasoning_effort?: string;
      verbosity?: string;
      use_responses_api?: boolean;
    };

    try {
      if (model.startsWith('gpt-5')) {
        if (use_responses_api) {
          // GPT-5.1 with Responses API (recommended)
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
          // GPT-5.1 with Chat Completions API
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