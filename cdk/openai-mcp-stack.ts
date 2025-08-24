import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
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

    // Lambda function for the MCP server with Function URL (no 29s timeout)
    const mcpLambda = new lambdaNodejs.NodejsFunction(this, 'OpenAIMcpFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/lambda-handler.ts'),
      handler: 'handler',
      timeout: cdk.Duration.minutes(15), // Much longer timeout for LLM calls
      memorySize: 512, // More memory for better performance
      environment: {
        NODE_ENV: 'production',
        OPENAI_API_KEY: props.config.openaiApiKey,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1', // Reuse connections
        AUTH_SECRET_NAME: authTokenSecret.secretName,
      },
      bundling: {
        target: 'es2022',
        format: lambdaNodejs.OutputFormat.CJS,
        minify: true,
      },
    });

    // Grant Lambda permission to read the auth token secret
    authTokenSecret.grantRead(mcpLambda);

    // Create Function URL for direct Lambda access (no API Gateway timeout)
    const functionUrl = mcpLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE, // Public access
      cors: {
        allowCredentials: false,
        allowedHeaders: ['Content-Type', 'Authorization'],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST, lambda.HttpMethod.OPTIONS],
        allowedOrigins: ['*'], // TODO: Restrict in production
        maxAge: cdk.Duration.hours(1),
      },
    });

    // Import certificate from us-east-1 if custom domain is specified
    let certificate: certificatemanager.ICertificate | undefined;
    if (props.config.customDomain) {
      const certificateArn = cdk.Fn.importValue(`${props.config.customDomain.replace(/\./g, '-')}-CertificateStack-CertificateArn`);
      certificate = certificatemanager.Certificate.fromCertificateArn(
        this,
        'ImportedCertificate',
        certificateArn
      );
    }

    // Create CloudFront distribution for custom domain and global edge caching
    let distribution: cloudfront.Distribution | undefined;
    
    if (props.config.customDomain && certificate) {
      distribution = new cloudfront.Distribution(this, 'McpDistribution', {
        defaultBehavior: {
          origin: new origins.FunctionUrlOrigin(functionUrl),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'McpCachePolicy', {
            cachePolicyName: 'OpenAI-MCP-Cache-Policy',
            defaultTtl: cdk.Duration.seconds(0), // No caching for dynamic API responses
            maxTtl: cdk.Duration.seconds(1),
            minTtl: cdk.Duration.seconds(0),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
              'Content-Type', 'Authorization', 'Accept'
            ),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
          }),
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        },
        domainNames: [props.config.customDomain],
        certificate: certificate,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe
        comment: 'OpenAI MCP Server Distribution',
      });

      new cdk.CfnOutput(this, 'CustomDomainName', {
        value: props.config.customDomain,
        description: 'Custom domain name for the API',
      });

      new cdk.CfnOutput(this, 'CloudFrontDistribution', {
        value: distribution.distributionDomainName,
        description: 'CloudFront distribution domain name for CNAME record',
      });
    }

    // Output the Function URL (direct Lambda access)
    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
      description: 'Direct Lambda Function URL (no timeout limits)',
    });

    // Output the main API URL (custom domain if available, otherwise function URL)
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: props.config.customDomain ? `https://${props.config.customDomain}` : functionUrl.url,
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
  }
}