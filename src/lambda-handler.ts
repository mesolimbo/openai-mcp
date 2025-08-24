import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { initializeApp, handleMcpRequest } from './app';
import { validateAuthToken, createAuthError } from './auth';

// Initialize the app once (outside handler for better performance)
let initPromise: Promise<void> | null = null;

async function ensureAppInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        console.log('Initializing app...');
        await initializeApp();
        console.log('App initialized successfully');
      } catch (error) {
        console.error('Failed to initialize app:', error);
        throw error;
      }
    })();
  }
  await initPromise;
}

// Support both API Gateway and Function URL events
type LambdaEvent = APIGatewayProxyEvent | {
  requestContext: { http: { method: string; path: string } };
  headers: { [name: string]: string | undefined };
  body: string | null;
};

function getEventProperties(event: any) {
  // API Gateway event format
  if (event.httpMethod) {
    return {
      method: event.httpMethod,
      path: event.path,
      headers: event.headers,
      body: event.body
    };
  }
  // Function URL event format
  if (event.requestContext?.http?.method) {
    return {
      method: event.requestContext.http.method,
      path: event.requestContext.http.path || '/',
      headers: event.headers,
      body: event.body
    };
  }
  throw new Error('Unsupported event format');
}

export const handler = async (
  event: LambdaEvent
): Promise<APIGatewayProxyResult> => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json',
  };

  try {
    // Ensure app is initialized (with OpenAI API key from Secrets Manager)
    await ensureAppInitialized();
    
    console.log('Event:', JSON.stringify(event, null, 2));
    const { method, path, headers: eventHeaders, body } = getEventProperties(event);
    console.log('Parsed:', { method, path, body: body?.substring(0, 100) });

    // Skip authentication for OAuth discovery endpoints
    if (path === '/.well-known/oauth-authorization-server' || path === '/.well-known/openid_configuration') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'OAuth discovery not supported. Use Basic token authentication.' }),
      };
    }

    // Validate authentication for all other requests
    const authHeader = eventHeaders?.Authorization || eventHeaders?.authorization;
    const isAuthenticated = await validateAuthToken(authHeader);
    
    if (!isAuthenticated) {
      const authError = createAuthError();
      return {
        ...authError,
        headers: { ...headers, ...authError.headers },
      };
    }

    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers,
        body: '',
      };
    }

    if (method === 'GET' && path === '/health') {
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

    // MCP discovery endpoints
    if (method === 'GET' && path === '/') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          service: 'OpenAI MCP Server',
          description: 'MCP server for OpenAI API queries with GPT-5 support',
          version: '1.0.0',
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            logging: {},
            prompts: {},
            resources: {}
          },
          serverInfo: {
            name: 'OpenAI MCP Server',
            version: '1.0.0'
          }
        }),
      };
    }

    if (method === 'GET' && path === '/mcp/info') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'OpenAI MCP Server',
            version: '1.0.0'
          }
        }),
      };
    }

    if (method !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    if (!body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    // Use shared app logic
    const requestBody = JSON.parse(body);
    const result = await handleMcpRequest(requestBody);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Lambda handler error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        details: process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : String(error)) : undefined
      }),
    };
  }
};