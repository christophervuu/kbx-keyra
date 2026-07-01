import type {
  CreateMappingInput,
  CreateProjectInput,
  CreateSchemaInput,
  MappingConfig,
  MappingMetadata,
  MappingVersionEntry,
  Project,
  ProjectDetail,
  ProjectMetadata,
  SchemaDetail,
  SchemaMetadata,
  SchemaSearchResult,
  UpdateProjectInput,
  UpdateSchemaInput,
} from '../../../ui/src/lib/types/domain';

import type { SeedPayload } from './types';

export interface AutoMapMockSuggestion {
  readonly target: string;
  readonly expression: string;
  readonly explanation: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly reviewStatus?: 'pending' | 'accepted' | 'dismissed' | 'kept-current' | 'stale' | 'conflict';
  readonly validation?: {
    readonly valid: boolean;
    readonly diagnostics: ReadonlyArray<{
      readonly severity: 'info' | 'warning' | 'error';
      readonly code: string;
      readonly message: string;
    }>;
  };
}

export interface AutoMapMockRunStatusStep {
  readonly status: string;
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

export interface AutoMapMockScenario {
  readonly scenarioId: string;
  readonly mappingId: string;
  readonly sectionPath: string;
  readonly visibleTargetPaths: readonly string[];
  readonly startRun: {
    readonly sessionId: string;
    readonly runId: string;
    readonly status: string;
    readonly queued: boolean;
  };
  readonly runStatuses: readonly AutoMapMockRunStatusStep[];
  readonly suggestionsByPoll: readonly AutoMapMockSuggestion[][];
}

interface AutoMapScenarioRuntime {
  scenario: AutoMapMockScenario;
  runStatusCursor: number;
  suggestionCursor: number;
  statusCallCount: number;
  suggestionsCallCount: number;
}

interface StoredMapping {
  metadata: MappingMetadata;
  config: MappingConfig;
}

interface StoredSchema {
  metadata: SchemaMetadata;
  content: SchemaDetail['content'];
}

const MAX_MAPPING_VERSIONS = 50;

export class InMemoryStore {
  private readonly projects = new Map<string, Project>();
  private readonly mappings = new Map<string, StoredMapping>();
  private readonly schemas = new Map<string, StoredSchema>();
  private readonly mappingVersions = new Map<string, MappingVersionEntry[]>();
  private readonly autoMapScenarios = new Map<string, AutoMapScenarioRuntime>();
  private readonly autoMapSessionByMapping = new Map<string, { sessionId: string; runId: string }>();

  private projectCounter = 1;
  private mappingCounter = 1;
  private schemaCounter = 1;
  private requestCounter = 1;

  nowIso(): string {
    return new Date().toISOString();
  }

  nextRequestId(): string {
    const id = `req-${String(this.requestCounter).padStart(6, '0')}`;
    this.requestCounter += 1;
    return id;
  }

  reset(): void {
    this.projects.clear();
    this.mappings.clear();
    this.schemas.clear();
    this.mappingVersions.clear();
    this.autoMapScenarios.clear();
    this.autoMapSessionByMapping.clear();
  }

