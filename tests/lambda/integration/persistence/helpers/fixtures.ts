import type {
  CreateMappingInput,
  CreateProjectInput,
  CreateSchemaMetadataInput,
  MappingConfig,
} from '../../../../../src/lib/persistence/types.js';

export const FIXTURE_IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  projectIdAlt: '22222222-2222-4222-8222-222222222222',
  mappingId: '33333333-3333-4333-8333-333333333333',
  schemaIdSource: '44444444-4444-4444-8444-444444444444',
  schemaIdTarget: '55555555-5555-4555-8555-555555555555',
  schemaIdMetadata: '66666666-6666-4666-8666-666666666666',
} as const;

export const fixtureProjectInput: CreateProjectInput = {
  name: 'FS-061 Project Fixture',
  description: 'Cross-session persistence harness fixture project',
  slug: 'fs-061-project-fixture',
  schemaRefs: [
    {
      schemaId: FIXTURE_IDS.schemaIdSource,
      type: 'local',
    },
    {
      schemaId: FIXTURE_IDS.schemaIdTarget,
      type: 'github',
      commitSha: 'abc1234',
    },
  ],
  tags: ['integration', 'fs-061', 'persistence'],
};

export const fixtureMappingConfig: MappingConfig = {
  id: FIXTURE_IDS.mappingId,
  projectId: FIXTURE_IDS.projectId,
  name: 'FS-061 Mapping Fixture',
  version: 1,
  engineVersion: '1.0.0',
  sourceSchemaRef: {
    schemaId: FIXTURE_IDS.schemaIdSource,
    type: 'local',
  },
  targetSchemaRef: {
    schemaId: FIXTURE_IDS.schemaIdTarget,
    type: 'local',
  },
  config: {
    unmappedTargets: 'omit',
    nullSubtrees: ['Order.Customer.Address'],
    constants: {
      sourceSystem: 'keyra-test',
      environment: 'integration',
    },
    externalSources: ['currency-rates'],
  },
  rules: [
    {
      target: 'Order.Id',
      type: 'string',
      expression: 'source("id")',
    },
    {
      target: 'Order.Total',
      type: 'number',
      expression: 'source("amount")',
    },
    {
      target: 'Order.Currency',
      type: 'string',
      expression: 'coalesce(source("currency"), static("USD"))',
    },
  ],
};

export const fixtureMappingInput: Omit<CreateMappingInput, 'configS3Key'> = {
  projectId: FIXTURE_IDS.projectId,
  name: 'FS-061 Mapping Fixture',
  sourceSchemaId: FIXTURE_IDS.schemaIdSource,
  targetSchemaId: FIXTURE_IDS.schemaIdTarget,
  status: 'ready',
  ruleCount: fixtureMappingConfig.rules.length,
  coverage: 80,
};

export const fixtureSchemaMetadataInput: CreateSchemaMetadataInput = {
  name: 'FS-061 Schema Metadata Fixture',
  format: 'json-schema',
  fieldCount: 12,
  origin: 'local',
  status: 'ready',
  scope: 'project',
  description: 'Fixture schema metadata used by FS-061 harness smoke tests',
  inferred: false,
  syncStatus: 'synced',
  source: {
    type: 'github',
    repo: 'org/keyra-fixtures',
    branch: 'main',
    path: '/schemas/fs-061-fixture.json',
    commitSha: 'deadbeef',
  },
};

export const fixtureSchemaContent = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    id: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string' },
  },
  required: ['id', 'amount'],
} as const;
