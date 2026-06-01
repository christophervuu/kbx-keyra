import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

const ORIGINAL_ENV = {
  PROJECTS_TABLE: getEnvStore().PROJECTS_TABLE,
  MAPPINGS_TABLE: getEnvStore().MAPPINGS_TABLE,
  SCHEMA_METADATA_TABLE: getEnvStore().SCHEMA_METADATA_TABLE,
  SCHEMA_NODES_TABLE: getEnvStore().SCHEMA_NODES_TABLE,
  MAPPING_REVISIONS_TABLE: getEnvStore().MAPPING_REVISIONS_TABLE,
  MAPPING_VERSIONS_TABLE: getEnvStore().MAPPING_VERSIONS_TABLE,
  STORAGE_BUCKET: getEnvStore().STORAGE_BUCKET,
};

function setEnvValue(key: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  const envStore = getEnvStore();

  if (value === undefined) {
    delete envStore[key];
    return;
  }

  envStore[key] = value;
}

async function importConfigModule() {
  return import('../../../src/lib/persistence/config.js');
}

describe('persistence config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    setEnvValue('PROJECTS_TABLE', ORIGINAL_ENV.PROJECTS_TABLE);
    setEnvValue('MAPPINGS_TABLE', ORIGINAL_ENV.MAPPINGS_TABLE);
    setEnvValue('SCHEMA_METADATA_TABLE', ORIGINAL_ENV.SCHEMA_METADATA_TABLE);
    setEnvValue('SCHEMA_NODES_TABLE', ORIGINAL_ENV.SCHEMA_NODES_TABLE);
    setEnvValue('MAPPING_REVISIONS_TABLE', ORIGINAL_ENV.MAPPING_REVISIONS_TABLE);
    setEnvValue('MAPPING_VERSIONS_TABLE', ORIGINAL_ENV.MAPPING_VERSIONS_TABLE);
    setEnvValue('STORAGE_BUCKET', ORIGINAL_ENV.STORAGE_BUCKET);
  });

  it('builds S3 keys using expected patterns', async () => {
    const config = await importConfigModule();

    expect(config.schemaOriginalKey('schema-1', 'xsd')).toBe('schemas/schema-1/original.xsd');
    expect(config.schemaContentKey('schema-1')).toBe('schemas/schema-1/content.json');
    expect(config.mappingConfigKey('mapping-1')).toBe('mappings/mapping-1/config.json');
    expect(config.mappingVersionKey('mapping-1', 12)).toBe('mappings/mapping-1/versions/v12.json');
    expect(config.mappingRevisionKey('mapping-1', 12)).toBe('mappings/mapping-1/revisions/r12.json');
  });

  it('uses defaults when table and bucket env vars are unset', async () => {
    setEnvValue('PROJECTS_TABLE', undefined);
    setEnvValue('MAPPINGS_TABLE', undefined);
    setEnvValue('SCHEMA_METADATA_TABLE', undefined);
    setEnvValue('SCHEMA_NODES_TABLE', undefined);
    setEnvValue('MAPPING_REVISIONS_TABLE', undefined);
    setEnvValue('MAPPING_VERSIONS_TABLE', undefined);
    setEnvValue('STORAGE_BUCKET', undefined);
    vi.resetModules();

    const config = await importConfigModule();

    expect(config.TABLE_NAMES).toEqual({
      projects: 'keyra-projects',
      mappings: 'keyra-mappings',
      schemaMetadata: 'keyra-schema-metadata',
      schemaNodes: 'keyra-schema-nodes',
      mappingRevisions: 'keyra-mapping-revisions',
      mappingVersions: 'keyra-mapping-versions',
    });
    expect(config.BUCKET_NAME).toBe('keyra-storage');
  });

  it('uses env overrides when provided', async () => {
    setEnvValue('PROJECTS_TABLE', 'projects-dev');
    setEnvValue('MAPPINGS_TABLE', 'mappings-dev');
    setEnvValue('SCHEMA_METADATA_TABLE', 'schema-metadata-dev');
    setEnvValue('SCHEMA_NODES_TABLE', 'schema-nodes-dev');
    setEnvValue('MAPPING_REVISIONS_TABLE', 'mapping-revisions-dev');
    setEnvValue('MAPPING_VERSIONS_TABLE', 'mapping-versions-dev');
    setEnvValue('STORAGE_BUCKET', 'storage-dev');
    vi.resetModules();

    const config = await importConfigModule();

    expect(config.TABLE_NAMES).toEqual({
      projects: 'projects-dev',
      mappings: 'mappings-dev',
      schemaMetadata: 'schema-metadata-dev',
      schemaNodes: 'schema-nodes-dev',
      mappingRevisions: 'mapping-revisions-dev',
      mappingVersions: 'mapping-versions-dev',
    });
    expect(config.BUCKET_NAME).toBe('storage-dev');
  });
});