  seed(payload: SeedPayload): void {
    this.reset();

    for (const project of payload.projects ?? []) {
      const p = project as Partial<Project> & { projectId?: string; name?: string; description?: string; slug?: string };
      const timestamp = this.nowIso();
      const projectId = p.projectId ?? this.nextProjectId();
      const full: Project = {
        projectId,
        name: p.name ?? `Project ${projectId}`,
        description: p.description ?? '',
        slug: p.slug ?? `project-${projectId}`,
        schemaRefs: Array.isArray(p.schemaRefs) ? p.schemaRefs : [],
        tags: Array.isArray(p.tags) ? p.tags : [],
        createdAt: p.createdAt ?? timestamp,
        updatedAt: p.updatedAt ?? timestamp,
      };
      this.projects.set(projectId, full);
    }

    for (const schema of payload.schemas ?? []) {
      const maybeDetail = schema as Partial<SchemaDetail> & { metadata?: Partial<SchemaMetadata>; content?: SchemaDetail['content'] };
      const metadata = maybeDetail.metadata ?? (schema as Partial<SchemaMetadata>);
      const timestamp = this.nowIso();
      const schemaId = metadata.schemaId ?? this.nextSchemaId();
      const fullMetadata: SchemaMetadata = {
        schemaId,
        name: metadata.name ?? `Schema ${schemaId}`,
        format: metadata.format ?? 'json-schema',
        fieldCount: metadata.fieldCount ?? 0,
        origin: metadata.origin === 'cdm' || metadata.origin === 'uploaded' || metadata.origin === 'inferred' ? metadata.origin : 'uploaded',
        status: metadata.status ?? 'ready',
        scope: metadata.scope ?? 'global',
        description: metadata.description,
        updatedBy: metadata.updatedBy,
        inferred: metadata.inferred,
        syncStatus: metadata.syncStatus ?? 'sync-failed',
        source: metadata.source ?? { type: 'upload' },
        createdAt: metadata.createdAt ?? timestamp,
        updatedAt: metadata.updatedAt ?? timestamp,
      };

      this.schemas.set(schemaId, {
        metadata: fullMetadata,
        content: maybeDetail.content ?? {},
      });
    }

    for (const mapping of payload.mappings ?? []) {
      const maybeStored = mapping as Partial<StoredMapping> & { metadata?: Partial<MappingMetadata>; config?: Partial<MappingConfig> };
      const metadata = maybeStored.metadata ?? (mapping as Partial<MappingMetadata>);
      const config = maybeStored.config ?? (mapping as Partial<MappingConfig>);
      const timestamp = this.nowIso();
      const mappingId = metadata.mappingId ?? config.id ?? this.nextMappingId();

      const fullConfig: MappingConfig = {
        id: mappingId,
        projectId: config.projectId ?? metadata.projectId ?? '',
        name: config.name ?? metadata.name ?? `Mapping ${mappingId}`,
        version: config.version ?? metadata.version ?? 1,
        engineVersion: config.engineVersion ?? '2.0.0',
        sourceSchemaRef: config.sourceSchemaRef,
        targetSchemaRef: config.targetSchemaRef,
        config: config.config ?? {},
        rules: config.rules ?? [],
      };

      const fullMetadata: MappingMetadata = {
        mappingId,
        projectId: metadata.projectId ?? fullConfig.projectId ?? '',
        name: metadata.name ?? fullConfig.name,
        version: metadata.version ?? fullConfig.version,
        status: metadata.status ?? 'draft',
        sourceSchemaId: metadata.sourceSchemaId ?? fullConfig.sourceSchemaRef?.schemaId,
        targetSchemaId: metadata.targetSchemaId ?? fullConfig.targetSchemaRef?.schemaId,
        ruleCount: metadata.ruleCount ?? fullConfig.rules.length,
        coverage: metadata.coverage ?? 0,
        updatedAt: metadata.updatedAt ?? timestamp,
      };

      this.mappings.set(mappingId, {
        metadata: fullMetadata,
        config: fullConfig,
      });
    }

    for (const seededScenario of payload.autoMapScenarios ?? []) {
      this.upsertAutoMapScenario(seededScenario);
    }
  }

