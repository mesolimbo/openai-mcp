#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OpenAIMcpStack } from './openai-mcp-stack';
import { loadConfig } from '../src/config';

const config = loadConfig();

const app = new cdk.App();

// Create main stack in us-east-2
new OpenAIMcpStack(app, 'OpenAIMcpStack', {
  env: {
    region: 'us-east-2',
  },
  config,
});