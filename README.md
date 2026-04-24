# OpenAI MCP Server

A Model Context Protocol (MCP) server for querying OpenAI's API, including GPT-5.5 with advanced reasoning capabilities. Runs locally via stdio.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create your configuration file:
```bash
cp config.json.example config.json
```

3. Edit `config.json` with your OpenAI API key:
```json
{
  "openaiApiKey": "your-openai-api-key-here"
}
```

## Usage

Run the MCP server:
```bash
npm run dev
```

### MCP Client Configuration

For Claude Code or other MCP clients, add to your MCP config:

**Windows:**
```json
{
  "chatgpt": {
    "type": "stdio",
    "command": "cmd",
    "args": ["/c", "npx", "tsx", "C:\\path\\to\\openai-mcp\\src\\index.ts"],
    "env": {}
  }
}
```

**macOS/Linux:**
```json
{
  "chatgpt": {
    "type": "stdio",
    "command": "npx",
    "args": ["tsx", "/path/to/openai-mcp/src/index.ts"],
    "env": {}
  }
}
```

## Available Tools

### query_openai

Query OpenAI's API with GPT-5.5 support.

**Parameters:**
- `prompt` (required): The prompt to send to OpenAI
- `model` (optional): OpenAI model to use (default: `gpt-5.5`)
- `max_tokens` (optional): Maximum tokens in response (default: 16384)
- `max_completion_tokens` (optional): Maximum completion tokens for GPT-5.x models
- `reasoning_effort` (optional): Reasoning effort level: `none`, `low`, `medium`, `high` (default: `low`)
- `use_responses_api` (optional): Use Responses API for GPT-5.x (default: `true`)

### get_model_info

Get information about an OpenAI model.

**Parameters:**
- `model` (optional): The model to get the default model version (e.g.: `gpt-5.5`)

## Scripts

- `npm run dev` - Run with tsx (development)
- `npm run build` - Compile TypeScript
- `npm run start` - Run compiled server

## Files

- `src/index.ts` - MCP server entry point (stdio transport)
- `src/config.ts` - Configuration loader
- `config.json` - Your API key config (not tracked in git)
- `config.json.example` - Configuration template
