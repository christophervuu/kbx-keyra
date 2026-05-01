import { SchemaParseError } from '../../types';

import type { ParsedSchema, SchemaNodeType, SchemaTreeNode } from '@/lib/types';

const XS_PREFIX = 'xs:';

// ---------------------------------------------------------------------------
// XSD built-in type mapping
// ---------------------------------------------------------------------------

const XSD_TYPE_MAP: Record<string, SchemaNodeType> = {
  string: 'string',
  normalizedString: 'string',
  token: 'string',
  language: 'string',
  Name: 'string',
  NCName: 'string',
  ID: 'string',
  IDREF: 'string',
  NMTOKEN: 'string',
  date: 'string',
  dateTime: 'string',
  time: 'string',
  duration: 'string',
  gYear: 'string',
  gYearMonth: 'string',
  gMonth: 'string',
  gMonthDay: 'string',
  gDay: 'string',
  anyURI: 'string',
  base64Binary: 'string',
  hexBinary: 'string',
  QName: 'string',
  integer: 'number',
  int: 'number',
  long: 'number',
  short: 'number',
  byte: 'number',
  decimal: 'number',
  float: 'number',
  double: 'number',
  nonNegativeInteger: 'number',
  positiveInteger: 'number',
  nonPositiveInteger: 'number',
  negativeInteger: 'number',
  unsignedInt: 'number',
  unsignedLong: 'number',
  unsignedShort: 'number',
  unsignedByte: 'number',
  boolean: 'boolean',
  anyType: 'any',
  anySimpleType: 'any',
};

// ---------------------------------------------------------------------------
// Internal context
// ---------------------------------------------------------------------------

interface XsdContext {
  doc: Document;
  totalCount: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse an XSD (XML Schema Definition) document into a normalized tree structure.
 *
 * Uses the browser DOMParser API for XML parsing. Handles xs:element,
 * xs:complexType, xs:simpleType, xs:sequence, xs:choice, xs:attribute,
 * minOccurs/maxOccurs, and xs:annotation/xs:documentation.
 *
 * @throws {SchemaParseError} if the content cannot be parsed
 */
export function parseXsd(content: string): ParsedSchema {
  const startTime = performance.now();

  if (!content || typeof content !== 'string') {
    throw new SchemaParseError('Failed to parse XSD: content must be a non-empty string', 'xsd');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');

  // Check for XML parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new SchemaParseError(
      'Failed to parse XSD: invalid XML',
      'xsd',
      parseError.textContent ?? undefined,
    );
  }

  // Verify this is an XSD document
  const root = doc.documentElement;
  if (!root || (root.nodeName !== `${XS_PREFIX}schema` && root.nodeName !== 'schema')) {
    throw new SchemaParseError(
      'Failed to parse XSD: root element must be xs:schema',
      'xsd',
      `Found root element: ${root?.nodeName ?? 'none'}`,
    );
  }

  const context: XsdContext = { doc, totalCount: 0 };

  // Find top-level xs:element declarations
  const nodes = findTopLevelElements(root, context);
  const parseTimeMs = performance.now() - startTime;

  return {
    nodes,
    totalFieldCount: context.totalCount,
    format: 'xsd',
    parseTimeMs,
    inferred: false,
  };
}

// ---------------------------------------------------------------------------
// Top-level element discovery
// ---------------------------------------------------------------------------

