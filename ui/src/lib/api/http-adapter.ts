import { FeatureNotEnabledError } from './errors';
import { httpRequest } from './http-client';
import { importLocalMappingsToBackend } from './local-mapping-import';
import { LocalStorageAdapter } from './local-storage-adapter';
import type {
  AutoMapCapabilities,
  AutoMapRunSummary,
  AutoMapSessionLookupResult,
  AutoMapSuggestionsPage,
  CurrentDeployment,
  CurrentDeployments,
  DeploymentMutationEnvironment,
  DeploymentReadEnvironment,
  DeploymentRecord,
  DeploymentSourceType,
  MappingImportSummary,
} from './types';

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
  ProjectValueTable,
  ProjectValueTableRevision,
  PublishSchemaInput,
  ProjectDetail,
  ProjectMetadata,
  ResolveProjectValueTableReferenceInput,
  ResolveProjectValueTableReferenceResult,
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
  UpdateProjectInput,
  UpdateSchemaInput,
  ValueTableDiffPage,
  ValueTableListOptions,
  ValueTableUsageEntry,
  CreateProjectValueTableInput,
  CreateProjectValueTableRevisionInput,
  CreateGlobalValueMapInput,
  LinkProjectValueMapInput,
  UpdateProjectValueMapOverlayInput,
  ReviewProjectValueMapUpdateInput,
  ReviewProjectValueMapUpdateResult,
  AcceptProjectValueMapUpdateInput,
  ProjectValueMapLinkSummary,
  ProjectValueMapDetail,
  DuplicateProjectValueTableInput,
  PromoteProjectValueMapInput,
  PromoteProjectValueMapResult,
  PortableValueMapExportPayload,
  ImportProjectValueMapPortableInput,
  ImportProjectValueMapPortableResult,
  ValidateMappingsInput,
  ValidationReport,
  ValueMapUsageSummary,
} from '@/lib/types';

interface CurrentDeploymentsApiResponse {
  readonly DEV: (CurrentDeployment & { readonly mappingIdEnvironment?: string }) | null;
  readonly PREPROD: (CurrentDeployment & { readonly mappingIdEnvironment?: string }) | null;
  readonly QA?: (CurrentDeployment & { readonly mappingIdEnvironment?: string }) | null;
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

function normalizeAutoMapExecutionMode(value: unknown): 'disabled' | 'legacy' | 'async' {
  if (value === 'disabled' || value === 'legacy' || value === 'async') {
    return value;
  }

  return 'legacy';
}

function normalizeSuggestionPageLimit(input: number | undefined): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    return 100;
  }

  const parsed = Math.trunc(input);
  if (parsed < 20) {
    return 20;
  }

  if (parsed > 250) {
    return 250;
  }

  return parsed;
}

function isQueuedRunStatus(status: unknown): boolean {
  return (
    status === 'queued'
    || status === 'preparing'
    || status === 'retrieving'
    || status === 'generating'
    || status === 'validating'
  );
}

function normalizeRunSummary(
  sessionId: string,
  payload: {
    readonly sessionId?: string;
    readonly runId: string;
    readonly status: AutoMapRunSummary['status'];
    readonly scope?: AutoMapRunSummary['scope'];
    readonly deduped?: boolean;
    readonly progress?: AutoMapRunSummary['progress'];
    readonly counts?: AutoMapRunSummary['counts'];
    readonly failure?: AutoMapRunSummary['failure'];
  },
): AutoMapRunSummary {
  return {
    sessionId: payload.sessionId ?? sessionId,
    runId: payload.runId,
    status: payload.status,
    scope: payload.scope ?? {
      mode: 'whole',
    },
    ...(typeof payload.deduped === 'boolean' ? { deduped: payload.deduped } : {}),
    ...(payload.progress ? { progress: payload.progress } : {}),
    ...(payload.counts ? { counts: payload.counts } : {}),
    ...(payload.failure ? { failure: payload.failure } : {}),
  };
}