  private createDefaultAutoMapScenario(mappingId: string, sectionPath: string, visibleTargetPaths: readonly string[]): AutoMapMockScenario {
    const target = visibleTargetPaths[0] ?? 'Order.Id';
    return {
      scenarioId: `scenario-${mappingId}-${sectionPath || 'root'}`,
      mappingId,
      sectionPath,
      visibleTargetPaths,
      startRun: {
        sessionId: `ams-${mappingId}`,
        runId: `run-${mappingId}-1`,
        status: 'queued',
        queued: true,
      },
      runStatuses: [
        {
          status: 'queued',
          progress: { completedWorkUnits: 0, totalWorkUnits: 2, completedTargets: 0, totalTargets: 2 },
          counts: { generated: 0, ready: 0, warning: 0, invalid: 0, failedTargets: 0 },
        },
        {
          status: 'generating',
          progress: { completedWorkUnits: 1, totalWorkUnits: 2, completedTargets: 1, totalTargets: 2 },
          counts: { generated: 1, ready: 1, warning: 0, invalid: 0, failedTargets: 0 },
        },
        {
          status: 'completed',
          progress: { completedWorkUnits: 2, totalWorkUnits: 2, completedTargets: 2, totalTargets: 2 },
          counts: { generated: 2, ready: 2, warning: 0, invalid: 0, failedTargets: 0 },
        },
      ],
      suggestionsByPoll: [
        [],
        [
          {
            target,
            expression: 'source("orderId")',
            explanation: 'Maps order id from source payload.',
            confidence: 'high',
            reviewStatus: 'pending',
            validation: { valid: true, diagnostics: [] },
          },
        ],
        [
          {
            target,
            expression: 'source("orderId")',
            explanation: 'Maps order id from source payload.',
            confidence: 'high',
            reviewStatus: 'pending',
            validation: { valid: true, diagnostics: [] },
          },
        ],
      ],
    };
  }

  private normalizeAutoMapScenario(input: unknown): AutoMapMockScenario | null {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const candidate = input as {
      scenarioId?: unknown;
      mappingId?: unknown;
      sectionPath?: unknown;
      visibleTargetPaths?: unknown;
      startRun?: unknown;
      runStatuses?: unknown;
      suggestionsByPoll?: unknown;
    };

    if (typeof candidate.mappingId !== 'string' || candidate.mappingId.trim() === '') {
      return null;
    }

    const startRun = candidate.startRun as {
      sessionId?: unknown;
      runId?: unknown;
      status?: unknown;
      queued?: unknown;
    } | undefined;
    if (!startRun || typeof startRun.sessionId !== 'string' || typeof startRun.runId !== 'string' || typeof startRun.status !== 'string') {
      return null;
    }

    const runStatusesRaw = Array.isArray(candidate.runStatuses) ? candidate.runStatuses : [];
    if (runStatusesRaw.length === 0) {
      return null;
    }

    const runStatuses: AutoMapMockRunStatusStep[] = runStatusesRaw
      .map((step) => {
        if (!step || typeof step !== 'object') return null;
        const typed = step as AutoMapMockRunStatusStep;
        if (typeof typed.status !== 'string') return null;
        return {
          status: typed.status,
          ...(typed.progress ? { progress: typed.progress } : {}),
          ...(typed.counts ? { counts: typed.counts } : {}),
          ...(typed.failure ? { failure: typed.failure } : {}),
        };
      })
      .filter((step): step is AutoMapMockRunStatusStep => step !== null);

    if (runStatuses.length === 0) {
      return null;
    }

    const suggestionsByPoll = Array.isArray(candidate.suggestionsByPoll)
      ? candidate.suggestionsByPoll.map((entry) => (Array.isArray(entry) ? entry : []) as AutoMapMockSuggestion[])
      : [];

    return {
      scenarioId: typeof candidate.scenarioId === 'string' && candidate.scenarioId.trim() !== ''
        ? candidate.scenarioId
        : `scenario-${candidate.mappingId}`,
      mappingId: candidate.mappingId,
      sectionPath: typeof candidate.sectionPath === 'string' ? candidate.sectionPath : '',
      visibleTargetPaths: Array.isArray(candidate.visibleTargetPaths)
        ? candidate.visibleTargetPaths.filter((path): path is string => typeof path === 'string')
        : [],
      startRun: {
        sessionId: startRun.sessionId,
        runId: startRun.runId,
        status: startRun.status,
        queued: startRun.queued !== false,
      },
      runStatuses,
      suggestionsByPoll,
    };
  }

