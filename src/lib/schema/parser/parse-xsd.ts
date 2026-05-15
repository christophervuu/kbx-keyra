import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { SchemaNodeAccumulator, type ParseResult, asArray } from './utils.js';

type XmlNode = Record<string, unknown>;

function isObject(value: unknown): value is XmlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTag(tag: string, localName: string): boolean {
  return tag === localName || tag.endsWith(`:${localName}`);
}

function getEntries(node: XmlNode): readonly (readonly [string, unknown])[] {
  return Object.entries(node);
}

function getFirst(node: XmlNode, localName: string): XmlNode | undefined {
  for (const [key, value] of getEntries(node)) {
    if (!isTag(key, localName)) {
      continue;
    }

    if (isObject(value)) {
      return value;
    }

    if (Array.isArray(value) && value.length > 0 && isObject(value[0])) {
      return value[0];
    }
  }

  return undefined;
}

function getAll(node: XmlNode, localName: string): XmlNode[] {
  const results: XmlNode[] = [];

  for (const [key, value] of getEntries(node)) {
    if (!isTag(key, localName)) {
      continue;
    }

    for (const item of asArray(value)) {
      if (isObject(item)) {
        results.push(item);
      }
    }
  }

  return results;
}

function getAttribute(node: XmlNode, name: string): string | undefined {
  const prefixed = node[`@_${name}`];
  if (typeof prefixed === 'string') {
    return prefixed;
  }

  const plain = node[name];
  if (typeof plain === 'string') {
    return plain;
  }

  return undefined;
}

function normalizeXsdType(rawType: string | undefined): string {
  const typeName = rawType?.includes(':') ? rawType.split(':').at(-1) : rawType;

  switch (typeName) {
    case 'string':
    case 'date':
    case 'dateTime':
      return 'string';
    case 'integer':
    case 'int':
    case 'long':
    case 'short':
    case 'decimal':
    case 'float':
    case 'double':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'object';
  }
}

function isXsdArray(node: XmlNode): boolean {
  const maxOccurs = getAttribute(node, 'maxOccurs');
  if (!maxOccurs) {
    return false;
  }

  if (maxOccurs === 'unbounded') {
    return true;
  }

  const parsed = Number.parseInt(maxOccurs, 10);
  return Number.isFinite(parsed) && parsed > 1;
}

function isRequired(node: XmlNode, forceOptional: boolean): boolean {
  if (forceOptional) {
    return false;
  }

  const minOccurs = getAttribute(node, 'minOccurs');
  if (!minOccurs) {
    return true;
  }

  const parsed = Number.parseInt(minOccurs, 10);
  if (!Number.isFinite(parsed)) {
    return true;
  }

  return parsed > 0;
}

function getDescription(node: XmlNode): string | undefined {
  const annotation = getFirst(node, 'annotation');
  if (!annotation) {
    return undefined;
  }

  const documentation = getFirst(annotation, 'documentation');
  if (!documentation) {
    return undefined;
  }

  const text = documentation['#text'];
  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : undefined;
}

