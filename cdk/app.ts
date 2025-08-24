#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OpenAIMcpStack } from './openai-mcp-stack';
import { CertificateStack } from './certificate-stack';
import { loadConfig } from '../src/config';

const config = loadConfig();

const app = new cdk.App();

// Create certificate stack in us-east-1 if custom domain is specified
if (config.customDomain) {
  const certificateStack = new CertificateStack(app, `${config.customDomain.replace(/\./g, '-')}-CertificateStack`, {
    env: {
      region: 'us-east-1', // Required for API Gateway edge certificates
    },
    customDomain: config.customDomain,
  });
}

// Create main stack in us-east-2
new OpenAIMcpStack(app, 'OpenAIMcpStack', {
  env: {
    region: 'us-east-2',
  },
  config,
});