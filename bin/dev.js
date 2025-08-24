#!/usr/bin/env node

const { fork, spawn } = require('child_process');
const path = require('path');

// Windows-friendly controller for local development
// Fixes Git Bash/mintty signal forwarding issues

console.log('Starting OpenAI MCP Server with process controller...');

const serverEntry = path.join(__dirname, '../dist/server-entry.js');

// Fork the HTTP server with IPC channel
const child = fork(serverEntry, {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  env: { ...process.env, USE_PROCESS_CONTROLLER: '1' }
});

// Windows-specific cleanup function
const killTree = () => {
  console.log('\nShutting down server...');
  
  if (child.connected) {
    // Try graceful shutdown first
    child.send('shutdown');
    
    // Set up fallback hard kill
    const killTimer = setTimeout(() => {
      console.log('Graceful shutdown timeout, force killing...');
      if (process.platform === 'win32') {
        // Use taskkill on Windows to kill the whole process tree
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { 
          stdio: 'ignore',
          detached: true 
        });
      } else {
        child.kill('SIGKILL');
      }
    }, 6000);
    
    // Clear timeout if child exits gracefully
    child.once('exit', () => {
      clearTimeout(killTimer);
    });
  }
};

// Handle various termination signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
  process.on(signal, () => {
    console.log(`\n${signal} received by controller`);
    killTree();
  });
});

// Handle Windows-specific break signal
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => {
    console.log('\nSIGBREAK received by controller');
    killTree();
  });
}

// Exit when child exits
child.on('exit', (code, signal) => {
  console.log(`Server process exited with code ${code} and signal ${signal}`);
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Controller error:', error);
  process.exit(1);
});

// Forward any messages from child to console
child.on('message', (message) => {
  if (typeof message === 'string') {
    console.log('Server message:', message);
  }
});

// Cleanup on process exit
process.on('exit', () => {
  if (child.connected) {
    killTree();
  }
});

console.log(`Controller PID: ${process.pid}, Server PID: ${child.pid}`);