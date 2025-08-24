import * as cdk from 'aws-cdk-lib';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';

export interface CertificateStackProps extends cdk.StackProps {
  customDomain: string;
}

export class CertificateStack extends cdk.Stack {
  public readonly certificate: certificatemanager.Certificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    // Create certificate in us-east-1 for CloudFront/API Gateway Edge
    this.certificate = new certificatemanager.Certificate(this, 'Certificate', {
      domainName: props.customDomain,
      validation: certificatemanager.CertificateValidation.fromDns(),
    });

    // Output certificate ARN for reference
    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'Certificate ARN for the custom domain',
      exportName: `${this.stackName}-CertificateArn`,
    });

    // Output validation records for manual DNS setup
    new cdk.CfnOutput(this, 'CertificateValidationInstructions', {
      value: 'Check the Certificate Manager console in us-east-1 for DNS validation records to add to your DNS provider',
      description: 'Instructions for certificate validation',
    });
  }
}