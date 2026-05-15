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
        origin: metadata.origin === 'cdm' || metadata.origin === 'published' || metadata.origin === 'local' ? metadata.origin : 'local',
        status: metadata.status ?? 'ready',
        scope: metadata.scope ?? 'global',
        description: metadata.description,
        updatedBy: metadata.updatedBy,
        inferred: metadata.inferred,
        syncStatus: metadata.syncStatus ?? 'not-synced',
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
      origin: input.origin === 'cdm' || input.origin === 'published' || input.origin === 'local' ? input.origin : 'local',
      status: 'ready',
      scope: input.scope ?? 'global',
      description: input.description,
      updatedBy: 'e2e-mock',
      inferred: input.inferred,
      syncStatus: input.syncStatus ?? 'not-synced',
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
