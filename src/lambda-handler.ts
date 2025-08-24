import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { initializeApp, handleMcpRequest } from './app';
import { validateAuthToken, createAuthError } from './auth';

// Initialize the app once (outside handler for better performance)
initializeApp();

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json',
  };

  try {
    // Validate authentication for ALL requests
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    const isAuthenticated = await validateAuthToken(authHeader);
    
    if (!isAuthenticated) {
      const authError = createAuthError();
      return {
        ...authError,
        headers: { ...headers, ...authError.headers },
      };
    }

    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: '',
      };
    }

    if (event.httpMethod === 'GET' && event.path === '/health') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          status: 'healthy', 
          server: 'openai-mcp-server-lambda',
          environment: 'aws-lambda'
        }),
      };
    }

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    // Use shared app logic
    const requestBody = JSON.parse(event.body);
    const result = await handleMcpRequest(requestBody);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
    };
  }
};