export function parseXsd(content: string, schemaId: string): ParseResult {
  const validation = XMLValidator.validate(content);
  if (validation !== true) {
    return {
      nodes: [],
      fieldCount: 0,
      errors: ['Invalid XSD content'],
    };
  }

  let parsed: unknown;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      trimValues: true,
      parseTagValue: false,
      parseAttributeValue: false,
      preserveOrder: false,
    });
    parsed = parser.parse(content);
  } catch {
    return {
      nodes: [],
      fieldCount: 0,
      errors: ['Invalid XSD content'],
    };
  }

  if (!isObject(parsed)) {
    return {
      nodes: [],
      fieldCount: 0,
      errors: ['XSD root must be an object'],
    };
  }

  const schemaEntry = getEntries(parsed).find(([key]) => isTag(key, 'schema'));
  if (!schemaEntry || !isObject(schemaEntry[1])) {
    return {
      nodes: [],
      fieldCount: 0,
      errors: ['XSD content must contain schema root element'],
    };
  }

  const schemaRoot = schemaEntry[1];
  const accumulator = new SchemaNodeAccumulator();
  const warnings: string[] = [];

  const complexTypesByName = new Map<string, XmlNode>();
  for (const complexType of getAll(schemaRoot, 'complexType')) {
    const name = getAttribute(complexType, 'name');
    if (name) {
      complexTypesByName.set(name, complexType);
    }
  }

  const processComplexType = (
    complexType: XmlNode,
    parentPath: string,
    depth: number,
    forceOptional: boolean,
    seenTypes: Set<string>,
  ): void => {
    const processParticles = (container: XmlNode, optionalInChoice: boolean): void => {
      for (const childElement of getAll(container, 'element')) {
        processElement(childElement, parentPath, depth, optionalInChoice, new Set(seenTypes));
      }

      for (const sequence of getAll(container, 'sequence')) {
        processParticles(sequence, optionalInChoice);
      }

      for (const all of getAll(container, 'all')) {
        processParticles(all, optionalInChoice);
      }

      for (const choice of getAll(container, 'choice')) {
        // Q5: xs:choice alternatives are included as sibling nodes and all forced optional.
        // This is an intentionally lossy structural approximation for ingestion/search.
        processParticles(choice, true);
      }
    };

    const complexContent = getFirst(complexType, 'complexContent');
    if (complexContent) {
      for (const extension of getAll(complexContent, 'extension')) {
        const baseTypeRaw = getAttribute(extension, 'base');
        const baseTypeName = baseTypeRaw?.split(':').at(-1);

        if (baseTypeName && complexTypesByName.has(baseTypeName)) {
          if (seenTypes.has(baseTypeName)) {
            warnings.push(`Circular XSD type extension detected for ${baseTypeName}`);
          } else {
            const nextSeen = new Set(seenTypes);
            nextSeen.add(baseTypeName);
            const baseType = complexTypesByName.get(baseTypeName);
            if (baseType) {
              processComplexType(baseType, parentPath, depth, forceOptional, nextSeen);
            }
          }
        }

        processParticles(extension, forceOptional);
        processAttributes(extension, parentPath, depth);
      }
    }

    processParticles(complexType, forceOptional);
    processAttributes(complexType, parentPath, depth);
  };

  const processAttributes = (container: XmlNode, parentPath: string, depth: number): void => {
    for (const attribute of getAll(container, 'attribute')) {
      const name = getAttribute(attribute, 'name');
      if (!name) {
        continue;
      }

      const path = `${parentPath}.${name}`;
      const requiredByUse = getAttribute(attribute, 'use') === 'required';

      accumulator.upsertNode({
        schemaId,
        path,
        fieldName: name,
        type: normalizeXsdType(getAttribute(attribute, 'type')),
        description: getDescription(attribute),
        depth,
        isArray: false,
        isRequired: requiredByUse,
        parentPath,
      });

      accumulator.link(parentPath, path);
    }
  };

  const processElement = (
    element: XmlNode,
    parentPath: string | undefined,
    depth: number,
    forceOptional: boolean,
    seenTypes: Set<string>,
  ): void => {
    const name = getAttribute(element, 'name');
    if (!name) {
      return;
    }

    const path = parentPath ? `${parentPath}.${name}` : name;
    const inlineComplexType = getFirst(element, 'complexType');
    const rawType = getAttribute(element, 'type');
    const normalizedRawType = normalizeXsdType(rawType);
    const typeName = rawType?.split(':').at(-1);
    const hasReferencedComplexType = Boolean(typeName && complexTypesByName.has(typeName));

    const nodeType = inlineComplexType || hasReferencedComplexType ? 'object' : normalizedRawType;

    accumulator.upsertNode({
      schemaId,
      path,
      fieldName: name,
      type: nodeType,
      description: getDescription(element),
      depth,
      isArray: isXsdArray(element),
      isRequired: isRequired(element, forceOptional),
      parentPath,
    });

    if (parentPath) {
      accumulator.link(parentPath, path);
    }

    if (inlineComplexType) {
      processComplexType(inlineComplexType, path, depth + 1, forceOptional, seenTypes);
      return;
    }

    if (!typeName || !hasReferencedComplexType) {
      return;
    }

    if (seenTypes.has(typeName)) {
      warnings.push(`Circular XSD type reference detected for ${typeName}`);
      return;
    }

    const referencedType = complexTypesByName.get(typeName);
    if (!referencedType) {
      return;
    }

    const nextSeen = new Set(seenTypes);
    nextSeen.add(typeName);
    processComplexType(referencedType, path, depth + 1, forceOptional, nextSeen);
  };

  const rootElements = getAll(schemaRoot, 'element');
  for (const element of rootElements) {
    processElement(element, undefined, 0, false, new Set());
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
