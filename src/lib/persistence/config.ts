type EnvStore = Record<string, string | undefined>;

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: EnvStore } }).process?.env;
  return env?.[key];
}

function getEnvValueOrDefault(key: string, fallback: string): string {
  const value = getEnvValue(key)?.trim();
  return value && value.length > 0 ? value : fallback;
}

export const TABLE_NAMES = {
  projects: getEnvValueOrDefault('PROJECTS_TABLE', 'keyra-projects'),
  mappings: getEnvValueOrDefault('MAPPINGS_TABLE', 'keyra-mappings'),
  schemaMetadata: getEnvValueOrDefault('SCHEMA_METADATA_TABLE', 'keyra-schema-metadata'),
  schemaNodes: getEnvValueOrDefault('SCHEMA_NODES_TABLE', 'keyra-schema-nodes'),
  schemaDrafts: getEnvValueOrDefault('SCHEMA_DRAFTS_TABLE', 'keyra-schema-drafts'),
  schemaVersions: getEnvValueOrDefault('SCHEMA_VERSIONS_TABLE', 'keyra-schema-versions'),
  mappingRevisions: getEnvValueOrDefault('MAPPING_REVISIONS_TABLE', 'keyra-mapping-revisions'),
  mappingVersions: getEnvValueOrDefault('MAPPING_VERSIONS_TABLE', 'keyra-mapping-versions'),
  valueTables: getEnvValueOrDefault('VALUE_TABLES_TABLE', 'keyra-value-tables'),
  valueTableRevisions: getEnvValueOrDefault('VALUE_TABLE_REVISIONS_TABLE', 'keyra-value-table-revisions'),
  deployments: getEnvValueOrDefault('DEPLOYMENTS_TABLE', 'keyra-deployments'),
  deploymentCurrent: getEnvValueOrDefault('DEPLOYMENT_CURRENT_TABLE', 'keyra-deployment-current'),
  deploymentOrchestrations: getEnvValueOrDefault('DEPLOYMENT_ORCHESTRATIONS_TABLE', 'keyra-deployment-orchestrations'),
  autoMap: getEnvValueOrDefault('AUTO_MAP_TABLE', 'keyra-auto-map'),
} as const;

export const RUNTIME_TABLE_NAMES = {
  activeSnapshots: getEnvValueOrDefault('ACTIVE_SNAPSHOTS_TABLE', 'keyra-active-snapshots'),
  deploymentHistory: getEnvValueOrDefault('DEPLOYMENT_HISTORY_TABLE', 'keyra-deployment-history'),
} as const;

export const BUCKET_NAME = getEnvValueOrDefault('STORAGE_BUCKET', 'keyra-storage');
export const RUNTIME_BUCKET_NAME = getEnvValueOrDefault(
  'RUNTIME_ARTIFACTS_BUCKET',
  getEnvValueOrDefault('STORAGE_BUCKET', 'keyra-storage'),
);
export const SNAPSHOTS_PREFIX = getEnvValueOrDefault('SNAPSHOTS_PREFIX', 'runtime/snapshots/');
export const SCHEMAS_PREFIX = getEnvValueOrDefault('SCHEMAS_PREFIX', 'runtime/schemas/');

export function schemaOriginalKey(schemaId: string, ext: string): string {
  return `schemas/${schemaId}/original.${ext}`;
}

export function schemaContentKey(schemaId: string): string {
  return `schemas/${schemaId}/content.json`;
}

export function schemaDraftRevisionContentKey(schemaId: string, revision: number): string {
  return `schemas/${schemaId}/drafts/r${revision}.json`;
}

export function schemaVersionContentKey(schemaId: string, version: number): string {
  return `schemas/${schemaId}/versions/v${version}.json`;
}

export function mappingConfigKey(mappingId: string): string {
  return `mappings/${mappingId}/config.json`;
}

export function mappingVersionKey(mappingId: string, version: number): string {
  return `mappings/${mappingId}/versions/v${version}.json`;
}

export function mappingRevisionKey(mappingId: string, revision: number): string {
  return `mappings/${mappingId}/revisions/r${revision}.json`;
}

export function valueTableRevisionRowsKey(valueTableId: string, revision: number): string {
  return `value-tables/${valueTableId}/revisions/r${revision}.json`;
}

export function deploymentSnapshotKey(mappingId: string, environment: string, deployedAt: string): string {
  return `deployments/${mappingId}/${environment}/${deployedAt}.json`;
}

export function deploymentHistorySortKey(environment: string, deployedAt: string): string {
  return `${environment}#${deployedAt}`;
}

export function deploymentCurrentKey(mappingId: string, environment: string): string {
  return `${mappingId}#${environment}`;
}

function normalizePrefix(prefix: string): string {
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

export function runtimeSnapshotKey(mappingId: string, snapshotId: string, prefix: string = SNAPSHOTS_PREFIX): string {
  return `${normalizePrefix(prefix)}${mappingId}/${snapshotId}.json`;
}

export function runtimeSchemaPayloadKey(
  mappingId: string,
  snapshotId: string,
  schemaRole: string,
  schemaId: string,
  prefix: string = SCHEMAS_PREFIX,
): string {
  return `${normalizePrefix(prefix)}${mappingId}/${snapshotId}/${schemaRole}-${schemaId}.json`;
}

export function autoMapSessionPk(sessionId: string): string {
  return `SESSION#${sessionId}`;
}

export function autoMapSessionMetaSk(): 'META' {
  return 'META';
}

export function autoMapRunSk(createdAt: string, runId: string): string {
  return `RUN#${createdAt}#${runId}`;
}

export function autoMapWorkUnitSk(runId: string, order: number, workUnitId: string): string {
  if (!Number.isInteger(order) || order < 0) {
    throw new Error(`order must be a non-negative integer. Received: ${order}`);
  }

  return `WORK_UNIT#${runId}#${String(order).padStart(6, '0')}#${workUnitId}`;
}

export function autoMapSuggestionSk(sectionOrder: number, targetOrder: number, suggestionId: string): string {
  if (!Number.isInteger(sectionOrder) || sectionOrder < 0) {
    throw new Error(`sectionOrder must be a non-negative integer. Received: ${sectionOrder}`);
  }

  if (!Number.isInteger(targetOrder) || targetOrder < 0) {
    throw new Error(`targetOrder must be a non-negative integer. Received: ${targetOrder}`);
  }

  return `SUGGESTION#${String(sectionOrder).padStart(6, '0')}#${String(targetOrder).padStart(6, '0')}#${suggestionId}`;
}

export function autoMapHistoryGsiPk(mappingId: string): string {
  return `MAPPING#${mappingId}`;
}

export function autoMapHistoryGsiSk(createdAt: string, sessionId: string): string {
  return `CREATED#${createdAt}#${sessionId}`;
}

export function autoMapOpenGsiPk(mappingId: string): string {
  return `MAPPING#${mappingId}`;
}

export function autoMapOpenGsiSk(updatedAt: string, sessionId: string): string {
  return `OPEN#${updatedAt}#${sessionId}`;
}
