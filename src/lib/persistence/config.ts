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
  mappingRevisions: getEnvValueOrDefault('MAPPING_REVISIONS_TABLE', 'keyra-mapping-revisions'),
  mappingVersions: getEnvValueOrDefault('MAPPING_VERSIONS_TABLE', 'keyra-mapping-versions'),
  deployments: getEnvValueOrDefault('DEPLOYMENTS_TABLE', 'keyra-deployments'),
  deploymentCurrent: getEnvValueOrDefault('DEPLOYMENT_CURRENT_TABLE', 'keyra-deployment-current'),
} as const;

export const BUCKET_NAME = getEnvValueOrDefault('STORAGE_BUCKET', 'keyra-storage');

export function schemaOriginalKey(schemaId: string, ext: string): string {
  return `schemas/${schemaId}/original.${ext}`;
}

export function schemaContentKey(schemaId: string): string {
  return `schemas/${schemaId}/content.json`;
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

export function deploymentSnapshotKey(mappingId: string, environment: string, deployedAt: string): string {
  return `deployments/${mappingId}/${environment}/${deployedAt}.json`;
}

export function deploymentHistorySortKey(environment: string, deployedAt: string): string {
  return `${environment}#${deployedAt}`;
}

export function deploymentCurrentKey(mappingId: string, environment: string): string {
  return `${mappingId}#${environment}`;
}
