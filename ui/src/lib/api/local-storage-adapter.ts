import type { ApiAdapter } from './types';

import type {
  ActivityEntry,
  AutoMapInput,
  AutoMapResult,
  CreateMappingInput,
  CreateProjectInput,
  CreateSchemaInput,
  DeploymentContext,
  DeploymentDiff,
  DeploymentRecord,
  DeployStatus,
  Environment,
  ExplainRuleInput,
  GitHubFile,
  LinkCdmSchemaInput,
  LinkPublishedSchemaInput,
  MappingConfig,
  MappingVersionEntry,
  MappingMetadata,
  Project,
  ProjectDetail,
  ProjectMetadata,
  PublishSchemaInput,
  SchemaDetail,
  SchemaMetadata,
  SchemaOrigin,
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

const VALID_SCHEMA_ORIGINS: readonly SchemaOrigin[] = ['cdm', 'published', 'local'];

function normalizeSchemaOrigin(origin: unknown): SchemaOrigin {
  return typeof origin === 'string' && VALID_SCHEMA_ORIGINS.includes(origin as SchemaOrigin)
    ? (origin as SchemaOrigin)
    : 'local';
}

interface StoredSchema {
  metadata: SchemaMetadata;
  detail: SchemaDetail;
}

interface StoredMapping {
  metadata: MappingMetadata;
  config: MappingConfig;
}

const OFFLINE_MODE_MESSAGE = 'Not available in offline mode';

export class LocalStorageAdapter implements ApiAdapter {
  private versionKey(mappingId: string): string {
    return `keyra:versions:${mappingId}`;
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

  // Schemas
  async listSchemas(): Promise<SchemaMetadata[]> {
    return this.readArray<StoredSchema>(STORAGE_KEYS.schemas).map((item) => ({
      ...item.metadata,
      origin: normalizeSchemaOrigin(item.metadata.origin),
      scope: item.metadata.scope ?? 'global',
      description: item.metadata.description ?? '',
      inferred: item.metadata.inferred ?? false,
      syncStatus: item.metadata.syncStatus ?? 'not-synced',
    }));
  }

  async getSchema(id: string): Promise<SchemaDetail> {
    const schemas = this.readArray<StoredSchema>(STORAGE_KEYS.schemas);
    const found = schemas.find((item) => item.metadata.schemaId === id);
    if (!found) {
      throw this.notFound('Schema', id);
    }

    const metadata: SchemaMetadata = {
      ...found.metadata,
      origin: normalizeSchemaOrigin(found.metadata.origin),
      scope: found.metadata.scope ?? 'global',
      description: found.metadata.description ?? '',
      inferred: found.metadata.inferred ?? false,
      syncStatus: found.metadata.syncStatus ?? 'not-synced',
    };

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
      status: 'ready',
      scope: input.scope ?? 'global',
      description: input.description ?? '',
      updatedBy: 'local-user',
      inferred: input.inferred ?? false,
      syncStatus: input.syncStatus ?? 'not-synced',
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
    const currentMetadata = {
      ...current.metadata,
      origin: normalizeSchemaOrigin(current.metadata.origin),
      scope: current.metadata.scope ?? 'global',
      description: current.metadata.description ?? '',
      inferred: current.metadata.inferred ?? false,
      syncStatus: current.metadata.syncStatus ?? 'not-synced',
    };

    const didUpdateContent = input.content !== undefined;
    const nextSyncStatus =
      didUpdateContent && currentMetadata.syncStatus === 'synced'
        ? 'local-changes'
        : currentMetadata.syncStatus;

    const nextMetadata: SchemaMetadata = {
      ...currentMetadata,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      ...(input.fieldCount !== undefined ? { fieldCount: input.fieldCount } : {}),
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

    return found.config;
  }

  async createMapping(input: CreateMappingInput): Promise<MappingMetadata> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const mappingId = crypto.randomUUID();
    const timestamp = this.nowIso();

    const config: MappingConfig = {
      id: mappingId,
      projectId: input.projectId,
      name: input.name,
      version: 1,
      engineVersion: '2.0.0',
      ...(input.sourceSchemaRef !== undefined && { sourceSchemaRef: input.sourceSchemaRef }),
      ...(input.targetSchemaRef !== undefined && { targetSchemaRef: input.targetSchemaRef }),
      config: input.config ?? {},
      rules: input.rules ?? [],
    };

    const metadata: MappingMetadata = {
      mappingId,
      projectId: input.projectId,
      name: input.name,
      version: 1,
      status: 'draft',
      sourceSchemaId: input.sourceSchemaRef?.schemaId ?? '',
      targetSchemaId: input.targetSchemaRef?.schemaId ?? '',
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

    const nextConfig: MappingConfig = {
      ...config,
      id,
      projectId: config.projectId ?? current.metadata.projectId,
    };

    const nextMetadata: MappingMetadata = {
      ...current.metadata,
      name: config.name,
      version: config.version,
      sourceSchemaId: config.sourceSchemaRef?.schemaId ?? current.metadata.sourceSchemaId,
      targetSchemaId: config.targetSchemaRef?.schemaId ?? current.metadata.targetSchemaId,
      ruleCount: config.rules.length,
      updatedAt: timestamp,
    };

    mappings[index] = { metadata: nextMetadata, config: nextConfig };
    this.writeArray(STORAGE_KEYS.mappings, mappings);

    return nextMetadata;
  }

  async deleteMapping(id: string): Promise<void> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const next = mappings.filter((item) => item.metadata.mappingId !== id);
    this.writeArray(STORAGE_KEYS.mappings, next);
    localStorage.removeItem(this.versionKey(id));
  }

  async listMappingVersions(mappingId: string): Promise<MappingVersionEntry[]> {
    const entries = this.readArray<MappingVersionEntry>(this.versionKey(mappingId));
    return entries.sort((a, b) => b.version - a.version);
  }

  async getMappingVersion(mappingId: string, version: number): Promise<MappingVersionEntry> {
    const entries = this.readArray<MappingVersionEntry>(this.versionKey(mappingId));
    const found = entries.find((entry) => entry.version === version);

    if (!found) {
      throw this.notFound('MappingVersion', `${mappingId}@v${version}`);
    }

    return found;
  }

  async saveMappingVersion(mappingId: string, entry: MappingVersionEntry): Promise<void> {
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

  async duplicateMapping(id: string, newName: string): Promise<MappingMetadata> {
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const original = mappings.find((item) => item.metadata.mappingId === id);
    if (!original) {
      throw this.notFound('Mapping', id);
    }

    const nextId = crypto.randomUUID();
    const timestamp = this.nowIso();

    const config: MappingConfig = {
      ...original.config,
      id: nextId,
      name: newName,
      version: 1,
    };

    const metadata: MappingMetadata = {
      ...original.metadata,
      mappingId: nextId,
      name: newName,
      version: 1,
      ruleCount: config.rules.length,
      updatedAt: timestamp,
    };

    mappings.push({ metadata, config });
    this.writeArray(STORAGE_KEYS.mappings, mappings);

    return metadata;
  }

  // Projects
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

    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings)
      .map((item) => item.metadata)
      .filter((item) => item.projectId === id);

    return {
      ...project,
      mappings,
    };
  }

  async createProject(input: CreateProjectInput): Promise<ProjectMetadata> {
    const projects = this.readArray<Project>(STORAGE_KEYS.projects);
    const timestamp = this.nowIso();

    const project: Project = {
      projectId: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      slug: input.slug,
      schemaRefs: input.schemaRefs ?? [],
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
    const next: Project = {
      ...current,
      ...input,
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

    const deployments = this.readArray<DeploymentRecord>(STORAGE_KEYS.deployments).filter(
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

  async deploy(mappingId: string, environment: Environment): Promise<DeploymentRecord> {
    const deployments = this.readArray<DeploymentRecord>(STORAGE_KEYS.deployments);
    const mappings = this.readArray<StoredMapping>(STORAGE_KEYS.mappings);
    const mapping = mappings.find((item) => item.metadata.mappingId === mappingId);

    const normalized = deployments.map((item) =>
      item.mappingId === mappingId && item.environment === environment && item.status === 'active'
        ? { ...item, status: 'superseded' as const }
        : item,
    );

    const record: DeploymentRecord = {
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

  async promote(mappingId: string, from: Environment, to: Environment): Promise<DeploymentRecord> {
    const deployments = this.readArray<DeploymentRecord>(STORAGE_KEYS.deployments);
    const source = deployments
      .filter((item) => item.mappingId === mappingId && item.environment === from)
      .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))[0];

    const normalized = deployments.map((item) =>
      item.mappingId === mappingId && item.environment === to && item.status === 'active'
        ? { ...item, status: 'superseded' as const }
        : item,
    );

    const record: DeploymentRecord = {
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
  ): Promise<DeploymentRecord> {
    const deployments = this.readArray<DeploymentRecord>(STORAGE_KEYS.deployments);

    const normalized = deployments.map((item) =>
      item.mappingId === mappingId && item.environment === environment && item.status === 'active'
        ? { ...item, status: 'superseded' as const }
        : item,
    );

    const record: DeploymentRecord = {
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

  // GitHub: CDM Repo (read-only)
  async listCdmSchemas(path?: string): Promise<GitHubFile[]> {
    void path;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  async linkCdmSchema(input: LinkCdmSchemaInput): Promise<SchemaMetadata> {
    void input;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  async syncCdmSchema(schemaId: string): Promise<SchemaSyncResult> {
    void schemaId;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  // GitHub: Non-CDM Repo (read-write)
  async listPublishedSchemas(path?: string): Promise<GitHubFile[]> {
    void path;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  async publishSchemaToGitHub(schemaId: string, input: PublishSchemaInput): Promise<void> {
    void schemaId;
    void input;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  async linkPublishedSchema(input: LinkPublishedSchemaInput): Promise<SchemaMetadata> {
    void input;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  // AI
  async autoMap(input: AutoMapInput): Promise<AutoMapResult> {
    void input;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  async suggestExpression(input: SuggestExpressionInput): Promise<SuggestExpressionResult> {
    void input;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  async explainRule(input: ExplainRuleInput): Promise<string> {
    void input;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  async smartFix(input: SmartFixInput): Promise<SmartFixResult> {
    void input;
    throw new Error(OFFLINE_MODE_MESSAGE);
  }

  async validateMappings(input: ValidateMappingsInput): Promise<ValidationReport> {
    void input;
    throw new Error(OFFLINE_MODE_MESSAGE);
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
    throw new Error(OFFLINE_MODE_MESSAGE);
  }
}
