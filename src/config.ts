import * as fs from 'fs';
import * as path from 'path';

export interface AppConfig {
  openaiApiKey: string;
  customDomain?: string;
}

export function loadConfig(): AppConfig {
  const configPath = path.join(__dirname, '../config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error('config.json not found. Please create it based on config.json.example');
  }

  const configData = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData) as AppConfig;

  if (!config.openaiApiKey) {
    throw new Error('openaiApiKey is required in config.json');
  }

  return config;
}