function toAutoMapScope(input: AutoMapSectionInput): AutoMapRunSummary['scope'] {
  const normalizedTargetPaths = Array.isArray(input.visibleTargetPaths)
    ? input.visibleTargetPaths
      .map((path) => path.trim())
      .filter((path) => path.length > 0)
    : [];

  const mode = input.mode ?? (normalizedTargetPaths.length > 0 ? 'visible' : 'whole');

  return {
    mode,
    ...(typeof input.sectionPath === 'string' && input.sectionPath.trim().length > 0
      ? { sectionPath: input.sectionPath.trim() }
      : {}),
    ...(normalizedTargetPaths.length > 0 ? { targetPaths: [...normalizedTargetPaths] } : {}),
  };
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

  override async markSchemaReviewed(id: string): Promise<SchemaMetadata> {
    const response = await httpRequest<{
      metadata: SchemaMetadata;
    }>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(id)}/mark-reviewed`,
      method: 'POST',
      body: {},
    });

    return response.metadata;
  }

  override async addSchemaSample(id: string, input: AddSchemaSampleInput): Promise<AddSchemaSampleResult> {
    return httpRequest<AddSchemaSampleResult>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(id)}/samples`,
      method: 'POST',
      body: input,
    });
  }

  override async deleteSchemaSample(id: string, sampleId: string): Promise<SchemaMetadata> {
    const response = await httpRequest<{ metadata: SchemaMetadata }>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(id)}/samples/${encodeURIComponent(sampleId)}`,
      method: 'DELETE',
    });

    return response.metadata;
  }

  override async getSchemaSamplePayload(id: string, sampleId: string): Promise<SchemaSamplePayloadContent> {
    return httpRequest<SchemaSamplePayloadContent>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(id)}/samples/${encodeURIComponent(sampleId)}`,
      method: 'GET',
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

  override async importLocalMappings(projectId: string): Promise<MappingImportSummary> {
    return importLocalMappingsToBackend(this, projectId);
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
    throw this.featureNotEnabled('listTemplates');
  }

  override async getTemplate(id: string): Promise<TemplateDetail> {
    void id;
    throw this.featureNotEnabled('getTemplate');
  }

  override async getDeploymentContext(mappingId: string): Promise<DeploymentContext> {
    return httpRequest<DeploymentContext>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/deploy-context`,
      method: 'GET',
    });
  }

  override async deploy(mappingId: string, environment: Environment): Promise<LegacyDeploymentRecord> {
    void mappingId;
    void environment;
    throw this.featureNotEnabled('deploy');
  }

  override async promote(
    mappingId: string,
    from: Environment,
    to: Environment,
  ): Promise<LegacyDeploymentRecord> {
    void mappingId;
    void from;
    void to;
    throw this.featureNotEnabled('promote');
  }

  override async rollback(
    mappingId: string,
    environment: Environment,
    targetVersion: number,
  ): Promise<LegacyDeploymentRecord> {
    void mappingId;
    void environment;
    void targetVersion;
    throw this.featureNotEnabled('rollback');
  }

  override async getDeploymentDiff(
    mappingId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<DeploymentDiff> {
    void mappingId;
    void fromVersion;
    void toVersion;
    throw this.featureNotEnabled('getDeploymentDiff');
  }

  override async deployMapping(
    mappingId: string,
    input: {
      environment: DeploymentMutationEnvironment;
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
      fromEnvironment: DeploymentMutationEnvironment;
      toEnvironment: DeploymentMutationEnvironment;
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
      environment: DeploymentMutationEnvironment;
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
      environment?: DeploymentReadEnvironment;
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

    const preprodDeployment = current.PREPROD ?? current.QA ?? null;

    return {
      DEV: {
        environment: 'DEV',
        deployment: current.DEV,
        status: computeStatus(current.DEV, stalenessInput),
      },
      PREPROD: {
        environment: 'PREPROD',
        deployment: preprodDeployment,
        status: computeStatus(preprodDeployment, stalenessInput),
      },
      PROD: {
        environment: 'PROD',
        deployment: current.PROD,
        status: computeStatus(current.PROD, stalenessInput),
      },
      QA: {
        environment: 'PREPROD',
        deployment: preprodDeployment,
        status: computeStatus(preprodDeployment, stalenessInput),
      },
    };
  }

  override async listCdmSchemas(path?: string): Promise<GitHubFile[]> {
    const query = typeof path === 'string' && path.trim() !== ''
      ? `?path=${encodeURIComponent(path.trim())}`
      : '';

    return httpRequest<GitHubFile[]>({
      baseUrl: this.apiUrl,
      path: `/schemas/cdm${query}`,
      method: 'GET',
    });
  }

  override async linkCdmSchema(input: LinkCdmSchemaInput): Promise<SchemaMetadata> {
    return httpRequest<SchemaMetadata>({
      baseUrl: this.apiUrl,
      path: '/schemas/cdm/link',
      method: 'POST',
      body: {
        projectId: input.projectId,
        path: input.path,
        ...(typeof input.branch === 'string' && input.branch.trim() !== '' ? { branch: input.branch.trim() } : {}),
        ...(typeof input.name === 'string' && input.name.trim() !== '' ? { name: input.name.trim() } : {}),
      },
    });
  }

  override async syncAllCdmSchemas(): Promise<CdmBulkSyncResult> {
    return httpRequest<CdmBulkSyncResult>({
      baseUrl: this.apiUrl,
      path: '/schemas/cdm/sync',
      method: 'POST',
      body: {},
    });
  }

  override async syncCdmSchema(
    schemaId: string,
    options?: {
      statusOnly?: boolean;
    },
  ): Promise<SchemaSyncResult> {
    return httpRequest<SchemaSyncResult>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(schemaId)}/sync-cdm`,
      method: options?.statusOnly ? 'GET' : 'POST',
      ...(options?.statusOnly ? {} : { body: {} }),
    });
  }

  override async listPublishedSchemas(path?: string): Promise<GitHubFile[]> {
    void path;
    throw this.featureNotEnabled('listPublishedSchemas');
  }

  override async publishSchemaToGitHub(schemaId: string, input: PublishSchemaInput): Promise<void> {
    void schemaId;
    void input;
    throw this.featureNotEnabled('publishSchemaToGitHub');
  }

  override async linkPublishedSchema(input: LinkPublishedSchemaInput): Promise<SchemaMetadata> {
    void input;
    throw this.featureNotEnabled('linkPublishedSchema');
  }

  override async autoMap(input: AutoMapInput): Promise<AutoMapResult> {
    return httpRequest<AutoMapResult>({
      baseUrl: this.apiUrl,
      path: '/ai/auto-map',
      method: 'POST',
      body: input,
    });
  }

  override async autoMapSection(input: AutoMapSectionInput): Promise<AutoMapSectionResult> {
    const capabilities = await this.getAutoMapCapabilities();
    const executionMode = capabilities.autoMap.executionMode;

    if (executionMode === 'disabled') {
      throw this.featureNotEnabled('autoMapSection');
    }

    if (executionMode === 'legacy') {
      return httpRequest<AutoMapSectionResult>({
        baseUrl: this.apiUrl,
        path: '/ai/auto-map',
        method: 'POST',
        body: {
          ...input,
          ...(input.visibleTargetPaths !== undefined
            ? { visibleTargetPaths: [...input.visibleTargetPaths] }
            : {}),
        },
      });
    }

    const sessionRun = await this.startAutoMapSession({
      projectId: input.projectId,
      mappingId: input.mappingId,
      mode: input.mode,
      sectionPath: input.sectionPath,
      targetSection: input.targetSection,
      sourceContext: input.sourceContext,
      sourceSchemaId: input.sourceSchemaId,
      businessContext: input.businessContext,
      visibleTargetPaths: input.visibleTargetPaths,
    });

    if (isQueuedRunStatus(sessionRun.status)) {
      return {
        suggestions: [],
        session: {
          sessionId: sessionRun.sessionId,
          runId: sessionRun.runId,
          runStatus: sessionRun.status,
          executionMode,
          queued: true,
        },
      };
    }

    const page = await this.listAutoMapSuggestions(sessionRun.sessionId, {
      limit: 100,
    });

    return {
      suggestions: [...page.items],
      session: {
        sessionId: sessionRun.sessionId,
        runId: sessionRun.runId,
        runStatus: sessionRun.status,
        executionMode,
        queued: false,
      },
    };
  }

  async getAutoMapCapabilities(): Promise<AutoMapCapabilities> {
    try {
      const capabilities = await httpRequest<{
        readonly capabilities?: {
          readonly autoMap?: {
            readonly enabled?: boolean;
            readonly executionMode?: unknown;
          };
        };
      }>({
        baseUrl: this.apiUrl,
        path: '/ai/auto-map/capabilities',
        method: 'GET',
      });

      return {
        autoMap: {
          enabled: capabilities.capabilities?.autoMap?.enabled !== false,
          executionMode: normalizeAutoMapExecutionMode(capabilities.capabilities?.autoMap?.executionMode),
        },
      };
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? (error as { statusCode?: unknown }).statusCode
          : undefined;

      if (statusCode === 404) {
        return {
          autoMap: {
            enabled: true,
            executionMode: 'legacy',
          },
        };
      }

      throw error;
    }
  }

  async getAutoMapSession(mappingId: string): Promise<AutoMapSessionLookupResult | null> {
    return httpRequest<AutoMapSessionLookupResult | null>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/auto-map-session`,
      method: 'GET',
    });
  }

  async startAutoMapSession(input: AutoMapInput): Promise<AutoMapRunSummary> {
    const openSession = await this.getAutoMapSession(input.mappingId);
    const scope = toAutoMapScope({
      ...input,
      visibleTargetPaths: input.visibleTargetPaths,
    });

    if (openSession) {
      const run = await this.startAutoMapRun(openSession.sessionId, {
        ...input,
        mode: input.mode,
        sectionPath: input.sectionPath,
        visibleTargetPaths: input.visibleTargetPaths,
      });
      return {
        ...run,
        sessionId: openSession.sessionId,
      };
    }

    const payload = await httpRequest<{
      readonly sessionId: string;
      readonly runId: string;
      readonly status: AutoMapRunSummary['status'];
      readonly deduped?: boolean;
    }>({
      baseUrl: this.apiUrl,
      path: '/ai/auto-map/sessions',
      method: 'POST',
      body: {
        projectId: input.projectId,
        mappingId: input.mappingId,
        baseMappingRevision: 0,
        scope,
        idempotencyKey: `${input.mappingId}:${scope.mode}:${scope.sectionPath ?? ''}`,
      },
    });

    return normalizeRunSummary(payload.sessionId, {
      ...payload,
      scope,
    });
  }

  async startAutoMapRun(sessionId: string, input: AutoMapSectionInput): Promise<AutoMapRunSummary> {
    const scope = toAutoMapScope(input);
    const payload = await httpRequest<{
      readonly sessionId?: string;
      readonly runId: string;
      readonly status: AutoMapRunSummary['status'];
      readonly scope?: AutoMapRunSummary['scope'];
      readonly deduped?: boolean;
      readonly progress?: AutoMapRunSummary['progress'];
      readonly counts?: AutoMapRunSummary['counts'];
      readonly failure?: AutoMapRunSummary['failure'];
    }>({
      baseUrl: this.apiUrl,
      path: `/ai/auto-map/sessions/${encodeURIComponent(sessionId)}/runs`,
      method: 'POST',
      body: {
        scope,
        idempotencyKey: `${input.mappingId}:${scope.mode}:${scope.sectionPath ?? ''}`,
      },
    });

    return normalizeRunSummary(sessionId, {
      ...payload,
      scope: payload.scope ?? scope,
    });
  }

  async getAutoMapRunStatus(sessionId: string, runId: string): Promise<AutoMapRunSummary> {
    const payload = await httpRequest<{
      readonly sessionId?: string;
      readonly runId: string;
      readonly status: AutoMapRunSummary['status'];
      readonly scope?: AutoMapRunSummary['scope'];
      readonly deduped?: boolean;
      readonly progress?: AutoMapRunSummary['progress'];
      readonly counts?: AutoMapRunSummary['counts'];
      readonly failure?: AutoMapRunSummary['failure'];
    }>({
      baseUrl: this.apiUrl,
      path: `/ai/auto-map/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(runId)}`,
      method: 'GET',
    });

    return normalizeRunSummary(sessionId, payload);
  }

  async listAutoMapSuggestions(
    sessionId: string,
    options?: {
      readonly limit?: number;
      readonly cursor?: string;
      readonly status?: readonly string[];
    },
  ): Promise<AutoMapSuggestionsPage> {
    const search = new URLSearchParams();
    search.set('limit', String(normalizeSuggestionPageLimit(options?.limit)));

    if (typeof options?.cursor === 'string' && options.cursor.trim().length > 0) {
      search.set('cursor', options.cursor);
    }

    if (Array.isArray(options?.status) && options.status.length > 0) {
      search.set('status', options.status.join(','));
    }

    return httpRequest<AutoMapSuggestionsPage>({
      baseUrl: this.apiUrl,
      path: `/ai/auto-map/sessions/${encodeURIComponent(sessionId)}/suggestions?${search.toString()}`,
      method: 'GET',
    });
  }

  override async suggestExpression(input: SuggestExpressionInput): Promise<SuggestExpressionResult> {
    return httpRequest<SuggestExpressionResult>({
      baseUrl: this.apiUrl,
      path: '/ai/suggest-expression',
      method: 'POST',
      body: input,
    });
  }

  override async explainRule(input: ExplainRuleInput): Promise<ExplainRuleResult> {
    return httpRequest<ExplainRuleResult>({
      baseUrl: this.apiUrl,
      path: '/ai/explain-rule',
      method: 'POST',
      body: input,
    });
  }

  override async smartFix(input: SmartFixInput): Promise<SmartFixResult> {
    return httpRequest<SmartFixResult>({
      baseUrl: this.apiUrl,
      path: '/ai/smart-fix',
      method: 'POST',
      body: input,
    });
  }

  override async validateMappings(input: ValidateMappingsInput): Promise<ValidationReport> {
    return httpRequest<ValidationReport>({
      baseUrl: this.apiUrl,
      path: '/ai/validate-mappings',
      method: 'POST',
      body: input,
    });
  }

  override async querySchemaNodes(schemaId: string, query: string): Promise<SchemaSearchResult[]> {
    return httpRequest<SchemaSearchResult[]>({
      baseUrl: this.apiUrl,
      path: `/schemas/${encodeURIComponent(schemaId)}/query`,
      method: 'POST',
      body: {
        query,
      },
    });
  }

  override async listActivity(projectId?: string, limit?: number): Promise<ActivityEntry[]> {
    void projectId;
    void limit;
    throw this.featureNotEnabled('listActivity');
  }

  override async previewOnServer(mappingId: string, input: ServerPreviewInput): Promise<ServerPreviewResult> {
    return httpRequest<ServerPreviewResult>({
      baseUrl: this.apiUrl,
      path: `/mappings/${encodeURIComponent(mappingId)}/preview`,
      method: 'POST',
      body: input,
    });
  }

  override async listProjectValueTables(
    projectId: string,
    options?: ValueTableListOptions,
  ): Promise<ProjectValueTable[]> {
    const searchParams = new URLSearchParams();
    if (options?.query) searchParams.set('query', options.query);
    if (options?.status) searchParams.set('status', options.status);
    if (options?.sortBy) searchParams.set('sortBy', options.sortBy);
    if (options?.sortDirection) searchParams.set('sortDirection', options.sortDirection);
    const query = searchParams.toString();

    return httpRequest<ProjectValueTable[]>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-tables${query ? `?${query}` : ''}`,
      method: 'GET',
    });
  }

  override async getProjectValueTable(valueTableId: string): Promise<ProjectValueTable> {
    return httpRequest<ProjectValueTable>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(valueTableId)}`,
      method: 'GET',
    });
  }

  override async getProjectValueTableRevision(
    valueTableId: string,
    revision: number,
  ): Promise<ProjectValueTableRevision> {
    return httpRequest<ProjectValueTableRevision>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(valueTableId)}/revisions/${encodeURIComponent(String(revision))}`,
      method: 'GET',
    });
  }

  override async createProjectValueTable(input: CreateProjectValueTableInput): Promise<ProjectValueTable> {
    return httpRequest<ProjectValueTable>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(input.projectId)}/value-tables`,
      method: 'POST',
      body: input,
    });
  }

  override async createProjectValueTableRevision(
    valueTableId: string,
    input: CreateProjectValueTableRevisionInput,
  ): Promise<ProjectValueTableRevision> {
    return httpRequest<ProjectValueTableRevision>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(valueTableId)}/revisions`,
      method: 'POST',
      body: input,
    });
  }

  override async duplicateProjectValueTable(input: DuplicateProjectValueTableInput): Promise<ProjectValueTable> {
    return httpRequest<ProjectValueTable>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(input.valueTableId)}/duplicate`,
      method: 'POST',
      body: input,
    });
  }

  override async promoteProjectValueMap(
    projectId: string,
    valueMapId: string,
    input: PromoteProjectValueMapInput = {},
  ): Promise<PromoteProjectValueMapResult> {
    return httpRequest<PromoteProjectValueMapResult>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-maps/${encodeURIComponent(valueMapId)}/promote`,
      method: 'POST',
      body: input,
    });
  }

  override async archiveProjectValueTable(valueTableId: string): Promise<ProjectValueTable> {
    return httpRequest<ProjectValueTable>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(valueTableId)}/archive`,
      method: 'POST',
      body: {},
    });
  }

  override async deleteProjectValueTable(valueTableId: string): Promise<void> {
    await httpRequest<void>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(valueTableId)}`,
      method: 'DELETE',
    });
  }

  override async listProjectValueTableUsage(valueTableId: string): Promise<ValueTableUsageEntry[]> {
    return httpRequest<ValueTableUsageEntry[]>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(valueTableId)}/usage`,
      method: 'GET',
    });
  }

  override async getProjectValueTableRevisionDiff(
    valueTableId: string,
    fromRevision: number,
    toRevision: number,
    options?: { cursor?: string; pageSize?: number },
  ): Promise<ValueTableDiffPage> {
    const searchParams = new URLSearchParams({
      fromRevision: String(fromRevision),
      toRevision: String(toRevision),
    });
    if (options?.cursor) searchParams.set('cursor', options.cursor);
    if (typeof options?.pageSize === 'number') searchParams.set('pageSize', String(options.pageSize));

    return httpRequest<ValueTableDiffPage>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(valueTableId)}/diff?${searchParams.toString()}`,
      method: 'GET',
    });
  }

  override async exportProjectValueTableCsv(
    valueTableId: string,
    revision?: number,
    options?: { portable?: boolean },
  ): Promise<string | PortableValueMapExportPayload> {
    const searchParams = new URLSearchParams();
    if (typeof revision === 'number') {
      searchParams.set('revision', String(revision));
    }
    if (options?.portable) {
      searchParams.set('portable', 'true');
    }
    const query = searchParams.toString();

    return httpRequest<string | PortableValueMapExportPayload>({
      baseUrl: this.apiUrl,
      path: `/value-tables/${encodeURIComponent(valueTableId)}/export.csv${query ? `?${query}` : ''}`,
      method: 'GET',
    });
  }

  override async importProjectValueTableCsv(
    projectId: string,
    csv: string,
    options?: { name?: string; key?: string },
  ): Promise<ProjectValueTableRevision> {
    return httpRequest<ProjectValueTableRevision>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-tables/import-csv`,
      method: 'POST',
      body: {
        csv,
        ...(options?.name ? { name: options.name } : {}),
        ...(options?.key ? { key: options.key } : {}),
      },
    });
  }

  override async importProjectValueMapPortable(
    projectId: string,
    input: ImportProjectValueMapPortableInput,
  ): Promise<ImportProjectValueMapPortableResult> {
    return httpRequest<ImportProjectValueMapPortableResult>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-tables/import-csv`,
      method: 'POST',
      body: input,
    });
  }

  override async resolveProjectValueTableReference(
    input: ResolveProjectValueTableReferenceInput,
  ): Promise<ResolveProjectValueTableReferenceResult> {
    return httpRequest<ResolveProjectValueTableReferenceResult>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(input.projectId)}/value-tables/resolve`,
      method: 'POST',
      body: input,
    });
  }

  override async listGlobalValueMaps(options?: ValueTableListOptions): Promise<ProjectValueTable[]> {
    const searchParams = new URLSearchParams();
    if (options?.query) searchParams.set('query', options.query);
    if (options?.status) searchParams.set('status', options.status);
    if (options?.sortBy) searchParams.set('sortBy', options.sortBy);
    if (options?.sortDirection) searchParams.set('sortDirection', options.sortDirection);
    const query = searchParams.toString();

    return httpRequest<ProjectValueTable[]>({
      baseUrl: this.apiUrl,
      path: `/value-maps${query ? `?${query}` : ''}`,
      method: 'GET',
    });
  }

  override async createGlobalValueMap(input: CreateGlobalValueMapInput): Promise<ProjectValueTable> {
    return httpRequest<ProjectValueTable>({
      baseUrl: this.apiUrl,
      path: '/value-maps',
      method: 'POST',
      body: input,
    });
  }

  override async getGlobalValueMap(valueMapId: string): Promise<ProjectValueTable> {
    return httpRequest<ProjectValueTable>({
      baseUrl: this.apiUrl,
      path: `/value-maps/${encodeURIComponent(valueMapId)}`,
      method: 'GET',
    });
  }

  override async listGlobalValueMapRevisions(valueMapId: string): Promise<ProjectValueTableRevision[]> {
    return httpRequest<ProjectValueTableRevision[]>({
      baseUrl: this.apiUrl,
      path: `/value-maps/${encodeURIComponent(valueMapId)}/revisions`,
      method: 'GET',
    });
  }

  override async createGlobalValueMapRevision(
    valueMapId: string,
    input: CreateProjectValueTableRevisionInput,
  ): Promise<ProjectValueTableRevision> {
    return httpRequest<ProjectValueTableRevision>({
      baseUrl: this.apiUrl,
      path: `/value-maps/${encodeURIComponent(valueMapId)}/revisions`,
      method: 'POST',
      body: input,
    });
  }

  override async getGlobalValueMapRevision(valueMapId: string, revision: number): Promise<ProjectValueTableRevision> {
    return httpRequest<ProjectValueTableRevision>({
      baseUrl: this.apiUrl,
      path: `/value-maps/${encodeURIComponent(valueMapId)}/revisions/${encodeURIComponent(String(revision))}`,
      method: 'GET',
    });
  }

  override async archiveGlobalValueMap(valueMapId: string): Promise<ProjectValueTable> {
    return httpRequest<ProjectValueTable>({
      baseUrl: this.apiUrl,
      path: `/value-maps/${encodeURIComponent(valueMapId)}/archive`,
      method: 'POST',
      body: {},
    });
  }

  override async getGlobalValueMapUsage(valueMapId: string): Promise<ValueMapUsageSummary> {
    return httpRequest<ValueMapUsageSummary>({
      baseUrl: this.apiUrl,
      path: `/value-maps/${encodeURIComponent(valueMapId)}/usage`,
      method: 'GET',
    });
  }

  override async listProjectValueMaps(projectId: string): Promise<ProjectValueMapLinkSummary[]> {
    return httpRequest<ProjectValueMapLinkSummary[]>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-maps`,
      method: 'GET',
    });
  }

  override async linkProjectValueMap(projectId: string, input: LinkProjectValueMapInput): Promise<ProjectValueMapDetail> {
    return httpRequest<ProjectValueMapDetail>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-maps/link`,
      method: 'POST',
      body: input,
    });
  }

  override async getProjectValueMapDetail(projectId: string, valueMapId: string): Promise<ProjectValueMapDetail> {
    return httpRequest<ProjectValueMapDetail>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-maps/${encodeURIComponent(valueMapId)}`,
      method: 'GET',
    });
  }

  override async updateProjectValueMapOverlay(
    projectId: string,
    valueMapId: string,
    input: UpdateProjectValueMapOverlayInput,
  ): Promise<ProjectValueMapDetail> {
    return httpRequest<ProjectValueMapDetail>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-maps/${encodeURIComponent(valueMapId)}/overlay`,
      method: 'PUT',
      body: input,
    });
  }

  override async reviewProjectValueMapUpdate(
    projectId: string,
    valueMapId: string,
    input?: ReviewProjectValueMapUpdateInput,
  ): Promise<ReviewProjectValueMapUpdateResult> {
    return httpRequest<ReviewProjectValueMapUpdateResult>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-maps/${encodeURIComponent(valueMapId)}/review-update`,
      method: 'POST',
      body: input ?? {},
    });
  }

  override async acceptProjectValueMapUpdate(
    projectId: string,
    valueMapId: string,
    input: AcceptProjectValueMapUpdateInput,
  ): Promise<ProjectValueMapDetail> {
    return httpRequest<ProjectValueMapDetail>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-maps/${encodeURIComponent(valueMapId)}/accept-update`,
      method: 'POST',
      body: input,
    });
  }

  override async unlinkProjectValueMap(projectId: string, valueMapId: string): Promise<void> {
    await httpRequest<void>({
      baseUrl: this.apiUrl,
      path: `/projects/${encodeURIComponent(projectId)}/value-maps/${encodeURIComponent(valueMapId)}/link`,
      method: 'DELETE',
    });
  }

  private featureNotEnabled(featureName: string): FeatureNotEnabledError {
    return new FeatureNotEnabledError(featureName);
  }
}
