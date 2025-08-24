# OpenAI MCP Server

A Model Context Protocol (MCP) server that provides access to OpenAI's API, including GPT-5 support with advanced reasoning capabilities. Deployable to AWS Lambda via CDK with secure Basic authentication.

## Features

- **Full MCP Protocol Support**: JSON-RPC 2.0 compliant MCP server implementation
- **OpenAI API Integration**: Complete access to OpenAI models including GPT-5 with Responses API
- **AWS Lambda Deployment**: Scalable serverless deployment with Function URLs (no timeout limits)
- **Custom Domain Support**: SSL certificates and CloudFront distribution for production use
- **Secure Authentication**: Basic auth with AWS Secrets Manager integration
- **GPT-5 Advanced Features**: Reasoning effort control, verbosity settings, and Responses API support
- **TypeScript Implementation**: Fully typed codebase with robust error handling
- **Infrastructure as Code**: CDK deployment with multi-region support

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create your configuration file:
```bash
cp config.json.example config.json
```

3. Edit `config.json` with your settings:
```json
{
  "openaiApiKey": "your-openai-api-key-here",
  "customDomain": "your-subdomain.your-domain.com"
}
```

4. Configure AWS credentials for deployment

### Custom Domain Setup

For custom domain deployment:

1. **Certificate**: CDK automatically creates an SSL certificate in us-east-1 with DNS validation
   - The certificate stack deploys to us-east-1 (required for CloudFront)
   - You'll get DNS validation records that need to be added to your DNS provider

2. **DNS Configuration**: Two sets of DNS records are needed:
   - **Certificate Validation**: Add the validation CNAME records shown in the certificate stack output
   - **Domain Routing**: After main stack deployment, add a CNAME record pointing your custom domain to the CloudFront distribution

**Deployment Process**:
1. `npm run deploy` creates both certificate (us-east-1) and main (us-east-2) stacks
2. Add certificate validation records to your DNS
3. Wait for certificate validation (can take up to 30 minutes)
4. Add the CNAME record for your domain to point to the CloudFront distribution

## Security

The server implements comprehensive security measures:

### Authentication
- **Basic Authentication** with credentials stored in AWS Secrets Manager
- **Username**: `admin`
- **Password**: Automatically generated and stored in AWS Secrets Manager (`openai-mcp-auth-token`)
- **Format**: `Authorization: Basic <base64(admin:password)>`

### Secret Management
- **OpenAI API Key**: Securely stored in AWS Secrets Manager (`openai-mcp-api-key`)
- **Authentication Credentials**: Auto-generated secure password in Secrets Manager
- **No Hardcoded Secrets**: All sensitive data retrieved at runtime from AWS Secrets Manager

## Local Development

Run the MCP server locally:
```bash
npm run dev
```

Note: Local development uses the config.json file for the OpenAI API key.

## AWS Deployment

Build and deploy to AWS:
```bash
npm run deploy
```

The deployment reads configuration from `config.json`. If you have a custom domain configured, CDK will:
- Create a certificate stack in us-east-1 with DNS validation
- Create the main stack in us-east-2 with Lambda Function URL and CloudFront
- Output DNS records you need to add for both certificate validation and domain routing

### Deployment Outputs

**Main Stack (us-east-2)**:
- `ApiUrl`: Your custom domain URL (e.g., https://openai.yourdomain.com)
- `FunctionUrl`: Direct Lambda Function URL (for debugging)
- `CloudFrontDistribution`: Target for CNAME record (if using custom domain)
- `AuthTokenSecretArn`: AWS Secrets Manager ARN containing the auth password
- `OpenAIApiKeySecretArn`: AWS Secrets Manager ARN containing the OpenAI API key
- `LambdaFunctionName`: Lambda function name for debugging

## Usage

### MCP Client Configuration

For Claude Code or other MCP clients:

```bash
mcp add openai-mcp-server https://your-domain.com --auth-header "Authorization: Basic <credentials>"
```

Where `<credentials>` is the base64 encoding of `admin:password`. Get the password from AWS Secrets Manager:

```bash
aws secretsmanager get-secret-value --secret-id "openai-mcp-auth-token" --query "SecretString" --output text
```

### MCP Protocol Methods

The server implements the full MCP JSON-RPC 2.0 protocol:

#### Initialize Connection
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {}
}
```

#### List Available Tools
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

#### Call OpenAI Tool
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "query_openai",
    "arguments": {
      "prompt": "Explain quantum computing",
      "model": "gpt-5",
      "reasoning_effort": "high",
      "verbosity": "high",
      "use_responses_api": true
    }
  }
}
```

