import { SchemaNodeAccumulator, type ParseResult, asArray } from './utils.js';

interface JsonSchemaObject {
  readonly type?: string | readonly string[];
  readonly description?: string;
  readonly properties?: Record<string, JsonSchemaObject>;
  readonly items?: JsonSchemaObject;
  readonly required?: readonly string[];
  readonly $ref?: string;
  readonly $defs?: Record<string, JsonSchemaObject>;
  readonly definitions?: Record<string, JsonSchemaObject>;
  readonly allOf?: readonly JsonSchemaObject[];
  readonly anyOf?: readonly JsonSchemaObject[];
  readonly oneOf?: readonly JsonSchemaObject[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeType(schema: JsonSchemaObject): string {
  const t = schema.type;
  if (Array.isArray(t)) {
    return t[0] ?? 'object';
  }

  if (typeof t === 'string') {
    return t;
  }

  if (schema.properties) {
    return 'object';
  }

  if (schema.items) {
    return 'array';
  }

  return 'object';
}

function decodeJsonPointer(pointerSegment: string): string {
  return pointerSegment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolveLocalRef(root: JsonSchemaObject, ref: string): JsonSchemaObject | undefined {
  if (!ref.startsWith('#/')) {
    return undefined;
  }

  const parts = ref
    .slice(2)
    .split('/')
    .map((part) => decodeJsonPointer(part));

  let current: unknown = root;
  for (const part of parts) {
    if (!isObject(current)) {
      return undefined;
    }

    current = current[part];
  }

  return isObject(current) ? (current as JsonSchemaObject) : undefined;
}

function mergeAllOf(schema: JsonSchemaObject): JsonSchemaObject {
  if (!schema.allOf || schema.allOf.length === 0) {
    return schema;
  }

  const mergedProperties: Record<string, JsonSchemaObject> = { ...(schema.properties ?? {}) };
  const mergedRequired = new Set<string>(schema.required ?? []);

  for (const sub of schema.allOf) {
    if (sub.properties) {
      for (const [name, prop] of Object.entries(sub.properties)) {
        mergedProperties[name] = prop;
      }
    }

    for (const req of sub.required ?? []) {
      mergedRequired.add(req);
    }
  }

  return {
    ...schema,
    properties: mergedProperties,
    required: [...mergedRequired],
  };
}

export function parseJsonSchema(content: string, schemaId: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      nodes: [],
      fieldCount: 0,
      errors: ['Invalid JSON schema content'],
    };
  }

  if (!isObject(parsed)) {
    return {
      nodes: [],
      fieldCount: 0,
      errors: ['JSON schema root must be an object'],
    };
  }

  const root = parsed as JsonSchemaObject;
  const accumulator = new SchemaNodeAccumulator();
  const warnings: string[] = [];

  const visit = (
    schema: JsonSchemaObject,
    currentPath: string,
    depth: number,
    parentPath: string | undefined,
    isRequired: boolean,
    seenRefs: Set<string>,
    forceOptional: boolean,
  ): void => {
    let workingSchema = mergeAllOf(schema);

    if (workingSchema.$ref) {
      if (seenRefs.has(workingSchema.$ref)) {
        warnings.push(`Circular $ref detected at ${workingSchema.$ref}`);
        return;
      }

      const resolved = resolveLocalRef(root, workingSchema.$ref);
      if (!resolved) {
        warnings.push(`Unresolved local $ref: ${workingSchema.$ref}`);
        return;
      }

      const nextSeen = new Set(seenRefs);
      nextSeen.add(workingSchema.$ref);
      workingSchema = mergeAllOf(resolved);

      visit(workingSchema, currentPath, depth, parentPath, isRequired, nextSeen, forceOptional);
      return;
    }

    const fieldName = currentPath.includes('.') ? currentPath.split('.').at(-1) ?? currentPath : currentPath;
    const nodeType = normalizeType(workingSchema);
    const requiredValue = forceOptional ? false : isRequired;

    accumulator.upsertNode({
      schemaId,
      path: currentPath,
      fieldName,
      type: nodeType,
      description: workingSchema.description,
      depth,
      isArray: nodeType === 'array',
      isRequired: requiredValue,
      parentPath,
    });

    const requiredSet = new Set(workingSchema.required ?? []);

    if (nodeType === 'array' && workingSchema.items) {
      const items = workingSchema.items;

      if (items.properties) {
        for (const [childName, childSchema] of Object.entries(items.properties)) {
          const childPath = `${currentPath}.${childName}`;
          accumulator.link(currentPath, childPath);
          visit(
            childSchema,
            childPath,
            depth + 1,
            currentPath,
            requiredSet.has(childName),
            new Set(seenRefs),
            forceOptional,
          );
        }
      }
    }

    for (const [childName, childSchema] of Object.entries(workingSchema.properties ?? {})) {
      const childPath = `${currentPath}.${childName}`;
      accumulator.link(currentPath, childPath);
      visit(
        childSchema,
        childPath,
        depth + 1,
        currentPath,
        requiredSet.has(childName),
        new Set(seenRefs),
        forceOptional,
      );
    }

    for (const alternative of asArray(workingSchema.anyOf)) {
      for (const [altName, altSchema] of Object.entries(alternative.properties ?? {})) {
        const childPath = `${currentPath}.${altName}`;
        accumulator.link(currentPath, childPath);
        visit(altSchema, childPath, depth + 1, currentPath, false, new Set(seenRefs), true);
      }
    }

    for (const alternative of asArray(workingSchema.oneOf)) {
      for (const [altName, altSchema] of Object.entries(alternative.properties ?? {})) {
        const childPath = `${currentPath}.${altName}`;
        accumulator.link(currentPath, childPath);
        visit(altSchema, childPath, depth + 1, currentPath, false, new Set(seenRefs), true);
      }
    }
  };

  const rootSchema = mergeAllOf(root);
  const rootRequired = new Set(rootSchema.required ?? []);

  for (const [fieldName, fieldSchema] of Object.entries(rootSchema.properties ?? {})) {
    visit(fieldSchema, fieldName, 0, undefined, rootRequired.has(fieldName), new Set(), false);
  }

  const finalized = accumulator.finalize();

  if (warnings.length === 0) {
    return finalized;
  }

  return {
    ...finalized,
    errors: warnings,
  };
}
