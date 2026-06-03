import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  toMappingMetadata,
  toProjectDetail,
  toProjectMetadata,
  toSchemaMetadata,
  type MappingItem,
  type MappingMetadata,
  type ProjectItem,
  type ProjectDetail,
  type ProjectMetadata,
  type SchemaMetadata,
  type SchemaMetadataItem,
} from '../../../src/lib/persistence/types.js';

/**
 * Mirror contracts from ui/src/lib/types/domain.ts (read-only reference).
 * Kept local to avoid cross-package module-resolution coupling in root tsconfig.
 */
type DomainProject = {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly schemaRefs: readonly { schemaId: string; type: 'github' | 'local' | 'published'; commitSha?: string }[];
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

type DomainProjectMetadata = {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly mappingCount?: number;
  readonly schemaCount?: number;
  readonly updatedAt: string;
};

type DomainProjectDetail = DomainProject & {
  readonly mappings: readonly DomainMappingMetadata[];
};

type DomainMappingMetadata = {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly version: number;
  readonly status: 'draft' | 'ready' | 'has-errors';
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly updatedAt: string;
};

type DomainSchemaMetadata = {
  readonly schemaId: string;
  readonly name: string;
  readonly format: 'json-schema' | 'xsd';
  readonly fieldCount: number;
  readonly origin: 'cdm' | 'published' | 'local';
  readonly status: 'ingesting' | 'ready' | 'error';
  readonly scope: 'global' | 'project';
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
  readonly syncStatus: 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';
  readonly source:
    | { readonly type: 'upload' }
    | {
        readonly type: 'github';
        readonly repo: string;
        readonly repoId?: number;
        readonly branch: string;
        readonly path: string;
        readonly commitSha?: string;
      };
  readonly createdAt: string;
  readonly updatedAt: string;
};

describe('persistence types', () => {
  it('project item includes all domain project fields', () => {
    expectTypeOf<ProjectItem>().toMatchTypeOf<DomainProject>();
  });

  it('converter outputs align with domain metadata types', () => {
    expectTypeOf<ReturnType<typeof toProjectMetadata>>().toEqualTypeOf<DomainProjectMetadata>();
    expectTypeOf<ReturnType<typeof toProjectDetail>>().toMatchTypeOf<DomainProjectDetail>();
    expectTypeOf<ReturnType<typeof toMappingMetadata>>().toEqualTypeOf<DomainMappingMetadata>();
    expectTypeOf<ReturnType<typeof toSchemaMetadata>>().toEqualTypeOf<DomainSchemaMetadata>();
  });

  it('accepts persistence items and returns metadata without internal fields', () => {
    const projectItem: ProjectItem = {
      projectId: 'proj-1',
      name: 'Project 1',
      description: 'desc',
      slug: 'project-1',
      schemaRefs: [],
      tags: [],
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };

    const mappingItem: MappingItem = {
      mappingId: 'map-1',
      projectId: 'proj-1',
      name: 'Mapping 1',
      version: 1,
      revision: 1,
      latestVersion: null,
      configHash: 'a'.repeat(64),
      sourceSchemaId: 'schema-1',
      targetSchemaId: 'schema-2',
      status: 'draft',
      ruleCount: 0,
      coverage: 0,
      configS3Key: 'mappings/map-1/config.json',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };

    const schemaMetadataItem: SchemaMetadataItem = {
      schemaId: 'schema-1',
      name: 'Schema 1',
      format: 'json-schema',
      fieldCount: 12,
      origin: 'local',
      status: 'ready',
      scope: 'project',
      description: 'schema description',
      inferred: false,
      syncStatus: 'synced',
      source: {
        type: 'upload',
      },
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };

    const projectMetadata: ProjectMetadata = toProjectMetadata(projectItem);
    const projectDetail: ProjectDetail = toProjectDetail(projectItem, [
      {
        mappingId: 'map-1',
        projectId: 'proj-1',
        name: 'Mapping 1',
        version: 1,
        status: 'draft',
        sourceSchemaId: 'schema-1',
        targetSchemaId: 'schema-2',
        ruleCount: 0,
        coverage: 0,
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    ]);
    const mappingMetadata: MappingMetadata = toMappingMetadata(mappingItem);
    const schemaMetadata: SchemaMetadata = toSchemaMetadata(schemaMetadataItem);

    expect(projectMetadata).toEqual({
      projectId: 'proj-1',
      name: 'Project 1',
      description: 'desc',
      slug: 'project-1',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });

    expect(mappingMetadata).toEqual({
      mappingId: 'map-1',
      projectId: 'proj-1',
      name: 'Mapping 1',
      version: 1,
      sourceSchemaId: 'schema-1',
      targetSchemaId: 'schema-2',
      status: 'draft',
      ruleCount: 0,
      coverage: 0,
      updatedAt: '2026-05-15T00:00:00.000Z',
    });

    expect(projectDetail).toEqual({
      ...projectItem,
      mappings: [
        {
          mappingId: 'map-1',
          projectId: 'proj-1',
          name: 'Mapping 1',
          version: 1,
          status: 'draft',
          sourceSchemaId: 'schema-1',
          targetSchemaId: 'schema-2',
          ruleCount: 0,
          coverage: 0,
          updatedAt: '2026-05-15T00:00:00.000Z',
        },
      ],
    });

    expect(schemaMetadata).toEqual({
      schemaId: 'schema-1',
      name: 'Schema 1',
      format: 'json-schema',
      fieldCount: 12,
      origin: 'local',
      status: 'ready',
      scope: 'project',
      description: 'schema description',
      inferred: false,
      syncStatus: 'synced',
      source: {
        type: 'upload',
      },
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });
  });
});
