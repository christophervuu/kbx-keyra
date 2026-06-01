import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  type GlobalSecondaryIndex,
} from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

const REGION = 'us-east-1';
const DYNAMO_ENDPOINT = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.DYNAMODB_LOCAL_ENDPOINT
  ?? 'http://127.0.0.1:8000';
const S3_ENDPOINT = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LOCALSTACK_S3_ENDPOINT
  ?? 'http://localhost.localstack.cloud:4566';

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const TEST_TABLES = {
  projects: `keyra-projects-it-${SUFFIX}`,
  mappings: `keyra-mappings-it-${SUFFIX}`,
  schemaMetadata: `keyra-schema-metadata-it-${SUFFIX}`,
  schemaNodes: `keyra-schema-nodes-it-${SUFFIX}`,
  mappingRevisions: `keyra-mapping-revisions-it-${SUFFIX}`,
  mappingVersions: `keyra-mapping-versions-it-${SUFFIX}`,
} as const;

export const TEST_BUCKET = `keyra-storage-it-${SUFFIX}`;

export function getTestClients() {
  const dynamo = new DynamoDBClient({
    region: REGION,
    endpoint: DYNAMO_ENDPOINT,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  });

  const s3 = new S3Client({
    region: REGION,
    endpoint: S3_ENDPOINT,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
    forcePathStyle: true,
  });

  return { dynamo, s3 };
}

export function applyPersistenceTestEnvironment(): void {
  const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available');
  }

  processRef.env.AWS_REGION = REGION;
  processRef.env.AWS_ACCESS_KEY_ID = 'test';
  processRef.env.AWS_SECRET_ACCESS_KEY = 'test';
  processRef.env.DYNAMODB_ENDPOINT = DYNAMO_ENDPOINT;
  processRef.env.S3_ENDPOINT = S3_ENDPOINT;

  processRef.env.PROJECTS_TABLE = TEST_TABLES.projects;
  processRef.env.MAPPINGS_TABLE = TEST_TABLES.mappings;
  processRef.env.SCHEMA_METADATA_TABLE = TEST_TABLES.schemaMetadata;
  processRef.env.SCHEMA_NODES_TABLE = TEST_TABLES.schemaNodes;
  processRef.env.MAPPING_REVISIONS_TABLE = TEST_TABLES.mappingRevisions;
  processRef.env.MAPPING_VERSIONS_TABLE = TEST_TABLES.mappingVersions;
  processRef.env.STORAGE_BUCKET = TEST_BUCKET;
}

export async function assertLocalServicesAvailable(): Promise<void> {
  const { dynamo, s3 } = getTestClients();

  try {
    await dynamo.send(new ListTablesCommand({}));
  } catch {
    throw new Error(`DynamoDB Local not reachable at ${DYNAMO_ENDPOINT}. Start docker-compose.test.yml first.`);
  }

  try {
    await s3.send(new ListBucketsCommand({}));
  } catch {
    throw new Error(`LocalStack S3 not reachable at ${S3_ENDPOINT}. Start docker-compose.test.yml first.`);
  }
}

function mappingTableGsi(): GlobalSecondaryIndex {
  return {
    IndexName: 'projectId-index',
    KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
    Projection: { ProjectionType: 'ALL' },
  };
}

