import {
  batchWriteSchemaNodeIdentities,
  listSchemaNodeIdentities,
  type SchemaIdentityNodePointer,
  type SchemaNodeIdentity,
} from '../persistence/index.js';

function parentPointer(pointer: string): string | undefined {
  if (pointer === '') {
    return undefined;
  }

  const lastSlash = pointer.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '';
  }

  return pointer.slice(0, lastSlash);
}

function encodePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function decodePointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function pointerToSegments(pointer: string): string[] {
  if (pointer === '') {
    return [];
  }

  return pointer
    .split('/')
    .slice(1)
    .map((segment) => decodePointerSegment(segment));
}

function segmentsToPointer(segments: readonly string[]): string {
  if (segments.length === 0) {
    return '';
  }

  return `/${segments.map((segment) => encodePointerSegment(segment)).join('/')}`;
}

function pointerName(pointer: string): string {
  if (pointer === '') {
    return '';
  }

  const segments = pointerToSegments(pointer);
  return segments[segments.length - 1] ?? '';
}

function pointerDepth(pointer: string): number {
  return pointerToSegments(pointer).length;
}

function isDescendant(pointer: string, ancestor: string): boolean {
  if (ancestor === '') {
    return pointer !== '';
  }

  return pointer.startsWith(`${ancestor}/`);
}

function deterministicFieldId(pointer: string): string {
  void pointer;
  return `fid_${crypto.randomUUID()}`;
}

function replacePointerPrefix(pointer: string, fromPrefix: string, toPrefix: string): string {
  if (fromPrefix === '') {
    if (pointer === '') {
      return toPrefix;
    }

    return `${toPrefix}${pointer}`;
  }

  if (pointer === fromPrefix) {
    return toPrefix;
  }

  if (!pointer.startsWith(`${fromPrefix}/`)) {
    return pointer;
  }

  return `${toPrefix}${pointer.slice(fromPrefix.length)}`;
}

function copyIdentityWithPointer(
  identity: SchemaNodeIdentity,
  schemaVersionId: string,
  jsonPointer: string,
): SchemaNodeIdentity {
  return {
    ...identity,
    schemaVersionId,
    jsonPointer,
  };
}

function buildParentFieldIdLookup(identities: readonly SchemaNodeIdentity[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const identity of identities) {
    lookup.set(identity.jsonPointer, identity.fieldId);
  }
  return lookup;
}

function withRecomputedParents(
  identities: readonly SchemaNodeIdentity[],
  schemaVersionId: string,
): SchemaNodeIdentity[] {
  const byPointer = buildParentFieldIdLookup(identities);
  return identities.map((identity) => {
    const parent = parentPointer(identity.jsonPointer);
    const parentFieldId = parent !== undefined ? byPointer.get(parent) : undefined;
    return {
      schemaVersionId,
      fieldId: identity.fieldId,
      jsonPointer: identity.jsonPointer,
      ...(parentFieldId ? { parentFieldId } : {}),
    };
  });
}

function sortPointersStable(pointers: readonly string[]): string[] {
  return [...pointers].sort((a, b) => {
    const depthDelta = pointerDepth(a) - pointerDepth(b);
    if (depthDelta !== 0) {
      return depthDelta;
    }

    return a.localeCompare(b);
  });
}

export function assignInitialSchemaNodeIdentities(
  schemaVersionId: string,
  pointers: readonly SchemaIdentityNodePointer[],
): SchemaNodeIdentity[] {
  const sorted = sortPointersStable(pointers.map((entry) => entry.jsonPointer));
  const byPointer = new Map<string, SchemaNodeIdentity>();

  for (const pointer of sorted) {
    const parent = parentPointer(pointer);
    const parentFieldId = parent !== undefined ? byPointer.get(parent)?.fieldId : undefined;
    const identity: SchemaNodeIdentity = {
      schemaVersionId,
      fieldId: deterministicFieldId(pointer),
      jsonPointer: pointer,
      ...(parentFieldId ? { parentFieldId } : {}),
    };
    byPointer.set(pointer, identity);
  }

  return sorted
    .map((pointer) => byPointer.get(pointer))
    .filter((identity): identity is SchemaNodeIdentity => identity !== undefined);
}

export function preserveIdentityForRename(
  schemaVersionId: string,
  current: readonly SchemaNodeIdentity[],
  input: {
    readonly fromPointer: string;
    readonly toPointer: string;
  },
): SchemaNodeIdentity[] {
  const transformed = current.map((identity) => {
    const nextPointer = replacePointerPrefix(identity.jsonPointer, input.fromPointer, input.toPointer);
    return copyIdentityWithPointer(identity, schemaVersionId, nextPointer);
  });

  return withRecomputedParents(transformed, schemaVersionId);
}

export function preserveIdentityForMove(
  schemaVersionId: string,
  current: readonly SchemaNodeIdentity[],
  input: {
    readonly fromPointer: string;
    readonly toParentPointer: string;
    readonly toName?: string;
  },
): SchemaNodeIdentity[] {
  const baseName = input.toName ?? pointerName(input.fromPointer);
  const destinationRoot = segmentsToPointer([
    ...pointerToSegments(input.toParentPointer),
    baseName,
  ]);

  return preserveIdentityForRename(schemaVersionId, current, {
    fromPointer: input.fromPointer,
    toPointer: destinationRoot,
  });
}

