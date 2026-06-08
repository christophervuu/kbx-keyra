import { getItem } from '../shared/index.js';
import {
  normalizeSchemaOrigin,
  type DeploymentCdmSchemaTraceabilityEntry,
  type SchemaOrigin,
} from '../../lib/persistence/types.js';

type SchemaReferenceRole = 'source' | 'target';

export type CdmDeployBlockReason =
  | 'unsynced'
  | 'update-failed'
  | 'metadata-incomplete'
  | 'ingest-not-ready'
  | 'schema-missing';

export type CdmDeployRemediationKey =
  | 're-sync-schema'
  | 'retry-sync'
  | 'relink-cdm-schema'
  | 'complete-ingestion';

export interface CdmDeployBlockIssue {
  readonly schemaId: string;
  readonly schemaName?: string;
  readonly referenceRole: SchemaReferenceRole;
  readonly reason: CdmDeployBlockReason;
  readonly remediationKey: CdmDeployRemediationKey;
}

export interface CdmDeployGuardResult {
  readonly blocked: boolean;
  readonly issues: readonly CdmDeployBlockIssue[];
  readonly cdmTraceability: readonly DeploymentCdmSchemaTraceabilityEntry[];
}

interface MappingSchemaRefs {
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
}

type SchemaSyncStatus = 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';
type SchemaIngestStatus = 'ingesting' | 'ready' | 'error';

interface SchemaMetadataRecord {
  readonly schemaId: string;
  readonly name?: string;
  readonly origin: SchemaOrigin | string;
  readonly status: SchemaIngestStatus;
  readonly syncStatus?: SchemaSyncStatus;
  readonly source?: {
    readonly type?: 'github' | 'upload';
    readonly repo?: string;
    readonly path?: string;
    readonly commitSha?: string;
  };
}

interface SchemaReference {
  readonly schemaId: string;
  readonly referenceRole: SchemaReferenceRole;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function getSchemasTableOrThrow(): string {
  const table = getEnvValue('SCHEMAS_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
  }

  return table;
}

function toSchemaReferences(mapping: MappingSchemaRefs): readonly SchemaReference[] {
  const refs: SchemaReference[] = [];

  if (typeof mapping.sourceSchemaId === 'string' && mapping.sourceSchemaId.trim() !== '') {
    refs.push({ schemaId: mapping.sourceSchemaId, referenceRole: 'source' });
  }

  if (typeof mapping.targetSchemaId === 'string' && mapping.targetSchemaId.trim() !== '') {
    refs.push({ schemaId: mapping.targetSchemaId, referenceRole: 'target' });
  }

  return refs;
}

function hasCompleteCdmSourceMetadata(schema: SchemaMetadataRecord): boolean {
  if (schema.source?.type !== 'github') {
    return false;
  }

  const repo = schema.source.repo?.trim();
  const path = schema.source.path?.trim();
  const commitSha = schema.source.commitSha?.trim();

  return Boolean(repo && path && commitSha);
}

function remediationForReason(reason: CdmDeployBlockReason): CdmDeployRemediationKey {
  switch (reason) {
    case 'unsynced':
      return 're-sync-schema';
    case 'update-failed':
      return 'retry-sync';
    case 'metadata-incomplete':
      return 'relink-cdm-schema';
    case 'ingest-not-ready':
      return 'complete-ingestion';
    case 'schema-missing':
      return 'relink-cdm-schema';
  }
}

function evaluateCdmSchema(schema: SchemaMetadataRecord): CdmDeployBlockReason | null {
  if (schema.status !== 'ready') {
    return 'ingest-not-ready';
  }

  if (!hasCompleteCdmSourceMetadata(schema)) {
    return 'metadata-incomplete';
  }

  if (schema.syncStatus === 'sync-failed') {
    return 'update-failed';
  }

  if (schema.syncStatus !== 'synced') {
    return 'unsynced';
  }

  return null;
}

export async function validateCdmDeployGuard(mapping: MappingSchemaRefs): Promise<CdmDeployGuardResult> {
  const refs = toSchemaReferences(mapping);
  if (refs.length === 0) {
    return { blocked: false, issues: [], cdmTraceability: [] };
  }

  const issues: CdmDeployBlockIssue[] = [];
  const cdmTraceability: DeploymentCdmSchemaTraceabilityEntry[] = [];
  const schemaTable = getSchemasTableOrThrow();

  for (const ref of refs) {
    const schema = await getItem<SchemaMetadataRecord>({
      TableName: schemaTable,
      Key: { schemaId: ref.schemaId },
    });

    if (!schema) {
      issues.push({
        schemaId: ref.schemaId,
        referenceRole: ref.referenceRole,
        reason: 'schema-missing',
        remediationKey: remediationForReason('schema-missing'),
      });
      continue;
    }

    if (normalizeSchemaOrigin(schema.origin) !== 'cdm') {
      continue;
    }

    const reason = evaluateCdmSchema(schema);
    if (!reason) {
      cdmTraceability.push({
        schemaId: schema.schemaId,
        schemaName: schema.name,
        referenceRole: ref.referenceRole,
        repo: schema.source?.repo ?? '',
        path: schema.source?.path ?? '',
        commitSha: schema.source?.commitSha ?? '',
      });
      continue;
    }

    issues.push({
      schemaId: schema.schemaId,
      schemaName: schema.name,
      referenceRole: ref.referenceRole,
      reason,
      remediationKey: remediationForReason(reason),
    });
  }

  return {
    blocked: issues.length > 0,
    issues,
    cdmTraceability,
  };
}
