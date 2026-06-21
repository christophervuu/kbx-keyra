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
  VALUE_TABLES_TABLE: getEnvStore().VALUE_TABLES_TABLE,
  VALUE_TABLE_REVISIONS_TABLE: getEnvStore().VALUE_TABLE_REVISIONS_TABLE,
  DEPLOYMENTS_TABLE: getEnvStore().DEPLOYMENTS_TABLE,
  DEPLOYMENT_CURRENT_TABLE: getEnvStore().DEPLOYMENT_CURRENT_TABLE,
  DEPLOYMENT_ORCHESTRATIONS_TABLE: getEnvStore().DEPLOYMENT_ORCHESTRATIONS_TABLE,
  ACTIVE_SNAPSHOTS_TABLE: getEnvStore().ACTIVE_SNAPSHOTS_TABLE,
  DEPLOYMENT_HISTORY_TABLE: getEnvStore().DEPLOYMENT_HISTORY_TABLE,
  STORAGE_BUCKET: getEnvStore().STORAGE_BUCKET,
  RUNTIME_ARTIFACTS_BUCKET: getEnvStore().RUNTIME_ARTIFACTS_BUCKET,
  SNAPSHOTS_PREFIX: getEnvStore().SNAPSHOTS_PREFIX,
  SCHEMAS_PREFIX: getEnvStore().SCHEMAS_PREFIX,
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
    setEnvValue('VALUE_TABLES_TABLE', ORIGINAL_ENV.VALUE_TABLES_TABLE);
    setEnvValue('VALUE_TABLE_REVISIONS_TABLE', ORIGINAL_ENV.VALUE_TABLE_REVISIONS_TABLE);
    setEnvValue('DEPLOYMENTS_TABLE', ORIGINAL_ENV.DEPLOYMENTS_TABLE);
    setEnvValue('DEPLOYMENT_CURRENT_TABLE', ORIGINAL_ENV.DEPLOYMENT_CURRENT_TABLE);
    setEnvValue('DEPLOYMENT_ORCHESTRATIONS_TABLE', ORIGINAL_ENV.DEPLOYMENT_ORCHESTRATIONS_TABLE);
    setEnvValue('ACTIVE_SNAPSHOTS_TABLE', ORIGINAL_ENV.ACTIVE_SNAPSHOTS_TABLE);
    setEnvValue('DEPLOYMENT_HISTORY_TABLE', ORIGINAL_ENV.DEPLOYMENT_HISTORY_TABLE);
    setEnvValue('STORAGE_BUCKET', ORIGINAL_ENV.STORAGE_BUCKET);
    setEnvValue('RUNTIME_ARTIFACTS_BUCKET', ORIGINAL_ENV.RUNTIME_ARTIFACTS_BUCKET);
    setEnvValue('SNAPSHOTS_PREFIX', ORIGINAL_ENV.SNAPSHOTS_PREFIX);
    setEnvValue('SCHEMAS_PREFIX', ORIGINAL_ENV.SCHEMAS_PREFIX);
  });

  it('builds S3 keys using expected patterns', async () => {
    const config = await importConfigModule();

    expect(config.schemaOriginalKey('schema-1', 'xsd')).toBe('schemas/schema-1/original.xsd');
    expect(config.schemaContentKey('schema-1')).toBe('schemas/schema-1/content.json');
    expect(config.mappingConfigKey('mapping-1')).toBe('mappings/mapping-1/config.json');
    expect(config.mappingVersionKey('mapping-1', 12)).toBe('mappings/mapping-1/versions/v12.json');
    expect(config.mappingRevisionKey('mapping-1', 12)).toBe('mappings/mapping-1/revisions/r12.json');
    expect(config.valueTableRevisionRowsKey('vt-1', 3)).toBe('value-tables/vt-1/revisions/r3.json');
    expect(config.deploymentSnapshotKey('mapping-1', 'DEV', '2026-06-01T00:00:00.000Z')).toBe(
      'deployments/mapping-1/DEV/2026-06-01T00:00:00.000Z.json',
    );
    expect(config.deploymentHistorySortKey('PREPROD', '2026-06-01T00:00:00.000Z')).toBe('PREPROD#2026-06-01T00:00:00.000Z');
    expect(config.deploymentCurrentKey('mapping-1', 'PROD')).toBe('mapping-1#PROD');
    expect(config.runtimeSnapshotKey('mapping-1', 'snapshot-1')).toBe('runtime/snapshots/mapping-1/snapshot-1.json');
    expect(config.runtimeSchemaPayloadKey('mapping-1', 'snapshot-1', 'source', 'schema-1')).toBe(
      'runtime/schemas/mapping-1/snapshot-1/source-schema-1.json',
    );
  });

  it('uses defaults when table and bucket env vars are unset', async () => {
    setEnvValue('PROJECTS_TABLE', undefined);
    setEnvValue('MAPPINGS_TABLE', undefined);
    setEnvValue('SCHEMA_METADATA_TABLE', undefined);
    setEnvValue('SCHEMA_NODES_TABLE', undefined);
    setEnvValue('MAPPING_REVISIONS_TABLE', undefined);
    setEnvValue('MAPPING_VERSIONS_TABLE', undefined);
    setEnvValue('VALUE_TABLES_TABLE', undefined);
    setEnvValue('VALUE_TABLE_REVISIONS_TABLE', undefined);
    setEnvValue('DEPLOYMENTS_TABLE', undefined);
    setEnvValue('DEPLOYMENT_CURRENT_TABLE', undefined);
    setEnvValue('DEPLOYMENT_ORCHESTRATIONS_TABLE', undefined);
    setEnvValue('ACTIVE_SNAPSHOTS_TABLE', undefined);
    setEnvValue('DEPLOYMENT_HISTORY_TABLE', undefined);
    setEnvValue('STORAGE_BUCKET', undefined);
    setEnvValue('RUNTIME_ARTIFACTS_BUCKET', undefined);
    setEnvValue('SNAPSHOTS_PREFIX', undefined);
    setEnvValue('SCHEMAS_PREFIX', undefined);
    vi.resetModules();

    const config = await importConfigModule();

    expect(config.TABLE_NAMES).toEqual({
      projects: 'keyra-projects',
      mappings: 'keyra-mappings',
      schemaMetadata: 'keyra-schema-metadata',
      schemaNodes: 'keyra-schema-nodes',
      mappingRevisions: 'keyra-mapping-revisions',
      mappingVersions: 'keyra-mapping-versions',
      valueTables: 'keyra-value-tables',
      valueTableRevisions: 'keyra-value-table-revisions',
      deployments: 'keyra-deployments',
      deploymentCurrent: 'keyra-deployment-current',
      deploymentOrchestrations: 'keyra-deployment-orchestrations',
    });
    expect(config.RUNTIME_TABLE_NAMES).toEqual({
      activeSnapshots: 'keyra-active-snapshots',
      deploymentHistory: 'keyra-deployment-history',
    });
    expect(config.BUCKET_NAME).toBe('keyra-storage');
    expect(config.RUNTIME_BUCKET_NAME).toBe('keyra-storage');
    expect(config.SNAPSHOTS_PREFIX).toBe('runtime/snapshots/');
    expect(config.SCHEMAS_PREFIX).toBe('runtime/schemas/');
  });

  it('uses env overrides when provided', async () => {
    setEnvValue('PROJECTS_TABLE', 'projects-dev');
    setEnvValue('MAPPINGS_TABLE', 'mappings-dev');
    setEnvValue('SCHEMA_METADATA_TABLE', 'schema-metadata-dev');
    setEnvValue('SCHEMA_NODES_TABLE', 'schema-nodes-dev');
    setEnvValue('MAPPING_REVISIONS_TABLE', 'mapping-revisions-dev');
    setEnvValue('MAPPING_VERSIONS_TABLE', 'mapping-versions-dev');
    setEnvValue('VALUE_TABLES_TABLE', 'value-tables-dev');
    setEnvValue('VALUE_TABLE_REVISIONS_TABLE', 'value-table-revisions-dev');
    setEnvValue('DEPLOYMENTS_TABLE', 'deployments-dev');
    setEnvValue('DEPLOYMENT_CURRENT_TABLE', 'deployment-current-dev');
    setEnvValue('DEPLOYMENT_ORCHESTRATIONS_TABLE', 'deployment-orchestrations-dev');
    setEnvValue('ACTIVE_SNAPSHOTS_TABLE', 'active-snapshots-dev');
    setEnvValue('DEPLOYMENT_HISTORY_TABLE', 'deployment-history-dev');
    setEnvValue('STORAGE_BUCKET', 'storage-dev');
    setEnvValue('RUNTIME_ARTIFACTS_BUCKET', 'runtime-storage-dev');
    setEnvValue('SNAPSHOTS_PREFIX', 'snapshots/dev/');
    setEnvValue('SCHEMAS_PREFIX', 'schemas/dev/');
    vi.resetModules();

    const config = await importConfigModule();

    expect(config.TABLE_NAMES).toEqual({
      projects: 'projects-dev',
      mappings: 'mappings-dev',
      schemaMetadata: 'schema-metadata-dev',
      schemaNodes: 'schema-nodes-dev',
      mappingRevisions: 'mapping-revisions-dev',
      mappingVersions: 'mapping-versions-dev',
      valueTables: 'value-tables-dev',
      valueTableRevisions: 'value-table-revisions-dev',
      deployments: 'deployments-dev',
      deploymentCurrent: 'deployment-current-dev',
      deploymentOrchestrations: 'deployment-orchestrations-dev',
    });
    expect(config.RUNTIME_TABLE_NAMES).toEqual({
      activeSnapshots: 'active-snapshots-dev',
      deploymentHistory: 'deployment-history-dev',
    });
    expect(config.BUCKET_NAME).toBe('storage-dev');
    expect(config.RUNTIME_BUCKET_NAME).toBe('runtime-storage-dev');
    expect(config.SNAPSHOTS_PREFIX).toBe('snapshots/dev/');
    expect(config.SCHEMAS_PREFIX).toBe('schemas/dev/');
  });
});
