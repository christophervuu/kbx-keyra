import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  normalizeProjectLinkedSchemaIds,
  normalizeSchemaOrigin,
  normalizeSchemaSyncStatus,
  toMappingMetadata,
  toProjectDetail,
  toProjectMetadata,
  toSchemaMetadata,
  type CdmReSyncStatus,
  type MappingItem,
  type MappingMetadata,
  type ProjectItem,
  type ProjectDetail,
  type ProjectMetadata,
  type SchemaDiffEntry,
  type SchemaDiffSummary,
  type SchemaMetadata,
  type SchemaMetadataItem,
  type SchemaSyncResult,
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
  readonly linkedSchemaIds?: readonly string[];
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
  readonly origin: 'cdm' | 'uploaded' | 'inferred';
  readonly status: 'ingesting' | 'ready' | 'error';
  readonly scope?: 'global' | 'project';
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
  readonly syncStatus: 'synced' | 'update-available' | 'sync-failed';
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

/**
 * FS-077: UI domain mirror for SchemaSyncResult with three-mode contract (FS-077).
 */
type DomainSchemaSyncResult = {
  readonly schemaId: string;
  readonly status: 'no-op' | 'updated' | 'failed';
  readonly synced: boolean;
  readonly message: string;
  readonly reason?: string;
  readonly previousCommitSha?: string;
  readonly currentCommitSha?: string;
  readonly commitSha?: string;
  readonly diffSummary?: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly modified: readonly string[];
  };
};