function findTopLevelElements(schemaRoot: Element, context: XsdContext): SchemaTreeNode[] {
  const nodes: SchemaTreeNode[] = [];
  const children = schemaRoot.childNodes;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;

    if (el.nodeName === `${XS_PREFIX}element`) {
      const node = processElement(el, null, 0, context);
      if (node) {
        nodes.push(node);
      }
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Element processing
// ---------------------------------------------------------------------------

function processElement(
  el: Element,
  parentPath: string | null,
  depth: number,
  context: XsdContext,
): SchemaTreeNode | null {
  const fieldName = el.getAttribute('name');
  if (!fieldName) return null;

  context.totalCount++;

  const path = parentPath ? `${parentPath}.${fieldName}` : fieldName;
  const description = extractAnnotation(el);

  // Cardinality
  const minOccurs = parseCardinality(el.getAttribute('minOccurs'), 1);
  const maxOccurs = parseMaxOccurs(el.getAttribute('maxOccurs'), 1);
  const isRequired = typeof minOccurs === 'number' && minOccurs >= 1;
  const isArray = maxOccurs === 'unbounded' || (typeof maxOccurs === 'number' && maxOccurs > 1);

  // Determine type and children
  const typeResult = resolveElementType(el, path, depth, context);

  return {
    path,
    fieldName,
    type: typeResult.type,
    description,
    depth,
    isArray,
    isRequired,
    parentPath,
    childCount: typeResult.children.length,
    children: typeResult.children,
    ...(typeResult.enumValues && { enumValues: typeResult.enumValues }),
    ...(typeResult.unionTypes && { unionTypes: typeResult.unionTypes }),
    ...(minOccurs !== undefined && { minOccurs: minOccurs as number }),
    ...(maxOccurs !== undefined && { maxOccurs }),
  };
}

// ---------------------------------------------------------------------------
// Type resolution
// ---------------------------------------------------------------------------

interface TypeResult {
  type: SchemaNodeType;
  children: SchemaTreeNode[];
  enumValues?: string[];
  unionTypes?: string[];
}

function resolveElementType(
  el: Element,
  path: string,
  depth: number,
  context: XsdContext,
): TypeResult {
  // Check for inline type attribute (e.g., type="xs:string")
  const typeAttr = el.getAttribute('type');
  if (typeAttr) {
    const mappedType = mapXsdType(typeAttr);
    return { type: mappedType, children: [] };
  }

  // Check for inline complex type
  const complexType = findChildElement(el, `${XS_PREFIX}complexType`);
  if (complexType) {
    return processComplexType(complexType, path, depth, context);
  }

  // Check for inline simple type
  const simpleType = findChildElement(el, `${XS_PREFIX}simpleType`);
  if (simpleType) {
    return processSimpleType(simpleType);
  }

  return { type: 'any', children: [] };
}

function processComplexType(
  complexType: Element,
  parentPath: string,
  depth: number,
  context: XsdContext,
): TypeResult {
  const children: SchemaTreeNode[] = [];

  // Process xs:sequence
  const sequence = findChildElement(complexType, `${XS_PREFIX}sequence`);
  if (sequence) {
    children.push(...processCompositor(sequence, parentPath, depth + 1, context));
  }

  // Process xs:all (treated same as sequence for tree purposes)
  const all = findChildElement(complexType, `${XS_PREFIX}all`);
  if (all) {
    children.push(...processCompositor(all, parentPath, depth + 1, context));
  }

  // Process xs:choice
  const choice = findChildElement(complexType, `${XS_PREFIX}choice`);
  if (choice) {
    const unionTypes = extractChoiceTypes(choice);
    // Also get the children from the choice options for display
    const choiceChildren = processCompositor(choice, parentPath, depth + 1, context);
    return {
      type: 'union',
      children: choiceChildren,
      unionTypes,
    };
  }

  // Process xs:attribute children
  const attributes = processAttributes(complexType, parentPath, depth + 1, context);
  children.push(...attributes);

  return { type: 'object', children };
}

function processSimpleType(simpleType: Element): TypeResult {
  // Check for enumeration restriction
  const restriction = findChildElement(simpleType, `${XS_PREFIX}restriction`);
  if (restriction) {
    const enumerations = findChildElements(restriction, `${XS_PREFIX}enumeration`);
    if (enumerations.length > 0) {
      const enumValues = enumerations.map((e) => e.getAttribute('value') ?? '');
      return { type: 'enum', children: [], enumValues };
    }

    // Check base type of restriction
    const base = restriction.getAttribute('base');
    if (base) {
      return { type: mapXsdType(base), children: [] };
    }
  }

  return { type: 'string', children: [] };
}

// ---------------------------------------------------------------------------
// Compositor processing (sequence, all, choice)
// ---------------------------------------------------------------------------

function processCompositor(
  compositor: Element,
  parentPath: string,
  depth: number,
  context: XsdContext,
): SchemaTreeNode[] {
  const nodes: SchemaTreeNode[] = [];
  const children = compositor.childNodes;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;

    if (el.nodeName === `${XS_PREFIX}element`) {
      const node = processElement(el, parentPath, depth, context);
      if (node) {
        nodes.push(node);
      }
    } else if (
      el.nodeName === `${XS_PREFIX}sequence` ||
      el.nodeName === `${XS_PREFIX}all`
    ) {
      // Nested compositor
      nodes.push(...processCompositor(el, parentPath, depth, context));
    }
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Attribute processing
// ---------------------------------------------------------------------------

function processAttributes(
  complexType: Element,
  parentPath: string,
  depth: number,
  context: XsdContext,
): SchemaTreeNode[] {
  const attributes = findChildElements(complexType, `${XS_PREFIX}attribute`);
  const nodes: SchemaTreeNode[] = [];

  for (const attr of attributes) {
    const name = attr.getAttribute('name');
    if (!name) continue;

    context.totalCount++;

    const path = parentPath ? `${parentPath}.${name}` : name;
    const typeAttr = attr.getAttribute('type');
    const type = typeAttr ? mapXsdType(typeAttr) : 'string';
    const use = attr.getAttribute('use');
    const isRequired = use === 'required';
    const description = extractAnnotation(attr) ?? '@attribute';

    nodes.push({
      path,
      fieldName: name,
      type,
      description,
      depth,
      isArray: false,
      isRequired,
      parentPath,
      childCount: 0,
      children: [],
    });
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// xs:choice type extraction
// ---------------------------------------------------------------------------

function extractChoiceTypes(choice: Element): string[] {
  const types: string[] = [];
  const children = choice.childNodes;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;

    if (el.nodeName === `${XS_PREFIX}element`) {
      const typeAttr = el.getAttribute('type');
      if (typeAttr) {
        types.push(stripXsPrefix(typeAttr));
      } else {
        const name = el.getAttribute('name') ?? 'unknown';
        types.push(name);
      }
    }
  }

  return types;
}

// ---------------------------------------------------------------------------
// Annotation extraction
// ---------------------------------------------------------------------------

function extractAnnotation(el: Element): string | undefined {
  const annotation = findChildElement(el, `${XS_PREFIX}annotation`);
  if (!annotation) return undefined;

  const documentation = findChildElement(annotation, `${XS_PREFIX}documentation`);
  if (!documentation) return undefined;

  const text = documentation.textContent?.trim();
  return text || undefined;
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

function mapXsdType(typeAttr: string): SchemaNodeType {
  const typeName = stripXsPrefix(typeAttr);
  return XSD_TYPE_MAP[typeName] ?? 'any';
}

function stripXsPrefix(type: string): string {
  if (type.startsWith(`${XS_PREFIX}`)) {
    return type.slice(XS_PREFIX.length);
  }
  return type;
}

// ---------------------------------------------------------------------------
// Cardinality parsing
// ---------------------------------------------------------------------------

function parseCardinality(value: string | null, defaultValue: number): number {
  if (value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseMaxOccurs(
  value: string | null,
  defaultValue: number,
): number | 'unbounded' {
  if (value === null) return defaultValue;
  if (value === 'unbounded') return 'unbounded';
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function findChildElement(parent: Element, nodeName: string): Element | null {
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).nodeName === nodeName) {
      return child as Element;
    }
  }
  return null;
}

function findChildElements(parent: Element, nodeName: string): Element[] {
  const result: Element[] = [];
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === Node.ELEMENT_NODE && (child as Element).nodeName === nodeName) {
      result.push(child as Element);
    }
  }
  return result;
}
