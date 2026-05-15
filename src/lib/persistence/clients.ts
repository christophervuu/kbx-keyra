import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

type EnvStore = Record<string, string | undefined>;

interface AwsClientConfig {
  readonly region: string;
  readonly endpoint?: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: EnvStore } }).process?.env;
  return env?.[key];
}

function getRegion(): string {
  const region = getEnvValue('AWS_REGION')?.trim();
  return region && region.length > 0 ? region : 'us-east-1';
}

function toOptionalEndpoint(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function buildDynamoConfig(): AwsClientConfig {
  return {
    region: getRegion(),
    endpoint: toOptionalEndpoint(getEnvValue('DYNAMODB_ENDPOINT')),
  };
}

function buildS3Config(): AwsClientConfig {
  return {
    region: getRegion(),
    endpoint: toOptionalEndpoint(getEnvValue('S3_ENDPOINT')),
  };
}

export const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient(buildDynamoConfig()));

export const s3Client = new S3Client(buildS3Config());
