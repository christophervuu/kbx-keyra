import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';

import type { SchemaNode } from '../types.js';
import { SCHEMA_NODES_INDEX, SCHEMA_NODES_INDEX_MAPPING } from './mapping.js';

const OPENSEARCH_BULK_SIZE = 500;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const OPENSEARCH_ENDPOINT = getEnvValue('OPENSEARCH_ENDPOINT');

type OpenSearchClientLike = {
  readonly indices: {
    exists(params: { readonly index: string }): Promise<{ readonly body?: boolean }>;
    create(params: { readonly index: string; readonly body: unknown }): Promise<unknown>;
  };
  bulk(params: { readonly body: unknown[]; readonly refresh?: 'wait_for' }): Promise<{
    readonly body?: {
      readonly errors?: boolean;
      readonly items?: Array<Record<string, { readonly error?: unknown }>>;
    };
  }>;
  deleteByQuery(params: { readonly index: string; readonly body: unknown; readonly refresh?: boolean }): Promise<unknown>;
};

const openSearchClient: OpenSearchClientLike = new Client({
  ...AwsSigv4Signer({
    region: getEnvValue('AWS_REGION') ?? 'us-east-1',
    service: 'aoss',
    getCredentials: () => {
      const provider = defaultProvider();
      return provider();
    },
  }),
  node: OPENSEARCH_ENDPOINT,
}) as unknown as OpenSearchClientLike;

export type OpenSearchIndexerErrorCode =
  | 'SCHEMA_OPENSEARCH_CONFIG_ERROR'
  | 'SCHEMA_OPENSEARCH_INDEX_ERROR'
  | 'SCHEMA_OPENSEARCH_BULK_ERROR'
  | 'SCHEMA_OPENSEARCH_DELETE_ERROR';

export class OpenSearchIndexerError extends Error {
  constructor(
    public readonly code: OpenSearchIndexerErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OpenSearchIndexerError';
  }
}

function getEndpointOrThrow(): string {
  const endpoint = OPENSEARCH_ENDPOINT?.trim();
  if (!endpoint) {
    throw new OpenSearchIndexerError(
      'SCHEMA_OPENSEARCH_CONFIG_ERROR',
      'Missing required environment variable: OPENSEARCH_ENDPOINT',
    );
  }

  return endpoint;
}

function chunkNodes(nodes: readonly SchemaNode[]): SchemaNode[][] {
  const chunks: SchemaNode[][] = [];
  for (let index = 0; index < nodes.length; index += OPENSEARCH_BULK_SIZE) {
    chunks.push(nodes.slice(index, index + OPENSEARCH_BULK_SIZE));
  }

  return chunks;
}

function buildDocumentId(node: SchemaNode): string {
  return `${node.schemaId}#${node.path}`;
}

function toOpenSearchDocument(node: SchemaNode): Record<string, unknown> {
  return {
    schemaId: node.schemaId,
    path: node.path,
    fieldName: node.fieldName,
    embeddingText: node.embeddingText,
    embedding: [],
    type: node.type,
    depth: node.depth,
    parentPath: node.parentPath,
    isArray: node.isArray,
  };
}

export async function ensureIndexExists(): Promise<void> {
  getEndpointOrThrow();

  try {
    const existsResult = await openSearchClient.indices.exists({
      index: SCHEMA_NODES_INDEX,
    });

    if (existsResult.body === true) {
      return;
    }

    await openSearchClient.indices.create({
      index: SCHEMA_NODES_INDEX,
      body: SCHEMA_NODES_INDEX_MAPPING,
    });
  } catch (error) {
    throw new OpenSearchIndexerError('SCHEMA_OPENSEARCH_INDEX_ERROR', 'Failed to ensure OpenSearch index exists', error);
  }
}

export async function bulkIndexSchemaNodes(nodes: readonly SchemaNode[]): Promise<{ indexed: number; failed: number }> {
  getEndpointOrThrow();

  if (nodes.length === 0) {
    return {
      indexed: 0,
      failed: 0,
    };
  }

  const chunks = chunkNodes(nodes);
  let indexed = 0;
  let failed = 0;

  for (const [chunkIndex, chunk] of chunks.entries()) {
    const body: unknown[] = [];
    for (const node of chunk) {
      body.push({
        index: {
          _index: SCHEMA_NODES_INDEX,
          _id: buildDocumentId(node),
        },
      });
      body.push(toOpenSearchDocument(node));
    }

    const isFinalBatch = chunkIndex === chunks.length - 1;

    try {
      const response = await openSearchClient.bulk({
        body,
        ...(isFinalBatch ? { refresh: 'wait_for' } : {}),
      });

      const hasErrors = response.body?.errors === true;
      const items = response.body?.items ?? [];

      if (!hasErrors) {
        indexed += chunk.length;
        continue;
      }

      let chunkFailed = 0;
      for (const item of items) {
        const op = item.index;
        if (op?.error) {
          chunkFailed += 1;
        }
      }

      failed += chunkFailed;
      indexed += chunk.length - chunkFailed;
    } catch (error) {
      throw new OpenSearchIndexerError('SCHEMA_OPENSEARCH_BULK_ERROR', 'Failed to bulk index schema nodes', error);
    }
  }

  return {
    indexed,
    failed,
  };
}

export async function deleteSchemaDocuments(schemaId: string): Promise<void> {
  getEndpointOrThrow();

  try {
    await openSearchClient.deleteByQuery({
      index: SCHEMA_NODES_INDEX,
      refresh: true,
      body: {
        query: {
          term: {
            schemaId,
          },
        },
      },
    });
  } catch (error) {
    throw new OpenSearchIndexerError(
      'SCHEMA_OPENSEARCH_DELETE_ERROR',
      `Failed to delete OpenSearch documents for schemaId '${schemaId}'`,
      error,
    );
  }
}
