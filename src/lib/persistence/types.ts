export type ISODateString = string;

export type SchemaRefType = 'github' | 'local' | 'published';

export interface SchemaRef {
  readonly schemaId: string;
  readonly type: SchemaRefType;
  readonly commitSha?: string;
}

export interface MappingRule {
  readonly target: string;
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'any';
  readonly expression: string;
  readonly description?: string;
}

export interface MappingConfigOptions {
  readonly unmappedTargets?: 'omit' | 'null' | 'error';
  readonly nullSubtrees?: readonly string[];
  readonly constants?: Readonly<Record<string, unknown>>;
  readonly externalSources?: readonly string[];
}

export interface MappingConfig {
  readonly id?: string;
  readonly projectId?: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly version: number;
  readonly engineVersion: string;
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
  readonly config: MappingConfigOptions;
  readonly rules: readonly MappingRule[];
}

export type MappingStatus = 'draft' | 'ready' | 'has-errors';

export type SchemaFormat = 'json-schema' | 'xsd';

export type SchemaOwnership = 'cdm' | 'user';

export type SchemaDataFormat = 'json' | 'xml';

export type SchemaSourceKind = 'json_schema' | 'xsd' | 'inferred_from_json' | 'inferred_from_xml';

export type SchemaStatus = 'ready' | 'processing' | 'needs_review' | 'error' | 'ingesting';

/**
 * Legacy-compatible persisted origin values.
 *
 * Canonical FS-087 values are: `cdm | uploaded | inferred`.
 * Legacy aliases (`published`, `local`) are accepted on read and normalized.
 */
export type SchemaOrigin = 'cdm' | 'uploaded' | 'inferred' | 'published' | 'local';

export type CanonicalSchemaOrigin = 'cdm' | 'uploaded' | 'inferred';

export type SchemaIngestStatus = 'ingesting' | 'ready' | 'error';

/**
 * @deprecated FS-087 compatibility-only field.
 * Scope must not drive schema availability behavior.
 */
export type SchemaScope = 'global' | 'project';

/**
 * Canonical CDM sync states (FS-076):
 * - synced
 * - update-available
 * - sync-failed
 *
 * Legacy values are retained for backward compatibility with existing
 * local/published schema records until migration is complete.
 */
export type SchemaSyncStatus =
  | 'synced'
  | 'update-available'
  | 'sync-failed'
  | 'not-synced'
  | 'local-changes';

/**
 * Canonical sync states exposed to UI consumers (FS-078 T-01).
 */
export type CanonicalSchemaSyncStatus = 'synced' | 'update-available' | 'sync-failed';

/**
 * Normalizes persisted/legacy sync statuses to canonical UI-facing values.
 *
 * - Canonical values pass through unchanged.
 * - Legacy and unknown values deterministically map to `sync-failed`.
 */
export function normalizeSchemaSyncStatus(
  value: SchemaSyncStatus | string | null | undefined,
): CanonicalSchemaSyncStatus {
  if (value === 'synced' || value === 'update-available' || value === 'sync-failed') {
    return value;
  }

  return 'sync-failed';
}

// ---------------------------------------------------------------------------
// CDM Re-sync Result Contracts (FS-077)
// ---------------------------------------------------------------------------

/**
 * Terminal status of a CDM re-sync operation.
 *
 * - `no-op`: upstream commit unchanged; no ingestion work performed.
 * - `updated`: upstream commit changed; full re-ingestion completed successfully.
 * - `failed`: re-sync could not complete (dependency resolution, parse, or index failure).
 */
export type CdmReSyncStatus = 'no-op' | 'updated' | 'failed';

/**
 * A single field-level diff entry between prior and refreshed schema nodes.
 */
export interface SchemaDiffEntry {
  readonly path: string;
  readonly changeType: 'added' | 'removed' | 'modified';
}

/**
 * Field-level diff summary for a successful updated re-sync (FS-077).
 *
 * Present only when `status === 'updated'`.
 */
export interface SchemaDiffSummary {
  /** Paths present in refreshed schema but absent in the prior schema. */
  readonly added: readonly string[];
  /** Paths present in the prior schema but absent in the refreshed schema. */
  readonly removed: readonly string[];
  /** Paths present in both schemas with differing structural fingerprint (type, isArray, depth). */
  readonly modified: readonly string[];
}

