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
  readonly version: number;
  readonly engineVersion: string;
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
  readonly config: MappingConfigOptions;
  readonly rules: readonly MappingRule[];
}

export type MappingStatus = 'draft' | 'ready' | 'has-errors';

export type SchemaFormat = 'json-schema' | 'xsd';

export type SchemaOrigin = 'cdm' | 'published' | 'local';

export type SchemaIngestStatus = 'ingesting' | 'ready' | 'error';

export type SchemaScope = 'global' | 'project';

export type SchemaSyncStatus = 'synced' | 'not-synced' | 'local-changes';

export interface GitHubSourceInfo {
  readonly type: 'github';
  readonly repo: string;
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
  readonly version: number;
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
  readonly scope: SchemaScope;
  readonly description?: string;
  readonly inferred?: boolean;
  readonly syncStatus: SchemaSyncStatus;
  readonly source: SchemaSourceInfo;
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
  readonly savedAt: ISODateString;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly configS3Key: string;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly schemaRefs?: readonly SchemaRef[];
  readonly tags?: readonly string[];
}

export interface UpdateProjectInput {
  readonly name?: string;
  readonly description?: string;
  readonly slug?: string;
  readonly schemaRefs?: readonly SchemaRef[];
  readonly tags?: readonly string[];
}

export interface CreateMappingInput {
  readonly projectId: string;
  readonly name: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly status?: MappingStatus;
  readonly ruleCount?: number;
  readonly coverage?: number;
  readonly configS3Key: string;
}

export interface UpdateMappingInput {
  readonly name?: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly status?: MappingStatus;
  readonly ruleCount?: number;
  readonly coverage?: number;
  readonly configS3Key?: string;
}

export interface CreateSchemaMetadataInput {
  readonly name: string;
  readonly format: SchemaFormat;
  readonly fieldCount: number;
  readonly origin: SchemaOrigin;
  readonly status?: SchemaIngestStatus;
  readonly scope: SchemaScope;
  readonly description?: string;
  readonly inferred?: boolean;
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
  readonly fieldCount: number;
  readonly origin: SchemaOrigin;
  readonly status: SchemaIngestStatus;
  readonly scope: SchemaScope;
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
  readonly syncStatus: SchemaSyncStatus;
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

export function toProjectDetail(item: ProjectItem, mappings: readonly MappingMetadata[] = []): ProjectDetail {
  return {
    projectId: item.projectId,
    name: item.name,
    description: item.description,
    slug: item.slug,
    schemaRefs: item.schemaRefs,
    tags: item.tags,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    mappings,
  };
}

export function toMappingMetadata(item: MappingItem): MappingMetadata {
  return {
    mappingId: item.mappingId,
    projectId: item.projectId,
    name: item.name,
    version: item.version,
    status: item.status,
    sourceSchemaId: item.sourceSchemaId,
    targetSchemaId: item.targetSchemaId,
    ruleCount: item.ruleCount,
    coverage: item.coverage,
    updatedAt: item.updatedAt,
  };
}

export function toSchemaMetadata(item: SchemaMetadataItem): SchemaMetadata {
  return {
    schemaId: item.schemaId,
    name: item.name,
    format: item.format,
    fieldCount: item.fieldCount,
    origin: item.origin,
    status: item.status,
    scope: item.scope,
    description: item.description,
    inferred: item.inferred,
    syncStatus: item.syncStatus,
    source: item.source,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
