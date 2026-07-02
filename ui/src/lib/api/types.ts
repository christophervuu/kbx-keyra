import type {
  ActivityEntry,
  AddSchemaSampleInput,
  AddSchemaSampleResult,
  AutoMapExecutionMode,
  AutoMapInput,
  AutoMapResult,
  AutoMapRunStatus,
  AutoMapSectionInput,
  AutoMapSectionResult,
  AutoMapSessionStatus,
  AutoMapScopeMode,
  CreateMappingInput,
  CreateProjectInput,
  CreateSchemaInput,
  DeploymentContext,
  DeploymentDiff,
  DeploymentRecord as LegacyDeploymentRecord,
  Environment,
  RuntimeEnvironment,
  ExplainRuleInput,
  ExplainRuleResult,
  CdmBulkSyncResult,
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
  ProjectValueTable,
  ProjectValueTableRevision,
  ProjectDetail,
  ProjectMetadata,
  ValueTableDiffPage,
  ValueTableListOptions,
  ValueTableUsageEntry,
  CreateProjectValueTableInput,
  CreateProjectValueTableRevisionInput,
  DuplicateProjectValueTableInput,
  PromoteProjectValueMapInput,
  PromoteProjectValueMapResult,
  CreateGlobalValueMapInput,
  LinkProjectValueMapInput,
  UpdateProjectValueMapOverlayInput,
  ReviewProjectValueMapUpdateInput,
  ReviewProjectValueMapUpdateResult,
  AcceptProjectValueMapUpdateInput,
  ProjectValueMapLinkSummary,
  ProjectValueMapDetail,
  ResolveProjectValueTableReferenceInput,
  ResolveProjectValueTableReferenceResult,
  PortableValueMapExportPayload,
  ImportProjectValueMapPortableInput,
  ImportProjectValueMapPortableResult,
  ValueMapUsageSummary,
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

export type DeploymentSourceType = 'revision' | 'version';

export type DeploymentStatus = 'current' | 'stale' | 'not-deployed';

export type DeploymentOrchestrationStatus =
  | 'queued'
  | 'in_progress'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'timed_out';

export interface DeploymentRecord {
  readonly mappingId: string;
  readonly environmentDeployedAt: string;
  readonly environment: Environment;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly configS3Key?: string;
  readonly configHash?: string;
  readonly deployedAt: string;
  readonly deployedBy: string;
  readonly promotedFrom?: Environment;
  readonly rollbackOf?: string;
  readonly orchestrationId?: string;
}

export interface CurrentDeployment {
  readonly mappingId: string;
  readonly environment: Environment;
  readonly deployedAt: string;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly configHash?: string;
  readonly configS3Key?: string;
}

export interface EnvironmentDeploymentSummary {
  readonly environment: Environment;
  readonly deployment: CurrentDeployment | null;
  readonly status: DeploymentStatus;
}

export interface CurrentDeployments {
  readonly DEV: EnvironmentDeploymentSummary;
  readonly PREPROD: EnvironmentDeploymentSummary;
  readonly PROD: EnvironmentDeploymentSummary;
  /** Legacy alias retained for compatibility; normalize behavior to PREPROD. */
  readonly QA: EnvironmentDeploymentSummary;
}

export type DeploymentMutationEnvironment = RuntimeEnvironment;

export type DeploymentReadEnvironment = RuntimeEnvironment | 'QA';

export type MappingImportIssueCode =
  | 'PROJECT_MISMATCH'
  | 'INVALID_RECORD'
  | 'INVALID_RULE'
  | 'ALREADY_IMPORTED'
  | 'IMPORT_FAILED';

export interface MappingImportIssue {
  readonly localMappingId?: string;
  readonly remoteMappingId?: string;
  readonly mappingName?: string;
  readonly code: MappingImportIssueCode;
  readonly message: string;
}

export interface MappingImportSummary {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly issues: readonly MappingImportIssue[];
}

export interface AutoMapCapabilities {
  readonly autoMap: {
    readonly enabled: boolean;
    readonly executionMode: AutoMapExecutionMode;
  };
}

export interface AutoMapSessionLookupResult {
  readonly sessionId: string;
  readonly mappingId: string;
  readonly projectId: string;
  readonly status: AutoMapSessionStatus;
  readonly baseMappingRevision: number;
  readonly lastRunId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AutoMapRunSummary {
  readonly sessionId: string;
  readonly runId: string;
  readonly status: AutoMapRunStatus;
  readonly scope: {
    readonly mode: AutoMapScopeMode;
    readonly sectionPath?: string;
    readonly targetPaths?: readonly string[];
    readonly refreshOfRunId?: string;
    readonly retryWorkUnitIds?: readonly string[];
  };
  readonly deduped?: boolean;
  readonly progress?: {
    readonly completedWorkUnits: number;
    readonly totalWorkUnits: number;
    readonly completedTargets: number;
    readonly totalTargets: number;
  };
  readonly counts?: {
    readonly generated: number;
    readonly ready: number;
    readonly warning: number;
    readonly invalid: number;
    readonly failedTargets: number;
  };
  readonly failure?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
}

export interface AutoMapSuggestionsPage {
  readonly items: readonly AutoMapSectionResult['suggestions'];
  readonly page: {
    readonly limit: number;
    readonly nextCursor: string | null;
    readonly total: number;
    readonly offset: number;
  };
}

export interface ApiAdapter {
  // Schemas
  listSchemas(): Promise<SchemaMetadata[]>;
  getSchema(id: string): Promise<SchemaDetail>;
  createSchema(input: CreateSchemaInput): Promise<SchemaMetadata>;
  updateSchema(id: string, input: UpdateSchemaInput): Promise<SchemaMetadata>;
  markSchemaReviewed?(id: string): Promise<SchemaMetadata>;
  addSchemaSample?(id: string, input: AddSchemaSampleInput): Promise<AddSchemaSampleResult>;
  deleteSchemaSample?(id: string, sampleId: string): Promise<SchemaMetadata>;
  getSchemaSamplePayload?(id: string, sampleId: string): Promise<SchemaSamplePayloadContent>;
  deleteSchema(id: string): Promise<void>;

  // Mappings
  listMappings(projectId: string): Promise<MappingMetadata[]>;
  getMapping(id: string): Promise<MappingConfig>;
  createMapping(input: CreateMappingInput): Promise<MappingMetadata>;
  updateMapping(id: string, config: MappingConfig): Promise<MappingMetadata>;
  saveMapping(id: string, config: MappingConfig): Promise<MappingSaveResult>;
  deleteMapping(id: string): Promise<void>;
  duplicateMapping(id: string, newName: string): Promise<MappingMetadata>;
  importLocalMappings?(projectId: string): Promise<MappingImportSummary>;

  // Version History
  listMappingVersions(mappingId: string): Promise<MappingVersionEntry[]>;
  getMappingVersion(mappingId: string, version: number): Promise<MappingVersionEntry>;
  listVersions(mappingId: string): Promise<MappingVersion[]>;
  getVersion(mappingId: string, version: number): Promise<MappingVersion>;
  listMappingRevisions(mappingId: string): Promise<MappingRevision[]>;
  getMappingRevision(mappingId: string, revision: number): Promise<MappingRevisionDetail>;
  createMappingVersion(mappingId: string): Promise<MappingVersion>;
  listRevisions(mappingId: string): Promise<MappingRevision[]>;
  getRevision(mappingId: string, revision: number): Promise<MappingRevisionDetail>;
  createVersion(mappingId: string): Promise<MappingVersion>;
  saveMappingVersion(mappingId: string, entry: MappingVersionEntry): Promise<void>;

  // Projects
  listProjects(): Promise<ProjectMetadata[]>;
  getProject(id: string): Promise<ProjectDetail>;
  createProject(input: CreateProjectInput): Promise<ProjectMetadata>;
  updateProject(id: string, input: UpdateProjectInput): Promise<ProjectMetadata>;
  deleteProject(id: string): Promise<void>;

  // Templates
  listTemplates(): Promise<TemplateMetadata[]>;
  getTemplate(id: string): Promise<TemplateDetail>;

  // Deployment
  getDeploymentContext(mappingId: string): Promise<DeploymentContext>;
  deploy(mappingId: string, environment: Environment): Promise<LegacyDeploymentRecord>;
  promote(mappingId: string, from: Environment, to: Environment): Promise<LegacyDeploymentRecord>;
  rollback(
    mappingId: string,
    environment: Environment,
    targetVersion: number,
  ): Promise<LegacyDeploymentRecord>;
  getDeploymentDiff(
    mappingId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<DeploymentDiff>;
  deployMapping(
    mappingId: string,
    input: {
      environment: DeploymentMutationEnvironment;
      sourceType: DeploymentSourceType;
      sourceNumber: number;
    },
  ): Promise<DeploymentRecord>;
  promoteDeployment(
    mappingId: string,
    input: {
      fromEnvironment: DeploymentMutationEnvironment;
      toEnvironment: DeploymentMutationEnvironment;
    },
  ): Promise<DeploymentRecord>;
  rollbackDeployment(
    mappingId: string,
    input: {
      environment: DeploymentMutationEnvironment;
      deploymentSK: string;
    },
  ): Promise<DeploymentRecord>;
  listDeployments(
    mappingId: string,
    options?: {
      environment?: DeploymentReadEnvironment;
    },
  ): Promise<DeploymentRecord[]>;
  getCurrentDeployments(mappingId: string): Promise<CurrentDeployments>;

  // GitHub: CDM Repo (read-only)
  listCdmSchemas(path?: string): Promise<GitHubFile[]>;
  linkCdmSchema(input: LinkCdmSchemaInput): Promise<SchemaMetadata>;
  syncAllCdmSchemas(): Promise<CdmBulkSyncResult>;
  syncCdmSchema(
    schemaId: string,
    options?: {
      /**
       * When true, performs lightweight status refresh (GET /schemas/:id/sync-cdm)
       * to surface update-available without mutating schema content.
       */
      statusOnly?: boolean;
    },
  ): Promise<SchemaSyncResult>;

  // GitHub: Non-CDM Repo (read-write)
  listPublishedSchemas(path?: string): Promise<GitHubFile[]>;
  publishSchemaToGitHub(schemaId: string, input: PublishSchemaInput): Promise<void>;
  linkPublishedSchema(input: LinkPublishedSchemaInput): Promise<SchemaMetadata>;

  // AI
  autoMap(input: AutoMapInput): Promise<AutoMapResult>;
  autoMapSection(input: AutoMapSectionInput): Promise<AutoMapSectionResult>;
  getAutoMapCapabilities?(): Promise<AutoMapCapabilities>;
  getAutoMapSession?(mappingId: string): Promise<AutoMapSessionLookupResult | null>;
  startAutoMapSession?(input: AutoMapInput): Promise<AutoMapRunSummary>;
  startAutoMapRun?(sessionId: string, input: AutoMapSectionInput): Promise<AutoMapRunSummary>;
  getAutoMapRunStatus?(sessionId: string, runId: string): Promise<AutoMapRunSummary>;
  listAutoMapSuggestions?(
    sessionId: string,
    options?: {
      readonly limit?: number;
      readonly cursor?: string;
      readonly status?: readonly string[];
    },
  ): Promise<AutoMapSuggestionsPage>;
  suggestExpression(input: SuggestExpressionInput): Promise<SuggestExpressionResult>;
  explainRule(input: ExplainRuleInput): Promise<ExplainRuleResult>;
  smartFix(input: SmartFixInput): Promise<SmartFixResult>;
  validateMappings(input: ValidateMappingsInput): Promise<ValidationReport>;

  // Schema Search
  querySchemaNodes(schemaId: string, query: string): Promise<SchemaSearchResult[]>;

  // Activity
  listActivity(projectId?: string, limit?: number): Promise<ActivityEntry[]>;

  // Preview
  previewOnServer(mappingId: string, input: ServerPreviewInput): Promise<ServerPreviewResult>;

  // Project value tables
  listProjectValueTables(projectId: string, options?: ValueTableListOptions): Promise<ProjectValueTable[]>;
  getProjectValueTable(valueTableId: string): Promise<ProjectValueTable>;
  getProjectValueTableRevision(valueTableId: string, revision: number): Promise<ProjectValueTableRevision>;
  createProjectValueTable(input: CreateProjectValueTableInput): Promise<ProjectValueTable>;
  createProjectValueTableRevision(
    valueTableId: string,
    input: CreateProjectValueTableRevisionInput,
  ): Promise<ProjectValueTableRevision>;
  duplicateProjectValueTable(input: DuplicateProjectValueTableInput): Promise<ProjectValueTable>;
  promoteProjectValueMap(
    projectId: string,
    valueMapId: string,
    input?: PromoteProjectValueMapInput,
  ): Promise<PromoteProjectValueMapResult>;
  archiveProjectValueTable(valueTableId: string): Promise<ProjectValueTable>;
  deleteProjectValueTable(valueTableId: string): Promise<void>;
  listProjectValueTableUsage(valueTableId: string): Promise<ValueTableUsageEntry[]>;
  getProjectValueTableRevisionDiff(
    valueTableId: string,
    fromRevision: number,
    toRevision: number,
    options?: { cursor?: string; pageSize?: number },
  ): Promise<ValueTableDiffPage>;
  exportProjectValueTableCsv(
    valueTableId: string,
    revision?: number,
    options?: { portable?: boolean },
  ): Promise<string | PortableValueMapExportPayload>;
  importProjectValueTableCsv(
    projectId: string,
    csv: string,
    options?: { name?: string; key?: string },
  ): Promise<ProjectValueTableRevision>;
  importProjectValueMapPortable(
    projectId: string,
    input: ImportProjectValueMapPortableInput,
  ): Promise<ImportProjectValueMapPortableResult>;
  resolveProjectValueTableReference(
    input: ResolveProjectValueTableReferenceInput,
  ): Promise<ResolveProjectValueTableReferenceResult>;

  // Global value maps (FS-102)
  listGlobalValueMaps(options?: ValueTableListOptions): Promise<ProjectValueTable[]>;
  createGlobalValueMap(input: CreateGlobalValueMapInput): Promise<ProjectValueTable>;
  getGlobalValueMap(valueMapId: string): Promise<ProjectValueTable>;
  listGlobalValueMapRevisions(valueMapId: string): Promise<ProjectValueTableRevision[]>;
  createGlobalValueMapRevision(
    valueMapId: string,
    input: CreateProjectValueTableRevisionInput,
  ): Promise<ProjectValueTableRevision>;
  getGlobalValueMapRevision(valueMapId: string, revision: number): Promise<ProjectValueTableRevision>;
  archiveGlobalValueMap(valueMapId: string): Promise<ProjectValueTable>;
  getGlobalValueMapUsage(valueMapId: string): Promise<ValueMapUsageSummary>;

  // Project value-map link/overlay/update-review (FS-102)
  listProjectValueMaps?(projectId: string): Promise<ProjectValueMapLinkSummary[]>;
  linkProjectValueMap?(projectId: string, input: LinkProjectValueMapInput): Promise<ProjectValueMapDetail>;
  getProjectValueMapDetail?(projectId: string, valueMapId: string): Promise<ProjectValueMapDetail>;
  updateProjectValueMapOverlay?(
    projectId: string,
    valueMapId: string,
    input: UpdateProjectValueMapOverlayInput,
  ): Promise<ProjectValueMapDetail>;
  reviewProjectValueMapUpdate?(
    projectId: string,
    valueMapId: string,
    input?: ReviewProjectValueMapUpdateInput,
  ): Promise<ReviewProjectValueMapUpdateResult>;
  acceptProjectValueMapUpdate?(
    projectId: string,
    valueMapId: string,
    input: AcceptProjectValueMapUpdateInput,
  ): Promise<ProjectValueMapDetail>;
  unlinkProjectValueMap?(projectId: string, valueMapId: string): Promise<void>;
}