### Available Tools

#### query_openai

Query OpenAI's API with advanced GPT-5 support:

**Parameters:**
- `prompt` (required): The prompt to send to OpenAI
- `model` (optional): OpenAI model to use (default: "gpt-5")
- `max_tokens` (optional): Maximum tokens in response (default: 1000)
- `max_completion_tokens` (optional): Maximum completion tokens for GPT-5
- `reasoning_effort` (optional): GPT-5 reasoning effort level: "minimal", "low", "medium", "high" (default: "medium")
- `verbosity` (optional): GPT-5 response verbosity: "low", "medium", "high" (default: "medium")
- `use_responses_api` (optional): Use GPT-5 Responses API for better performance (default: true)

**GPT-5 Features:**
- **Responses API**: Optimized API for better performance and reasoning
- **Reasoning Effort**: Control how much computational effort GPT-5 uses
- **Verbosity Control**: Adjust response detail level
- **Long Context**: Supports extended reasoning sessions up to 15 minutes

### HTTP Endpoints

#### Discovery Endpoints
- `GET /` - Server information and capabilities
- `GET /health` - Health check endpoint
- `GET /mcp/info` - MCP protocol information

#### MCP Endpoint
- `POST /` - MCP JSON-RPC endpoint (requires Basic auth)

## Architecture

**Timeout-Free Design**: Uses Lambda Function URLs instead of API Gateway to eliminate timeout limitations, enabling long GPT-5 reasoning calls (up to 15 minutes).

**Security**: Basic Authentication with AWS Secrets Manager integration prevents unauthorized access.

### Components

- `src/app.ts`: Core MCP request handling with OpenAI integration
- `src/lambda-handler.ts`: AWS Lambda handler with Function URL and auth
- `src/auth.ts`: Basic authentication with Secrets Manager integration
- `src/config.ts`: Configuration loading utility
- `cdk/`: CDK infrastructure code
- `config.json`: Deployment configuration (gitignored)

### Deployment Architecture

- **Lambda Function URL**: Direct access without API Gateway timeout (15-minute limit)
- **CloudFront Distribution**: Global edge caching and custom domain support
- **AWS Secrets Manager**: Secure credential storage
- **Certificate Management**: Automatic SSL certificate creation in us-east-1
- **Multi-Region**: Certificate stack in us-east-1, main stack in us-east-2

### MCP Protocol Compliance

The server fully implements MCP protocol version 2024-11-05:
- JSON-RPC 2.0 transport
- Standard MCP methods: `initialize`, `tools/list`, `tools/call`
- Proper error handling with JSON-RPC error codes
- Capability negotiation
- Authentication integration

## Troubleshooting

### Common Issues

1. **Connection Fails**: Verify Basic auth credentials and ensure the password matches Secrets Manager
2. **Certificate Validation**: Add DNS validation records and wait up to 30 minutes
3. **Domain Not Resolving**: Add CNAME record pointing to CloudFront distribution
4. **Long Requests Timeout**: The server supports 15-minute requests via Function URLs

### Getting Authentication Credentials

```bash
# Get the password from AWS Secrets Manager
aws secretsmanager get-secret-value --secret-id "openai-mcp-auth-token" --query "SecretString" --output text

# Encode for Basic auth (username is always "admin")
echo -n "admin:YOUR_PASSWORD_HERE" | base64
```

## Files

- `config.json.example`: Template for configuration
- `config.json`: Your actual config (create from example, not tracked in git)
- `test-payload.json`: Example MCP request for testing