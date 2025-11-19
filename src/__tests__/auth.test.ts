import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock AWS SDK before importing auth module
const mockSend = jest.fn() as jest.MockedFunction<any>;
jest.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    GetSecretValueCommand: jest.fn()
  };
});

describe('Auth Module', () => {
  let validateAuthToken: any;
  let createAuthError: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSend.mockReset();

    // Import the module after mocks are set up
    const authModule = await import('../auth');
    validateAuthToken = authModule.validateAuthToken;
    createAuthError = authModule.createAuthError;
  });

  afterEach(() => {
    jest.resetModules();
  });

  describe('validateAuthToken', () => {
    test('should return false when auth header is undefined', async () => {
      const result = await validateAuthToken(undefined);
      expect(result).toBe(false);
    });

    test('should return false when auth header is not Basic auth', async () => {
      const result = await validateAuthToken('Bearer some-token');
      expect(result).toBe(false);
    });

    test('should return false when username is not admin', async () => {
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify({ token: 'test-password' })
      });

      const credentials = Buffer.from('wronguser:test-password').toString('base64');
      const authHeader = `Basic ${credentials}`;

      const result = await validateAuthToken(authHeader);
      expect(result).toBe(false);
    });

    test('should return false when password is incorrect', async () => {
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify({ token: 'correct-password' })
      });

      const credentials = Buffer.from('admin:wrong-password').toString('base64');
      const authHeader = `Basic ${credentials}`;

      const result = await validateAuthToken(authHeader);
      expect(result).toBe(false);
    });

    test('should return true when credentials are valid', async () => {
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify({ token: 'test-password' })
      });

      const credentials = Buffer.from('admin:test-password').toString('base64');
      const authHeader = `Basic ${credentials}`;

      const result = await validateAuthToken(authHeader);
      expect(result).toBe(true);
    });

    test('should support password field in secret', async () => {
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify({ password: 'my-password' })
      });

      const credentials = Buffer.from('admin:my-password').toString('base64');
      const authHeader = `Basic ${credentials}`;

      const result = await validateAuthToken(authHeader);
      expect(result).toBe(true);
    });

    test('should return false when Secrets Manager fails', async () => {
      mockSend.mockRejectedValue(new Error('Secrets Manager error'));

      const credentials = Buffer.from('admin:test-password').toString('base64');
      const authHeader = `Basic ${credentials}`;

      const result = await validateAuthToken(authHeader);
      expect(result).toBe(false);
    });

    test('should trim whitespace from password', async () => {
      mockSend.mockResolvedValue({
        SecretString: JSON.stringify({ token: '  test-password  ' })
      });

      const credentials = Buffer.from('admin:test-password').toString('base64');
      const authHeader = `Basic ${credentials}`;

      const result = await validateAuthToken(authHeader);
      expect(result).toBe(true);
    });
  });

  describe('createAuthError', () => {
    test('should return 401 response with WWW-Authenticate header', () => {
      const error = createAuthError();

      expect(error.statusCode).toBe(401);
      expect(error.headers['Content-Type']).toBe('application/json');
      expect(error.headers['WWW-Authenticate']).toBe('Basic realm="OpenAI MCP Server"');

      const body = JSON.parse(error.body);
      expect(body.error).toContain('Unauthorized');
      expect(body.error).toContain('admin');
    });
  });
});
