import type { SchemaMetadataItem } from '../../persistence/types.js';

export const CDM_MANIFEST_VERSION = '2026-06-08.1';

export interface CdmManifestEntry {
  readonly schemaId: string;
  readonly name: string;
  readonly format: 'json-schema' | 'xsd';
  readonly fieldCount: number;
  readonly sourcePath: string;
  readonly sourceKind: 'json_schema' | 'xsd';
}

const CANONICAL_REPO = 'KBXT/KBX-Canonicals';
const CANONICAL_BRANCH = 'main';
const CANONICAL_REPO_ID = 1052821334;
const CANONICAL_SYNC_STATUS = 'synced' as const;
const CREATED_AT = '2026-06-08T00:00:00.000Z';

export const CDM_MANIFEST: readonly CdmManifestEntry[] = [
  {
    schemaId: 'cdm-shipment-order-xsd-v1',
    name: 'ShipmentOrder',
    format: 'xsd',
    fieldCount: 1284,
    sourcePath: 'XSD/CommonDataModels/ShipmentOrder.xsd',
    sourceKind: 'xsd',
  },
  {
    schemaId: 'cdm-invoice-json-v1',
    name: 'Invoice',
    format: 'json-schema',
    fieldCount: 412,
    sourcePath: 'JSONSchemas/CommonDataModels/Invoice.json',
    sourceKind: 'json_schema',
  },
] as const;

export function buildCdmManifestMetadataItems(): readonly SchemaMetadataItem[] {
  return CDM_MANIFEST.map((entry) => ({
    schemaId: entry.schemaId,
    name: entry.name,
    format: entry.format,
    fieldCount: entry.fieldCount,
    origin: 'cdm',
    ownership: 'cdm',
    readonly: true,
    sourceKind: entry.sourceKind,
    status: 'ready',
    inferred: false,
    syncStatus: CANONICAL_SYNC_STATUS,
    source: {
      type: 'github',
      repo: CANONICAL_REPO,
      repoId: CANONICAL_REPO_ID,
      branch: CANONICAL_BRANCH,
      path: entry.sourcePath,
    },
    sourceRepoId: CANONICAL_REPO_ID,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }));
}
