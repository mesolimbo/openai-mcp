#!/usr/bin/env node

import * as http from 'http';
import { initializeApp, handleMcpRequest } from './app';
import { validateAuthToken, createAuthError } from './auth';

// Detect environment
const isLambda = Boolean(
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT ||
  (process.env.AWS_EXECUTION_ENV || '').includes('AWS_Lambda')
);

const useController = process.env.USE_PROCESS_CONTROLLER === '1';

console.log(`Starting server entry point (Lambda: ${isLambda}, Controller: ${useController})`);

// Initialize the app
try {
  initializeApp();
  console.log('App initialized successfully');
} catch (error) {
  console.error('Failed to initialize app:', error);
  process.exit(1);
}

// Create HTTP server
const httpServer = http.createServer(async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Validate authentication for ALL requests
  const authHeader = req.headers?.authorization;
  const isAuthenticated = await validateAuthToken(authHeader);
  
  if (!isAuthenticated) {
    const authError = createAuthError();
    res.writeHead(authError.statusCode, authError.headers);
    res.end(authError.body);
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      server: 'openai-mcp-server',
      controller: useController,
      pid: process.pid
    }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        const result = await handleMcpRequest(requestData);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Internal server error'
        }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3000;
const server = httpServer.listen(PORT, () => {
  console.log(`OpenAI MCP Server running on HTTP port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Process PID: ${process.pid}`);
});

// Graceful shutdown function
function shutdown(reason: string): void {
  console.log(`\n${reason} - Shutting down server...`);
  
  server.closeAllConnections?.();
  
  server.close((err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }
    console.log('Server closed successfully');
    process.exit(0);
  });
  
  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('Force exit after timeout');
    process.exit(1);
  }, 5000);
}

// Handle signals for standalone operation
if (!useController) {
  process.on('SIGINT', () => shutdown('SIGINT received'));
  process.on('SIGTERM', () => shutdown('SIGTERM received'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT received'));
  
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => shutdown('SIGBREAK received'));
  }
}

// Handle controller messages
if (useController && process.send) {
  process.on('message', (message) => {
    if (message === 'shutdown') {
      shutdown('Controller shutdown message');
    }
  });
  
  // Detect when parent controller dies (IPC disconnect)
  process.on('disconnect', () => {
    shutdown('Parent controller disconnected');
  });
  
  console.log('Process controller mode enabled - listening for shutdown messages');
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('Uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('Unhandled rejection');
});