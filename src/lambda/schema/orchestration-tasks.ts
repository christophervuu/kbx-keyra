import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import {
  parseJsonSchema,
  parseXsd,
  storeProcessedContent,
  updateSchemaStatus,
  type SchemaFormat,
  type SchemaNode,
} from '../../lib/schema/index.js';

interface S3BodyLike {
  transformToString?: () => Promise<string>;
}

export interface BatchReference {
  readonly batchIndex: number;
  readonly s3Key: string;
  readonly schemaId: string;
  readonly nodeCount: number;
}

export interface ParseSchemaEvent {
  readonly schemaId: string;
  readonly s3Key: string;
  readonly format: SchemaFormat;
}

export interface AggregateBatchResult {
  readonly batchIndex: number;
  readonly nodesWritten: number;
  readonly nodesIndexed: number;
  readonly errors?: readonly string[];
}

export interface AggregateResultsEvent {
  readonly schemaId: string;
  readonly fieldCount: number;
  readonly processedContentS3Key?: string;
  readonly batchResults?: readonly AggregateBatchResult[];
}

export interface UpdateMetadataEvent {
  readonly schemaId: string;
  readonly status: 'ready' | 'error';
  readonly fieldCount?: number;
}

export interface HandleErrorEvent {
  readonly schemaId: string;
  readonly status?: 'error';
  readonly error?: unknown;
}

const BATCH_SIZE = 500;
const s3Client = new S3Client({});

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMA_BUCKET = getEnvValue('SCHEMA_BUCKET');

function getSchemaBucketOrThrow(): string {
  const bucket = SCHEMA_BUCKET?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: SCHEMA_BUCKET');
  }

  return bucket;
}

function chunkNodes(nodes: readonly SchemaNode[]): SchemaNode[][] {
  const chunks: SchemaNode[][] = [];
  for (let index = 0; index < nodes.length; index += BATCH_SIZE) {
    chunks.push(nodes.slice(index, index + BATCH_SIZE));
  }

  return chunks;
}

async function readOriginalSchemaContent(s3Key: string): Promise<string> {
  const bucket = getSchemaBucketOrThrow();
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    }),
  );

  const body = response.Body as S3BodyLike | undefined;
  if (!body?.transformToString) {
    throw new Error(`Original schema body is empty for s3://${bucket}/${s3Key}`);
  }

  return body.transformToString();
}

export async function parseSchemaTask(event: ParseSchemaEvent): Promise<{
  batchReferences: BatchReference[];
  fieldCount: number;
  processedContentS3Key: string;
}> {
  const content = await readOriginalSchemaContent(event.s3Key);

  const parsed = event.format === 'xsd' ? parseXsd(content, event.schemaId) : parseJsonSchema(content, event.schemaId);

  const chunks = chunkNodes(parsed.nodes);
  const bucket = getSchemaBucketOrThrow();
  const batchReferences: BatchReference[] = [];

  await Promise.all(
    chunks.map(async (chunk, index) => {
      const key = `schemas/${event.schemaId}/batches/batch-${index}.json`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(chunk),
          ContentType: 'application/json',
        }),
      );

      batchReferences.push({
        batchIndex: index,
        s3Key: key,
        schemaId: event.schemaId,
        nodeCount: chunk.length,
      });
    }),
  );

  batchReferences.sort((a, b) => a.batchIndex - b.batchIndex);

  return {
    batchReferences,
    fieldCount: parsed.fieldCount,
    processedContentS3Key: `schemas/${event.schemaId}/content.json`,
  };
}

export async function aggregateResultsTask(event: AggregateResultsEvent): Promise<{
  schemaId: string;
  fieldCount: number;
  written: number;
  indexed: number;
  failed: number;
}> {
  const results = event.batchResults ?? [];

  const written = results.reduce((sum, item) => sum + item.nodesWritten, 0);
  const indexed = results.reduce((sum, item) => sum + item.nodesIndexed, 0);
  const failed = results.reduce((sum, item) => sum + (item.errors && item.errors.length > 0 ? 1 : 0), 0);

  await storeProcessedContent(event.schemaId, {
    schemaId: event.schemaId,
    fieldCount: event.fieldCount,
    batchResults: results,
    summary: {
      written,
      indexed,
      failed,
    },
  });

  return {
    schemaId: event.schemaId,
    fieldCount: event.fieldCount,
    written,
    indexed,
    failed,
  };
}

export async function updateMetadataTask(event: UpdateMetadataEvent): Promise<{ schemaId: string; status: string; fieldCount: number }> {
  if (event.status === 'ready') {
    await updateSchemaStatus(event.schemaId, 'ready', {
      fieldCount: event.fieldCount ?? 0,
    });

    return {
      schemaId: event.schemaId,
      status: 'ready',
      fieldCount: event.fieldCount ?? 0,
    };
  }

  await updateSchemaStatus(event.schemaId, 'error');

  return {
    schemaId: event.schemaId,
    status: 'error',
    fieldCount: event.fieldCount ?? 0,
  };
}

export async function handleErrorTask(event: HandleErrorEvent): Promise<{ schemaId: string; status: 'error'; errorDetails: string }> {
  const errorDetails = JSON.stringify(
    event.error
    ?? {
      message: 'Unknown error',
      traceId: `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    },
  );

  await updateSchemaStatus(event.schemaId, 'error', {
    name: `error:${errorDetails.slice(0, 120)}`,
  });

  return {
    schemaId: event.schemaId,
    status: 'error',
    errorDetails,
  };
}

type OrchestrationEvent =
  | ({ readonly action: 'parse' } & ParseSchemaEvent)
  | ({ readonly action: 'aggregate' } & AggregateResultsEvent)
  | ({ readonly action: 'updateMetadata' } & UpdateMetadataEvent)
  | ({ readonly action: 'handleError' } & HandleErrorEvent);

export async function handler(event: OrchestrationEvent): Promise<unknown> {
  switch (event.action) {
    case 'parse':
      return parseSchemaTask(event);
    case 'aggregate':
      return aggregateResultsTask(event);
    case 'updateMetadata':
      return updateMetadataTask(event);
    case 'handleError':
      return handleErrorTask(event);
    default: {
      const neverAction: never = event.action;
      throw new Error(`Unsupported orchestration action: ${String(neverAction)}`);
    }
  }
}
