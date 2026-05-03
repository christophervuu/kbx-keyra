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
  Environment,
  ExplainRuleInput,
  GitHubFile,
  LinkCdmSchemaInput,
  LinkPublishedSchemaInput,
  MappingConfig,
  MappingVersionEntry,
  MappingMetadata,
  ProjectDetail,
  ProjectMetadata,
  PublishSchemaInput,
  SchemaDetail,
  SchemaMetadata,
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

export interface ApiAdapter {
  // Schemas
  listSchemas(): Promise<SchemaMetadata[]>;
  getSchema(id: string): Promise<SchemaDetail>;
  createSchema(input: CreateSchemaInput): Promise<SchemaMetadata>;
  updateSchema(id: string, input: UpdateSchemaInput): Promise<SchemaMetadata>;
  deleteSchema(id: string): Promise<void>;

  // Mappings
  listMappings(projectId: string): Promise<MappingMetadata[]>;
  getMapping(id: string): Promise<MappingConfig>;
  createMapping(input: CreateMappingInput): Promise<MappingMetadata>;
  updateMapping(id: string, config: MappingConfig): Promise<MappingMetadata>;
  deleteMapping(id: string): Promise<void>;
  duplicateMapping(id: string, newName: string): Promise<MappingMetadata>;

  // Version History
  listMappingVersions(mappingId: string): Promise<MappingVersionEntry[]>;
  getMappingVersion(mappingId: string, version: number): Promise<MappingVersionEntry>;
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
  deploy(mappingId: string, environment: Environment): Promise<DeploymentRecord>;
  promote(mappingId: string, from: Environment, to: Environment): Promise<DeploymentRecord>;
  rollback(
    mappingId: string,
    environment: Environment,
    targetVersion: number,
  ): Promise<DeploymentRecord>;
  getDeploymentDiff(
    mappingId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<DeploymentDiff>;

  // GitHub: CDM Repo (read-only)
  listCdmSchemas(path?: string): Promise<GitHubFile[]>;
  linkCdmSchema(input: LinkCdmSchemaInput): Promise<SchemaMetadata>;
  syncCdmSchema(schemaId: string): Promise<SchemaSyncResult>;

  // GitHub: Non-CDM Repo (read-write)
  listPublishedSchemas(path?: string): Promise<GitHubFile[]>;
  publishSchemaToGitHub(schemaId: string, input: PublishSchemaInput): Promise<void>;
  linkPublishedSchema(input: LinkPublishedSchemaInput): Promise<SchemaMetadata>;

  // AI
  autoMap(input: AutoMapInput): Promise<AutoMapResult>;
  suggestExpression(input: SuggestExpressionInput): Promise<SuggestExpressionResult>;
  explainRule(input: ExplainRuleInput): Promise<string>;
  smartFix(input: SmartFixInput): Promise<SmartFixResult>;
  validateMappings(input: ValidateMappingsInput): Promise<ValidationReport>;

  // Schema Search
  querySchemaNodes(schemaId: string, query: string): Promise<SchemaSearchResult[]>;

  // Activity
  listActivity(projectId?: string, limit?: number): Promise<ActivityEntry[]>;

  // Preview
  previewOnServer(mappingId: string, input: ServerPreviewInput): Promise<ServerPreviewResult>;
}
