import { AdapterMethodNotImplementedError } from './errors';
import { httpRequest } from './http-client';
import { LocalStorageAdapter } from './local-storage-adapter';
import type {
  CurrentDeployment,
  CurrentDeployments,
  DeploymentRecord,
  DeploymentSourceType,
} from './types';

import type {
  ActivityEntry,
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
  GitHubFile,
  LinkCdmSchemaInput,
  LinkPublishedSchemaInput,
  MappingConfig,
  MappingMetadata,
  MappingRevision,
  MappingRevisionDetail,
  MappingSaveResult,
  MappingVersion,
  MappingVersionEntry,
  PublishSchemaInput,
  ProjectDetail,
  ProjectMetadata,
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
  UpdateProjectInput,
  UpdateSchemaInput,
  ValidateMappingsInput,
  ValidationReport,
} from '@/lib/types';

interface CurrentDeploymentsApiResponse {
  readonly DEV: (CurrentDeployment & { readonly mappingIdEnvironment?: string }) | null;
  readonly QA: (CurrentDeployment & { readonly mappingIdEnvironment?: string }) | null;
  readonly PROD: (CurrentDeployment & { readonly mappingIdEnvironment?: string }) | null;
}

function computeStatus(
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

/**
 * HttpAdapter MUST remain HTTP-only for data reconstruction.
 *
 * Code review convention (FS-061 T-05): do not add localStorage/sessionStorage
 * reads or writes in HttpAdapter, bootstrap, or HTTP transport helpers.
 */

export class HttpAdapter extends LocalStorageAdapter {
  private readonly apiUrl: string;

  constructor(apiUrl: string) {
    super();

    if (!apiUrl || !apiUrl.trim()) {
      throw new Error('HttpAdapter requires a non-empty apiUrl.');
    }

    this.apiUrl = apiUrl;
  }

  override async listSchemas(): Promise<SchemaMetadata[]> {
    return httpRequest<SchemaMetadata[]>({
      baseUrl: this.apiUrl,
      path: '/schemas',
      method: 'GET',
    });
  }

  override async getSchema(id: string): Promise<SchemaDetail> {
    return httpRequest<SchemaDetail>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(id)}`,
      method: 'GET',
    });
  }

  override async createSchema(input: CreateSchemaInput): Promise<SchemaMetadata> {
    return httpRequest<SchemaMetadata>({
      baseUrl: this.apiUrl,
      path: '/schemas',
      method: 'POST',
      body: input,
    });
  }

  override async updateSchema(id: string, input: UpdateSchemaInput): Promise<SchemaMetadata> {
    return httpRequest<SchemaMetadata>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: input,
    });
  }

  override async deleteSchema(id: string): Promise<void> {
    await httpRequest<void>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(id)}`,
      method: 'DELETE',
    });
  }

  override async listMappings(projectId: string): Promise<MappingMetadata[]> {
    return httpRequest<MappingMetadata[]>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/mappings`,
      method: 'GET',
    });
  }

  override async getMapping(id: string): Promise<MappingConfig> {
    return httpRequest<MappingConfig>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(id)}`,
      method: 'GET',
    });
  }

  override async createMapping(input: CreateMappingInput): Promise<MappingMetadata> {
    return httpRequest<MappingMetadata>({
      baseUrl: this.apiUrl,
      path: '/mappings',
      method: 'POST',
      body: input,
    });
  }

  override async updateMapping(id: string, config: MappingConfig): Promise<MappingMetadata> {
    return httpRequest<MappingMetadata>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: config,
    });
  }

  override async saveMapping(id: string, config: MappingConfig): Promise<MappingSaveResult> {
    return httpRequest<MappingSaveResult>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: {
        ...config,
        expectedRevision: config.version,
      },
    });
  }

  override async deleteMapping(id: string): Promise<void> {
    await httpRequest<void>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(id)}`,
      method: 'DELETE',
    });
  }

  override async duplicateMapping(id: string, newName: string): Promise<MappingMetadata> {
    return httpRequest<MappingMetadata>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(id)}/duplicate`,
      method: 'POST',
      body: { name: newName },
    });
  }

  override async listMappingVersions(mappingId: string): Promise<MappingVersionEntry[]> {
    return httpRequest<MappingVersionEntry[]>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/versions`,
      method: 'GET',
    });
  }

  override async getMappingVersion(mappingId: string, version: number): Promise<MappingVersionEntry> {
    return httpRequest<MappingVersionEntry>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/versions/${encodeURIComponent(String(version))}`,
      method: 'GET',
    });
  }

  override async listVersions(mappingId: string): Promise<MappingVersion[]> {
    return httpRequest<MappingVersion[]>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/versions`,
      method: 'GET',
    });
  }

  override async getVersion(mappingId: string, version: number): Promise<MappingVersion> {
    return httpRequest<MappingVersion>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/versions/${encodeURIComponent(String(version))}`,
      method: 'GET',
    });
  }

  override async listMappingRevisions(mappingId: string): Promise<MappingRevision[]> {
    return httpRequest<MappingRevision[]>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/revisions`,
      method: 'GET',
    });
  }

  override async getMappingRevision(mappingId: string, revision: number): Promise<MappingRevisionDetail> {
    return httpRequest<MappingRevisionDetail>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/revisions/${encodeURIComponent(String(revision))}`,
      method: 'GET',
    });
  }

  override async createMappingVersion(mappingId: string): Promise<MappingVersion> {
    return httpRequest<MappingVersion>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/versions`,
      method: 'POST',
      body: {},
    });
  }

  override async listRevisions(mappingId: string): Promise<MappingRevision[]> {
    return this.listMappingRevisions(mappingId);
  }

  override async getRevision(mappingId: string, revision: number): Promise<MappingRevisionDetail> {
    return this.getMappingRevision(mappingId, revision);
  }

  override async createVersion(mappingId: string): Promise<MappingVersion> {
    return this.createMappingVersion(mappingId);
  }

  override async saveMappingVersion(mappingId: string, entry: MappingVersionEntry): Promise<void> {
    void entry;
    await httpRequest<void>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/versions`,
      method: 'POST',
      body: {},
    });
  }

  override async listProjects(): Promise<ProjectMetadata[]> {
    return httpRequest<ProjectMetadata[]>({
      baseUrl: this.apiUrl,
      path: '/projects',
      method: 'GET',
    });
  }

  override async getProject(id: string): Promise<ProjectDetail> {
    return httpRequest<ProjectDetail>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(id)}`,
      method: 'GET',
    });
  }

  override async createProject(input: CreateProjectInput): Promise<ProjectMetadata> {
    return httpRequest<ProjectMetadata>({
      baseUrl: this.apiUrl,
      path: '/projects',
      method: 'POST',
      body: input,
    });
  }

  override async updateProject(id: string, input: UpdateProjectInput): Promise<ProjectMetadata> {
    return httpRequest<ProjectMetadata>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(id)}`,
      method: 'PUT',
      body: input,
    });
  }

  override async deleteProject(id: string): Promise<void> {
    await httpRequest<void>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(id)}`,
      method: 'DELETE',
    });
  }

  override async listTemplates(): Promise<TemplateMetadata[]> {
    throw this.notImplemented('listTemplates');
  }

  override async getTemplate(id: string): Promise<TemplateDetail> {
    void id;
    throw this.notImplemented('getTemplate');
  }

  override async getDeploymentContext(mappingId: string): Promise<DeploymentContext> {
    void mappingId;
    throw this.notImplemented('getDeploymentContext');
  }

  override async deploy(mappingId: string, environment: Environment): Promise<LegacyDeploymentRecord> {
    void mappingId;
    void environment;
    throw this.notImplemented('deploy');
  }

  override async promote(
    mappingId: string,
    from: Environment,
    to: Environment,
  ): Promise<LegacyDeploymentRecord> {
    void mappingId;
    void from;
    void to;
    throw this.notImplemented('promote');
  }

  override async rollback(
    mappingId: string,
    environment: Environment,
    targetVersion: number,
  ): Promise<LegacyDeploymentRecord> {
    void mappingId;
    void environment;
    void targetVersion;
    throw this.notImplemented('rollback');
  }

  override async getDeploymentDiff(
    mappingId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<DeploymentDiff> {
    void mappingId;
    void fromVersion;
    void toVersion;
    throw this.notImplemented('getDeploymentDiff');
  }

  override async deployMapping(
    mappingId: string,
    input: {
      environment: Environment;
      sourceType: DeploymentSourceType;
      sourceNumber: number;
    },
  ): Promise<DeploymentRecord> {
    return httpRequest<DeploymentRecord>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/deploy`,
      method: 'POST',
      body: input,
    });
  }

  override async promoteDeployment(
    mappingId: string,
    input: {
      fromEnvironment: Environment;
      toEnvironment: Environment;
    },
  ): Promise<DeploymentRecord> {
    return httpRequest<DeploymentRecord>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/promote`,
      method: 'POST',
      body: input,
    });
  }

  override async rollbackDeployment(
    mappingId: string,
    input: {
      environment: Environment;
      deploymentSK: string;
    },
  ): Promise<DeploymentRecord> {
    return httpRequest<DeploymentRecord>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/rollback`,
      method: 'POST',
      body: input,
    });
  }

  override async listDeployments(
    mappingId: string,
    options?: {
      environment?: Environment;
    },
  ): Promise<DeploymentRecord[]> {
    const environmentQuery = options?.environment
      ? `?environment=${encodeURIComponent(options.environment)}`
      : '';

    return httpRequest<DeploymentRecord[]>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/deployments${environmentQuery}`,
      method: 'GET',
    });
  }

  override async getCurrentDeployments(mappingId: string): Promise<CurrentDeployments> {
    const [current, mappingConfig, versions] = await Promise.all([
      httpRequest<CurrentDeploymentsApiResponse>({
        baseUrl: this.apiUrl,
        path: `/mappings/${encodeURIComponent(mappingId)}/deployments/current`,
        method: 'GET',
      }),
      this.getMapping(mappingId),
      this.listVersions(mappingId),
    ]);

    const latestVersion = versions.length > 0
      ? versions.reduce((max, version) => Math.max(max, version.version), versions[0]?.version ?? 0)
      : null;

    const stalenessInput = {
      revision: mappingConfig.version,
      latestVersion,
    };

    return {
      DEV: {
        environment: 'DEV',
        deployment: current.DEV,
        status: computeStatus(current.DEV, stalenessInput),
      },
      QA: {
        environment: 'QA',
        deployment: current.QA,
        status: computeStatus(current.QA, stalenessInput),
      },
      PROD: {
        environment: 'PROD',
        deployment: current.PROD,
        status: computeStatus(current.PROD, stalenessInput),
      },
    };
  }

  override async listCdmSchemas(path?: string): Promise<GitHubFile[]> {
    void path;
    throw this.notImplemented('listCdmSchemas');
  }

  override async linkCdmSchema(input: LinkCdmSchemaInput): Promise<SchemaMetadata> {
    void input;
    throw this.notImplemented('linkCdmSchema');
  }

  override async syncCdmSchema(schemaId: string): Promise<SchemaSyncResult> {
    void schemaId;
    throw this.notImplemented('syncCdmSchema');
  }

  override async listPublishedSchemas(path?: string): Promise<GitHubFile[]> {
    void path;
    throw this.notImplemented('listPublishedSchemas');
  }

  override async publishSchemaToGitHub(schemaId: string, input: PublishSchemaInput): Promise<void> {
    void schemaId;
    void input;
    throw this.notImplemented('publishSchemaToGitHub');
  }

  override async linkPublishedSchema(input: LinkPublishedSchemaInput): Promise<SchemaMetadata> {
    void input;
    throw this.notImplemented('linkPublishedSchema');
  }

  override async autoMap(input: AutoMapInput): Promise<AutoMapResult> {
    void input;
    throw this.notImplemented('autoMap');
  }

  override async autoMapSection(input: AutoMapSectionInput): Promise<AutoMapSectionResult> {
    void input;
    throw this.notImplemented('autoMapSection');
  }

  override async suggestExpression(input: SuggestExpressionInput): Promise<SuggestExpressionResult> {
    void input;
    throw this.notImplemented('suggestExpression');
  }

  override async explainRule(input: ExplainRuleInput): Promise<ExplainRuleResult> {
    void input;
    throw this.notImplemented('explainRule');
  }

  override async smartFix(input: SmartFixInput): Promise<SmartFixResult> {
    void input;
    throw this.notImplemented('smartFix');
  }

  override async validateMappings(input: ValidateMappingsInput): Promise<ValidationReport> {
    void input;
    throw this.notImplemented('validateMappings');
  }

  override async querySchemaNodes(schemaId: string, query: string): Promise<SchemaSearchResult[]> {
    void schemaId;
    void query;
    throw this.notImplemented('querySchemaNodes');
  }

  override async listActivity(projectId?: string, limit?: number): Promise<ActivityEntry[]> {
    void projectId;
    void limit;
    throw this.notImplemented('listActivity');
  }

  override async previewOnServer(mappingId: string, input: ServerPreviewInput): Promise<ServerPreviewResult> {
    void mappingId;
    void input;
    throw this.notImplemented('previewOnServer');
  }

  private notImplemented(methodName: string): AdapterMethodNotImplementedError {
    return new AdapterMethodNotImplementedError(methodName);
  }
}