describe('persistence types', () => {
  it('normalizes legacy/unknown sync statuses to canonical values', () => {
    expect(normalizeSchemaSyncStatus('synced')).toBe('synced');
    expect(normalizeSchemaSyncStatus('update-available')).toBe('update-available');
    expect(normalizeSchemaSyncStatus('sync-failed')).toBe('sync-failed');
    expect(normalizeSchemaSyncStatus('not-synced')).toBe('sync-failed');
    expect(normalizeSchemaSyncStatus('local-changes')).toBe('sync-failed');
    expect(normalizeSchemaSyncStatus('mystery-status')).toBe('sync-failed');
    expect(normalizeSchemaSyncStatus(undefined)).toBe('sync-failed');
  });

  it('project item includes all domain project fields', () => {
    expectTypeOf<ProjectItem>().toMatchTypeOf<DomainProject>();
  });

  it('normalizes schema origin aliases to canonical values', () => {
    expect(normalizeSchemaOrigin('cdm')).toBe('cdm');
    expect(normalizeSchemaOrigin('inferred')).toBe('inferred');
    expect(normalizeSchemaOrigin('uploaded')).toBe('uploaded');
    expect(normalizeSchemaOrigin('local')).toBe('uploaded');
    expect(normalizeSchemaOrigin('published')).toBe('uploaded');
    expect(normalizeSchemaOrigin('unknown-value')).toBe('uploaded');
    expect(normalizeSchemaOrigin(undefined)).toBe('uploaded');
  });

  it('normalizes legacy schemaRefs to linkedSchemaIds', () => {
    expect(
      normalizeProjectLinkedSchemaIds({
        schemaRefs: [
          { schemaId: ' schema-a ', type: 'local' },
          { schemaId: 'schema-a', type: 'published' },
          { schemaId: 'schema-b', type: 'github' },
          { schemaId: '   ', type: 'local' },
        ],
      }),
    ).toEqual(['schema-a', 'schema-b']);

    expect(
      normalizeProjectLinkedSchemaIds({
        linkedSchemaIds: [' schema-x ', 'schema-x', 'schema-y', '   '],
        schemaRefs: [{ schemaId: 'schema-z', type: 'local' }],
      }),
    ).toEqual(['schema-x', 'schema-y']);
  });

  it('converter outputs align with domain metadata types', () => {
    expectTypeOf<ReturnType<typeof toProjectMetadata>>().toEqualTypeOf<DomainProjectMetadata>();
    expectTypeOf<ReturnType<typeof toProjectDetail>>().toMatchTypeOf<DomainProjectDetail>();
    expectTypeOf<ReturnType<typeof toMappingMetadata>>().toEqualTypeOf<DomainMappingMetadata>();
    expectTypeOf<ReturnType<typeof toSchemaMetadata>>().toEqualTypeOf<DomainSchemaMetadata>();
  });

  // ---------------------------------------------------------------------------
  // FS-077 — Re-sync result & diff types
  // ---------------------------------------------------------------------------

  it('SchemaSyncResult includes canonical status and backward-compat synced field', () => {
    // Canonical status field is required
    expectTypeOf<SchemaSyncResult>().toHaveProperty('status');
    // Backward-compat synced is also required
    expectTypeOf<SchemaSyncResult>().toHaveProperty('synced');
    // Both commitSha alias fields are optional strings
    expectTypeOf<SchemaSyncResult['previousCommitSha']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SchemaSyncResult['currentCommitSha']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SchemaSyncResult['commitSha']>().toEqualTypeOf<string | undefined>();
    // diffSummary is optional
    expectTypeOf<SchemaSyncResult['diffSummary']>().toEqualTypeOf<SchemaDiffSummary | undefined>();
  });

  it('SchemaSyncResult satisfies UI domain contract', () => {
    // The persistence type is a superset of the UI domain mirror
    expectTypeOf<SchemaSyncResult>().toMatchTypeOf<DomainSchemaSyncResult>();
  });

  it('CdmReSyncStatus is a union of exactly three string literals', () => {
    expectTypeOf<CdmReSyncStatus>().toEqualTypeOf<'no-op' | 'updated' | 'failed'>();
  });

  it('SchemaDiffSummary stores readonly string arrays for added/removed/modified', () => {
    expectTypeOf<SchemaDiffSummary['added']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<SchemaDiffSummary['removed']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<SchemaDiffSummary['modified']>().toEqualTypeOf<readonly string[]>();
  });

  it('SchemaDiffEntry has path string and changeType union', () => {
    expectTypeOf<SchemaDiffEntry>().toHaveProperty('path');
    expectTypeOf<SchemaDiffEntry['changeType']>().toEqualTypeOf<'added' | 'removed' | 'modified'>();
  });

  it('constructs a no-op SchemaSyncResult', () => {
    const result: SchemaSyncResult = {
      schemaId: 'test-schema',
      status: 'no-op',
      synced: true,
      message: 'No changes detected.',
      currentCommitSha: 'abc123',
      commitSha: 'abc123',
      previousCommitSha: 'abc123',
    };
    expect(result.schemaId).toBe('test-schema');
    expect(result.status).toBe('no-op');
    expect(result.synced).toBe(true);
    expect(result.message).toBe('No changes detected.');
    expect(result.currentCommitSha).toBe('abc123');
    expect(result.commitSha).toBe('abc123'); // backward compat
    expect(result.previousCommitSha).toBe('abc123');
    expect(result.diffSummary).toBeUndefined();
    expect(result.reason).toBeUndefined();
  });

  it('constructs an updated SchemaSyncResult with diffSummary', () => {
    const diff: SchemaDiffSummary = {
      added: ['/fields/newField'],
      removed: [],
      modified: ['/fields/existingField'],
    };
    const result: SchemaSyncResult = {
      schemaId: 'test-schema',
      status: 'updated',
      synced: true,
      message: 'Schema updated from CDM source.',
      currentCommitSha: 'def456',
      commitSha: 'def456',
      previousCommitSha: 'abc123',
      diffSummary: diff,
    };
    expect(result.status).toBe('updated');
    expect(result.currentCommitSha).toBe('def456');
    expect(result.previousCommitSha).toBe('abc123');
    expect(result.diffSummary).toBe(diff);
    expect(result.diffSummary?.added).toEqual(['/fields/newField']);
    expect(result.diffSummary?.modified).toEqual(['/fields/existingField']);
    expect(result.diffSummary?.removed).toEqual([]);
  });

  it('constructs a failed SchemaSyncResult with reason', () => {
    const result: SchemaSyncResult = {
      schemaId: 'test-schema',
      status: 'failed',
      synced: false,
      message: 'Re-sync failed.',
      reason: 'GitHub API rate-limited',
    };
    expect(result.status).toBe('failed');
    expect(result.synced).toBe(false);
    expect(result.reason).toBe('GitHub API rate-limited');
    expect(result.currentCommitSha).toBeUndefined();
    expect(result.diffSummary).toBeUndefined();
  });

  it('accepts persistence items and returns metadata without internal fields', () => {
    const projectItem: ProjectItem = {
      projectId: 'proj-1',
      name: 'Project 1',
      description: 'desc',
      slug: 'project-1',
      linkedSchemaIds: ['schema-1'],
      schemaRefs: [{ schemaId: 'schema-1', type: 'local' }],
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
      linkedSchemaIds: ['schema-1'],
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
      origin: 'uploaded',
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
