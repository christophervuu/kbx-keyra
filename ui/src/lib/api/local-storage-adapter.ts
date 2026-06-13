import { getSeededCdmSchemaDetail, listSeededCdmMetadataFixtures } from './cdm-fixtures';
import type { ApiAdapter } from './types';
import type {
  CurrentDeployment,
  CurrentDeployments,
  DeploymentRecord,
  DeploymentSourceType,
} from './types';

import {
  normalizeProjectLinkedSchemaIds,
  normalizeSchemaOwnership,
  normalizeSchemaOrigin,
  normalizeSchemaReviewState,
  normalizeSchemaSourceKind,
  normalizeSchemaStatus,
  schemaDataFormatFromSourceKind,
} from '@/lib/types';
import type {
  ActivityEntry,
  AddSchemaSampleInput,
  AddSchemaSampleResult,
  AutoMapInput,
  AutoMapResult,
  AutoMapSectionInput,
  AutoMapSectionResult,
  CdmBulkSyncResult,
  CreateMappingInput,
  CreateProjectInput,
  CreateSchemaInput,
  DeploymentContext,
  DeploymentDiff,
  DeploymentRecord as LegacyDeploymentRecord,
  DeployStatus,
  Environment,
  ExplainRuleInput,
  ExplainRuleResult,
  GitHubFile,
  LinkCdmSchemaInput,
  LinkPublishedSchemaInput,
  MappingConfig,
  MappingRevision,
  MappingRevisionDetail,
  MappingSaveResult,
  MappingVersion,
  MappingVersionEntry,
  MappingMetadata,
  Project,
  ProjectDetail,
  ProjectMetadata,
  PublishSchemaInput,
  SchemaDetail,
  SchemaMetadata,
  SchemaSamplePayloadContent,
  SchemaSearchResult,
  SchemaSyncResult,
  ServerPreviewInput,
  ServerPreviewResult,
  SmartFixInput,
  SmartFixResult,
  SuggestExpressionInput,
  SuggestExpressionResult,
  TemplateDetail,
  TemplateMetadata,
  UpdateSchemaInput,
  UpdateProjectInput,
  ValidateMappingsInput,
  ValidationReport,
} from '@/lib/types';

const STORAGE_KEYS = {
  projects: 'keyra:projects',
  schemas: 'keyra:schemas',
  mappings: 'keyra:mappings',
  templates: 'keyra:templates',
  deployments: 'keyra:deployments',
  activity: 'keyra:activity',
} as const;

const MAX_MAPPING_VERSIONS = 50;

function normalizeSchemaSyncStatusForStorage(value: unknown): SchemaMetadata['syncStatus'] {
  if (value === 'synced' || value === 'update-available' || value === 'sync-failed') {
    return value;
  }

  return 'sync-failed';
}

function normalizeSchemaMetadataForRead(metadata: SchemaMetadata): SchemaMetadata {
  const sourceKind = normalizeSchemaSourceKind({
    sourceKind: metadata.sourceKind,
    format: metadata.format,
    inferred: metadata.inferred,
  });
  const ownership = normalizeSchemaOwnership({
    ownership: metadata.ownership,
    origin: metadata.origin,
  });

  return {
    ...metadata,
    origin: normalizeSchemaOrigin(metadata.origin),
    ownership,
    isCdm: metadata.isCdm ?? ownership === 'cdm',
    readonly: metadata.readonly ?? ownership === 'cdm',
    sourceKind,
    dataFormat: metadata.dataFormat ?? schemaDataFormatFromSourceKind(sourceKind),
    status: normalizeSchemaStatus({
      status: metadata.status,
      inferred: metadata.inferred,
      reviewedAt: metadata.reviewedAt,
    }),
    ...(metadata.scope !== undefined ? { scope: metadata.scope } : {}),
    description: metadata.description ?? '',
      inferred: metadata.inferred ?? false,
      reviewState: normalizeSchemaReviewState({
        reviewState: metadata.reviewState,
        inferred: metadata.inferred,
        reviewedAt: metadata.reviewedAt,
      }),
      syncStatus: normalizeSchemaSyncStatusForStorage(metadata.syncStatus ?? 'sync-failed'),
  };
}


interface StoredSchema {
  metadata: SchemaMetadata;
  detail: SchemaDetail;
  samplePayloadContentById?: Record<string, SchemaSamplePayloadContent>;
}

interface StoredMapping {
  metadata: MappingMetadata;
  config: MappingConfig;
}

function uniqueAliases(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    aliases.push(value);
  }

  return aliases;
}

