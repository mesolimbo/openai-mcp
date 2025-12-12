import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies
const mockChatCompletionsCreate = jest.fn() as jest.MockedFunction<any>;
const mockResponsesCreate = jest.fn() as jest.MockedFunction<any>;
const mockSend = jest.fn() as jest.MockedFunction<any>;

jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockChatCompletionsCreate
        }
      },
      responses: {
        create: mockResponsesCreate
      }
    }))
  };
});

jest.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    GetSecretValueCommand: jest.fn()
  };
});

jest.mock('../config', () => ({
  loadConfig: jest.fn().mockReturnValue({
    openaiApiKey: 'test-api-key'
  })
}));

describe('App Module', () => {
  let handleMcpRequest: any;
  let initializeApp: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockChatCompletionsCreate.mockReset();
    mockResponsesCreate.mockReset();
    mockSend.mockReset();

    // Import fresh module for each test
    const appModule = await import('../app');
    handleMcpRequest = appModule.handleMcpRequest;
    initializeApp = appModule.initializeApp;
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('MCP Protocol Methods', () => {
    beforeEach(async () => {
      await initializeApp();
    });

    test('should handle initialize method', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      };

      const response = await handleMcpRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result?.protocolVersion).toBe('2024-11-05');
      expect(response.result?.serverInfo?.name).toBe('OpenAI MCP Server');
      expect(response.result?.capabilities).toBeDefined();
    });

    test('should handle ping method', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'ping'
      };

      const response = await handleMcpRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(2);
      expect(response.result?.status).toBe('ok');
    });

    test('should handle tools/list method', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list'
      };

      const response = await handleMcpRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(3);
      expect(response.result?.tools).toBeInstanceOf(Array);
      expect(response.result?.tools.length).toBeGreaterThan(0);

      const queryTool = response.result?.tools.find((t: any) => t.name === 'query_openai');
      expect(queryTool).toBeDefined();
      expect(queryTool.description).toContain('OpenAI');
      expect(queryTool.inputSchema.properties.prompt).toBeDefined();
    });

    test('should handle notifications/initialized', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      };

      const response = await handleMcpRequest(request);

      expect(response).toEqual({});
    });

    test('should return error for unknown method', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'unknown/method'
      };

      const response = await handleMcpRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(4);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32601);
      expect(response.error?.message).toContain('Unknown method');
    });
  });

  describe('OpenAI Query Tool', () => {
    beforeEach(async () => {
      await initializeApp();
    });

    test('should query OpenAI with standard model', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Test response from GPT-4'
          }
        }]
      });

      const request = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'query_openai',
          arguments: {
            prompt: 'Hello, world!',
            model: 'gpt-4',
            max_tokens: 100
          }
        }
      };

      const response = await handleMcpRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(5);
      expect(response.result?.content).toBeInstanceOf(Array);
      expect(response.result?.content[0]?.text).toBe('Test response from GPT-4');
      expect(mockChatCompletionsCreate).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        max_tokens: 100
      });
    });

    test('should query GPT-5.2 with Responses API', async () => {
      mockResponsesCreate.mockResolvedValue({
        output_text: 'Response from GPT-5.2'
      });

      const request = {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'query_openai',
          arguments: {
            prompt: 'Explain quantum computing',
            model: 'gpt-5.2',
            reasoning_effort: 'high',
            verbosity: 'high',
            use_responses_api: true
          }
        }
      };

      const response = await handleMcpRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(6);
      expect(response.result?.content[0]?.text).toBe('Response from GPT-5.2');
      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'gpt-5.2',
        input: 'Explain quantum computing',
        reasoning: { effort: 'high' },
        text: { verbosity: 'high' }
      });
    });

    test('should query GPT-5.2 with Chat Completions API', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'Chat completion response'
          }
        }]
      });

      const request = {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'query_openai',
          arguments: {
            prompt: 'Test prompt',
            model: 'gpt-5.2',
            reasoning_effort: 'medium',
            verbosity: 'low',
            use_responses_api: false,
            max_completion_tokens: 2000
          }
        }
      };

      const response = await handleMcpRequest(request);

      expect(response.result?.content[0]?.text).toBe('Chat completion response');
      expect(mockChatCompletionsCreate).toHaveBeenCalledWith({
        model: 'gpt-5.2',
        messages: [{ role: 'user', content: 'Test prompt' }],
        reasoning_effort: 'medium',
        verbosity: 'low',
        max_completion_tokens: 2000
      });
    });

    test('should handle OpenAI API errors gracefully', async () => {
      mockChatCompletionsCreate.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const request = {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'query_openai',
          arguments: {
            prompt: 'Test',
            model: 'gpt-4'
          }
        }
      };

      const response = await handleMcpRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32603);
      expect(response.error?.message).toContain('API rate limit exceeded');
    });

    test('should use default parameters when not provided', async () => {
      mockResponsesCreate.mockResolvedValue({
        output_text: 'Default params response'
      });

      const request = {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'query_openai',
          arguments: {
            prompt: 'Test with defaults'
          }
        }
      };

      const response = await handleMcpRequest(request);

      expect(response.result?.content[0]?.text).toBe('Default params response');
      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: 'gpt-5.2',
        input: 'Test with defaults',
        reasoning: { effort: 'medium' },
        text: { verbosity: 'medium' }
      });
    });
  });

  describe('Initialization', () => {
    test('should throw error when handling request before initialization', async () => {
      const request = {
        method: 'ping',
        id: 1
      };

      await expect(handleMcpRequest(request)).rejects.toThrow('App not initialized');
    });
  });
});
