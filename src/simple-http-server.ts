#!/usr/bin/env node

import OpenAI from 'openai';
import { loadConfig } from './config';
import * as http from 'http';

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

// HTTP server for testing
const httpServer = http.createServer(async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', server: 'openai-mcp-server' }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        
        if (requestData.method === 'tools/list') {
          const response = {
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
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } else if (requestData.method === 'tools/call' && requestData.params?.name === 'query_openai') {
          const {
            prompt,
            model = 'gpt-5.1',
            max_tokens = 1000, 
            max_completion_tokens,
            reasoning_effort = 'medium',
            verbosity = 'medium',
            use_responses_api = true
          } = requestData.params.arguments;

          try {
            let result: any;
            
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
                
                result = {
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

                result = {
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

              result = {
                content: [
                  {
                    type: 'text',
                    text: response.choices[0]?.message?.content || 'No response received',
                  },
                ],
              };
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (error) {
            const result = {
              content: [
                {
                  type: 'text',
                  text: `Error querying OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
              ],
              isError: true,
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown method or tool' }));
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Internal server error' 
        }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3000;
const server = httpServer.listen(PORT, () => {
  console.log(`OpenAI MCP Server running on HTTP port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown - handle multiple signals and force exit if needed
function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down server...`);
  
  // Force close all connections
  server.closeAllConnections?.();
  
  server.close((err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }
    console.log('Server closed successfully');
    process.exit(0);
  });
  
  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Force closing server after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGQUIT', () => shutdown('SIGQUIT'));

// Handle uncaught exceptions to prevent zombie processes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION');
});