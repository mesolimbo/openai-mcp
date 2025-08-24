import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

let secretsClient: SecretsManagerClient;
let cachedToken: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getSecretsClient(): SecretsManagerClient {
  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-2'
    });
  }
  return secretsClient;
}

async function getAuthTokenFromSecrets(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid
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
    
    // Cache the token
    cachedToken = response.SecretString.trim();
    cacheExpiry = now + CACHE_TTL;
    
    return cachedToken;
  } catch (error) {
    console.error('Failed to retrieve auth token from Secrets Manager:', error);
    throw new Error('Authentication configuration error');
  }
}

export async function validateAuthToken(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader) {
    return false;
  }
  
  // Extract bearer token
  const matches = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!matches) {
    return false;
  }
  
  const providedToken = matches[1];
  
  try {
    const validToken = await getAuthTokenFromSecrets();
    return providedToken === validToken;
  } catch (error) {
    console.error('Token validation failed:', error);
    return false;
  }
}

export function createAuthError(): { statusCode: number; headers: any; body: string } {
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer'
    },
    body: JSON.stringify({ error: 'Unauthorized - Valid Bearer token required' })
  };
}