function normalizeLegacyExternalAliases(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueAliases(
    value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

function normalizeCanonicalEnrichmentSources(value: unknown): NonNullable<MappingConfig['enrichmentSources']> {
  if (!Array.isArray(value)) {
    return [];
  }

  const aliases = new Set<string>();
  const normalized: NonNullable<MappingConfig['enrichmentSources']> = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as Record<string, unknown>;
    const alias = typeof candidate.alias === 'string' ? candidate.alias.trim() : '';
    if (!alias || aliases.has(alias)) {
      continue;
    }

    aliases.add(alias);
    const schemaId = typeof candidate.schemaId === 'string' ? candidate.schemaId.trim() : '';
    const required = typeof candidate.required === 'boolean' ? candidate.required : true;
    const description = typeof candidate.description === 'string' ? candidate.description.trim() : '';
    normalized.push({
      alias,
      ...(schemaId ? { schemaId } : {}),
      required,
      ...(description ? { description } : {}),
    });
  }

  return normalized;
}

function normalizeMappingCompatibility(config: MappingConfig): MappingConfig {
  const canonical = normalizeCanonicalEnrichmentSources(config.enrichmentSources);
  const legacyExternalAliases = normalizeLegacyExternalAliases(config.config?.externalSources);
  const enrichmentSources = canonical.length > 0
    ? canonical
    : legacyExternalAliases.map((alias) => ({ alias, required: false }));
  const externalSources = uniqueAliases([
    ...enrichmentSources.map((source) => source.alias),
    ...legacyExternalAliases,
  ]);

  return {
    ...config,
    enrichmentSources,
    config: {
      ...(config.config ?? {}),
      externalSources,
    },
  };
}

function normalizeOptionalBusinessContext(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mergeWithSeededCdmMetadata(items: readonly SchemaMetadata[]): SchemaMetadata[] {
  const byId = new Map(items.map((item) => [item.schemaId, item]));
  const seeded = listSeededCdmMetadataFixtures().map((fixture) => {
    const existing = byId.get(fixture.schemaId);
    if (existing) {
      return {
        ...existing,
        origin: 'cdm' as const,
        ownership: 'cdm' as const,
        isCdm: true,
        readonly: true,
      };
    }

    return fixture;
  });

  const seededIds = new Set(seeded.map((entry) => entry.schemaId));
  const nonSeeded = items.filter((item) => !seededIds.has(item.schemaId));

  return [...seeded, ...nonSeeded];
}

interface StoredRevisionEntry {
  readonly revision: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly configHash: string;
  readonly config: MappingConfig;
}

interface StoredVersionEntry {
  readonly version: number;
  readonly revisionNumber: number;
  readonly createdAt: string;
  readonly createdBy: string;
}

interface CurrentDeploymentsInput {
  readonly DEV?: CurrentDeployment | null;
  readonly PREPROD?: CurrentDeployment | null;
  readonly PROD?: CurrentDeployment | null;
}

const OFFLINE_MODE_MESSAGE = 'Not available in offline mode';

export class LocalStorageAdapter implements ApiAdapter {
  /**
   * Canonical offline-mode behavior for unsupported integrations (AI, GitHub, server preview).
   *
   * Keep this centralized so all unsupported offline methods fail with the same deterministic
   * semantics expected by UI error mappers and tests.
   */
  private offlineModeError(): Error {
    return new Error(OFFLINE_MODE_MESSAGE);
  }

  private deploymentKey(mappingId: string): string {
    return `keyra:deployments:${mappingId}`;
  }

  private versionKey(mappingId: string): string {
    return `keyra:versions:${mappingId}`;
  }

  private revisionKey(mappingId: string): string {
    return `keyra:revisions:${mappingId}`;
  }

  private sortObject(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortObject(item));
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const sortedKeys = Object.keys(record).sort((a, b) => a.localeCompare(b));
      const next: Record<string, unknown> = {};
      for (const key of sortedKeys) {
        next[key] = this.sortObject(record[key]);
      }
      return next;
    }

    return value;
  }

  private async computeConfigHash(config: MappingConfig): Promise<string> {
    const normalized = {
      ...config,
      version: 0,
    };
    const json = JSON.stringify(this.sortObject(normalized));

    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
      return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    }

    return json;
  }

  private readArray<T>(key: string): T[] {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  private writeArray<T>(key: string, value: T[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      throw this.asStorageError(error);
    }
  }

  private asStorageError(error: unknown) {
    const isQuotaError =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

    if (!isQuotaError) {
      throw error;
    }

    return {
      message: 'Browser storage quota exceeded',
      retryable: false,
      cause: error,
    };
  }

  private notFound(entity: string, id: string) {
    return {
      message: `${entity} not found: ${id}`,
      code: 'NOT_FOUND',
      statusCode: 404,
      retryable: false,
    };
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private computeStaleness(
    deployment: CurrentDeployment | null,
    mapping: { revision: number; latestVersion: number | null },
  ): 'current' | 'stale' | 'not-deployed' {
    if (!deployment) {
      return 'not-deployed';
    }

    if (deployment.sourceType === 'revision') {
      return mapping.revision > deployment.sourceNumber ? 'stale' : 'current';
    }

    const latestVersion = mapping.latestVersion ?? deployment.sourceNumber;
    return latestVersion > deployment.sourceNumber ? 'stale' : 'current';
  }

  private computeAllEnvironments(
    currentDeployments: CurrentDeploymentsInput,
    mapping: { revision: number; latestVersion: number | null },
  ): CurrentDeployments {
    return {
      DEV: {
        environment: 'DEV',
        deployment: currentDeployments.DEV ?? null,
        status: this.computeStaleness(currentDeployments.DEV ?? null, mapping),
      },
      PREPROD: {
        environment: 'PREPROD',
        deployment: currentDeployments.PREPROD ?? null,
        status: this.computeStaleness(currentDeployments.PREPROD ?? null, mapping),
      },
      PROD: {
        environment: 'PROD',
        deployment: currentDeployments.PROD ?? null,
        status: this.computeStaleness(currentDeployments.PROD ?? null, mapping),
      },
      QA: {
        environment: 'PREPROD',
        deployment: currentDeployments.PREPROD ?? null,
        status: this.computeStaleness(currentDeployments.PREPROD ?? null, mapping),
      },
    };
  }

  private readDeployments(mappingId: string): DeploymentRecord[] {
    return this.readArray<DeploymentRecord>(this.deploymentKey(mappingId));
  }

  private writeDeployments(mappingId: string, deployments: DeploymentRecord[]): void {
    this.writeArray(this.deploymentKey(mappingId), deployments);
  }

  private toCurrentDeployment(item: DeploymentRecord): CurrentDeployment {
    return {
      mappingId: item.mappingId,
      environment: item.environment,
      deployedAt: item.deployedAt,
      sourceType: item.sourceType,
      sourceNumber: item.sourceNumber,
      configHash: item.configHash,
      configS3Key: item.configS3Key,
    };
  }

  private getCurrentByEnvironment(
    mappingId: string,
  ): { DEV: CurrentDeployment | null; PREPROD: CurrentDeployment | null; PROD: CurrentDeployment | null } {
    const deployments = this.readDeployments(mappingId);

    const latestFor = (environment: Environment): CurrentDeployment | null => {
      const entry = deployments
        .filter((item) => item.environment === environment)
        .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))[0];

      return entry ? this.toCurrentDeployment(entry) : null;
    };

    return {
      DEV: latestFor('DEV'),
      PREPROD: latestFor('PREPROD'),
      PROD: latestFor('PROD'),
    };
  }

  private async appendDeployment(
    mappingId: string,
    input: {
      environment: Environment;
      sourceType: DeploymentSourceType;
      sourceNumber: number;
      deployedBy: string;
      promotedFrom?: Environment;
      rollbackOf?: string;
    },
  ): Promise<DeploymentRecord> {
    const mapping = await this.getMapping(mappingId);
    const deployedAt = this.nowIso();
    const configHash = await this.computeConfigHash(mapping);

    const record: DeploymentRecord = {
      mappingId,
      environmentDeployedAt: `${input.environment}#${deployedAt}`,
      environment: input.environment,
      sourceType: input.sourceType,
      sourceNumber: input.sourceNumber,
      configS3Key: `local://deployments/${mappingId}/${input.environment}/${deployedAt}.json`,
      configHash,
      deployedAt,
      deployedBy: input.deployedBy,
      ...(input.promotedFrom !== undefined ? { promotedFrom: input.promotedFrom } : {}),
      ...(input.rollbackOf !== undefined ? { rollbackOf: input.rollbackOf } : {}),
    };

    const deployments = this.readDeployments(mappingId);
    deployments.push(record);
    this.writeDeployments(mappingId, deployments);

    return record;
  }

  private async getLatestVersionNumber(mappingId: string): Promise<number | null> {
    const versions = await this.listVersions(mappingId);
    if (versions.length === 0) {
      return null;
    }

    return versions.reduce((maxVersion, version) => Math.max(maxVersion, version.version), versions[0]?.version ?? 0);
  }

  // Schemas
  async listSchemas(): Promise<SchemaMetadata[]> {
    const stored = this.readArray<StoredSchema>(STORAGE_KEYS.schemas).map((item) => normalizeSchemaMetadataForRead(item.metadata));
    return mergeWithSeededCdmMetadata(stored).map((item) => normalizeSchemaMetadataForRead(item));
  }

  async getSchema(id: string): Promise<SchemaDetail> {
    const schemas = this.readArray<StoredSchema>(STORAGE_KEYS.schemas);
    const found = schemas.find((item) => item.metadata.schemaId === id);
    if (!found) {
      const seeded = getSeededCdmSchemaDetail(id);
      if (seeded) {
        return {
          ...seeded,
          metadata: normalizeSchemaMetadataForRead(seeded.metadata),
        };
      }

      throw this.notFound('Schema', id);
    }

    const metadata = normalizeSchemaMetadataForRead(found.metadata);

    return {
      ...found.detail,
      metadata,
    };
  }

  async createSchema(input: CreateSchemaInput): Promise<SchemaMetadata> {
    const schemas = this.readArray<StoredSchema>(STORAGE_KEYS.schemas);
    const timestamp = this.nowIso();
    const schemaId = crypto.randomUUID();

    const metadata: SchemaMetadata = {
      schemaId,
      name: input.name,
      format: input.format,
      fieldCount: 0,
      origin: normalizeSchemaOrigin(input.origin),
      ownership: normalizeSchemaOwnership({
        ownership: input.ownership,
        origin: input.origin,
      }),
      isCdm: normalizeSchemaOwnership({ ownership: input.ownership, origin: input.origin }) === 'cdm',
      readonly: input.readonly,
      sourceKind: normalizeSchemaSourceKind({ sourceKind: input.sourceKind, format: input.format, inferred: input.inferred }),
      status: normalizeSchemaStatus({
        status: input.status ?? 'ready',
        inferred: input.inferred,
        reviewedAt: input.reviewedAt,
      }),
      dataFormat: schemaDataFormatFromSourceKind(
        normalizeSchemaSourceKind({ sourceKind: input.sourceKind, format: input.format, inferred: input.inferred }),
      ),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      description: input.description ?? '',
      updatedBy: 'local-user',
      inferred: input.inferred ?? false,
      reviewedAt: input.reviewedAt,
      reviewedBy: input.reviewedBy,
      disambiguator: input.disambiguator,
      syncStatus: normalizeSchemaSyncStatusForStorage(input.syncStatus ?? 'sync-failed'),
      source: input.source ?? { type: 'upload' },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const detail: SchemaDetail = {
      metadata,
      content: input.content,
    };

    schemas.push({ metadata, detail });
    this.writeArray(STORAGE_KEYS.schemas, schemas);

    return metadata;
  }

  async updateSchema(id: string, input: UpdateSchemaInput): Promise<SchemaMetadata> {
    const schemas = this.readArray<StoredSchema>(STORAGE_KEYS.schemas);
    const index = schemas.findIndex((item) => item.metadata.schemaId === id);
    if (index < 0) {
      throw this.notFound('Schema', id);
    }

    const current = schemas[index];
    const timestamp = this.nowIso();
    const currentMetadata = normalizeSchemaMetadataForRead(current.metadata);

    const didUpdateContent = input.content !== undefined;
    const nextSyncStatus =
      didUpdateContent && currentMetadata.syncStatus === 'synced'
        ? 'sync-failed'
        : currentMetadata.syncStatus;

    const nextMetadata: SchemaMetadata = {
      ...currentMetadata,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      ...(input.fieldCount !== undefined ? { fieldCount: input.fieldCount } : {}),
      ...(input.status !== undefined ? {
        status: normalizeSchemaStatus({
          status: input.status,
          inferred: currentMetadata.inferred,
          reviewedAt: input.reviewedAt ?? currentMetadata.reviewedAt,
        }),
      } : {}),
      ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
      ...(input.reviewedBy !== undefined ? { reviewedBy: input.reviewedBy } : {}),
      ...(input.disambiguator !== undefined ? { disambiguator: input.disambiguator } : {}),
      reviewState: normalizeSchemaReviewState({
        reviewState: currentMetadata.reviewState,
        inferred: currentMetadata.inferred,
        reviewedAt: input.reviewedAt ?? currentMetadata.reviewedAt,
      }),
      sourceKind: normalizeSchemaSourceKind({
        sourceKind: currentMetadata.sourceKind,
        format: input.format ?? currentMetadata.format,
        inferred: currentMetadata.inferred,
      }),
      dataFormat: schemaDataFormatFromSourceKind(
        normalizeSchemaSourceKind({
          sourceKind: currentMetadata.sourceKind,
          format: input.format ?? currentMetadata.format,
          inferred: currentMetadata.inferred,
        }),
      ),
      syncStatus: nextSyncStatus,
      updatedAt: timestamp,
      updatedBy: 'local-user',
    };

    const nextContent = didUpdateContent ? input.content : current.detail.content;

    const nextDetail: SchemaDetail = {
      ...current.detail,
      metadata: nextMetadata,
      content: nextContent,
    };

    schemas[index] = {
      metadata: nextMetadata,
      detail: nextDetail,
    };

    this.writeArray(STORAGE_KEYS.schemas, schemas);
    return nextMetadata;
  }

  async markSchemaReviewed(id: string): Promise<SchemaMetadata> {
    return this.updateSchema(id, {
      status: 'ready',
      reviewedAt: this.nowIso(),
      reviewedBy: 'local-user',
    });
  }

  async addSchemaSample(id: string, input: AddSchemaSampleInput): Promise<AddSchemaSampleResult> {
    const detail = await this.getSchema(id);
    const metadata = normalizeSchemaMetadataForRead(detail.metadata);

    const sampleId = crypto.randomUUID();
    const now = this.nowIso();
    const sample = {
      sampleId,
      schemaId: id,
      name: input.sampleName?.trim() || `Sample ${(metadata.samplePayloadCount ?? metadata.samplePayloads?.length ?? 0) + 1}`,
      dataFormat: metadata.dataFormat ?? 'json',
      contentRef: `local://schemas/${id}/samples/${sampleId}`,
      usedForInference: false,
      source: 'added_sample' as const,
      createdAt: now,
      compatibility: 'unknown' as const,
    };

    const nextSamples = [...(metadata.samplePayloads ?? []), sample];
    const nextMetadata = await this.updateSchema(id, {
      status: input.applySuggestedUpdates ? 'needs_review' : metadata.status,
      fieldCount: metadata.fieldCount,
    });

    const mergedMetadata = {
      ...nextMetadata,
      samplePayloads: nextSamples,
      samplePayloadCount: nextSamples.length,
    };

    const schemas = this.readArray<StoredSchema>(STORAGE_KEYS.schemas);
    const index = schemas.findIndex((item) => item.metadata.schemaId === id);
    if (index >= 0) {
      const raw = metadata.dataFormat === 'xml'
        ? (typeof input.sampleContent === 'string' ? input.sampleContent : String(input.sampleContent))
        : JSON.stringify(input.sampleContent);
      const parsed = metadata.dataFormat === 'xml'
        ? null
        : input.sampleContent;

      const patched = {
        ...schemas[index],
        metadata: mergedMetadata,
        detail: {
          ...schemas[index].detail,
          metadata: mergedMetadata,
        },
        samplePayloadContentById: {
          ...(schemas[index].samplePayloadContentById ?? {}),
          [sampleId]: {
            sampleId,
            schemaId: id,
            dataFormat: sample.dataFormat,
            raw,
            parsed,
          },
        },
      };
      schemas[index] = patched;
      this.writeArray(STORAGE_KEYS.schemas, schemas);
    }

    return {
      sample,
      diff: {
        additions: [],
        typeConflicts: [],
        requiredOptionalEvidence: [],
      },
      schemaUpdated: input.applySuggestedUpdates === true,
      mode: input.applySuggestedUpdates ? 'apply_all' : 'save_only',
      metadata: mergedMetadata,
    };
  }

  async deleteSchemaSample(id: string, sampleId: string): Promise<SchemaMetadata> {
    const schemas = this.readArray<StoredSchema>(STORAGE_KEYS.schemas);
    const index = schemas.findIndex((item) => item.metadata.schemaId === id);
    if (index < 0) {
      throw this.notFound('Schema', id);
    }

    const current = schemas[index];
    const existingSamples = current.metadata.samplePayloads ?? [];
    const nextSamples = existingSamples.filter((sample) => sample.sampleId !== sampleId);

    if (nextSamples.length === existingSamples.length) {
      throw this.notFound('Schema sample', `${id}:${sampleId}`);
    }

    const nextMetadata: SchemaMetadata = {
      ...normalizeSchemaMetadataForRead(current.metadata),
      samplePayloads: nextSamples,
      samplePayloadCount: nextSamples.length,
      updatedAt: this.nowIso(),
      updatedBy: 'local-user',
    };

    const nextContentById = { ...(current.samplePayloadContentById ?? {}) };
    delete nextContentById[sampleId];

    schemas[index] = {
      ...current,
      metadata: nextMetadata,
      detail: {
        ...current.detail,
        metadata: nextMetadata,
      },
      samplePayloadContentById: nextContentById,
    };

    this.writeArray(STORAGE_KEYS.schemas, schemas);
    return nextMetadata;
  }

  async getSchemaSamplePayload(id: string, sampleId: string): Promise<SchemaSamplePayloadContent> {
    const schemas = this.readArray<StoredSchema>(STORAGE_KEYS.schemas);
    const schema = schemas.find((item) => item.metadata.schemaId === id);
    if (!schema) {
      throw this.notFound('Schema', id);
    }

    const metadata = (schema.metadata.samplePayloads ?? []).find((sample) => sample.sampleId === sampleId);
    if (!metadata) {
      throw this.notFound('Schema sample', `${id}:${sampleId}`);
    }

    const cached = schema.samplePayloadContentById?.[sampleId];
    if (cached) {
      return cached;
    }

    throw this.notFound('Schema sample payload', `${id}:${sampleId}`);
  }

  async deleteSchema(id: string): Promise<void> {
    const schemas = this.readArray<StoredSchema>(STORAGE_KEYS.schemas);
    const next = schemas.filter((item) => item.metadata.schemaId !== id);
    this.writeArray(STORAGE_KEYS.schemas, next);
  }

  // Mappings
  async listMappings(projectId: string): Promise<MappingMetadata[]> {
    return this.readArray<StoredMapping>(STORAGE_KEYS.mappings)
      .map((item) => item.metadata)
      .filter((item) => item.projectId === projectId);
  }

  async getMapping(id: string): Promise<MappingConfig> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const found = mappings.find((item) => item.metadata.mappingId === id);
    if (!found) {
      throw this.notFound('Mapping', id);
    }

    return normalizeMappingCompatibility(found.config);
  }

  async createMapping(input: CreateMappingInput): Promise<MappingMetadata> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const mappingId = crypto.randomUUID();
    const timestamp = this.nowIso();
    const businessContext = normalizeOptionalBusinessContext(input.businessContext);

    const config: MappingConfig = normalizeMappingCompatibility({
      id: mappingId,
      projectId: input.projectId,
      name: input.name,
      ...(businessContext ? { businessContext } : {}),
      version: 1,
      engineVersion: '2.0.0',
      ...(input.sourceSchemaRef !== undefined && { sourceSchemaRef: input.sourceSchemaRef }),
      ...(input.targetSchemaRef !== undefined && { targetSchemaRef: input.targetSchemaRef }),
      ...(input.enrichmentSources !== undefined && { enrichmentSources: input.enrichmentSources }),
      config: input.config ?? {},
      rules: input.rules ?? [],
    });

    const metadata: MappingMetadata = {
      mappingId,
      projectId: input.projectId,
      name: input.name,
      ...(businessContext ? { businessContext } : {}),
      version: 1,
      status: 'draft',
      sourceSchemaId: input.sourceSchemaRef?.schemaId ?? '',
      targetSchemaId: input.targetSchemaRef?.schemaId ?? '',
      ...(config.enrichmentSources !== undefined ? { enrichmentSources: config.enrichmentSources } : {}),
      ruleCount: config.rules.length,
      coverage: 0,
      updatedAt: timestamp,
    };

    mappings.push({ metadata, config });
    this.writeArray(STORAGE_KEYS.mappings, mappings);

    return metadata;
  }

  async updateMapping(id: string, config: MappingConfig): Promise<MappingMetadata> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const index = mappings.findIndex((item) => item.metadata.mappingId === id);
    if (index < 0) {
      throw this.notFound('Mapping', id);
    }

    const current = mappings[index];
    const timestamp = this.nowIso();
    const businessContext = normalizeOptionalBusinessContext(config.businessContext);

    const nextConfig: MappingConfig = normalizeMappingCompatibility({
      ...config,
      id,
      projectId: config.projectId ?? current.metadata.projectId,
    });

    const nextMetadata: MappingMetadata = {
      ...current.metadata,
      name: config.name,
      ...(businessContext ? { businessContext } : {}),
      version: config.version,
      sourceSchemaId: config.sourceSchemaRef?.schemaId ?? current.metadata.sourceSchemaId,
      targetSchemaId: config.targetSchemaRef?.schemaId ?? current.metadata.targetSchemaId,
      ...(nextConfig.enrichmentSources !== undefined ? { enrichmentSources: nextConfig.enrichmentSources } : {}),
      ruleCount: config.rules.length,
      updatedAt: timestamp,
    };

    mappings[index] = { metadata: nextMetadata, config: nextConfig };
    this.writeArray(STORAGE_KEYS.mappings, mappings);

    return nextMetadata;
  }

  async saveMapping(id: string, config: MappingConfig): Promise<MappingSaveResult> {
    const revisions = this.readArray<StoredRevisionEntry>(this.revisionKey(id))
      .sort((a, b) => b.revision - a.revision);
    const latest = revisions[0];

    const currentHash = await this.computeConfigHash(config);
    if (latest && latest.configHash === currentHash) {
      return {
        revision: latest.revision,
        noChange: true,
      };
    }

    const nextRevision = (latest?.revision ?? 0) + 1;
    const now = this.nowIso();

    const nextConfig: MappingConfig = {
      ...config,
      id,
      version: nextRevision,
    };

    await this.updateMapping(id, nextConfig);

    this.writeArray(this.revisionKey(id), [
      ...revisions,
      {
        revision: nextRevision,
        savedAt: now,
        savedBy: 'local-user',
        ruleCount: nextConfig.rules.length,
        configHash: currentHash,
        config: nextConfig,
      } satisfies StoredRevisionEntry,
    ]);

    return {
      revision: nextRevision,
      noChange: false,
    };
  }

  async deleteMapping(id: string): Promise<void> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const mappingToDelete = mappings.find((item) => item.metadata.mappingId === id);
    const next = mappings.filter((item) => item.metadata.mappingId !== id);
    this.writeArray(STORAGE_KEYS.mappings, next);
    localStorage.removeItem(this.versionKey(id));
    localStorage.removeItem(this.revisionKey(id));

    if (!mappingToDelete) {
      return;
    }

    const projectId = mappingToDelete.metadata.projectId;
    const projectMappings = next.filter((item) => item.metadata.projectId === projectId);
    const referencedSchemaIds = new Set<string>();
    for (const mapping of projectMappings) {
      const sourceSchemaId = mapping.metadata.sourceSchemaId;
      const targetSchemaId = mapping.metadata.targetSchemaId;
      if (typeof sourceSchemaId === 'string' && sourceSchemaId.trim().length > 0) {
        referencedSchemaIds.add(sourceSchemaId);
      }
      if (typeof targetSchemaId === 'string' && targetSchemaId.trim().length > 0) {
        referencedSchemaIds.add(targetSchemaId);
      }
    }

    const projects = this.readArray<Project>(STORAGE_KEYS.projects);
    const projectIndex = projects.findIndex((item) => item.projectId === projectId);
    if (projectIndex < 0) {
      return;
    }

    const current = projects[projectIndex];
    const currentRefs = current.schemaRefs ?? [];
    const nextSchemaRefs = currentRefs.filter((ref) => referencedSchemaIds.has(ref.schemaId));
    const nextLinkedSchemaIds = normalizeProjectLinkedSchemaIds({
      linkedSchemaIds: current.linkedSchemaIds,
      schemaRefs: nextSchemaRefs,
    }).filter((schemaId) => referencedSchemaIds.has(schemaId));

    const nextProject: Project = {
      ...current,
      linkedSchemaIds: nextLinkedSchemaIds,
      schemaRefs: nextSchemaRefs,
      updatedAt: this.nowIso(),
    };

    const nextProjects = [...projects];
    nextProjects[projectIndex] = nextProject;
    this.writeArray(STORAGE_KEYS.projects, nextProjects);
  }

  async listMappingVersions(mappingId: string): Promise<MappingVersionEntry[]> {
    const rawEntries = this.readArray<unknown>(this.versionKey(mappingId));
    const legacyEntries = rawEntries
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record = entry as Partial<MappingVersionEntry>;
        if (
          typeof record.version === 'number'
          && typeof record.savedAt === 'string'
          && typeof record.savedBy === 'string'
          && typeof record.ruleCount === 'number'
          && !!record.config
        ) {
          return record as MappingVersionEntry;
        }

        return null;
      })
      .filter((entry): entry is MappingVersionEntry => entry !== null);

    if (legacyEntries.length > 0) {
      return legacyEntries.sort((a, b) => b.version - a.version);
    }

    const versions = await this.listVersions(mappingId);
    const revisions = this.readArray<StoredRevisionEntry>(this.revisionKey(mappingId));

    return versions
      .map((version) => {
        const revision = revisions.find((entry) => entry.revision === version.revisionNumber);
        if (!revision) {
          return null;
        }

        return {
          version: version.version,
          savedAt: revision.savedAt,
          savedBy: revision.savedBy,
          ruleCount: revision.ruleCount,
          config: revision.config,
        } satisfies MappingVersionEntry;
      })
      .filter((entry): entry is MappingVersionEntry => entry !== null)
      .sort((a, b) => b.version - a.version);
  }

  async getMappingVersion(mappingId: string, version: number): Promise<MappingVersionEntry> {
    const legacy = this.readArray<unknown>(this.versionKey(mappingId))
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record = entry as Partial<MappingVersionEntry>;
        if (
          typeof record.version === 'number'
          && typeof record.savedAt === 'string'
          && typeof record.savedBy === 'string'
          && typeof record.ruleCount === 'number'
          && !!record.config
        ) {
          return record as MappingVersionEntry;
        }

        return null;
      })
      .filter((entry): entry is MappingVersionEntry => entry !== null)
      .find((entry) => entry.version === version);

    if (legacy) {
      return legacy;
    }

    const found = await this.getVersion(mappingId, version);
    const revision = await this.getMappingRevision(mappingId, found.revisionNumber);

    return {
      version: found.version,
      savedAt: revision.savedAt,
      savedBy: revision.savedBy,
      ruleCount: revision.ruleCount,
      config: revision.config,
    };
  }

  async saveMappingVersion(mappingId: string, entry: MappingVersionEntry): Promise<void> {
    try {
      await this.getMapping(mappingId);
      await this.saveMapping(mappingId, entry.config);
      await this.createMappingVersion(mappingId);
      return;
    } catch {
      // Fall back to legacy direct-write behavior for tests/fixtures that only persist version history.
    }

    const key = this.versionKey(mappingId);
    const entries = this.readArray<MappingVersionEntry>(key);
    const next = [...entries, entry];

    const pruned = next.length > MAX_MAPPING_VERSIONS
      ? [...next]
        .sort((a, b) => a.version - b.version)
        .slice(next.length - MAX_MAPPING_VERSIONS)
      : next;

    this.writeArray(key, pruned);
  }

  async listVersions(mappingId: string): Promise<MappingVersion[]> {
    const rawEntries = this.readArray<unknown>(this.versionKey(mappingId));

    const entries = rawEntries
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const record = entry as Record<string, unknown>;

        if (
          typeof record.version === 'number'
          && typeof record.revisionNumber === 'number'
          && typeof record.createdAt === 'string'
          && typeof record.createdBy === 'string'
        ) {
          return record as unknown as StoredVersionEntry;
        }

        if (
          typeof record.version === 'number'
          && typeof record.savedAt === 'string'
          && typeof record.savedBy === 'string'
        ) {
          return {
            version: record.version,
            revisionNumber: record.version,
            createdAt: record.savedAt,
            createdBy: record.savedBy,
          } satisfies StoredVersionEntry;
        }

        return null;
      })
      .filter((entry): entry is StoredVersionEntry => entry !== null);

    return entries.sort((a, b) => b.version - a.version);
  }

  async getVersion(mappingId: string, version: number): Promise<MappingVersion> {
    const entries = this.readArray<StoredVersionEntry>(this.versionKey(mappingId));
    const found = entries.find((entry) => entry.version === version);

    if (!found) {
      throw this.notFound('MappingVersion', `${mappingId}@v${version}`);
    }

    return found;
  }

  async listMappingRevisions(mappingId: string): Promise<MappingRevision[]> {
    const entries = this.readArray<StoredRevisionEntry>(this.revisionKey(mappingId))
      .sort((a, b) => b.revision - a.revision);
    return entries.map((entry) => ({
      revision: entry.revision,
      savedAt: entry.savedAt,
      savedBy: entry.savedBy,
      ruleCount: entry.ruleCount,
    }));
  }

  async getMappingRevision(mappingId: string, revision: number): Promise<MappingRevisionDetail> {
    const entries = this.readArray<StoredRevisionEntry>(this.revisionKey(mappingId));
    const entry = entries.find((candidate) => candidate.revision === revision);

    if (!entry) {
      throw this.notFound('MappingRevision', `${mappingId}@r${revision}`);
    }

    return {
      mappingId,
      revision,
      savedAt: entry.savedAt,
      savedBy: entry.savedBy,
      ruleCount: entry.ruleCount,
      config: entry.config,
    };
  }

  async listRevisions(mappingId: string): Promise<MappingRevision[]> {
    return this.listMappingRevisions(mappingId);
  }

  async getRevision(mappingId: string, revision: number): Promise<MappingRevisionDetail> {
    return this.getMappingRevision(mappingId, revision);
  }

  async createMappingVersion(mappingId: string): Promise<MappingVersion> {
    const revisions = this.readArray<StoredRevisionEntry>(this.revisionKey(mappingId))
      .sort((a, b) => b.revision - a.revision);

    let latestRevision = revisions[0]?.revision;
    if (!latestRevision) {
      const mapping = await this.getMapping(mappingId);
      const saved = await this.saveMapping(mappingId, mapping);
      latestRevision = saved.revision;
    }

    const versions = this.readArray<StoredVersionEntry>(this.versionKey(mappingId))
      .sort((a, b) => b.version - a.version);
    const nextVersion = (versions[0]?.version ?? 0) + 1;
    const now = this.nowIso();

    const nextEntry: StoredVersionEntry = {
      version: nextVersion,
      revisionNumber: latestRevision,
      createdAt: now,
      createdBy: 'local-user',
    };

    const nextVersions = [...versions, nextEntry];

    const pruned = nextVersions.length > MAX_MAPPING_VERSIONS
      ? [...nextVersions]
        .sort((a, b) => a.version - b.version)
        .slice(nextVersions.length - MAX_MAPPING_VERSIONS)
      : nextVersions;

    this.writeArray(this.versionKey(mappingId), pruned);

    return {
      version: nextVersion,
      revisionNumber: latestRevision,
      createdAt: now,
      createdBy: 'local-user',
    };
  }

  async createVersion(mappingId: string): Promise<MappingVersion> {
    return this.createMappingVersion(mappingId);
  }

  async duplicateMapping(id: string, newName: string): Promise<MappingMetadata> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const original = mappings.find((item) => item.metadata.mappingId === id);
    if (!original) {
      throw this.notFound('Mapping', id);
    }

    const nextId = crypto.randomUUID();
    const timestamp = this.nowIso();
    const businessContext = normalizeOptionalBusinessContext(original.config.businessContext)
      ?? normalizeOptionalBusinessContext(original.metadata.businessContext);

    const config: MappingConfig = {
      ...normalizeMappingCompatibility(original.config),
      id: nextId,
      name: newName,
      ...(businessContext ? { businessContext } : {}),
      version: 1,
    };

    const metadata: MappingMetadata = {
      ...original.metadata,
      mappingId: nextId,
      name: newName,
      ...(businessContext ? { businessContext } : {}),
      version: 1,
      ...(config.enrichmentSources !== undefined ? { enrichmentSources: config.enrichmentSources } : {}),
      ruleCount: config.rules.length,
      updatedAt: timestamp,
    };

    mappings.push({ metadata, config });
    this.writeArray(STORAGE_KEYS.mappings, mappings);

    return metadata;
  }

  // Projects
  private normalizeProject(project: Project): Project {
    const schemaRefs = project.schemaRefs ?? [];
    const linkedSchemaIds = normalizeProjectLinkedSchemaIds({
      linkedSchemaIds: project.linkedSchemaIds,
      schemaRefs,
    });

    return {
      ...project,
      linkedSchemaIds,
      schemaRefs,
      tags: project.tags ?? [],
    };
  }

  async listProjects(): Promise<ProjectMetadata[]> {
    return this.readArray<Project>(STORAGE_KEYS.projects).map((project) => ({
      projectId: project.projectId,
      name: project.name,
      description: project.description,
      slug: project.slug,
      updatedAt: project.updatedAt,
    }));
  }

  async getProject(id: string): Promise<ProjectDetail> {
    const projects = this.readArray<Project>(STORAGE_KEYS.projects);
    const project = projects.find((item) => item.projectId === id);
    if (!project) {
      throw this.notFound('Project', id);
    }

    const normalizedProject = this.normalizeProject(project);

    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings)
      .map((item) => item.metadata)
      .filter((item) => item.projectId === id);

    return {
      ...normalizedProject,
      mappings,
    };
  }

  async createProject(input: CreateProjectInput): Promise<ProjectMetadata> {
    const projects = this.readArray<Project>(STORAGE_KEYS.projects);
    const timestamp = this.nowIso();

    const schemaRefs = input.schemaRefs ?? [];
    const linkedSchemaIds = normalizeProjectLinkedSchemaIds({
      linkedSchemaIds: input.linkedSchemaIds,
      schemaRefs,
    });

    const project: Project = {
      projectId: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      slug: input.slug,
      linkedSchemaIds,
      schemaRefs,
      tags: input.tags ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    projects.push(project);
    this.writeArray(STORAGE_KEYS.projects, projects);

    return {
      projectId: project.projectId,
      name: project.name,
      description: project.description,
      slug: project.slug,
      updatedAt: project.updatedAt,
    };
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<ProjectMetadata> {
    const projects = this.readArray<Project>(STORAGE_KEYS.projects);
    const index = projects.findIndex((item) => item.projectId === id);
    if (index < 0) {
      throw this.notFound('Project', id);
    }

    const current = projects[index];
    const currentSchemaRefs = current.schemaRefs ?? [];
    const nextSchemaRefs = input.schemaRefs ?? currentSchemaRefs;
    const nextLinkedSchemaIds = input.linkedSchemaIds !== undefined || input.schemaRefs !== undefined
      ? normalizeProjectLinkedSchemaIds({
          linkedSchemaIds: input.linkedSchemaIds ?? current.linkedSchemaIds,
          schemaRefs: nextSchemaRefs,
        })
      : normalizeProjectLinkedSchemaIds({
          linkedSchemaIds: current.linkedSchemaIds,
          schemaRefs: currentSchemaRefs,
        });

    const next: Project = {
      ...current,
      ...input,
      linkedSchemaIds: nextLinkedSchemaIds,
      schemaRefs: nextSchemaRefs,
      updatedAt: this.nowIso(),
    };

    projects[index] = next;
    this.writeArray(STORAGE_KEYS.projects, projects);

    return {
      projectId: next.projectId,
      name: next.name,
      description: next.description,
      slug: next.slug,
      updatedAt: next.updatedAt,
    };
  }

  async deleteProject(id: string): Promise<void> {
    const projects = this.readArray<Project>(STORAGE_KEYS.projects);
    const next = projects.filter((item) => item.projectId !== id);
    this.writeArray(STORAGE_KEYS.projects, next);
  }

  // Templates
  async listTemplates(): Promise<TemplateMetadata[]> {
    return [];
  }

  async getTemplate(id: string): Promise<TemplateDetail> {
    throw this.notFound('Template', id);
  }

  // Deployment
  async getDeploymentContext(mappingId: string): Promise<DeploymentContext> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const mapping = mappings.find((item) => item.metadata.mappingId === mappingId);
    if (!mapping) {
      throw this.notFound('Mapping', mappingId);
    }

    const deployments = this.readArray<LegacyDeploymentRecord>(STORAGE_KEYS.deployments).filter(
      (item) => item.mappingId === mappingId,
    );

    const environments = (['DEV', 'QA', 'PROD'] as const).map((env) => {
      const latest = deployments
        .filter((item) => item.environment === env)
        .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))[0];

      return {
        environment: env,
        status: (latest ? 'deployed' : 'not-deployed') as DeployStatus,
        deployedVersion: latest?.version,
        deployedAt: latest?.deployedAt,
      };
    });

    return {
      mappingId,
      mappingName: mapping.metadata.name,
      projectId: mapping.metadata.projectId,
      projectName: mapping.metadata.projectId,
      environments,
    };
  }

  async deploy(mappingId: string, environment: Environment): Promise<LegacyDeploymentRecord> {
    const deployments = this.readArray<LegacyDeploymentRecord>(STORAGE_KEYS.deployments);
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const mapping = mappings.find((item) => item.metadata.mappingId === mappingId);

    const normalized = deployments.map((item) =>
      item.mappingId === mappingId && item.environment === environment && item.status === 'active'
        ? { ...item, status: 'superseded' as const }
        : item,
    );

    const record: LegacyDeploymentRecord = {
      mappingId,
      environment,
      version: mapping?.metadata.version ?? 1,
      snapshotId: crypto.randomUUID(),
      deployedAt: this.nowIso(),
      deployedBy: 'local-user',
      status: 'active',
    };

    normalized.push(record);
    this.writeArray(STORAGE_KEYS.deployments, normalized);
    return record;
  }

  async promote(mappingId: string, from: Environment, to: Environment): Promise<LegacyDeploymentRecord> {
    const deployments = this.readArray<LegacyDeploymentRecord>(STORAGE_KEYS.deployments);
    const source = deployments
      .filter((item) => item.mappingId === mappingId && item.environment === from)
      .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))[0];

    const normalized = deployments.map((item) =>
      item.mappingId === mappingId && item.environment === to && item.status === 'active'
        ? { ...item, status: 'superseded' as const }
        : item,
    );

    const record: LegacyDeploymentRecord = {
      mappingId,
      environment: to,
      version: source?.version ?? 1,
      snapshotId: crypto.randomUUID(),
      deployedAt: this.nowIso(),
      deployedBy: 'local-user',
      status: 'active',
    };

    normalized.push(record);
    this.writeArray(STORAGE_KEYS.deployments, normalized);
    return record;
  }

  async rollback(
    mappingId: string,
    environment: Environment,
    targetVersion: number,
  ): Promise<LegacyDeploymentRecord> {
    const deployments = this.readArray<LegacyDeploymentRecord>(STORAGE_KEYS.deployments);

    const normalized = deployments.map((item) =>
      item.mappingId === mappingId && item.environment === environment && item.status === 'active'
        ? { ...item, status: 'superseded' as const }
        : item,
    );

    const record: LegacyDeploymentRecord = {
      mappingId,
      environment,
      version: targetVersion,
      snapshotId: crypto.randomUUID(),
      deployedAt: this.nowIso(),
      deployedBy: 'local-user',
      status: 'active',
    };

    normalized.push(record);
    this.writeArray(STORAGE_KEYS.deployments, normalized);
    return record;
  }

  async getDeploymentDiff(
    mappingId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<DeploymentDiff> {
    return {
      mappingId,
      fromVersion,
      toVersion,
      changedFields: [],
    };
  }

  async deployMapping(
    mappingId: string,
    input: {
      environment: Environment;
      sourceType: DeploymentSourceType;
      sourceNumber: number;
    },
  ): Promise<DeploymentRecord> {
    await this.getMapping(mappingId);

    if (input.sourceType === 'revision' && input.environment !== 'DEV') {
      throw {
        message: 'Revision deployments are only allowed for DEV',
        code: 'REVISION_NOT_DEPLOYABLE_TO_ENV',
        statusCode: 400,
        retryable: false,
      };
    }

    if (input.sourceType === 'revision') {
      await this.getRevision(mappingId, input.sourceNumber);
    } else {
      await this.getVersion(mappingId, input.sourceNumber);
    }

    return this.appendDeployment(mappingId, {
      environment: input.environment,
      sourceType: input.sourceType,
      sourceNumber: input.sourceNumber,
      deployedBy: 'local-user',
    });
  }

  async promoteDeployment(
    mappingId: string,
    input: {
      fromEnvironment: Environment;
      toEnvironment: Environment;
    },
  ): Promise<DeploymentRecord> {
    await this.getMapping(mappingId);

    const source = this.readDeployments(mappingId)
      .filter((item) => item.environment === input.fromEnvironment)
      .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))[0];

    if (!source) {
      throw this.notFound('Deployment', `${mappingId}:${input.fromEnvironment}`);
    }

    if (source.sourceType !== 'version') {
      throw {
        message: 'Promotion requires a version-backed source deployment',
        code: 'PROMOTION_REQUIRES_VERSION',
        statusCode: 400,
        retryable: false,
      };
    }

    return this.appendDeployment(mappingId, {
      environment: input.toEnvironment,
      sourceType: 'version',
      sourceNumber: source.sourceNumber,
      deployedBy: 'local-user',
      promotedFrom: input.fromEnvironment,
    });
  }

  async rollbackDeployment(
    mappingId: string,
    input: {
      environment: Environment;
      deploymentSK: string;
    },
  ): Promise<DeploymentRecord> {
    await this.getMapping(mappingId);

    const target = this.readDeployments(mappingId).find(
      (item) => item.environment === input.environment && item.environmentDeployedAt === input.deploymentSK,
    );

    if (!target) {
      throw this.notFound('Deployment', `${mappingId}:${input.deploymentSK}`);
    }

    return this.appendDeployment(mappingId, {
      environment: input.environment,
      sourceType: target.sourceType,
      sourceNumber: target.sourceNumber,
      deployedBy: 'local-user',
      rollbackOf: input.deploymentSK,
    });
  }

  async listDeployments(
    mappingId: string,
    options?: {
      environment?: Environment;
    },
  ): Promise<DeploymentRecord[]> {
    await this.getMapping(mappingId);

    const deployments = this.readDeployments(mappingId)
      .filter((item) => (options?.environment ? item.environment === options.environment : true))
      .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt));

    return deployments;
  }

  async getCurrentDeployments(mappingId: string): Promise<CurrentDeployments> {
    const mapping = await this.getMapping(mappingId);
    const current = this.getCurrentByEnvironment(mappingId);
    const latestVersion = await this.getLatestVersionNumber(mappingId);

    return this.computeAllEnvironments(current, {
      revision: mapping.version,
      latestVersion,
    });
  }

  // GitHub: CDM Repo (read-only)
  async listCdmSchemas(path?: string): Promise<GitHubFile[]> {
    void path;
    throw this.offlineModeError();
  }

  async linkCdmSchema(input: LinkCdmSchemaInput): Promise<SchemaMetadata> {
    void input;
    throw this.offlineModeError();
  }

  async syncAllCdmSchemas(): Promise<CdmBulkSyncResult> {
    throw this.offlineModeError();
  }

  async syncCdmSchema(
    schemaId: string,
    options?: {
      statusOnly?: boolean;
    },
  ): Promise<SchemaSyncResult> {
    void schemaId;
    void options;
    throw this.offlineModeError();
  }

  // GitHub: Non-CDM Repo (read-write)
  async listPublishedSchemas(path?: string): Promise<GitHubFile[]> {
    void path;
    throw this.offlineModeError();
  }

  async publishSchemaToGitHub(schemaId: string, input: PublishSchemaInput): Promise<void> {
    void schemaId;
    void input;
    throw this.offlineModeError();
  }

  async linkPublishedSchema(input: LinkPublishedSchemaInput): Promise<SchemaMetadata> {
    void input;
    throw this.offlineModeError();
  }

  // AI
  async autoMap(input: AutoMapInput): Promise<AutoMapResult> {
    void input;
    throw this.offlineModeError();
  }

  async autoMapSection(input: AutoMapSectionInput): Promise<AutoMapSectionResult> {
    void input;
    throw this.offlineModeError();
  }

  async suggestExpression(input: SuggestExpressionInput): Promise<SuggestExpressionResult> {
    void input;
    throw this.offlineModeError();
  }

  async explainRule(input: ExplainRuleInput): Promise<ExplainRuleResult> {
    void input;
    throw this.offlineModeError();
  }

  async smartFix(input: SmartFixInput): Promise<SmartFixResult> {
    void input;
    throw this.offlineModeError();
  }

  async validateMappings(input: ValidateMappingsInput): Promise<ValidationReport> {
    void input;
    throw this.offlineModeError();
  }

  // Schema Search
  async querySchemaNodes(schemaId: string, query: string): Promise<SchemaSearchResult[]> {
    void schemaId;
    void query;
    return [];
  }

  // Activity
  async listActivity(projectId?: string, limit?: number): Promise<ActivityEntry[]> {
    const entries = this.readArray<ActivityEntry>(STORAGE_KEYS.activity)
      .filter((item) => (projectId ? item.projectId === projectId : true))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (!limit || limit <= 0) {
      return entries;
    }

    return entries.slice(0, limit);
  }

  // Preview
  async previewOnServer(
    mappingId: string,
    input: ServerPreviewInput,
  ): Promise<ServerPreviewResult> {
    void mappingId;
    void input;
    throw this.offlineModeError();
  }
}
