import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let secretsClient: SecretsManagerClient;
let cachedToken: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2'
    });
  }
  return secretsClient;
}

async function getAuthPasswordFromSecrets(): Promise<string> {
  const now = Date.now();
  
  // Return cached password if still valid
  if (cachedToken && now < cacheExpiry) {
    return cachedToken;
  }

  const secretName = process.env.AUTH_SECRET_NAME || 'openai-mcp-auth-token';
  
  try {
    const client = getSecretsClient();
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }
    
    // Parse JSON and extract password (fallback to token for backwards compatibility)
    const secretData = JSON.parse(response.SecretString);
    const password = secretData.password || secretData.token;
    if (!password || typeof password !== 'string') {
      throw new Error('Password not found in secret');
    }
    
    // Cache the password
    const passwordValue = password.trim();
    cachedToken = passwordValue;
    cacheExpiry = now + CACHE_TTL;
    
    return passwordValue;
  } catch (error) {
    console.error('Failed to retrieve auth password from Secrets Manager:', error);
    throw new Error('Authentication configuration error');
  }
}

export async function validateAuthToken(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader) {
    return false;
  }
  
  // Extract Basic auth credentials
  const matches = authHeader.match(/^Basic\s+(.+)$/i);
  if (!matches) {
    return false;
  }
  
  const encodedCredentials = matches[1];
  
  try {
    // Decode base64 credentials
    const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf-8');
    const [username, password] = decodedCredentials.split(':');
    
    if (username !== 'admin') {
      return false;
    }
    
    const validPassword = await getAuthPasswordFromSecrets();
    return password === validPassword;
  } catch (error) {
    console.error('Auth validation failed:', error);
    return false;
  }
}

export function createAuthError(): { statusCode: number; headers: any; body: string } {
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Basic realm="OpenAI MCP Server"'
    },
    body: JSON.stringify({ error: 'Unauthorized - Valid Basic auth required (username: admin)' })
  };
}