/**
 * Canonical result of a CDM re-sync operation (FS-077).
 *
 * Backward-compat fields (`synced`, `commitSha`, `message`) are retained
 * for existing consumers. New consumers should use the `status` field.
 */
export interface SchemaSyncResult {
  readonly schemaId: string;

  /** Canonical three-mode outcome: no-op / updated / failed. */
  readonly status: CdmReSyncStatus;

  /**
   * Derived from `status` for backward compat.
   * - `true` when status is `updated` or `no-op`
   * - `false` when status is `failed`
   */
  readonly synced: boolean;

  /** Human-readable message describing the result. */
  readonly message: string;

  /** Failure reason — present only when status is `failed`. */
  readonly reason?: string;

  /** Commit SHA stored prior to this re-sync call. */
  readonly previousCommitSha?: string;

  /**
   * Commit SHA after re-sync.
   * - `currentCommitSha` reflects the value persisted/confirmed by this call.
   * - For backward compat, this is also surfaced as `commitSha`.
   */
  readonly currentCommitSha?: string;

  /** @deprecated Use `currentCommitSha` instead. Kept for backward compat. */
  readonly commitSha?: string;

  /** Field-level diff summary — present only when status is `updated`. */
  readonly diffSummary?: SchemaDiffSummary;
}

export interface GitHubSourceInfo {
  readonly type: 'github';
  readonly repo: string;
  readonly repoId?: number;
  readonly branch: string;
  readonly path: string;
  readonly commitSha?: string;
}

export interface UploadSourceInfo {
  readonly type: 'upload';
}

export type SchemaSourceInfo = GitHubSourceInfo | UploadSourceInfo;

/**
 * DynamoDB Projects table item.
 */
