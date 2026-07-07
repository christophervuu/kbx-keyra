export type SchemaPatchOperation =
  | {
      readonly op: 'set';
      readonly pointer: string;
      readonly value: unknown;
    }
  | {
      readonly op: 'remove';
      readonly pointer: string;
    }
  | {
      readonly op: 'addField';
      readonly parentPointer: string;
      readonly fieldName: string;
      readonly fieldSchema: Record<string, unknown>;
      readonly required?: boolean;
    };

export interface ApplySchemaPatchesInput {
  readonly content: Record<string, unknown>;
  readonly patches: readonly SchemaPatchOperation[];
  readonly changeSummary?: string;
}

export interface ApplySchemaPatchesResult {
  readonly content: Record<string, unknown>;
}

type SchemaPatchErrorKind = 'validation' | 'unsupported';

export class SchemaPatchError extends Error {
  constructor(
    public readonly kind: SchemaPatchErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SchemaPatchError';
  }
}

const UNSUPPORTED_KEYWORDS = new Set([
  '$ref',
  '$defs',
  'definitions',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'patternProperties',
  'additionalProperties',
  'unevaluatedProperties',
]);

function decodeSegment(value: string): string {
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
}

function parsePointer(pointer: string): string[] {
  if (pointer === '') {
    return [];
  }

  if (!pointer.startsWith('/')) {
    throw new SchemaPatchError('validation', `Invalid JSON Pointer '${pointer}'`);
  }

  return pointer
    .split('/')
    .slice(1)
    .map((segment) => decodeSegment(segment));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSupportedPointer(pointer: string): void {
  const segments = parsePointer(pointer);
  for (const segment of segments) {
    if (UNSUPPORTED_KEYWORDS.has(segment)) {
      throw new SchemaPatchError(
        'unsupported',
        `Unsupported schema patch operation at '${pointer}': keyword '${segment}' is restricted to preserve lossless safety`,
      );
    }
  }
}

function cloneContent<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function getAtPointer(root: unknown, pointer: string): unknown {
  const segments = parsePointer(pointer);
  let current: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }

      current = current[index];
      continue;
    }

    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function getContainerAndKey(
  root: Record<string, unknown>,
  pointer: string,
): { container: Record<string, unknown> | unknown[]; key: string } {
  const segments = parsePointer(pointer);
  if (segments.length === 0) {
    throw new SchemaPatchError('validation', 'Root-level replacement is not allowed for guided patch operations');
  }

  const key = segments[segments.length - 1]!;
  let current: unknown = root;

  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        throw new SchemaPatchError('validation', `JSON Pointer segment '${segment}' not found`);
      }

      current = current[index];
      continue;
    }

    if (!isRecord(current) || !(segment in current)) {
      throw new SchemaPatchError('validation', `JSON Pointer segment '${segment}' not found`);
    }

    current = current[segment];
  }

  if (!Array.isArray(current) && !isRecord(current)) {
    throw new SchemaPatchError('validation', `JSON Pointer target container for '${pointer}' is not addressable`);
  }

  return {
    container: current,
    key,
  };
}

function applySet(root: Record<string, unknown>, pointer: string, value: unknown): void {
  assertSupportedPointer(pointer);
  const { container, key } = getContainerAndKey(root, pointer);

  if (Array.isArray(container)) {
    const index = Number.parseInt(key, 10);
    if (!Number.isInteger(index) || index < 0 || index >= container.length) {
      throw new SchemaPatchError('validation', `Array index '${key}' is out of bounds for pointer '${pointer}'`);
    }

    container[index] = value;
    return;
  }

  container[key] = value;
}

function applyRemove(root: Record<string, unknown>, pointer: string, changeSummary?: string): void {
  assertSupportedPointer(pointer);

  if (!changeSummary || changeSummary.trim() === '') {
    throw new SchemaPatchError(
      'validation',
      'Destructive schema patch operations require non-empty changeSummary confirmation',
    );
  }

  const { container, key } = getContainerAndKey(root, pointer);
  if (Array.isArray(container)) {
    const index = Number.parseInt(key, 10);
    if (!Number.isInteger(index) || index < 0 || index >= container.length) {
      throw new SchemaPatchError('validation', `Array index '${key}' is out of bounds for pointer '${pointer}'`);
    }

    container.splice(index, 1);
    return;
  }

  if (!(key in container)) {
    throw new SchemaPatchError('validation', `JSON Pointer '${pointer}' does not exist`);
  }

  delete container[key];
}

function applyAddField(
  root: Record<string, unknown>,
  patch: Extract<SchemaPatchOperation, { op: 'addField' }>,
): void {
  assertSupportedPointer(patch.parentPointer);

  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(patch.fieldName)) {
    throw new SchemaPatchError('validation', `Invalid fieldName '${patch.fieldName}' for addField operation`);
  }

  const parent = getAtPointer(root, patch.parentPointer);
  if (!isRecord(parent)) {
    throw new SchemaPatchError('validation', `Parent pointer '${patch.parentPointer}' does not reference an object node`);
  }

  const properties = parent.properties;
  if (!isRecord(properties)) {
    throw new SchemaPatchError(
      'validation',
      `Parent pointer '${patch.parentPointer}' is not add-field compatible: missing object properties container`,
    );
  }

  if (Object.prototype.hasOwnProperty.call(properties, patch.fieldName)) {
    throw new SchemaPatchError(
      'validation',
      `addField rejected: field '${patch.fieldName}' already exists at '${patch.parentPointer}'`,
    );
  }

  properties[patch.fieldName] = patch.fieldSchema;

  if (patch.required) {
    const requiredRaw = parent.required;
    const required = Array.isArray(requiredRaw)
      ? requiredRaw.filter((entry): entry is string => typeof entry === 'string')
      : [];

    if (!required.includes(patch.fieldName)) {
      required.push(patch.fieldName);
      parent.required = required;
    }
  }
}

export function applySchemaPatches(input: ApplySchemaPatchesInput): ApplySchemaPatchesResult {
  const base = cloneContent(input.content);

  for (const patch of input.patches) {
    if (patch.op === 'set') {
      applySet(base, patch.pointer, patch.value);
      continue;
    }

    if (patch.op === 'remove') {
      applyRemove(base, patch.pointer, input.changeSummary);
      continue;
    }

    if (patch.op === 'addField') {
      applyAddField(base, patch);
      continue;
    }

    const exhaustive: never = patch;
    throw new SchemaPatchError('validation', `Unsupported patch op '${String(exhaustive)}'`);
  }

  return { content: base };
}
