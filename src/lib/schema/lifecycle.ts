import {
  createSchemaVersion,
  getCurrentSchemaDraft,
  getLatestSchemaVersion,
  getSchemaDraftRevisionContent,
  getSchemaVersion,
  saveSchemaDraft,
  setSchemaDraftBasedOnVersion,
  updateSchemaVersionDerivedStatuses,
  type CreateSchemaVersionResult,
  type SaveSchemaDraftResult,
  type SchemaDraftItem,
  type SchemaVersionItem,
} from '../persistence/index.js';

import { computeStableJsonSha256 } from '../persistence/hash.js';
import {
  deriveSchemaNodeIdentitiesForVersion,
  extractSchemaIdentityPointersFromJsonSchema,
  loadSchemaNodeIdentitiesForVersion,
  saveSchemaNodeIdentitiesForVersion,
} from './identity.js';

export async function computeCanonicalSchemaContentHash(content: Record<string, unknown>): Promise<string> {
  return computeStableJsonSha256(content);
}

export interface SaveSchemaDraftServiceInput {
  readonly content: Record<string, unknown>;
  readonly expectedRevision?: number;
  readonly updatedBy: string;
}

export async function saveSchemaDraftRevision(
  schemaId: string,
  input: SaveSchemaDraftServiceInput,
): Promise<SaveSchemaDraftResult> {
  return saveSchemaDraft(schemaId, {
    content: input.content,
    expectedRevision: input.expectedRevision,
    updatedBy: input.updatedBy,
  });
}

export async function getActiveSchemaDraft(schemaId: string): Promise<SchemaDraftItem | null> {
  return getCurrentSchemaDraft(schemaId);
}

export async function createImmutableSchemaVersion(
  schemaId: string,
  input: {
    createdBy: string;
    expectedDraftRevision?: number;
    idempotencyKey?: string;
    changeSummary?: string;
  },
): Promise<CreateSchemaVersionResult> {
  const draft = await getCurrentSchemaDraft(schemaId);
  if (!draft) {
    throw new Error(`No active draft found for schema '${schemaId}'`);
  }

  if (input.expectedDraftRevision !== undefined && input.expectedDraftRevision !== draft.revision) {
    throw new Error(
      `Schema draft revision conflict for schema '${schemaId}': expected ${input.expectedDraftRevision}, actual ${draft.revision}`,
    );
  }

  const created = await createSchemaVersion(schemaId, draft, {
    createdBy: input.createdBy,
    expectedDraftRevision: input.expectedDraftRevision,
    idempotencyKey: input.idempotencyKey,
    changeSummary: input.changeSummary,
  });

  if (!created.noChange && created.item) {
    const draftContent = await getSchemaDraftRevisionContent(schemaId, draft.revision);
    if (!draftContent) {
      throw new Error(`Schema draft content missing for schema '${schemaId}' revision ${draft.revision}`);
    }

    const pointers = extractSchemaIdentityPointersFromJsonSchema(draftContent);

    let basedOnVersionIdentities: Awaited<ReturnType<typeof loadSchemaNodeIdentitiesForVersion>> | undefined;
    if (draft.basedOnVersion !== null) {
      const basedOn = await getSchemaVersion(schemaId, draft.basedOnVersion);
      if (basedOn) {
        basedOnVersionIdentities = await loadSchemaNodeIdentitiesForVersion(basedOn.schemaVersionId);
      }
    }

    const identities = deriveSchemaNodeIdentitiesForVersion(
      created.item.schemaVersionId,
      pointers,
      basedOnVersionIdentities,
    );

    await saveSchemaNodeIdentitiesForVersion(created.item.schemaVersionId, identities);
  }

  if (!created.noChange && created.item) {
    await setSchemaDraftBasedOnVersion(schemaId, created.item.version, input.createdBy);
  }

  return created;
}

export async function getLatestImmutableSchemaVersion(schemaId: string): Promise<SchemaVersionItem | null> {
  return getLatestSchemaVersion(schemaId);
}

export async function markSchemaVersionDerivedStatuses(input: {
  readonly schemaId: string;
  readonly version: number;
  readonly indexStatus?: SchemaVersionItem['indexStatus'];
  readonly impactStatus?: SchemaVersionItem['impactStatus'];
  readonly sampleValidationStatus?: SchemaVersionItem['sampleValidationStatus'];
}): Promise<SchemaVersionItem | null> {
  return updateSchemaVersionDerivedStatuses(input.schemaId, input.version, {
    indexStatus: input.indexStatus,
    impactStatus: input.impactStatus,
    sampleValidationStatus: input.sampleValidationStatus,
  });
}
