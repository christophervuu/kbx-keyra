import { SchemaParseError } from '../../types';

import type { ParsedSchema, SchemaNodeType, SchemaTreeNode } from '@/lib/types';

const MAX_DEPTH = 16;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface JsonSchemaObject {
  type?: string | string[];
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject | JsonSchemaObject[];
  required?: string[];
  description?: string;
  enum?: unknown[];
  oneOf?: JsonSchemaObject[];
  anyOf?: JsonSchemaObject[];
  $ref?: string;
  definitions?: Record<string, JsonSchemaObject>;
  $defs?: Record<string, JsonSchemaObject>;
  [key: string]: unknown;
}

interface TraversalContext {
  rootSchema: JsonSchemaObject;
  visitedRefs: Set<string>;
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a JSON Schema document into a normalized tree structure.
 *
 * Handles:
 * - properties, items, local $ref resolution
 * - required arrays, type, description, enum, oneOf/anyOf
 *
 * @throws {SchemaParseError} if the content cannot be parsed
 */
export function parseJsonSchema(content: string | object): ParsedSchema {
  const startTime = performance.now();

  let schema: JsonSchemaObject;
  try {
    schema = typeof content === 'string' ? JSON.parse(content) : (content as JsonSchemaObject);
  } catch (err) {
    throw new SchemaParseError(
      'Failed to parse JSON Schema: invalid JSON',
      'json-schema',
      err instanceof Error ? err.message : String(err),
    );
  }

  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new SchemaParseError(
      'Failed to parse JSON Schema: content must be a JSON object',
      'json-schema',
    );
  }

  const context: TraversalContext = {
    rootSchema: schema,
    visitedRefs: new Set(),
    totalCount: 0,
  };

  const nodes = traverseProperties(schema, null, 0, context);
  const parseTimeMs = performance.now() - startTime;

  return {
    nodes,
    totalFieldCount: context.totalCount,
    format: 'json-schema',
    parseTimeMs,
    inferred: false,
  };
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

function traverseProperties(
  schema: JsonSchemaObject,
  parentPath: string | null,
  depth: number,
  context: TraversalContext,
): SchemaTreeNode[] {
  const requiredFields = new Set(schema.required ?? []);
  const properties = schema.properties;

  if (!properties) {
    return [];
  }

  const nodes: SchemaTreeNode[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    const path = parentPath ? `${parentPath}.${fieldName}` : fieldName;
    const node = buildNode(fieldName, fieldSchema, path, parentPath, depth, context, requiredFields);
    nodes.push(node);
  }

  return nodes;
}

function buildNode(
  fieldName: string,
  schema: JsonSchemaObject,
  path: string,
  parentPath: string | null,
  depth: number,
  context: TraversalContext,
  requiredFields: Set<string>,
): SchemaTreeNode {
  context.totalCount++;

  // Resolve $ref if present — track which ref we expanded so children can detect cycles
  const refKey = schema.$ref ?? null;
  const resolved = resolveRef(schema, context, depth);

  const nodeType = determineType(resolved);
  const description = resolved.description ?? undefined;
  const isRequired = requiredFields.has(fieldName);
  const isArray = nodeType === 'array';
  const enumValues = resolved.enum ? resolved.enum.map(String) : undefined;
  const unionTypes = extractUnionTypes(resolved);

  // Build children (ref stays in visitedRefs during child traversal for cycle detection)
  let children: SchemaTreeNode[] = [];

  if (depth < MAX_DEPTH) {
    if (nodeType === 'object' && resolved.properties) {
      children = traverseProperties(resolved, path, depth + 1, context);
    } else if (isArray && resolved.items) {
      children = traverseArrayItems(resolved.items, path, depth + 1, context);
    }
  }

  // Remove ref from visited set after children are built (allows reuse in other branches)
  if (refKey && refKey.startsWith('#/')) {
    context.visitedRefs.delete(refKey);
  }

  return {
    path,
    fieldName,
    type: nodeType,
    description,
    depth,
    isArray,
    isRequired,
    parentPath,
    childCount: children.length,
    children,
    ...(enumValues && { enumValues }),
    ...(unionTypes && { unionTypes }),
  };
}

// ---------------------------------------------------------------------------
// Array items handling
// ---------------------------------------------------------------------------

function traverseArrayItems(
  items: JsonSchemaObject | JsonSchemaObject[],
  parentPath: string,
  depth: number,
  context: TraversalContext,
): SchemaTreeNode[] {
  // If items is an array (tuple validation), take the first item as representative
  const itemSchema = Array.isArray(items) ? items[0] : items;
  if (!itemSchema) return [];

  const resolved = resolveRef(itemSchema, context, depth);

  // If the array items have properties, show them as children
  if (resolved.properties) {
    return traverseProperties(resolved, parentPath, depth, context);
  }

  return [];
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

function resolveRef(
  schema: JsonSchemaObject,
  context: TraversalContext,
  depth: number,
): JsonSchemaObject {
  if (!schema.$ref) {
    return schema;
  }

  const ref = schema.$ref;

  // Only support local refs
  if (!ref.startsWith('#/')) {
    return schema;
  }

  // Cycle detection
  if (context.visitedRefs.has(ref)) {
    return {
      type: 'object',
      description: '[Circular Reference]',
    };
  }

  // Max depth guard
  if (depth >= MAX_DEPTH) {
    return {
      type: 'object',
      description: '[Max depth exceeded]',
    };
  }

  context.visitedRefs.add(ref);

  const resolved = navigateRef(ref, context.rootSchema);
  if (!resolved) {
    context.visitedRefs.delete(ref);
    return schema;
  }

  // Recursively resolve if the resolved schema also has a $ref
  const final = resolveRef(resolved, context, depth + 1);

  return final;
}

function navigateRef(ref: string, rootSchema: JsonSchemaObject): JsonSchemaObject | null {
  // Remove the leading '#/'
  const path = ref.slice(2).split('/');
  let current: unknown = rootSchema;

  for (const segment of path) {
    if (current === null || typeof current !== 'object') {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  if (current === null || typeof current !== 'object' || Array.isArray(current)) {
    return null;
  }

  return current as JsonSchemaObject;
}

// ---------------------------------------------------------------------------
// Type determination
// ---------------------------------------------------------------------------

function determineType(schema: JsonSchemaObject): SchemaNodeType {
  // Check for enum first
  if (schema.enum) {
    return 'enum';
  }

  // Check for union types
  if (schema.oneOf || schema.anyOf) {
    return 'union';
  }

  // Check for array (by items presence)
  if (schema.items) {
    return 'array';
  }

  // Check for object (by properties presence)
  if (schema.properties) {
    return 'object';
  }

  const type = schema.type;

  if (!type) {
    return 'any';
  }

  // Handle array of types (e.g., ["string", "null"]) as union
  if (Array.isArray(type)) {
    return 'union';
  }

  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    case 'array':
      return 'array';
    case 'null':
      return 'null';
    default:
      return 'any';
  }
}

// ---------------------------------------------------------------------------
// Union type extraction
// ---------------------------------------------------------------------------

function extractUnionTypes(schema: JsonSchemaObject): string[] | undefined {
  const members = schema.oneOf ?? schema.anyOf;
  if (!members || members.length === 0) {
    return undefined;
  }

  const types = members.map((member) => {
    if (member.type && typeof member.type === 'string') {
      return member.type;
    }
    if (member.properties) return 'object';
    if (member.items) return 'array';
    if (member.enum) return 'enum';
    return 'any';
  });

  return types;
}
