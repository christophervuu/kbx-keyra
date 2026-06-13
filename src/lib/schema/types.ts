/**
 * Supported input schema formats for ingestion.
 */
export type SchemaFormat = 'json-schema' | 'xsd';

/**
 * Lifecycle states for schema ingestion.
 */
export type SchemaStatus = 'ingesting' | 'ready' | 'error';

/**
 * Source origin categories for ingested schemas.
 */
export type SchemaOrigin = 'cdm' | 'published' | 'local';

/**
 * Source metadata for uploaded schema content.
 */
export interface SchemaSource {
  /**
   * Source type discriminator.
   */
  readonly type: 'upload' | 'github';
  /**
   * GitHub repository owner/name when source is GitHub.
   */
  readonly repo?: string;
  /**
   * GitHub branch name when source is GitHub.
   */
  readonly branch?: string;
  /**
   * GitHub file path when source is GitHub.
   */
  readonly path?: string;
  /**
   * Optional source commit SHA when known.
   */
  readonly commitSha?: string;
}

/**
 * DynamoDB-backed schema node record.
 *
 * This shape mirrors the SchemaNodes table definition.
 */
export interface SchemaNode {
  /**
   * Parent schema identifier (DynamoDB partition key).
   */
  readonly schemaId: string;
  /**
   * Dot-notation field path (DynamoDB sort key).
   */
  readonly path: string;
  /**
   * Field name at this path.
   */
  readonly fieldName: string;
  /**
   * Simplified field type string.
   */
  readonly type: string;
  /**
   * Human-readable field description when available.
   */
  readonly description?: string;
  /**
   * Nesting depth from schema root.
   */
  readonly depth: number;
  /**
   * Indicates whether this node represents an array field.
   */
  readonly isArray: boolean;
  /**
   * Indicates whether this node is required by its parent.
   */
  readonly isRequired: boolean;
  /**
   * Dot-notation parent path; undefined at root-level nodes.
   */
  readonly parentPath?: string;
  /**
   * Number of direct child fields.
   */
  readonly childCount: number;
  /**
   * Total descendant field count in this node's subtree.
   */
  readonly subtreeFieldCount: number;
  /**
   * Canonical text used for BM25 search and future embedding generation.
   */
  readonly embeddingText: string;
  /**
   * Optional deterministic embedding vector stored per-node in DynamoDB.
   */
  readonly embedding?: readonly number[];
}

/**
 * DynamoDB-backed schema metadata record.
 *
 * This shape mirrors the SchemaMetadata table definition.
 */
export interface SchemaMetadata {
  /**
   * Unique schema identifier.
   */
  readonly schemaId: string;
  /**
   * Display name for the schema.
   */
  readonly name: string;
  /**
   * Declared schema format.
   */
  readonly format: SchemaFormat;
  /**
   * Total leaf field count.
   */
  readonly fieldCount: number;
  /**
   * Source origin classification.
   */
  readonly origin: SchemaOrigin;
  /**
   * Ingestion lifecycle state.
   */
  readonly status: SchemaStatus;
  /**
   * Original source metadata (upload or GitHub reference).
   */
  readonly source: SchemaSource;
  /**
   * Record creation timestamp (ISO-8601).
   */
  readonly createdAt: string;
  /**
   * Last update timestamp (ISO-8601).
   */
  readonly updatedAt: string;
}

/**
 * Input payload for schema ingestion requests.
 */
export interface IngestionRequest {
  /**
   * Display name for the schema.
   */
  readonly name: string;
  /**
   * Raw uploaded schema content (JSON or XML string).
   */
  readonly content: string;
  /**
   * Declared schema format.
   */
  readonly format: SchemaFormat;
  /**
   * Source origin classification.
   */
  readonly origin: SchemaOrigin;
  /**
   * Optional source metadata map.
   */
  readonly source?: SchemaSource;
}

/**
 * Synchronous inline ingestion result.
 */
export interface InlineIngestionResult {
  /**
   * Newly created schema identifier.
   */
  readonly schemaId: string;
  /**
   * Final status for inline path.
   */
  readonly status: 'ready';
  /**
   * Persisted schema metadata record.
   */
  readonly metadata: SchemaMetadata;
}