export interface ProjectItem {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  /**
   * Canonical FS-087 linkage model.
   */
  readonly linkedSchemaIds?: readonly string[];
  /**
   * @deprecated Legacy rich linkage payload retained for compatibility.
   */
  readonly schemaRefs: readonly SchemaRef[];
  readonly tags: readonly string[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

/**
 * DynamoDB Mappings table item.
 */
export interface MappingItem {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly revision: number;
  readonly latestVersion: number | null;
  readonly configHash: string;
  /** @deprecated legacy compatibility field; mirrors revision */
  readonly version?: number;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly status: MappingStatus;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly configS3Key: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

/**
 * DynamoDB SchemaMetadata table item.
 */
export interface SchemaMetadataItem {
  readonly schemaId: string;
  readonly name: string;
  readonly format: SchemaFormat;
  readonly fieldCount: number;
  readonly origin: SchemaOrigin;
  readonly status: SchemaIngestStatus;
  /**
   * @deprecated FS-087 compatibility-only field.
   */
  readonly scope?: SchemaScope;
  readonly description?: string;
  readonly inferred?: boolean;
  readonly sourceKind?: SchemaSourceKind;
  readonly ownership?: SchemaOwnership;
  readonly readonly?: boolean;
  readonly reviewedAt?: ISODateString;
  readonly reviewedBy?: string;
  readonly disambiguator?: string;
  readonly syncStatus: SchemaSyncStatus;
  readonly source: SchemaSourceInfo;
  readonly sourceRepoId?: number;
  /** Outcome of the last CDM re-sync operation (FS-077 T-05). */
  readonly lastSyncResult?: CdmReSyncStatus;
  /** ISO-8601 timestamp of the last CDM re-sync operation. */
  readonly lastSyncTimestamp?: ISODateString;
  /** Commit SHA reported by the last CDM re-sync (may differ from source.commitSha on failure). */
  readonly lastSyncCommitSha?: string;
  /** Failure reason from the last CDM re-sync — present only when lastSyncResult is 'failed'. */
  readonly lastSyncReason?: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

/**
 * DynamoDB SchemaNodes table item.
 */
export interface SchemaNodeItem {
  readonly schemaId: string;
  readonly path: string;
  readonly fieldName: string;
  readonly type: string;
  readonly description?: string;
  readonly depth: number;
  readonly isArray: boolean;
  readonly isRequired: boolean;
  readonly parentPath: string | null;
  readonly childCount: number;
  readonly subtreeFieldCount: number;
  readonly embeddingText: string;
}

/**
 * DynamoDB MappingVersions table item.
 */
export interface MappingVersionItem {
  readonly mappingId: string;
  readonly version: number;
  readonly revisionNumber: number;
  readonly createdAt: ISODateString;
  readonly createdBy: string;
  /** @deprecated legacy compatibility fields */
  readonly savedAt?: ISODateString;
  /** @deprecated legacy compatibility fields */
  readonly savedBy?: string;
  /** @deprecated legacy compatibility fields */
  readonly ruleCount?: number;
  /** @deprecated legacy compatibility fields */
  readonly configS3Key?: string;
  /** @deprecated legacy compatibility field */
  readonly config?: Record<string, unknown>;
}

/**
 * DynamoDB MappingRevisions table item.
 */
export interface MappingRevisionItem {
  readonly mappingId: string;
  readonly revision: number;
  readonly savedAt: ISODateString;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly configS3Key: string;
  readonly configHash: string;
}

export type RuntimeDeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

/**
 * Canonical environment model (FS-081):
 * - SANDBOX is control-plane context only (never a runtime deploy target)
 * - DEV/PREPROD/PROD are runtime deployment targets
 */
export type DeploymentEnvironmentModel = 'SANDBOX' | RuntimeDeploymentEnvironment;

/**
 * Legacy persisted runtime value retained for audit compatibility.
 */
export type LegacyRuntimeDeploymentEnvironment = 'QA';

/**
 * Canonical runtime deployment environment contract.
 */
export type DeploymentEnvironment = RuntimeDeploymentEnvironment;

/**
 * Persisted environment value may include legacy QA records.
 */
export type PersistedDeploymentEnvironment = RuntimeDeploymentEnvironment | LegacyRuntimeDeploymentEnvironment;

export function normalizeRuntimeDeploymentEnvironment(
  value: PersistedDeploymentEnvironment | string,
): RuntimeDeploymentEnvironment {
  if (value === 'DEV' || value === 'PREPROD' || value === 'PROD') {
    return value;
  }

  if (value === 'QA') {
    return 'PREPROD';
  }

  throw new Error(`Unknown deployment environment: ${value}`);
}

export type DeploymentSourceType = 'revision' | 'version';

export type DeploymentSchemaReferenceRole = 'source' | 'target';

export interface DeploymentCdmSchemaTraceabilityEntry {
  readonly schemaId: string;
  readonly schemaName?: string;
  readonly referenceRole: DeploymentSchemaReferenceRole;
  readonly repo: string;
  readonly path: string;
  readonly commitSha: string;
}

export interface DeploymentSnapshotMetadata {
  readonly cdmSchemaTraceability?: readonly DeploymentCdmSchemaTraceabilityEntry[];
}

/**
 * DynamoDB Deployments table item.
 */
export interface DeploymentItem {
  readonly mappingId: string;
  /** Composite SK: {ENV}#{ISO8601} */
  readonly environmentDeployedAt: string;
  /**
   * Canonical in new writes; may be legacy QA in historical records.
   */
  readonly environment: PersistedDeploymentEnvironment;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly configS3Key: string;
  readonly configHash: string;
  readonly deployedAt: ISODateString;
  readonly deployedBy: string;
  readonly cdmSchemaTraceability?: readonly DeploymentCdmSchemaTraceabilityEntry[];
  readonly promotedFrom?: DeploymentEnvironment;
  readonly rollbackOf?: string;
}

/**
 * DynamoDB DeploymentCurrent table item.
 */
export interface DeploymentCurrentItem {
  /** Composite PK: {mappingId}#{ENV} */
  readonly mappingIdEnvironment: string;
  readonly mappingId: string;
  /**
   * Canonical in new writes; may be legacy QA in historical records.
   */
  readonly environment: PersistedDeploymentEnvironment;
  readonly deployedAt: ISODateString;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly configHash: string;
  readonly configS3Key: string;
}

/**
 * DynamoDB SyncActivity table item (FS-077 T-05).
 *
 * Records the outcome of each CDM re-sync operation for observability.
 */
export interface SyncActivityItem {
  readonly schemaId: string;
  /** ISO-8601 timestamp of the sync operation (sort key). */
  readonly timestamp: ISODateString;
  readonly outcome: CdmReSyncStatus;
  readonly previousCommitSha?: string;
  readonly currentCommitSha?: string;
  readonly reason?: string;
  readonly addedCount?: number;
  readonly removedCount?: number;
  readonly modifiedCount?: number;
}

export interface CreateDeploymentInput {
  readonly mappingId: string;
  readonly environment: DeploymentEnvironment;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly deployedBy: string;
  readonly config: MappingConfig;
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly cdmSchemaTraceability?: readonly DeploymentCdmSchemaTraceabilityEntry[];
  readonly promotedFrom?: DeploymentEnvironment;
  readonly rollbackOf?: string;
}

export interface CreateRollbackDeploymentInput {
  readonly mappingId: string;
  readonly environment: DeploymentEnvironment;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly deployedBy: string;
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly configHash: string;
  readonly configS3Key: string;
  readonly rollbackOf: string;
}

export type RuntimeDeploymentEventType = 'deploy' | 'rollback';

export type DeploymentOrchestrationOperationType = 'deploy' | 'promote' | 'rollback' | 'preview';

export type DeploymentOrchestrationStatus =
  | 'queued'
  | 'in_progress'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'timed_out';

export interface DeploymentOrchestrationItem {
  readonly orchestrationId: string;
  readonly mappingId: string;
  readonly operationType: DeploymentOrchestrationOperationType;
  readonly targetEnvironment: DeploymentEnvironment;
  readonly sourceEnvironment?: DeploymentEnvironment;
  readonly artifactId?: string;
  readonly status: DeploymentOrchestrationStatus;
  readonly attemptCount: number;
  readonly lastErrorCode?: string;
  readonly lastErrorMessage?: string;
  readonly requestId: string;
  readonly requestedBy: string;
  readonly requestedAt: ISODateString;
  readonly completedAt?: ISODateString;
}

export interface CreateDeploymentOrchestrationInput {
  readonly mappingId: string;
  readonly operationType: DeploymentOrchestrationOperationType;
  readonly targetEnvironment: DeploymentEnvironment;
  readonly sourceEnvironment?: DeploymentEnvironment;
  readonly artifactId?: string;
  readonly requestId: string;
  readonly requestedBy: string;
}

export interface UpdateDeploymentOrchestrationStatusInput {
  readonly orchestrationId: string;
  readonly status: DeploymentOrchestrationStatus;
  readonly attemptCount?: number;
  readonly artifactId?: string;
  readonly requestId?: string;
  readonly lastErrorCode?: string;
  readonly lastErrorMessage?: string;
  readonly completedAt?: ISODateString;
}

/**
 * Runtime bootstrap table item: active snapshot pointer per mapping.
 */
export interface ActiveSnapshotItem {
  readonly mappingId: string;
  readonly activeSnapshotId: string;
  readonly snapshotHash: string;
  readonly activatedAt: ISODateString;
  readonly activatedBy: string;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly schemaBundleRef?: string;
}

/**
 * Runtime bootstrap table item: append-only deployment/rollback history.
 */
export interface DeploymentHistoryItem {
  readonly mappingId: string;
  readonly eventAt: ISODateString;
  readonly eventType: RuntimeDeploymentEventType;
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly requestedBy: string;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly rollbackOf?: string;
  readonly requestId: string;
}

export interface UpsertActiveSnapshotInput {
  readonly mappingId: string;
  readonly activeSnapshotId: string;
  readonly snapshotHash: string;
  readonly activatedBy: string;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly schemaBundleRef?: string;
}

export interface AppendDeploymentHistoryInput {
  readonly mappingId: string;
  readonly eventType: RuntimeDeploymentEventType;
  readonly snapshotId: string;
  readonly snapshotHash: string;
  readonly requestedBy: string;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly rollbackOf?: string;
  readonly requestId: string;
  readonly eventAt?: ISODateString;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly linkedSchemaIds?: readonly string[];
  readonly schemaRefs?: readonly SchemaRef[];
  readonly tags?: readonly string[];
}

export interface UpdateProjectInput {
  readonly name?: string;
  readonly description?: string;
  readonly slug?: string;
  readonly linkedSchemaIds?: readonly string[];
  readonly schemaRefs?: readonly SchemaRef[];
  readonly tags?: readonly string[];
}

export interface CreateMappingInput {
  readonly projectId: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly status?: MappingStatus;
  readonly ruleCount?: number;
  readonly coverage?: number;
  readonly configS3Key: string;
}

export interface UpdateMappingInput {
  readonly name?: string;
  readonly businessContext?: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly status?: MappingStatus;
  readonly ruleCount?: number;
  readonly coverage?: number;
  readonly configS3Key?: string;
  readonly configHash?: string;
}

export interface CreateSchemaMetadataInput {
  readonly name: string;
  readonly format: SchemaFormat;
  readonly fieldCount: number;
  readonly origin: SchemaOrigin;
  readonly status?: SchemaIngestStatus;
  /**
   * @deprecated FS-087 compatibility-only field.
   */
  readonly scope?: SchemaScope;
  readonly description?: string;
  readonly inferred?: boolean;
  readonly sourceKind?: SchemaSourceKind;
  readonly ownership?: SchemaOwnership;
  readonly readonly?: boolean;
  readonly reviewedAt?: ISODateString;
  readonly reviewedBy?: string;
  readonly disambiguator?: string;
  readonly syncStatus?: SchemaSyncStatus;
  readonly source: SchemaSourceInfo;
}

export interface ProjectMetadata {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly mappingCount?: number;
  readonly schemaCount?: number;
  readonly updatedAt: ISODateString;
}

export interface ProjectDetail {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly linkedSchemaIds: readonly string[];
  readonly schemaRefs: readonly SchemaRef[];
  readonly tags: readonly string[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly mappings: readonly MappingMetadata[];
}

export interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly version: number;
  readonly status: MappingStatus;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly updatedAt: ISODateString;
}

export interface SchemaMetadata {
  readonly schemaId: string;
  readonly name: string;
  readonly format: SchemaFormat;
  readonly dataFormat?: SchemaDataFormat;
  readonly sourceKind?: SchemaSourceKind;
  readonly fieldCount: number;
  readonly ownership?: SchemaOwnership;
  readonly isCdm?: boolean;
  readonly readonly?: boolean;
  readonly origin: CanonicalSchemaOrigin;
  readonly status: SchemaStatus;
  /**
   * @deprecated FS-087 compatibility-only field.
   */
  readonly scope?: SchemaScope;
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
  readonly reviewedAt?: ISODateString;
  readonly reviewedBy?: string;
  readonly disambiguator?: string;
  readonly syncStatus: CanonicalSchemaSyncStatus;
  readonly source: SchemaSourceInfo;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export function toProjectMetadata(item: ProjectItem): ProjectMetadata {
  return {
    projectId: item.projectId,
    name: item.name,
    description: item.description,
    slug: item.slug,
    updatedAt: item.updatedAt,
  };
}

export function normalizeProjectLinkedSchemaIds(
  project: Pick<ProjectItem, 'linkedSchemaIds' | 'schemaRefs'>,
): readonly string[] {
  const values = Array.isArray(project.linkedSchemaIds)
    ? project.linkedSchemaIds
    : (project.schemaRefs ?? []).map((ref) => ref.schemaId);

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function toProjectDetail(item: ProjectItem, mappings: readonly MappingMetadata[] = []): ProjectDetail {
  return {
    projectId: item.projectId,
    name: item.name,
    description: item.description,
    slug: item.slug,
    linkedSchemaIds: normalizeProjectLinkedSchemaIds(item),
    schemaRefs: item.schemaRefs,
    tags: item.tags,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    mappings,
  };
}

export function toMappingMetadata(item: MappingItem): MappingMetadata {
  const revision = item.revision ?? item.version ?? 0;
  return {
    mappingId: item.mappingId,
    projectId: item.projectId,
    name: item.name,
    ...(item.businessContext ? { businessContext: item.businessContext } : {}),
    version: revision,
    status: item.status,
    sourceSchemaId: item.sourceSchemaId,
    targetSchemaId: item.targetSchemaId,
    ruleCount: item.ruleCount,
    coverage: item.coverage,
    updatedAt: item.updatedAt,
  };
}

export function normalizeSchemaOrigin(
  value: SchemaOrigin | string | null | undefined,
): CanonicalSchemaOrigin {
  if (value === 'cdm') {
    return 'cdm';
  }

  if (value === 'inferred') {
    return 'inferred';
  }

  return 'uploaded';
}

export function normalizeSchemaOwnership(
  input: {
    ownership?: SchemaOwnership;
    origin?: SchemaOrigin | CanonicalSchemaOrigin | string | null;
  },
): SchemaOwnership {
  if (input.ownership === 'cdm' || input.ownership === 'user') {
    return input.ownership;
  }

  return normalizeSchemaOrigin(input.origin) === 'cdm' ? 'cdm' : 'user';
}

export function normalizeSchemaSourceKind(input: {
  sourceKind?: SchemaSourceKind | string | null;
  format?: SchemaFormat | string | null;
  inferred?: boolean | null;
}): SchemaSourceKind {
  if (
    input.sourceKind === 'json_schema'
    || input.sourceKind === 'xsd'
    || input.sourceKind === 'inferred_from_json'
    || input.sourceKind === 'inferred_from_xml'
  ) {
    return input.sourceKind;
  }

  if (input.format === 'xsd') {
    return input.inferred ? 'inferred_from_xml' : 'xsd';
  }

  return input.inferred ? 'inferred_from_json' : 'json_schema';
}

export function schemaDataFormatFromSourceKind(sourceKind: SchemaSourceKind): SchemaDataFormat {
  return sourceKind === 'xsd' || sourceKind === 'inferred_from_xml' ? 'xml' : 'json';
}

export function normalizeSchemaStatus(input: {
  status?: SchemaIngestStatus | SchemaStatus | string | null;
  inferred?: boolean | null;
  reviewedAt?: ISODateString | null;
}): SchemaStatus {
  if (input.status === 'processing' || input.status === 'needs_review') {
    return input.status;
  }

  if (input.status === 'ingesting') {
    return 'processing';
  }

  if (input.status === 'error') {
    return 'error';
  }

  if (input.status === 'ready') {
    if (input.inferred && !input.reviewedAt) {
      return 'needs_review';
    }

    return 'ready';
  }

  if (input.inferred && !input.reviewedAt) {
    return 'needs_review';
  }

  return 'ready';
}

export function toSchemaMetadata(item: SchemaMetadataItem): SchemaMetadata {
  const sourceKind = normalizeSchemaSourceKind({
    sourceKind: item.sourceKind,
    format: item.format,
    inferred: item.inferred,
  });
  const ownership = normalizeSchemaOwnership({
    ownership: item.ownership,
    origin: item.origin,
  });

  return {
    schemaId: item.schemaId,
    name: item.name,
    format: item.format,
    dataFormat: schemaDataFormatFromSourceKind(sourceKind),
    sourceKind,
    fieldCount: item.fieldCount,
    ownership,
    isCdm: ownership === 'cdm',
    readonly: item.readonly ?? ownership === 'cdm',
    origin: normalizeSchemaOrigin(item.origin),
    status: normalizeSchemaStatus({
      status: item.status,
      inferred: item.inferred,
      reviewedAt: item.reviewedAt,
    }),
    ...(item.scope !== undefined ? { scope: item.scope } : {}),
    description: item.description,
    inferred: item.inferred,
    ...(item.reviewedAt !== undefined ? { reviewedAt: item.reviewedAt } : {}),
    ...(item.reviewedBy !== undefined ? { reviewedBy: item.reviewedBy } : {}),
    ...(item.disambiguator !== undefined ? { disambiguator: item.disambiguator } : {}),
    syncStatus: normalizeSchemaSyncStatus(item.syncStatus),
    source: item.source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
