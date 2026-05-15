import type {
  MappingConfig,
  MappingMetadata,
  MappingVersionEntry,
  Project,
  ProjectMetadata,
  SchemaDetail,
  SchemaMetadata,
} from '../../../ui/src/lib/types/domain';

export interface TestSeedData {
  projects: Project[];
  mappings: Array<{ metadata: MappingMetadata; config: MappingConfig }>;
  schemas: Array<{ metadata: SchemaMetadata; content: SchemaDetail['content'] }>;
  mappingVersions?: Record<string, MappingVersionEntry[]>;
}

export function createTestProject(
  overrides: Partial<ProjectMetadata> = {},
): ProjectMetadata {
  return {
    projectId: 'test-project-1',
    name: 'Test Project',
    description: 'Project for E2E parity validation',
    slug: 'test-project-1',
    mappingCount: 0,
    schemaCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createTestProjectEntity(
  overrides: Partial<Project> = {},
): Project {
  return {
    projectId: 'test-project-1',
    name: 'Test Project',
    description: 'Project for E2E parity validation',
    slug: 'test-project-1',
    schemaRefs: [],
    tags: ['e2e', 'parity'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createTestMapping(
  overrides: Partial<MappingMetadata> = {},
): MappingMetadata {
  return {
    mappingId: 'test-mapping-1',
    projectId: 'test-project-1',
    name: 'Test Mapping',
    version: 1,
    status: 'draft',
    sourceSchemaId: 'test-schema-source-1',
    targetSchemaId: 'test-schema-target-1',
    ruleCount: 0,
    coverage: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createTestMappingConfig(
  overrides: Partial<MappingConfig> = {},
): MappingConfig {
  return {
    id: 'test-mapping-1',
    projectId: 'test-project-1',
    name: 'Test Mapping',
    version: 1,
    engineVersion: '2.0.0',
    sourceSchemaRef: { schemaId: 'test-schema-source-1', type: 'local' },
    targetSchemaRef: { schemaId: 'test-schema-target-1', type: 'local' },
    config: {},
    rules: [],
    ...overrides,
  };
}

export function createTestSchema(
  overrides: Partial<SchemaMetadata> = {},
): SchemaMetadata {
  return {
    schemaId: 'test-schema-1',
    name: 'Test Schema',
    format: 'json-schema',
    fieldCount: 8,
    origin: 'local',
    status: 'ready',
    scope: 'global',
    description: 'Schema for E2E tests',
    updatedBy: 'e2e-test',
    inferred: false,
    syncStatus: 'not-synced',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createTestSchemaDetail(
  overrides: Partial<SchemaDetail> = {},
): SchemaDetail {
  const metadata = createTestSchema(overrides.metadata);
  return {
    metadata,
    content: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        id: { type: 'string' },
        amount: { type: 'number' },
      },
      required: ['id'],
    },
    ...overrides,
  };
}

export function createDefaultSeedData(
  overrides: Partial<TestSeedData> = {},
): TestSeedData {
  const project = createTestProjectEntity();
  const sourceSchema = createTestSchema({
    schemaId: 'test-schema-source-1',
    name: 'Source Schema',
  });
  const targetSchema = createTestSchema({
    schemaId: 'test-schema-target-1',
    name: 'Target Schema',
  });
  const mappingMetadata = createTestMapping();
  const mappingConfig = createTestMappingConfig();

  return {
    projects: [project],
    mappings: [{ metadata: mappingMetadata, config: mappingConfig }],
    schemas: [
      { metadata: sourceSchema, content: createTestSchemaDetail({ metadata: sourceSchema }).content },
      { metadata: targetSchema, content: createTestSchemaDetail({ metadata: targetSchema }).content },
    ],
    mappingVersions: {
      'test-mapping-1': [
        {
          version: 1,
          savedAt: '2026-01-01T00:00:00.000Z',
          savedBy: 'e2e-test',
          ruleCount: 0,
          config: mappingConfig,
        },
      ],
    },
    ...overrides,
  };
}
