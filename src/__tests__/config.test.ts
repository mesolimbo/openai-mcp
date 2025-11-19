import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import * as fs from 'fs';

// Mock the fs module
jest.mock('fs');

describe('Config Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('loadConfig should throw error when config.json does not exist', () => {
    const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    mockExistsSync.mockReturnValue(false);

    // Import after mocking
    const { loadConfig } = require('../config');

    expect(() => loadConfig()).toThrow('config.json not found');
  });

  test('loadConfig should throw error when openaiApiKey is missing', () => {
    const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{"customDomain": "example.com"}');

    const { loadConfig } = require('../config');

    expect(() => loadConfig()).toThrow('openaiApiKey is required');
  });

  test('loadConfig should successfully load valid config', () => {
    const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

    const validConfig = {
      openaiApiKey: 'test-api-key-123',
      customDomain: 'test.example.com'
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

    const { loadConfig } = require('../config');
    const config = loadConfig();

    expect(config.openaiApiKey).toBe('test-api-key-123');
    expect(config.customDomain).toBe('test.example.com');
  });

  test('loadConfig should load config with only required fields', () => {
    const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
    const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

    const minimalConfig = {
      openaiApiKey: 'sk-test123'
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(minimalConfig));

    const { loadConfig } = require('../config');
    const config = loadConfig();

    expect(config.openaiApiKey).toBe('sk-test123');
    expect(config.customDomain).toBeUndefined();
  });
});