  upsertAutoMapScenario(input: unknown): boolean {
    const scenario = this.normalizeAutoMapScenario(input);
    if (!scenario) {
      return false;
    }

    this.autoMapScenarios.set(scenario.mappingId, {
      scenario,
      runStatusCursor: 0,
      suggestionCursor: 0,
      statusCallCount: 0,
      suggestionsCallCount: 0,
    });
    this.autoMapSessionByMapping.set(scenario.mappingId, {
      sessionId: scenario.startRun.sessionId,
      runId: scenario.startRun.runId,
    });
    return true;
  }

  private getOrCreateAutoMapRuntime(mappingId: string, sectionPath: string, visibleTargetPaths: readonly string[]): AutoMapScenarioRuntime {
    const existing = this.autoMapScenarios.get(mappingId);
    if (existing) {
      return existing;
    }

    const scenario = this.createDefaultAutoMapScenario(mappingId, sectionPath, visibleTargetPaths);
    const runtime: AutoMapScenarioRuntime = {
      scenario,
      runStatusCursor: 0,
      suggestionCursor: 0,
      statusCallCount: 0,
      suggestionsCallCount: 0,
    };
    this.autoMapScenarios.set(mappingId, runtime);
    this.autoMapSessionByMapping.set(mappingId, {
      sessionId: scenario.startRun.sessionId,
      runId: scenario.startRun.runId,
    });
    return runtime;
  }

  getAutoMapOpenSession(mappingId: string): { sessionId: string; mappingId: string; projectId: string; status: string; baseMappingRevision: number; lastRunId: string; createdAt: string; updatedAt: string } | null {
    const runtime = this.autoMapScenarios.get(mappingId);
    const mapping = this.mappings.get(mappingId);
    if (!runtime || !mapping) {
      return null;
    }

    const step = runtime.scenario.runStatuses[Math.min(runtime.runStatusCursor, runtime.scenario.runStatuses.length - 1)];
    const status = step?.status === 'completed' || step?.status === 'partial' || step?.status === 'failed' || step?.status === 'superseded'
      ? 'reviewing'
      : 'generating';

    return {
      sessionId: runtime.scenario.startRun.sessionId,
      mappingId,
      projectId: mapping.metadata.projectId,
      status,
      baseMappingRevision: 0,
      lastRunId: runtime.scenario.startRun.runId,
      createdAt: this.nowIso(),
      updatedAt: this.nowIso(),
    };
  }

  startAutoMapSession(input: { mappingId: string; sectionPath: string; visibleTargetPaths: readonly string[] }): { sessionId: string; runId: string; status: string; deduped: boolean } {
    const runtime = this.getOrCreateAutoMapRuntime(input.mappingId, input.sectionPath, input.visibleTargetPaths);
    runtime.runStatusCursor = 0;
    runtime.suggestionCursor = 0;
    this.autoMapSessionByMapping.set(input.mappingId, {
      sessionId: runtime.scenario.startRun.sessionId,
      runId: runtime.scenario.startRun.runId,
    });

    return {
      sessionId: runtime.scenario.startRun.sessionId,
      runId: runtime.scenario.startRun.runId,
      status: runtime.scenario.startRun.status,
      deduped: false,
    };
  }

  startAutoMapRunBySession(sessionId: string): { sessionId: string; runId: string; status: string; deduped: boolean } | null {
    const runtime = Array.from(this.autoMapScenarios.values()).find((entry) => entry.scenario.startRun.sessionId === sessionId);
    if (!runtime) {
      return null;
    }

    runtime.runStatusCursor = 0;
    runtime.suggestionCursor = 0;
    return {
      sessionId: runtime.scenario.startRun.sessionId,
      runId: runtime.scenario.startRun.runId,
      status: runtime.scenario.startRun.status,
      deduped: false,
    };
  }

