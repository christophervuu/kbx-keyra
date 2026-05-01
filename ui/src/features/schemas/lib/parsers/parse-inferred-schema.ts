import { SchemaParseError } from '../../types';

import type { ParsedSchema, SchemaNodeType, SchemaTreeNode } from '@/lib/types';

// ---------------------------------------------------------------------------
// Internal context
// ---------------------------------------------------------------------------

interface InferContext {
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Infer a schema from sample data (JSON or XML).
 *
 * Recursively analyzes sample data to infer field types, producing a
 * `ParsedSchema` with all nodes marked `inferred: true`.
 *
 * @throws {SchemaParseError} if the content cannot be parsed
 */
export function parseInferredSchema(content: string, format: 'json' | 'xml'): ParsedSchema {
  const startTime = performance.now();

  if (!content || typeof content !== 'string') {
    throw new SchemaParseError(
      'Failed to infer schema: content must be a non-empty string',
      'json-schema',
    );
  }

  const context: InferContext = { totalCount: 0 };
  let nodes: SchemaTreeNode[];

  if (format === 'json') {
    nodes = inferFromJson(content, context);
  } else {
    nodes = inferFromXml(content, context);
  }

  const parseTimeMs = performance.now() - startTime;

  return {
    nodes,
    totalFieldCount: context.totalCount,
    format: 'json-schema',
    parseTimeMs,
    inferred: true,
  };
}

// ---------------------------------------------------------------------------
// JSON inference
// ---------------------------------------------------------------------------

function inferFromJson(content: string, context: InferContext): SchemaTreeNode[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new SchemaParseError(
      'Failed to infer schema: invalid JSON',
      'json-schema',
      err instanceof Error ? err.message : String(err),
    );
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new SchemaParseError(
      'Failed to infer schema: sample data must be a JSON object or array',
      'json-schema',
    );
  }

  // If the top-level is an array, infer from the first element
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return [];
    const first = parsed[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first)) {
      return inferObjectProperties(first as Record<string, unknown>, null, 0, context);
    }
    return [];
  }

  return inferObjectProperties(parsed as Record<string, unknown>, null, 0, context);
}

function inferObjectProperties(
  obj: Record<string, unknown>,
  parentPath: string | null,
  depth: number,
  context: InferContext,
): SchemaTreeNode[] {
  const nodes: SchemaTreeNode[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    const node = inferNode(key, value, path, parentPath, depth, context);
    nodes.push(node);
  }

  return nodes;
}

function inferNode(
  fieldName: string,
  value: unknown,
  path: string,
  parentPath: string | null,
  depth: number,
  context: InferContext,
): SchemaTreeNode {
  context.totalCount++;

  const type = inferType(value);
  const isArray = type === 'array';
  let children: SchemaTreeNode[] = [];

  if (type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    children = inferObjectProperties(value as Record<string, unknown>, path, depth + 1, context);
  } else if (isArray && Array.isArray(value) && value.length > 0) {
    children = inferArrayChildren(value, path, depth + 1, context);
  }

  return {
    path,
    fieldName,
    type,
    depth,
    isArray,
    isRequired: false,
    parentPath,
    childCount: children.length,
    children,
    inferred: true,
  };
}

function inferType(value: unknown): SchemaNodeType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';

  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'any';
  }
}

function inferArrayChildren(
  arr: unknown[],
  parentPath: string,
  depth: number,
  context: InferContext,
): SchemaTreeNode[] {
  // Find the first non-null object element to infer structure from
  for (const item of arr) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return inferObjectProperties(item as Record<string, unknown>, parentPath, depth, context);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// XML inference
// ---------------------------------------------------------------------------

function inferFromXml(content: string, context: InferContext): SchemaTreeNode[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new SchemaParseError(
      'Failed to infer schema: invalid XML',
      'json-schema',
      parseError.textContent ?? undefined,
    );
  }

  const root = doc.documentElement;
  if (!root) {
    throw new SchemaParseError('Failed to infer schema: empty XML document', 'json-schema');
  }

  // Infer from root element's children
  return inferXmlChildren(root, null, 0, context);
}

function inferXmlChildren(
  parent: Element,
  parentPath: string | null,
  depth: number,
  context: InferContext,
): SchemaTreeNode[] {
  const childElements = getChildElements(parent);
  if (childElements.length === 0) return [];

  // Detect repeated siblings (same tag name = array)
  const tagCounts = new Map<string, number>();
  for (const el of childElements) {
    const name = el.nodeName;
    tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
  }

  const nodes: SchemaTreeNode[] = [];
  const processed = new Set<string>();

  for (const el of childElements) {
    const name = el.nodeName;
    if (processed.has(name)) continue;
    processed.add(name);

    const path = parentPath ? `${parentPath}.${name}` : name;
    const count = tagCounts.get(name) ?? 1;
    const isArray = count > 1;

    context.totalCount++;

    const elChildren = getChildElements(el);
    let type: SchemaNodeType;
    let children: SchemaTreeNode[] = [];

    if (elChildren.length > 0) {
      type = 'object';
      children = inferXmlChildren(el, path, depth + 1, context);
    } else {
      type = 'string'; // Conservative default for leaf elements
    }

    if (isArray) {
      type = 'array';
      // For arrays of objects, infer children from the first element
      if (elChildren.length > 0) {
        children = inferXmlChildren(el, path, depth + 1, context);
      }
    }

    nodes.push({
      path,
      fieldName: name,
      type,
      depth,
      isArray,
      isRequired: false,
      parentPath,
      childCount: children.length,
      children,
      inferred: true,
    });
  }

  return nodes;
}

function getChildElements(parent: Element): Element[] {
  const elements: Element[] = [];
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    if (children[i].nodeType === Node.ELEMENT_NODE) {
      elements.push(children[i] as Element);
    }
  }
  return elements;
}
