import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies
const mockChatCompletionsCreate = jest.fn() as jest.MockedFunction<any>;
const mockResponsesCreate = jest.fn() as jest.MockedFunction<any>;
const mockModelsRetrieve = jest.fn() as jest.MockedFunction<any>;
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
      },
      models: {
        retrieve: mockModelsRetrieve
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
  let DEFAULT_MODEL: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockChatCompletionsCreate.mockReset();
    mockResponsesCreate.mockReset();
    mockModelsRetrieve.mockReset();
    mockSend.mockReset();

    // Import fresh module for each test
    const appModule = await import('../app');
    handleMcpRequest = appModule.handleMcpRequest;
    initializeApp = appModule.initializeApp;
    DEFAULT_MODEL = appModule.DEFAULT_MODEL;
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

      const modelInfoTool = response.result?.tools.find((t: any) => t.name === 'get_model_info');
      expect(modelInfoTool).toBeDefined();
      expect(modelInfoTool.description).toContain('model');
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

    test('should query default model with Responses API', async () => {
      mockResponsesCreate.mockResolvedValue({
        output_text: 'Response from default model'
      });

      const request = {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'query_openai',
          arguments: {
            prompt: 'Explain quantum computing',
            model: DEFAULT_MODEL,
            reasoning_effort: 'high',
            verbosity: 'high',
            use_responses_api: true
          }
        }
      };

      const response = await handleMcpRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(6);
      expect(response.result?.content[0]?.text).toBe('Response from default model');
      expect(mockResponsesCreate).toHaveBeenCalledWith({
        model: DEFAULT_MODEL,
        input: 'Explain quantum computing',
        reasoning: { effort: 'high' },
        text: { verbosity: 'high' },
        max_output_tokens: 100000,
      });
    });

    test('should query default model with Chat Completions API', async () => {
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
            model: DEFAULT_MODEL,
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
        model: DEFAULT_MODEL,
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
        model: DEFAULT_MODEL,
        input: 'Test with defaults',
        reasoning: { effort: 'medium' },
        text: { verbosity: 'medium' },
        max_output_tokens: 100000,
      });
    });
  });

  describe('Get Model Info Tool', () => {
    beforeEach(async () => {
      await initializeApp();
    });

    test('should retrieve model info with default model', async () => {
      mockModelsRetrieve.mockResolvedValue({
        id: DEFAULT_MODEL,
        object: 'model',
        created: 1700000000,
        owned_by: 'openai',
      });

      const request = {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'get_model_info',
          arguments: {}
        }
      };

      const response = await handleMcpRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(10);
      const parsed = JSON.parse(response.result?.content[0]?.text);
      expect(parsed.id).toBe(DEFAULT_MODEL);
      expect(parsed.owned_by).toBe('openai');
      expect(mockModelsRetrieve).toHaveBeenCalledWith(DEFAULT_MODEL);
    });

    test('should retrieve model info for a specified model', async () => {
      mockModelsRetrieve.mockResolvedValue({
        id: 'gpt-4',
        object: 'model',
        created: 1600000000,
        owned_by: 'openai',
      });

      const request = {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'get_model_info',
          arguments: { model: 'gpt-4' }
        }
      };

      const response = await handleMcpRequest(request);

      const parsed = JSON.parse(response.result?.content[0]?.text);
      expect(parsed.id).toBe('gpt-4');
      expect(mockModelsRetrieve).toHaveBeenCalledWith('gpt-4');
    });

    test('should handle errors when retrieving model info', async () => {
      mockModelsRetrieve.mockRejectedValue(new Error('Model not found'));

      const request = {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'get_model_info',
          arguments: { model: 'nonexistent-model' }
        }
      };

      const response = await handleMcpRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(-32603);
      expect(response.error?.message).toContain('Model not found');
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