  getAutoMapRunStatus(sessionId: string, runId: string): AutoMapMockRunStatusStep & { sessionId: string; runId: string; scope: { mode: string } } | null {
    const runtime = Array.from(this.autoMapScenarios.values()).find(
      (entry) => entry.scenario.startRun.sessionId === sessionId && entry.scenario.startRun.runId === runId,
    );
    if (!runtime) {
      return null;
    }

    runtime.statusCallCount += 1;
    const currentIndex = Math.min(runtime.runStatusCursor, runtime.scenario.runStatuses.length - 1);
    const current = runtime.scenario.runStatuses[currentIndex] ?? runtime.scenario.runStatuses[runtime.scenario.runStatuses.length - 1];
    if (runtime.runStatusCursor < runtime.scenario.runStatuses.length - 1) {
      runtime.runStatusCursor += 1;
    }

    return {
      sessionId,
      runId,
      scope: { mode: runtime.scenario.sectionPath === '' ? 'whole' : 'section' },
      ...current,
    };
  }

  listAutoMapSuggestions(sessionId: string): { items: AutoMapMockSuggestion[]; total: number } | null {
    const runtime = Array.from(this.autoMapScenarios.values()).find(
      (entry) => entry.scenario.startRun.sessionId === sessionId,
    );
    if (!runtime) {
      return null;
    }

    runtime.suggestionsCallCount += 1;
    const currentIndex = Math.min(runtime.suggestionCursor, Math.max(runtime.scenario.suggestionsByPoll.length - 1, 0));
    const items = runtime.scenario.suggestionsByPoll[currentIndex] ?? [];
    if (runtime.suggestionCursor < runtime.scenario.suggestionsByPoll.length - 1) {
      runtime.suggestionCursor += 1;
    }

    return {
      items: [...items],
      total: items.length,
    };
  }

  getAutoMapMetrics(mappingId: string): { runStatusCalls: number; suggestionCalls: number } {
    const runtime = this.autoMapScenarios.get(mappingId);
    if (!runtime) {
      return { runStatusCalls: 0, suggestionCalls: 0 };
    }
    return {
      runStatusCalls: runtime.statusCallCount,
      suggestionCalls: runtime.suggestionsCallCount,
    };
  }

  // Projects
  listProjects(): ProjectMetadata[] {
    return Array.from(this.projects.values()).map((project) => {
      const mappings = this.listMappings(project.projectId);
      return {
        projectId: project.projectId,
        name: project.name,
        description: project.description,
        slug: project.slug,
        mappingCount: mappings.length,
        schemaCount: project.schemaRefs.length,
        updatedAt: project.updatedAt,
      };
    });
  }

  getProject(projectId: string): ProjectDetail | null {
    const project = this.projects.get(projectId);
    if (!project) return null;

    return {
      ...project,
      mappings: this.listMappings(projectId),
    };
  }