/**
 * Asynchronous Step Functions ingestion start result.
 */
export interface OrchestratedIngestionResult {
  /**
   * Newly created schema identifier.
   */
  readonly schemaId: string;
  /**
   * Initial status when asynchronous ingestion has started.
   */
  readonly status: 'ingesting';
  /**
   * Started Step Functions execution ARN.
   */
  readonly executionArn: string;
}

/**
 * Combined ingest response shape for inline and orchestrated flows.
 */
export type IngestionResult = InlineIngestionResult | OrchestratedIngestionResult;

/**
 * Query filters for schema node search.
 */
export interface SchemaQueryFilters {
  /**
   * Restrict results to one or more field types.
   */
  readonly type?: readonly string[];
  /**
   * Restrict results to array or non-array fields.
   */
  readonly isArray?: boolean;
  /**
   * Restrict results to an exact nesting depth.
   */
  readonly depth?: number;
}

/**
 * Input payload for schema node query endpoint.
 */
export interface QuerySchemaNodesRequest {
  /**
   * Search text used for keyword matching.
   */
  readonly query: string;
  /**
   * Optional query filters.
   */
  readonly filters?: SchemaQueryFilters;
  /**
   * Opt-in structural enrichment of parent path chain.
   *
   * Defaults to false when omitted.
   */
  readonly includeParentChain?: boolean;
  /**
   * Optional maximum result count.
   *
   * Defaults to 20 when omitted; capped at 100.
   */
  readonly limit?: number;
}

/**
 * Single ranked search result returned by schema query endpoint.
 */
export interface SchemaSearchResult {
  /**
   * Dot-notation field path for the matched node.
   */
  readonly path: string;
  /**
   * Matched field name.
   */
  readonly fieldName: string;
  /**
   * Matched field type.
   */
  readonly type: string;
  /**
   * Nesting depth of the matched field.
   */
  readonly depth: number;
  /**
   * Whether the matched field is an array node.
   */
  readonly isArray: boolean;
  /**
   * Relevance score returned by search backend.
   */
  readonly score: number;
  /**
   * Canonical text used for keyword search and future embeddings.
   */
  readonly embeddingText: string;
  /**
   * Optional ordered parent path chain from root to direct parent.
   */
  readonly parentChain?: readonly string[];
}

/**
 * Runtime schema-retriever modes for AI/schema-query paths.
 */
export type SchemaRetrieverMode = 'dynamodb';

/**
 * Search request passed to retriever implementations.
 */
export interface SchemaRetrieverSearchRequest {
  readonly schemaId: string;
  readonly query: string;
  readonly filters?: SchemaQueryFilters;
  readonly limit?: number;
  /**
   * Optional correlation/request identifiers used for retrieval telemetry.
   */
  readonly requestId?: string;
  readonly correlationId?: string;
  /**
   * Optional per-request override for embedding rerank.
   *
   * When omitted, runtime defaults are used.
   */
  readonly enableRerank?: boolean;
  /**
   * Optional per-request structural context expansion.
   *
   * When true, retriever may append bounded sibling/children context nodes
   * beyond the lexical/rerank base set.
   */
  readonly includeContextExpansion?: boolean;
  /**
   * Optional non-fatal shadow telemetry callback.
   */
  readonly onShadowTelemetry?: (payload: {
    readonly schemaId: string;
    readonly queryLength: number;
    readonly primary: 'dynamodb';
    readonly secondary: 'dynamodb';
    readonly sampled: boolean;
    readonly jaccardAt10?: number;
    readonly ndcgDeltaAt10?: number;
    readonly timingDeltaMs?: number;
    readonly secondaryResultCount?: number;
    readonly secondaryFailed?: boolean;
    readonly secondaryError?: string;
  }) => void;
}

/**
 * Shared schema-retriever interface used by AI and schema-query handlers.
 */
export interface SchemaRetriever {
  searchSchemaNodes(request: SchemaRetrieverSearchRequest): Promise<SchemaSearchResult[]>;
}
