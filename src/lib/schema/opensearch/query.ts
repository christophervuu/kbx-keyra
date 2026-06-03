import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';

import type { SchemaQueryFilters } from '../types.js';
import { SCHEMA_NODES_INDEX } from './mapping.js';

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const OPENSEARCH_ENDPOINT = getEnvValue('OPENSEARCH_ENDPOINT');

type OpenSearchClientLike = {
  search(params: {
    readonly index: string;
    readonly size: number;
    readonly body: unknown;
  }): Promise<{
    readonly body?: {
      readonly hits?: {
        readonly hits?: Array<{
          readonly _score?: number;
          readonly _source?: Record<string, unknown>;
        }>;
      };
    };
  }>;
};

let openSearchClient: OpenSearchClientLike | undefined;

function getOpenSearchClient(): OpenSearchClientLike {
  if (!openSearchClient) {
    openSearchClient = new Client({
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
  }

  return openSearchClient;
}

const DEFAULT_QUERY_LIMIT = 20;
const MAX_QUERY_LIMIT = 100;

export interface RawSearchResult {
  readonly path: string;
  readonly fieldName: string;
  readonly type: string;
  readonly depth: number;
  readonly isArray: boolean;
  readonly parentPath?: string;
  readonly embeddingText: string;
  readonly score: number;
}

export type OpenSearchQueryErrorCode = 'SCHEMA_OPENSEARCH_CONFIG_ERROR' | 'SCHEMA_OPENSEARCH_QUERY_ERROR';

export class OpenSearchQueryError extends Error {
  constructor(
    public readonly code: OpenSearchQueryErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OpenSearchQueryError';
  }
}

function getEndpointOrThrow(): string {
  const endpoint = OPENSEARCH_ENDPOINT?.trim();
  if (!endpoint) {
    throw new OpenSearchQueryError(
      'SCHEMA_OPENSEARCH_CONFIG_ERROR',
      'Missing required environment variable: OPENSEARCH_ENDPOINT',
    );
  }

  return endpoint;
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_QUERY_LIMIT;
  }

  const floored = Math.floor(limit);
  if (floored <= 0) {
    return DEFAULT_QUERY_LIMIT;
  }

  return Math.min(floored, MAX_QUERY_LIMIT);
}

function buildFilterClauses(schemaId: string, filters?: SchemaQueryFilters): unknown[] {
  const filterClauses: unknown[] = [
    {
      term: {
        schemaId,
      },
    },
  ];

  if (filters?.type && filters.type.length > 0) {
    filterClauses.push({
      terms: {
        type: filters.type,
      },
    });
  }

  if (typeof filters?.isArray === 'boolean') {
    filterClauses.push({
      term: {
        isArray: filters.isArray,
      },
    });
  }

  if (typeof filters?.depth === 'number' && Number.isFinite(filters.depth)) {
    filterClauses.push({
      term: {
        depth: Math.floor(filters.depth),
      },
    });
  }

  return filterClauses;
}

function parseRawSearchResults(response: {
  readonly body?: {
    readonly hits?: {
      readonly hits?: Array<{
        readonly _score?: number;
        readonly _source?: Record<string, unknown>;
      }>;
    };
  };
}): RawSearchResult[] {
  const hits = response.body?.hits?.hits ?? [];

  const results: RawSearchResult[] = [];

  for (const hit of hits) {
    const source = hit._source;
    if (!source) {
      continue;
    }

    const path = source.path;
    const fieldName = source.fieldName;
    const type = source.type;
    const depth = source.depth;
    const isArray = source.isArray;
    const embeddingText = source.embeddingText;
    const parentPath = source.parentPath;

    if (
      typeof path !== 'string'
      || typeof fieldName !== 'string'
      || typeof type !== 'string'
      || typeof depth !== 'number'
      || typeof isArray !== 'boolean'
      || typeof embeddingText !== 'string'
    ) {
      continue;
    }

    results.push({
      path,
      fieldName,
      type,
      depth,
      isArray,
      embeddingText,
      parentPath: typeof parentPath === 'string' && parentPath !== '' ? parentPath : undefined,
      score: typeof hit._score === 'number' ? hit._score : 0,
    });
  }

  return results;
}

export async function searchSchemaNodes(
  schemaId: string,
  query: string,
  filters?: SchemaQueryFilters,
  limit?: number,
): Promise<RawSearchResult[]> {
  getEndpointOrThrow();

  const normalizedLimit = normalizeLimit(limit);
  const filterClauses = buildFilterClauses(schemaId, filters);

  try {
    const response = await getOpenSearchClient().search({
      index: SCHEMA_NODES_INDEX,
      size: normalizedLimit,
      body: {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['fieldName^3', 'path^2', 'embeddingText^1'],
                },
              },
            ],
            filter: filterClauses,
          },
        },
      },
    });

    return parseRawSearchResults(response);
  } catch (error) {
    throw new OpenSearchQueryError('SCHEMA_OPENSEARCH_QUERY_ERROR', 'Failed to query schema nodes in OpenSearch', error);
  }
}
