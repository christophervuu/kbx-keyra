import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ScanCommand, BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

type EnvStore = Record<string, string | undefined>;

const env = (globalThis as { process?: { env?: EnvStore } }).process?.env;

const REGION = 'us-east-1';
const DYNAMODB_ENDPOINT = env?.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const S3_ENDPOINT = env?.S3_ENDPOINT ?? 'http://localhost:4566';

function credentials() {
  return {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  };
}

function createDocClient(): DynamoDBDocumentClient {
  const dynamo = new DynamoDBClient({
    region: REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: credentials(),
  });

  return DynamoDBDocumentClient.from(dynamo);
}

function createS3Client(): S3Client {
  return new S3Client({
    region: REGION,
    endpoint: S3_ENDPOINT,
    credentials: credentials(),
    forcePathStyle: true,
  });
}

const KEY_NAMES_BY_TABLE_TOKEN: Readonly<Record<string, readonly string[]>> = {
  projects: ['projectId'],
  mappings: ['mappingId'],
  'schema-metadata': ['schemaId'],
  'schema-nodes': ['schemaId', 'path'],
  'mapping-versions': ['mappingId', 'version'],
};

function inferKeyNames(tableName: string): readonly string[] {
  const normalized = tableName.toLowerCase();
  for (const [token, keys] of Object.entries(KEY_NAMES_BY_TABLE_TOKEN)) {
    if (normalized.includes(token)) {
      return keys;
    }
  }

  throw new Error(`Unable to infer key schema for table ${tableName}`);
}

export async function cleanTable(tableName: string): Promise<void> {
  const doc = createDocClient();
  const keyNames = inferKeyNames(tableName);

  const scanned = await doc.send(new ScanCommand({ TableName: tableName }));
  const items = scanned.Items ?? [];
  if (items.length === 0) {
    return;
  }

  for (let index = 0; index < items.length; index += 25) {
    const chunk = items.slice(index, index + 25);

    await doc.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map((item) => ({
          DeleteRequest: {
            Key: Object.fromEntries(
              keyNames.map((keyName) => [keyName, item[keyName]]),
            ),
          },
        })),
      },
    }));
  }
}

export async function cleanBucket(bucket: string): Promise<void> {
  const s3 = createS3Client();
  let continuationToken: string | undefined;

  do {
    const listed = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));

    const keys = (listed.Contents ?? [])
      .map((entry) => entry.Key)
      .filter((key): key is string => typeof key === 'string' && key.length > 0);

    if (keys.length > 0) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
        },
      }));
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}
