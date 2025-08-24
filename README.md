# OpenAI MCP Server

A Model Context Protocol (MCP) server that provides access to OpenAI's API, deployable to AWS Lambda via CDK.

## Features

- MCP server implementation for querying OpenAI models
- AWS Lambda deployment with API Gateway
- Custom domain support with SSL certificates
- TypeScript implementation
- CDK infrastructure as code
- Configuration-based deployment

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
   - The certificate stack deploys to us-east-1 (required for API Gateway edge endpoints)
   - You'll get DNS validation records that need to be added to your DNS provider

2. **DNS Configuration**: Two sets of DNS records are needed:
   - **Certificate Validation**: Add the validation CNAME records shown in the certificate stack output
   - **Domain Routing**: After main stack deployment, add a CNAME record pointing your custom domain to the CloudFront distribution

**Deployment Process**:
1. `npm run deploy` creates both certificate (us-east-1) and main (us-east-2) stacks
2. Add certificate validation records to your DNS
3. Wait for certificate validation (can take up to 30 minutes)
4. Add the CNAME record for your domain to point to the CloudFront distribution

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
- Create the main stack in us-east-2 with API Gateway and Lambda
- Output DNS records you need to add for both certificate validation and domain routing

### Deployment Outputs

**Certificate Stack (us-east-1, if custom domain configured)**:
- `CertificateArn`: ARN of the created certificate
- `CertificateValidationInstructions`: Instructions for adding DNS validation records

**Main Stack (us-east-2)**:
- `ApiUrl`: Direct API Gateway URL
- `CustomDomainName`: Your custom domain (if configured)
- `CloudFrontDistribution`: Target for CNAME record (if using custom domain)
- `LambdaFunctionName`: Lambda function name for debugging

## Usage

### As MCP Server

The server provides one tool:

- `query_openai`: Query OpenAI's API with a prompt
  - Parameters:
    - `prompt` (required): The prompt to send to OpenAI
    - `model` (optional): OpenAI model to use (default: gpt-4o)
    - `max_tokens` (optional): Maximum tokens in response (default: 1000)

### As HTTP API (when deployed)

Send POST requests to the deployed API Gateway URL with MCP protocol messages:

```json
{
  "method": "tools/list"
}
```

```json
{
  "method": "tools/call",
  "params": {
    "name": "query_openai",
    "arguments": {
      "prompt": "What is the capital of France?",
      "model": "gpt-4o",
      "max_tokens": 100
    }
  }
}
```

## Architecture

**Timeout-Free Design**: Uses Lambda Function URLs instead of API Gateway to eliminate the 29-second timeout limitation, allowing for long GPT-5 reasoning calls (up to 15 minutes).

- `src/index.ts`: Main MCP server for local/stdio usage
- `src/lambda-handler.ts`: AWS Lambda handler with Function URL (no timeout limits)
- `src/config.ts`: Configuration loading utility
- `cdk/`: CDK infrastructure code
- `config.json`: Deployment configuration (gitignored)

**Deployment Architecture:**
- **Lambda Function URL**: Direct access without API Gateway timeout
- **CloudFront Distribution**: Global edge caching and custom domain support
- **Certificate Management**: Automatic SSL certificate creation in us-east-1
- **Regions**: Certificate stack in us-east-1, main stack in us-east-2

### Files

- `config.json.example`: Template for configuration
- `config.json`: Your actual config (create from example, not tracked in git)
- `.env.example`: Legacy environment variable example