function schemaNodesGsis(): GlobalSecondaryIndex[] {
  return [
    {
      IndexName: 'fieldName-index',
      KeySchema: [
        { AttributeName: 'fieldName', KeyType: 'HASH' },
        { AttributeName: 'schemaIdPath', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'parentPath-index',
      KeySchema: [
        { AttributeName: 'schemaId', KeyType: 'HASH' },
        { AttributeName: 'parentPath', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ];
}

export async function createTables(): Promise<void> {
  const { dynamo } = getTestClients();

  await dynamo.send(new CreateTableCommand({
    TableName: TEST_TABLES.projects,
    AttributeDefinitions: [{ AttributeName: 'projectId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await dynamo.send(new CreateTableCommand({
    TableName: TEST_TABLES.mappings,
    AttributeDefinitions: [
      { AttributeName: 'mappingId', AttributeType: 'S' },
      { AttributeName: 'projectId', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'mappingId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [mappingTableGsi()],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await dynamo.send(new CreateTableCommand({
    TableName: TEST_TABLES.schemaMetadata,
    AttributeDefinitions: [{ AttributeName: 'schemaId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'schemaId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await dynamo.send(new CreateTableCommand({
    TableName: TEST_TABLES.schemaNodes,
    AttributeDefinitions: [
      { AttributeName: 'schemaId', AttributeType: 'S' },
      { AttributeName: 'path', AttributeType: 'S' },
      { AttributeName: 'fieldName', AttributeType: 'S' },
      { AttributeName: 'schemaIdPath', AttributeType: 'S' },
      { AttributeName: 'parentPath', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'schemaId', KeyType: 'HASH' },
      { AttributeName: 'path', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: schemaNodesGsis(),
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await dynamo.send(new CreateTableCommand({
    TableName: TEST_TABLES.mappingRevisions,
    AttributeDefinitions: [
      { AttributeName: 'mappingId', AttributeType: 'S' },
      { AttributeName: 'revision', AttributeType: 'N' },
    ],
    KeySchema: [
      { AttributeName: 'mappingId', KeyType: 'HASH' },
      { AttributeName: 'revision', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await dynamo.send(new CreateTableCommand({
    TableName: TEST_TABLES.mappingVersions,
    AttributeDefinitions: [
      { AttributeName: 'mappingId', AttributeType: 'S' },
      { AttributeName: 'version', AttributeType: 'N' },
    ],
    KeySchema: [
      { AttributeName: 'mappingId', KeyType: 'HASH' },
      { AttributeName: 'version', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));
}

async function clearTable(tableName: string, keyNames: readonly string[]): Promise<void> {
  const { dynamo } = getTestClients();
  const doc = DynamoDBDocumentClient.from(dynamo);

  const scanned = await doc.send(new ScanCommand({ TableName: tableName }));
  const items = scanned.Items ?? [];
  if (items.length === 0) {
    return;
  }

  for (let index = 0; index < items.length; index += 25) {
    const chunk = items.slice(index, index + 25);
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: chunk.map((item) => ({
            DeleteRequest: {
              Key: Object.fromEntries(keyNames.map((keyName) => [keyName, item[keyName]])),
            },
          })),
        },
      }),
    );
  }
}

export async function clearTablesData(): Promise<void> {
  await clearTable(TEST_TABLES.mappingRevisions, ['mappingId', 'revision']);
  await clearTable(TEST_TABLES.mappingVersions, ['mappingId', 'version']);
  await clearTable(TEST_TABLES.schemaNodes, ['schemaId', 'path']);
  await clearTable(TEST_TABLES.mappings, ['mappingId']);
  await clearTable(TEST_TABLES.schemaMetadata, ['schemaId']);
  await clearTable(TEST_TABLES.projects, ['projectId']);
}

export async function deleteTables(): Promise<void> {
  const { dynamo } = getTestClients();
  const names = Object.values(TEST_TABLES);

  for (const tableName of names) {
    try {
      await dynamo.send(new DeleteTableCommand({ TableName: tableName }));
    } catch {
      // best effort cleanup
    }
  }
}

export async function createBucket(): Promise<void> {
  const { s3 } = getTestClients();
  await s3.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
}

export async function clearBucket(): Promise<void> {
  const { s3 } = getTestClients();
  let continuationToken: string | undefined;

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: TEST_BUCKET,
        ContinuationToken: continuationToken,
      }),
    );

    const objects = (listed.Contents ?? [])
      .map((obj) => obj.Key)
      .filter((key): key is string => typeof key === 'string' && key.length > 0)
      .map((key) => ({ Key: key }));

    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: TEST_BUCKET,
          Delete: {
            Objects: objects,
          },
        }),
      );
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

export async function deleteBucket(): Promise<void> {
  const { s3 } = getTestClients();
  try {
    await s3.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET }));
  } catch {
    // best effort cleanup
  }
}
