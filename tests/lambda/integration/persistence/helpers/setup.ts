import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  type GlobalSecondaryIndex,
} from '@aws-sdk/client-dynamodb';
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  ListBucketsCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { cleanBucket } from './cleanup.js';

type EnvStore = Record<string, string | undefined>;

const env = (globalThis as { process?: { env?: EnvStore } }).process?.env;

const REGION = 'us-east-1';
const DYNAMODB_ENDPOINT = env?.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const S3_ENDPOINT = env?.S3_ENDPOINT ?? 'http://localhost:4566';

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const TEST_TABLES = {
  projects: `keyra-projects-fs061-${SUFFIX}`,
  mappings: `keyra-mappings-fs061-${SUFFIX}`,
  schemaMetadata: `keyra-schema-metadata-fs061-${SUFFIX}`,
  schemaNodes: `keyra-schema-nodes-fs061-${SUFFIX}`,
  schemaDrafts: `keyra-schema-drafts-fs061-${SUFFIX}`,
  schemaVersions: `keyra-schema-versions-fs061-${SUFFIX}`,
  mappingRevisions: `keyra-mapping-revisions-fs061-${SUFFIX}`,
  mappingVersions: `keyra-mapping-versions-fs061-${SUFFIX}`,
} as const;

export const TEST_BUCKET = `keyra-storage-fs061-${SUFFIX}`;

function awsCredentials() {
  return {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  };
}

function createDynamoControlClient(): DynamoDBClient {
  return new DynamoDBClient({
    region: REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: awsCredentials(),
  });
}

function createS3ControlClient(): S3Client {
  return new S3Client({
    region: REGION,
    endpoint: S3_ENDPOINT,
    credentials: awsCredentials(),
    forcePathStyle: true,
  });
}

export function applyIntegrationEnvironment(): void {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available');
  }

  processRef.env.AWS_REGION = REGION;
  processRef.env.AWS_ACCESS_KEY_ID = 'test';
  processRef.env.AWS_SECRET_ACCESS_KEY = 'test';

  processRef.env.DYNAMODB_ENDPOINT = DYNAMODB_ENDPOINT;
  processRef.env.S3_ENDPOINT = S3_ENDPOINT;

  // Persistence module env names.
  processRef.env.PROJECTS_TABLE = TEST_TABLES.projects;
  processRef.env.MAPPINGS_TABLE = TEST_TABLES.mappings;
  processRef.env.SCHEMA_METADATA_TABLE = TEST_TABLES.schemaMetadata;
  processRef.env.SCHEMA_NODES_TABLE = TEST_TABLES.schemaNodes;
  processRef.env.SCHEMA_DRAFTS_TABLE = TEST_TABLES.schemaDrafts;
  processRef.env.SCHEMA_VERSIONS_TABLE = TEST_TABLES.schemaVersions;
  processRef.env.MAPPING_REVISIONS_TABLE = TEST_TABLES.mappingRevisions;
  processRef.env.MAPPING_VERSIONS_TABLE = TEST_TABLES.mappingVersions;
  processRef.env.STORAGE_BUCKET = TEST_BUCKET;

  // Lambda handler env names used by FS-057 handlers.
  processRef.env.SCHEMAS_TABLE = TEST_TABLES.schemaMetadata;
  processRef.env.CONTENT_BUCKET = TEST_BUCKET;
}

export async function assertLocalServicesAvailable(): Promise<void> {
  const dynamo = createDynamoControlClient();
  const s3 = createS3ControlClient();

  try {
    await dynamo.send(new ListTablesCommand({}));
  } catch {
    throw new Error(`DynamoDB Local not reachable at ${DYNAMODB_ENDPOINT}`);
  }

  try {
    await s3.send(new ListBucketsCommand({}));
  } catch {
    throw new Error(`LocalStack S3 not reachable at ${S3_ENDPOINT}`);
  }
}

function mappingProjectIndex(): GlobalSecondaryIndex {
  return {
    IndexName: 'projectId-index',
    KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
    Projection: { ProjectionType: 'ALL' },
  };
}

function schemaNodeIndexes(): GlobalSecondaryIndex[] {
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

async function waitForTableActive(tableName: string): Promise<void> {
  const dynamo = createDynamoControlClient();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await dynamo.send(new DescribeTableCommand({ TableName: tableName }));
    if (response.Table?.TableStatus === 'ACTIVE') {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }

  throw new Error(`Timed out waiting for table ${tableName} to become ACTIVE`);
}

export async function createTables(): Promise<void> {
  const dynamo = createDynamoControlClient();

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
    GlobalSecondaryIndexes: [mappingProjectIndex()],
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
    GlobalSecondaryIndexes: schemaNodeIndexes(),
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await dynamo.send(new CreateTableCommand({
    TableName: TEST_TABLES.schemaDrafts,
    AttributeDefinitions: [
      { AttributeName: 'schemaId', AttributeType: 'S' },
      { AttributeName: 'revision', AttributeType: 'N' },
    ],
    KeySchema: [
      { AttributeName: 'schemaId', KeyType: 'HASH' },
      { AttributeName: 'revision', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await dynamo.send(new CreateTableCommand({
    TableName: TEST_TABLES.schemaVersions,
    AttributeDefinitions: [
      { AttributeName: 'schemaId', AttributeType: 'S' },
      { AttributeName: 'version', AttributeType: 'N' },
    ],
    KeySchema: [
      { AttributeName: 'schemaId', KeyType: 'HASH' },
      { AttributeName: 'version', KeyType: 'RANGE' },
    ],
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

  await waitForTableActive(TEST_TABLES.projects);
  await waitForTableActive(TEST_TABLES.mappings);
  await waitForTableActive(TEST_TABLES.schemaMetadata);
  await waitForTableActive(TEST_TABLES.schemaNodes);
  await waitForTableActive(TEST_TABLES.schemaDrafts);
  await waitForTableActive(TEST_TABLES.schemaVersions);
  await waitForTableActive(TEST_TABLES.mappingRevisions);
  await waitForTableActive(TEST_TABLES.mappingVersions);
}

export async function deleteTables(): Promise<void> {
  const dynamo = createDynamoControlClient();
  const orderedDeletion = [
    TEST_TABLES.mappingVersions,
    TEST_TABLES.mappingRevisions,
    TEST_TABLES.schemaVersions,
    TEST_TABLES.schemaDrafts,
    TEST_TABLES.schemaNodes,
    TEST_TABLES.schemaMetadata,
    TEST_TABLES.mappings,
    TEST_TABLES.projects,
  ];

  for (const tableName of orderedDeletion) {
    try {
      await dynamo.send(new DeleteTableCommand({ TableName: tableName }));
    } catch {
      // best-effort teardown
    }
  }
}

export async function createBucket(): Promise<void> {
  const s3 = createS3ControlClient();
  await s3.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }));
}

export async function deleteBucket(): Promise<void> {
  await cleanBucket(TEST_BUCKET);
  const s3 = createS3ControlClient();

  try {
    await s3.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET }));
  } catch {
    // best-effort teardown
  }
}
