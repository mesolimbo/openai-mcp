import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Config {
  openaiApiKey: string;
}

export function loadConfig(): Config {
  const configPath = join(__dirname, '..', 'config.json');

  try {
    const configData = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData) as Config;

    if (!config.openaiApiKey) {
      throw new Error('openaiApiKey is required in config.json');
    }

    return config;
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('config.json not found. Please create it from config.json.example');
    }
    throw error;
  }
}