  createProject(input: CreateProjectInput): ProjectMetadata {
    const timestamp = this.nowIso();
    const projectId = this.nextProjectId();

    const project: Project = {
      projectId,
      name: input.name,
      description: input.description,
      slug: input.slug,
      schemaRefs: input.schemaRefs ?? [],
      tags: input.tags ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.projects.set(projectId, project);

    return {
      projectId,
      name: project.name,
      description: project.description,
      slug: project.slug,
      mappingCount: 0,
      schemaCount: project.schemaRefs.length,
      updatedAt: project.updatedAt,
    };
  }

  updateProject(projectId: string, input: UpdateProjectInput): ProjectMetadata | null {
    const current = this.projects.get(projectId);
    if (!current) return null;

    const next: Project = {
      ...current,
      ...input,
      updatedAt: this.nowIso(),
    };
    this.projects.set(projectId, next);

    const mappings = this.listMappings(projectId);
    return {
      projectId: next.projectId,
      name: next.name,
      description: next.description,
      slug: next.slug,
      mappingCount: mappings.length,
      schemaCount: next.schemaRefs.length,
      updatedAt: next.updatedAt,
    };
  }

  deleteProject(projectId: string): 'deleted' | 'not-found' | 'conflict' {
    if (!this.projects.has(projectId)) return 'not-found';
    if (this.listMappings(projectId).length > 0) return 'conflict';

    this.projects.delete(projectId);
    return 'deleted';
  }

  // Mappings
  listMappings(projectId: string): MappingMetadata[] {
    return Array.from(this.mappings.values())
      .map((m) => m.metadata)
      .filter((m) => m.projectId === projectId);
  }

  getMapping(mappingId: string): MappingConfig | null {
    return this.mappings.get(mappingId)?.config ?? null;
  }

  createMapping(input: CreateMappingInput): MappingMetadata {
    const timestamp = this.nowIso();
    const mappingId = this.nextMappingId();

    const config: MappingConfig = {
      id: mappingId,
      projectId: input.projectId,
      name: input.name,
      version: 1,
      engineVersion: '2.0.0',
      sourceSchemaRef: input.sourceSchemaRef,
      targetSchemaRef: input.targetSchemaRef,
      config: input.config ?? {},
      rules: input.rules ?? [],
    };

    const metadata: MappingMetadata = {
      mappingId,
      projectId: input.projectId,
      name: input.name,
      version: 1,
      status: 'draft',
      sourceSchemaId: input.sourceSchemaRef?.schemaId,
      targetSchemaId: input.targetSchemaRef?.schemaId,
      ruleCount: config.rules.length,
      coverage: 0,
      updatedAt: timestamp,
    };

    this.mappings.set(mappingId, { metadata, config });
    return metadata;
  }

  updateMapping(mappingId: string, config: MappingConfig): MappingMetadata | null {
    const current = this.mappings.get(mappingId);
    if (!current) return null;

    const timestamp = this.nowIso();
    const nextConfig: MappingConfig = {
      ...config,
      id: mappingId,
      projectId: config.projectId ?? current.metadata.projectId,
    };

    const nextMetadata: MappingMetadata = {
      ...current.metadata,
      name: nextConfig.name,
      version: nextConfig.version,
      sourceSchemaId: nextConfig.sourceSchemaRef?.schemaId,
      targetSchemaId: nextConfig.targetSchemaRef?.schemaId,
      ruleCount: nextConfig.rules.length,
      updatedAt: timestamp,
    };

    this.mappings.set(mappingId, {
      metadata: nextMetadata,
      config: nextConfig,
    });

    return nextMetadata;
  }

  deleteMapping(mappingId: string): boolean {
    const existed = this.mappings.delete(mappingId);
    this.mappingVersions.delete(mappingId);
    return existed;
  }

  duplicateMapping(mappingId: string, name: string): MappingMetadata | null {
    const original = this.mappings.get(mappingId);
    if (!original) return null;

    const nextId = this.nextMappingId();
    const timestamp = this.nowIso();

    const config: MappingConfig = {
      ...original.config,
      id: nextId,
      name,
      version: 1,
    };

    const metadata: MappingMetadata = {
      ...original.metadata,
      mappingId: nextId,
      name,
      version: 1,
      ruleCount: config.rules.length,
      updatedAt: timestamp,
    };

    this.mappings.set(nextId, { metadata, config });
    return metadata;
  }

  listMappingVersions(mappingId: string): MappingVersionEntry[] {
    return [...(this.mappingVersions.get(mappingId) ?? [])].sort((a, b) => b.version - a.version);
  }

  getMappingVersion(mappingId: string, version: number): MappingVersionEntry | null {
    const versions = this.mappingVersions.get(mappingId) ?? [];
    return versions.find((entry) => entry.version === version) ?? null;
  }

  saveMappingVersion(mappingId: string, entry: MappingVersionEntry): 'saved' | 'mapping-not-found' {
    if (!this.mappings.has(mappingId)) return 'mapping-not-found';

    const versions = this.mappingVersions.get(mappingId) ?? [];
    const next = [...versions, entry];
    const pruned =
      next.length > MAX_MAPPING_VERSIONS
        ? [...next]
            .sort((a, b) => a.version - b.version)
            .slice(next.length - MAX_MAPPING_VERSIONS)
        : next;

    this.mappingVersions.set(mappingId, pruned);
    return 'saved';
  }

  // Schemas
  listSchemas(): SchemaMetadata[] {
    return Array.from(this.schemas.values()).map((s) => s.metadata);
  }

  getSchema(schemaId: string): SchemaDetail | null {
    const current = this.schemas.get(schemaId);
    if (!current) return null;

    return {
      metadata: current.metadata,
      content: current.content,
    };
  }

  createSchema(input: CreateSchemaInput & { fieldCount?: number }): SchemaMetadata {
    const timestamp = this.nowIso();
    const schemaId = this.nextSchemaId();

    const metadata: SchemaMetadata = {
      schemaId,
      name: input.name,
      format: input.format,
      fieldCount: typeof input.fieldCount === 'number' ? input.fieldCount : 0,
      origin: input.origin === 'cdm' || input.origin === 'uploaded' || input.origin === 'inferred' ? input.origin : 'uploaded',
      status: 'ready',
      scope: input.scope ?? 'global',
      description: input.description,
      updatedBy: 'e2e-mock',
      inferred: input.inferred,
      syncStatus: input.syncStatus ?? 'sync-failed',
      source: input.source ?? { type: 'upload' },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.schemas.set(schemaId, {
      metadata,
      content: input.content,
    });

    return metadata;
  }

  updateSchema(schemaId: string, input: UpdateSchemaInput): SchemaMetadata | null {
    const current = this.schemas.get(schemaId);
    if (!current) return null;

    const nextMetadata: SchemaMetadata = {
      ...current.metadata,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.fieldCount !== undefined ? { fieldCount: input.fieldCount } : {}),
      ...(input.format !== undefined ? { format: input.format } : {}),
      updatedAt: this.nowIso(),
      updatedBy: 'e2e-mock',
    };

    const nextContent = input.content !== undefined ? input.content : current.content;

    this.schemas.set(schemaId, {
      metadata: nextMetadata,
      content: nextContent,
    });

    return nextMetadata;
  }

  deleteSchema(schemaId: string): boolean {
    return this.schemas.delete(schemaId);
  }

  querySchema(schemaId: string, query: string): SchemaSearchResult[] | null {
    const schema = this.schemas.get(schemaId);
    if (!schema) return null;

    if (!query.trim()) return [];

    const q = query.toLowerCase();
    const content = schema.content;

    if (!content || typeof content !== 'object') {
      return [];
    }

    const results: SchemaSearchResult[] = [];

    const visit = (node: unknown, path: string) => {
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      const properties = record.properties;

      if (properties && typeof properties === 'object') {
        for (const [key, value] of Object.entries(properties)) {
          const childPath = path ? `${path}.${key}` : key;
          const valueObj = (value && typeof value === 'object') ? (value as Record<string, unknown>) : undefined;
          const type = typeof valueObj?.type === 'string' ? valueObj.type : 'any';
          const description = typeof valueObj?.description === 'string' ? valueObj.description : undefined;

          if (key.toLowerCase().includes(q) || childPath.toLowerCase().includes(q)) {
            results.push({
              path: childPath,
              fieldName: key,
              type,
              description,
            });
          }

          visit(value, childPath);
        }
      }
    };

    visit(content, '');

    return results.slice(0, 50);
  }

  private nextProjectId(): string {
    const id = `project-${String(this.projectCounter).padStart(4, '0')}`;
    this.projectCounter += 1;
    return id;
  }

  private nextMappingId(): string {
    const id = `mapping-${String(this.mappingCounter).padStart(4, '0')}`;
    this.mappingCounter += 1;
    return id;
  }

  private nextSchemaId(): string {
    const id = `schema-${String(this.schemaCounter).padStart(4, '0')}`;
    this.schemaCounter += 1;
    return id;
  }
}
