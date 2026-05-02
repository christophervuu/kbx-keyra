import type { ExecutionResult } from '@keyra/engine';

export type ISODateString = string;

export type Environment = 'DEV' | 'QA' | 'PROD';

export type DeployStatus = 'deployed' | 'stale' | 'not-deployed' | 'deploying';

export type SchemaFormat = 'json-schema' | 'xsd';

export type SchemaOrigin = 'cdm' | 'published' | 'local';

export type SchemaIngestStatus = 'ingesting' | 'ready' | 'error';

export type MappingStatus = 'draft' | 'ready' | 'has-errors';

export type DeploymentRecordStatus = 'active' | 'superseded' | 'rolled-back';

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

export interface Project {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly schemaRefs: readonly SchemaRef[];
  readonly tags: readonly string[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
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

export interface ProjectDetail extends Project {
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

export interface SchemaMetadata {
  readonly schemaId: string;
  readonly name: string;
  readonly format: SchemaFormat;
  readonly fieldCount: number;
  readonly origin: SchemaOrigin;
  readonly status: SchemaIngestStatus;
  readonly source: SchemaSourceInfo;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface SchemaDetail {
  readonly metadata: SchemaMetadata;
  readonly content: Readonly<Record<string, unknown>> | string;
}

export interface DeploymentRecord {
  readonly mappingId: string;
  readonly environment: Environment;
  readonly version: number;
  readonly snapshotId: string;
  readonly deployedAt: ISODateString;
  readonly deployedBy: string;
  readonly status: DeploymentRecordStatus;
}

export interface DeploymentEnvironmentStatus {
  readonly environment: Environment;
  readonly status: DeployStatus;
  readonly deployedVersion?: number;
  readonly deployedAt?: ISODateString;
}

export interface DeploymentContext {
  readonly mappingId: string;
  readonly mappingName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly environments: readonly DeploymentEnvironmentStatus[];
}

export interface DeploymentDiffField {
  readonly path: string;
  readonly previousValue: unknown;
  readonly nextValue: unknown;
}

export interface DeploymentDiff {
  readonly mappingId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly changedFields: readonly DeploymentDiffField[];
}

export interface Template {
  readonly templateId: string;
  readonly name: string;
  readonly description: string;
  readonly sourceSchemaType: string;
  readonly targetSchemaType: string;
  readonly ruleCount: number;
  readonly tags: readonly string[];
  readonly configS3Key?: string;
}

export interface TemplateMetadata {
  readonly templateId: string;
  readonly name: string;
  readonly description: string;
  readonly sourceSchemaType: string;
  readonly targetSchemaType: string;
  readonly ruleCount: number;
  readonly tags: readonly string[];
}

export interface TemplateDetail extends Template {
  readonly mappingConfig: MappingConfig;
}

export type ActivityType =
  | 'project-created'
  | 'project-updated'
  | 'mapping-created'
  | 'mapping-updated'
  | 'mapping-deployed'
  | 'schema-linked'
  | 'schema-synced'
  | 'info'
  | 'warning'
  | 'error';

export interface ActivityEntry {
  readonly id: string;
  readonly type: ActivityType;
  readonly message: string;
  readonly timestamp: ISODateString;
  readonly projectId?: string;
  readonly mappingId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
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
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
  readonly config?: MappingConfigOptions;
  readonly rules?: readonly MappingRule[];
}

export interface CreateSchemaInput {
  readonly name: string;
  readonly format: SchemaFormat;
  readonly origin: SchemaOrigin;
  readonly content: Readonly<Record<string, unknown>> | string;
  readonly source?: SchemaSourceInfo;
}

export interface GitHubFile {
  readonly path: string;
  readonly name: string;
  readonly type: 'file' | 'dir';
  readonly sha: string;
  readonly size?: number;
  readonly downloadUrl?: string;
  readonly htmlUrl?: string;
}

export interface LinkCdmSchemaInput {
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly name?: string;
}

export interface SchemaSyncResult {
  readonly schemaId: string;
  readonly synced: boolean;
  readonly commitSha?: string;
  readonly message?: string;
}

export interface PublishSchemaInput {
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly commitMessage?: string;
}

export interface LinkPublishedSchemaInput {
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly name?: string;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly path?: string;
}

// AI types are intentionally minimal in Phase 0.
export interface AutoMapInput {
  readonly projectId: string;
  readonly mappingId: string;
}

export interface AutoMapResult {
  readonly rules: readonly MappingRule[];
  readonly diagnostics?: readonly Diagnostic[];
}

export interface SuggestExpressionInput {
  readonly instruction: string;
  readonly targetPath: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

export interface SuggestExpressionResult {
  readonly expression: string;
  readonly explanation?: string;
}

export interface ExplainRuleInput {
  readonly expression: string;
}

export interface SmartFixInput {
  readonly mappingId: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SmartFixResult {
  readonly updatedRules: readonly MappingRule[];
  readonly notes?: readonly string[];
}

export interface ValidateMappingsInput {
  readonly mappingIds: readonly string[];
}

export interface ValidationReport {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SchemaSearchResult {
  readonly path: string;
  readonly fieldName: string;
  readonly type: string;
  readonly description?: string;
}

export interface ServerPreviewInput {
  readonly environment: Environment;
  readonly sourceData: Readonly<Record<string, unknown>>;
}

export interface ServerPreviewResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly Diagnostic[];
  readonly metadata: {
    readonly environment: Environment;
    readonly snapshotVersion: number;
    readonly deployedAt: ISODateString;
    readonly engineVersion: string;
  };
}

export interface TestCase {
  readonly id: string;
  readonly name: string;
  readonly sourceData: string;
  readonly expectedOutput?: string;
  readonly createdAt: ISODateString;
}

export interface PreviewContextValue {
  readonly sourceData: unknown | null;
  readonly isExecuting: boolean;
  readonly lastResult: ExecutionResult | null;
}

export type PreviewExecutionState =
  | { readonly status: 'idle' }
  | { readonly status: 'executing' }
  | { readonly status: 'success'; readonly result: ExecutionResult }
  | { readonly status: 'error'; readonly error: string }
  | { readonly status: 'timeout' };

// ---------------------------------------------------------------------------
// Schema Tree Types (FS-009)
// ---------------------------------------------------------------------------

export type SchemaNodeType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'enum'
  | 'null'
  | 'any'
  | 'union';

export type MappingNodeStatus = 'mapped' | 'unmapped' | 'warning';

export interface SchemaTreeNode {
  path: string;
  fieldName: string;
  type: SchemaNodeType;
  description?: string;
  depth: number;
  isArray: boolean;
  isRequired: boolean;
  parentPath: string | null;
  childCount: number;
  children: SchemaTreeNode[];
  enumValues?: string[];
  inferred?: boolean;
  unionTypes?: string[];
  minOccurs?: number;
  maxOccurs?: number | 'unbounded';
}

export interface ParsedSchema {
  readonly nodes: SchemaTreeNode[];
  readonly totalFieldCount: number;
  readonly format: SchemaFormat;
  readonly parseTimeMs: number;
  readonly inferred: boolean;
}
