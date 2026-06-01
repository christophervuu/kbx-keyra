import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import {
  createMappingsModule,
  createMappingVersionsModule,
  createProjectsModule,
  createSchemaMetadataModule,
  createSchemaNodesModule,
  createS3Module,
} from './session-factories.js';
import { TEST_BUCKET, TEST_TABLES } from './setup.js';

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

function createRawClients() {
  const dynamoBase = new DynamoDBClient({
    region: REGION,
    endpoint: DYNAMODB_ENDPOINT,
    credentials: credentials(),
  });

  const dynamo = DynamoDBDocumentClient.from(dynamoBase);

  const s3 = new S3Client({
    region: REGION,
    endpoint: S3_ENDPOINT,
    credentials: credentials(),
    forcePathStyle: true,
  });

  return {
    dynamo,
    s3,
  };
}

interface PersistenceTableNames {
  readonly projects: string;
  readonly mappings: string;
  readonly schemaMetadata: string;
  readonly schemaNodes: string;
  readonly mappingRevisions: string;
  readonly mappingVersions: string;
}

interface PersistenceConfig {
  readonly tableNames: PersistenceTableNames;
  readonly bucketName: string;
}

export interface FreshSession {
  readonly projects: ReturnType<typeof createProjectsModule>;
  readonly mappings: ReturnType<typeof createMappingsModule>;
  readonly schemaMetadata: ReturnType<typeof createSchemaMetadataModule>;
  readonly schemaNodes: ReturnType<typeof createSchemaNodesModule>;
  readonly mappingVersions: ReturnType<typeof createMappingVersionsModule>;
  readonly s3: ReturnType<typeof createS3Module>;
  readonly __sessionId: string;
}

export function createFreshSession(): FreshSession {
  const clients = createRawClients();
  const config: PersistenceConfig = {
    tableNames: {
      projects: TEST_TABLES.projects,
      mappings: TEST_TABLES.mappings,
      schemaMetadata: TEST_TABLES.schemaMetadata,
      schemaNodes: TEST_TABLES.schemaNodes,
      mappingRevisions: TEST_TABLES.mappingRevisions,
      mappingVersions: TEST_TABLES.mappingVersions,
    },
    bucketName: TEST_BUCKET,
  };

  const s3 = createS3Module({
    s3Client: clients.s3,
    bucketName: config.bucketName,
  });

  return {
    projects: createProjectsModule({
      dynamoClient: clients.dynamo,
      tableName: config.tableNames.projects,
    }),
    mappings: createMappingsModule({
      dynamoClient: clients.dynamo,
      s3Client: clients.s3,
      tableName: config.tableNames.mappings,
      bucketName: config.bucketName,
    }),
    schemaMetadata: createSchemaMetadataModule({
      dynamoClient: clients.dynamo,
      tableName: config.tableNames.schemaMetadata,
    }),
    schemaNodes: createSchemaNodesModule({
      dynamoClient: clients.dynamo,
      tableName: config.tableNames.schemaNodes,
    }),
    mappingVersions: createMappingVersionsModule({
      dynamoClient: clients.dynamo,
      s3Client: clients.s3,
      tableName: config.tableNames.mappingVersions,
      bucketName: config.bucketName,
    }),
    s3,
    __sessionId: crypto.randomUUID(),
  };
}