export function duplicateSubtreeWithNewIdentities(
  schemaVersionId: string,
  current: readonly SchemaNodeIdentity[],
  input: {
    readonly sourcePointer: string;
    readonly destinationParentPointer: string;
    readonly destinationName: string;
  },
): SchemaNodeIdentity[] {
  const destinationRoot = segmentsToPointer([
    ...pointerToSegments(input.destinationParentPointer),
    input.destinationName,
  ]);

  const sourceSubtree = sortPointersStable(
    current
      .filter((identity) => identity.jsonPointer === input.sourcePointer || isDescendant(identity.jsonPointer, input.sourcePointer))
      .map((identity) => identity.jsonPointer),
  );

  const added: SchemaNodeIdentity[] = [];
  for (const sourcePointer of sourceSubtree) {
    const destinationPointer = replacePointerPrefix(sourcePointer, input.sourcePointer, destinationRoot);
    const parent = parentPointer(destinationPointer);
    const parentFieldId = parent ? [...added, ...current].find((identity) => identity.jsonPointer === parent)?.fieldId : undefined;
    added.push({
      schemaVersionId,
      fieldId: deterministicFieldId(`${destinationPointer}#dup`),
      jsonPointer: destinationPointer,
      ...(parentFieldId ? { parentFieldId } : {}),
    });
  }

  return withRecomputedParents([...current.map((identity) => ({ ...identity, schemaVersionId })), ...added], schemaVersionId);
}

export function deleteAndReaddWithNewIdentity(
  schemaVersionId: string,
  current: readonly SchemaNodeIdentity[],
  pointer: string,
): SchemaNodeIdentity[] {
  const removed = current.filter((identity) => identity.jsonPointer !== pointer && !isDescendant(identity.jsonPointer, pointer));
  const parent = parentPointer(pointer);
  const parentFieldId = parent ? removed.find((identity) => identity.jsonPointer === parent)?.fieldId : undefined;

  const readded: SchemaNodeIdentity = {
    schemaVersionId,
    fieldId: deterministicFieldId(`${pointer}#readd`),
    jsonPointer: pointer,
    ...(parentFieldId ? { parentFieldId } : {}),
  };

  return withRecomputedParents([...removed.map((identity) => ({ ...identity, schemaVersionId })), readded], schemaVersionId);
}

export function restoreIdentitiesFromVersion(
  schemaVersionId: string,
  restoredFromVersion: readonly SchemaNodeIdentity[],
): SchemaNodeIdentity[] {
  return withRecomputedParents(
    restoredFromVersion.map((identity) => ({
      ...identity,
      schemaVersionId,
    })),
    schemaVersionId,
  );
}

export async function saveSchemaNodeIdentitiesForVersion(
  schemaVersionId: string,
  identities: readonly SchemaNodeIdentity[],
): Promise<void> {
  await batchWriteSchemaNodeIdentities(schemaVersionId, identities);
}

export async function loadSchemaNodeIdentitiesForVersion(
  schemaVersionId: string,
): Promise<SchemaNodeIdentity[]> {
  return listSchemaNodeIdentities(schemaVersionId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface JsonPointerNode {
  readonly pointer: string;
  readonly parentPointer?: string;
}

function collectJsonSchemaPointers(
  schema: unknown,
  pointer: string,
  parentPointer: string | undefined,
  out: JsonPointerNode[],
): void {
  if (!isRecord(schema)) {
    return;
  }

  out.push({ pointer, parentPointer });

  const properties = schema.properties;
  if (isRecord(properties)) {
    for (const [name, child] of Object.entries(properties)) {
      const childPointer = `${pointer}/properties/${encodePointerSegment(name)}`;
      collectJsonSchemaPointers(child, childPointer, pointer, out);
    }
  }

  const items = schema.items;
  if (isRecord(items)) {
    const itemsPointer = `${pointer}/items`;
    collectJsonSchemaPointers(items, itemsPointer, pointer, out);
  }
}

export function extractSchemaIdentityPointersFromJsonSchema(content: unknown): SchemaIdentityNodePointer[] {
  const collected: JsonPointerNode[] = [];
  collectJsonSchemaPointers(content, '', undefined, collected);

  return sortPointersStable(collected.map((entry) => entry.pointer)).map((jsonPointer) => {
    const parentJsonPointer = parentPointer(jsonPointer);
    return {
      jsonPointer,
      ...(parentJsonPointer !== undefined ? { parentJsonPointer } : {}),
    };
  });
}

export function deriveSchemaNodeIdentitiesForVersion(
  schemaVersionId: string,
  pointers: readonly SchemaIdentityNodePointer[],
  basedOnVersionIdentities?: readonly SchemaNodeIdentity[],
): SchemaNodeIdentity[] {
  const priorByPointer = new Map<string, SchemaNodeIdentity>();
  for (const identity of basedOnVersionIdentities ?? []) {
    priorByPointer.set(identity.jsonPointer, identity);
  }

  const sortedPointers = sortPointersStable(pointers.map((entry) => entry.jsonPointer));
  const generated: SchemaNodeIdentity[] = [];
  const fieldIdByPointer = new Map<string, string>();

  for (const jsonPointer of sortedPointers) {
    const prior = priorByPointer.get(jsonPointer);
    const fieldId = prior?.fieldId ?? deterministicFieldId(jsonPointer);
    fieldIdByPointer.set(jsonPointer, fieldId);
    generated.push({
      schemaVersionId,
      fieldId,
      jsonPointer,
    });
  }

  return generated.map((identity) => {
    const parent = parentPointer(identity.jsonPointer);
    const parentFieldId = parent !== undefined ? fieldIdByPointer.get(parent) : undefined;

    return {
      ...identity,
      ...(parentFieldId ? { parentFieldId } : {}),
    };
  });
}
