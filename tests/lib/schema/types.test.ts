import { afterEach, describe, expect, it } from 'vitest';

import {
  DYNAMO_BATCH_SIZE,
  INLINE_FIELD_THRESHOLD,
  OPENSEARCH_BULK_SIZE,
  getInlineFieldThreshold,
  type IngestionRequest,
  type IngestionResult,
  type QuerySchemaNodesRequest,
  type SchemaMetadata,
  type SchemaNode,
  type SchemaSearchResult,
} from '../../../src/lib/schema/index.js';

type EnvStore = Record<string, string | undefined>;

function getTestEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

const ORIGINAL_INLINE_THRESHOLD = getTestEnvStore().SCHEMA_INLINE_FIELD_THRESHOLD;

function setInlineThreshold(value: string | undefined): void {
  const envStore = getTestEnvStore();

  if (value === undefined) {
    delete envStore.SCHEMA_INLINE_FIELD_THRESHOLD;
    return;
  }

  envStore.SCHEMA_INLINE_FIELD_THRESHOLD = value;
}

describe('lib/schema types and constants', () => {
  afterEach(() => {
    setInlineThreshold(ORIGINAL_INLINE_THRESHOLD);
  });

  it('exports constants with documented baseline values', () => {
    expect(INLINE_FIELD_THRESHOLD).toBe(500);
    expect(DYNAMO_BATCH_SIZE).toBe(25);
    expect(OPENSEARCH_BULK_SIZE).toBe(500);
  });

  it('exposes assignable contracts for schema ingestion types', () => {
    const node: SchemaNode = {
      schemaId: 'schema-1',
      path: 'Order.Header.DocumentType',
      fieldName: 'DocumentType',
      type: 'string',
      description: 'The type of business document',
      depth: 2,
      isArray: false,
      isRequired: true,
      parentPath: 'Order.Header',
      childCount: 0,
      subtreeFieldCount: 1,
      embeddingText: 'Order.Header.DocumentType | DocumentType (string) | The type of business document',
    };

    const metadata: SchemaMetadata = {
      schemaId: 'schema-1',
      name: 'Order Schema',
      format: 'json-schema',
      fieldCount: 1,
      origin: 'local',
      status: 'ready',
      source: {
        type: 'upload',
      },
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };

    const request: IngestionRequest = {
      name: 'Order Schema',
      content: '{"type":"object","properties":{}}',
      format: 'json-schema',
      origin: 'local',
    };

    const inlineResult: IngestionResult = {
      schemaId: 'schema-1',
      status: 'ready',
      metadata,
    };

    const stepFunctionsResult: IngestionResult = {
      schemaId: 'schema-2',
      status: 'ingesting',
      executionArn: 'arn:aws:states:us-east-1:123456789012:execution:ingest:exec-1',
    };

    const queryRequest: QuerySchemaNodesRequest = {
      query: 'postal code',
      filters: {
        type: ['string'],
        isArray: false,
        depth: 3,
      },
      includeParentChain: true,
    };

    const searchResult: SchemaSearchResult = {
      path: 'Order.Buyer.Address.PostalCode',
      fieldName: 'PostalCode',
      type: 'string',
      depth: 3,
      isArray: false,
      score: 1.23,
      embeddingText: 'Order.Buyer.Address.PostalCode | PostalCode (string)',
      parentChain: ['Order', 'Order.Buyer', 'Order.Buyer.Address'],
    };

    expect(node.path).toContain('Order.Header');
    expect(metadata.status).toBe('ready');
    expect(request.format).toBe('json-schema');
    expect(inlineResult.status).toBe('ready');
    expect(stepFunctionsResult.status).toBe('ingesting');
    expect(queryRequest.includeParentChain).toBe(true);
    expect(searchResult.parentChain?.at(-1)).toBe('Order.Buyer.Address');
  });

  it('returns default threshold when env var is unset', () => {
    setInlineThreshold(undefined);

    expect(getInlineFieldThreshold()).toBe(500);
  });

  it('returns configured threshold when env var is numeric', () => {
    setInlineThreshold('1000');

    expect(getInlineFieldThreshold()).toBe(1000);
  });

  it('returns default threshold when env var is non-numeric', () => {
    setInlineThreshold('not-a-number');

    expect(getInlineFieldThreshold()).toBe(500);
  });
});
