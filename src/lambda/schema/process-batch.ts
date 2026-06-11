import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { batchWriteSchemaNodes, type SchemaNode } from '../../lib/schema/index.js';

interface S3BodyLike {
  transformToString?: () => Promise<string>;
}

export interface BatchReference {
  readonly batchIndex: number;
  readonly s3Key: string;
  readonly schemaId: string;
  readonly nodeCount: number;
}

export interface ProcessBatchEvent {
  readonly schemaId?: string;
  readonly batch?: BatchReference;
  readonly batchIndex?: number;
  readonly s3Key?: string;
  readonly nodeCount?: number;
}

export interface ProcessBatchResult {
  readonly batchIndex: number;
  readonly nodesWritten: number;
  readonly errors?: readonly string[];
}

const s3Client = new S3Client({});

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const SCHEMA_BUCKET = getEnvValue('SCHEMA_BUCKET');

function computeEmbeddingTelemetry(nodes: readonly {
  readonly embeddingText?: string;
  readonly embedding?: readonly number[];
}[]): {
  nodeCount: number;
  nodesWithEmbeddingText: number;
  nodesWithEmbeddingVector: number;
  approxEmbeddingBytes: number;
} {
  let nodesWithEmbeddingText = 0;
  let nodesWithEmbeddingVector = 0;
  let approxEmbeddingBytes = 0;

  for (const node of nodes) {
    if (typeof node.embeddingText === 'string' && node.embeddingText.trim() !== '') {
      nodesWithEmbeddingText += 1;
    }

    if (Array.isArray(node.embedding) && node.embedding.length > 0) {
      nodesWithEmbeddingVector += 1;
      approxEmbeddingBytes += node.embedding.length * 8;
    }
  }

  return {
    nodeCount: nodes.length,
    nodesWithEmbeddingText,
    nodesWithEmbeddingVector,
    approxEmbeddingBytes,
  };
}

function getSchemaBucketOrThrow(): string {
  const bucket = SCHEMA_BUCKET?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: SCHEMA_BUCKET');
  }

  return bucket;
}

function resolveBatchReference(event: ProcessBatchEvent): BatchReference {
  if (event.batch) {
    return event.batch;
  }

  if (
    typeof event.batchIndex === 'number'
    && typeof event.s3Key === 'string'
    && typeof event.schemaId === 'string'
    && typeof event.nodeCount === 'number'
  ) {
    return {
      batchIndex: event.batchIndex,
      s3Key: event.s3Key,
      schemaId: event.schemaId,
      nodeCount: event.nodeCount,
    };
  }

  throw new Error('Invalid batch event payload');
}

async function readBatchNodes(s3Key: string): Promise<SchemaNode[]> {
  const bucket = getSchemaBucketOrThrow();
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    }),
  );

  const body = response.Body as S3BodyLike | undefined;
  if (!body?.transformToString) {
    throw new Error(`Batch manifest is empty for s3://${bucket}/${s3Key}`);
  }

  const content = await body.transformToString();
  const parsed = JSON.parse(content) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Batch manifest is not an array for s3://${bucket}/${s3Key}`);
  }

  return parsed as SchemaNode[];
}

export async function handler(event: ProcessBatchEvent): Promise<ProcessBatchResult> {
  let batchRef: BatchReference;
  try {
      batchRef = resolveBatchReference(event);
  } catch (error) {
    return {
      batchIndex: typeof event.batchIndex === 'number' ? event.batchIndex : -1,
      nodesWritten: 0,
      errors: [error instanceof Error ? error.message : 'Invalid event payload'],
    };
  }

  try {
    const nodes = await readBatchNodes(batchRef.s3Key);
    console.info('[schema-process-batch] retrieval fields batch telemetry', {
      schemaId: batchRef.schemaId,
      batchIndex: batchRef.batchIndex,
      ...computeEmbeddingTelemetry(nodes),
    });

    try {
      const writeResult = await batchWriteSchemaNodes(nodes);
      if (writeResult.failed > 0) {
        return {
          batchIndex: batchRef.batchIndex,
          nodesWritten: writeResult.written,
          errors: [`DynamoDB write failed for ${writeResult.failed} nodes`],
        };
      }

      return {
        batchIndex: batchRef.batchIndex,
        nodesWritten: writeResult.written,
      };
    } catch (error) {
      return {
        batchIndex: batchRef.batchIndex,
        nodesWritten: 0,
        errors: [error instanceof Error ? error.message : 'DynamoDB write failed'],
      };
    }
  } catch (error) {
    return {
      batchIndex: batchRef.batchIndex,
      nodesWritten: 0,
      errors: [error instanceof Error ? error.message : 'Failed to process batch'],
    };
  }
}
