import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import { AppConfig } from '../src/config';

export interface OpenAIMcpStackProps extends cdk.StackProps {
  config: AppConfig;
}

export class OpenAIMcpStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OpenAIMcpStackProps) {
    super(scope, id, props);

    // Create secret for auth token
    const authTokenSecret = new secretsmanager.Secret(this, 'AuthTokenSecret', {
      secretName: 'openai-mcp-auth-token',
      description: 'Authentication token for OpenAI MCP server',
      generateSecretString: {
        secretStringTemplate: '{}',
        generateStringKey: 'token',
        excludeCharacters: '"\\/',
        passwordLength: 64,
      },
    });

    // Create secret for OpenAI API key
    const openaiApiKeySecret = new secretsmanager.Secret(this, 'OpenAIApiKeySecret', {
      secretName: 'openai-mcp-api-key',
      description: 'OpenAI API key for MCP server',
      secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({
        apiKey: props.config.openaiApiKey
      })),
    });

    // Lambda function for the MCP server with Function URL (no 29s timeout)
    const mcpLambda = new lambdaNodejs.NodejsFunction(this, 'OpenAIMcpFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda-handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(15), // Much longer timeout for LLM calls
      memorySize: 512, // More memory for better performance
      environment: {
        NODE_ENV: 'production',
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1', // Reuse connections
        AUTH_SECRET_NAME: authTokenSecret.secretName,
        OPENAI_API_KEY_SECRET_NAME: openaiApiKeySecret.secretName,
        CACHE_INVALIDATE: '5', // Force cache refresh
      },
      bundling: {
        target: 'es2022',
        format: lambdaNodejs.OutputFormat.CJS,
        minify: true,
      },
    });

    // Grant Lambda permission to read both secrets
    authTokenSecret.grantRead(mcpLambda);
    openaiApiKeySecret.grantRead(mcpLambda);

    // Create Function URL for direct Lambda access (no API Gateway timeout)
    const functionUrl = mcpLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE, // Public access
      cors: {
        allowCredentials: false,
        allowedHeaders: ['Content-Type', 'Authorization'],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
        allowedOrigins: ['*'], // TODO: Restrict in production
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Add lambda:InvokeFunction permission as required by AWS Lambda's new authorization model
    // Note: lambda:InvokeFunctionUrl is automatically added by addFunctionUrl() above
    // Both permissions are required as of CDK 2.218.0+ (October 2025 requirement)
    // Use InvokedViaFunctionUrl property to restrict to function URL calls only
    new lambda.CfnPermission(this, 'InvokeFunctionPermission', {
      action: 'lambda:InvokeFunction',
      functionName: mcpLambda.functionName,
      principal: '*',
      invokedViaFunctionUrl: true, // Ensures function can only be invoked via function URL
    });


    // Output the Function URL (direct Lambda access)
    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
      description: 'Direct Lambda Function URL (no timeout limits)',
    });

    // Output the main API URL (function URL only)
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: functionUrl.url,
      description: 'Main API URL for the OpenAI MCP server',
    });

    // Output the Lambda function name
    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: mcpLambda.functionName,
      description: 'Name of the Lambda function',
    });

    // Output the auth token secret ARN
    new cdk.CfnOutput(this, 'AuthTokenSecretArn', {
      value: authTokenSecret.secretArn,
      description: 'ARN of the authentication token secret',
    });

    // Output the OpenAI API key secret ARN
    new cdk.CfnOutput(this, 'OpenAIApiKeySecretArn', {
      value: openaiApiKeySecret.secretArn,
      description: 'ARN of the OpenAI API key secret',
    });
  }
}