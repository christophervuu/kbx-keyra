import type {
  ActivityEntry,
  AddSchemaSampleInput,
  AddSchemaSampleResult,
  AutoMapInput,
  AutoMapResult,
  AutoMapSectionInput,
  AutoMapSectionResult,
  CreateMappingInput,
  CreateProjectInput,
  CreateSchemaInput,
  DeploymentContext,
  DeploymentDiff,
  DeploymentRecord as LegacyDeploymentRecord,
  Environment,
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
      environment: Environment;
      sourceType: DeploymentSourceType;
      sourceNumber: number;
    },
  ): Promise<DeploymentRecord>;
  promoteDeployment(
    mappingId: string,
    input: {
      fromEnvironment: Environment;
      toEnvironment: Environment;
    },
  ): Promise<DeploymentRecord>;
  rollbackDeployment(
    mappingId: string,
    input: {
      environment: Environment;
      deploymentSK: string;
    },
  ): Promise<DeploymentRecord>;
  listDeployments(
    mappingId: string,
    options?: {
      environment?: Environment;
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
}
