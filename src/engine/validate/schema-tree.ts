import { type Diagnostic, type ValueType } from '../types/index.js';

type PathSegment = string | number;

export interface SchemaNode {
  readonly type: ValueType;
  readonly required: boolean;
  readonly children: Readonly<Record<string, SchemaNode>>;
  readonly item?: SchemaNode;
}

export interface SchemaTree {
  readonly diagnostics: readonly Diagnostic[];
  hasPath(path: string): boolean;
  getTypeAtPath(path: string): ValueType | undefined;
  getRequiredLeafPaths(): string[];
  isArrayPath(path: string): boolean;
}

const schemaTreeCache = new WeakMap<object, SchemaTree>();

interface BuildContext {
  readonly rootSchema: unknown;
  readonly required: boolean;
  readonly seenRefs: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mapJsonSchemaType(raw: unknown): ValueType {
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => entry !== 'null');
    return mapJsonSchemaType(first);
  }

  switch (raw) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    default:
      return 'any';
  }
}

function decodePointerToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolveLocalRef(rootSchema: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    return undefined;
  }

  const tokens = ref
    .slice(2)
    .split('/')
    .map((token) => decodePointerToken(token));

  let current: unknown = rootSchema;
  for (const token of tokens) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[token];
  }

  return current;
}

function mergeChildMaps(
  left: Readonly<Record<string, SchemaNode>>,
  right: Readonly<Record<string, SchemaNode>>,
): Readonly<Record<string, SchemaNode>> {
  const merged: Record<string, SchemaNode> = { ...left };

  for (const [key, rightNode] of Object.entries(right)) {
    const leftNode = merged[key];
    if (!leftNode) {
      merged[key] = rightNode;
      continue;
    }

    merged[key] = {
      type: rightNode.type === 'any' ? leftNode.type : rightNode.type,
      required: leftNode.required || rightNode.required,
      children: mergeChildMaps(leftNode.children, rightNode.children),
      item: rightNode.item ?? leftNode.item,
    };
  }

  return merged;
}

function buildNode(schema: unknown, context: BuildContext): SchemaNode {
  if (!isRecord(schema)) {
    return {
      type: 'any',
      required: context.required,
      children: {},
    };
  }

  const ref = typeof schema.$ref === 'string' ? schema.$ref : undefined;
  if (ref) {
    if (context.seenRefs.has(ref)) {
      return {
        type: 'any',
        required: context.required,
        children: {},
      };
    }

    context.seenRefs.add(ref);
    const resolved = resolveLocalRef(context.rootSchema, ref);
    const node = buildNode(resolved, context);
    context.seenRefs.delete(ref);

    return {
      ...node,
      required: context.required,
    };
  }

  const directType = mapJsonSchemaType(schema.type);
  const nodeType: ValueType = directType === 'any' && isRecord(schema.properties) ? 'object' : directType;

  let children: Readonly<Record<string, SchemaNode>> = {};
  if (isRecord(schema.properties)) {
    const requiredSet = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((value): value is string => typeof value === 'string')
        : [],
    );

    const map: Record<string, SchemaNode> = {};
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      map[key] = buildNode(childSchema, {
        ...context,
        required: requiredSet.has(key),
      });
    }

    children = map;
  }

  let item: SchemaNode | undefined;
  if (nodeType === 'array') {
    item = buildNode(schema.items, {
      ...context,
      required: false,
    });
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    for (const part of schema.allOf) {
      const partNode = buildNode(part, {
        ...context,
        required: context.required,
      });
      children = mergeChildMaps(children, partNode.children);
      item = item ?? partNode.item;
    }
  }

  return {
    type: nodeType,
    required: context.required,
    children,
    item,
  };
}

function tokenizePath(path: string): PathSegment[] | null {
  if (path.length === 0) {
    return [];
  }

  const segments: PathSegment[] = [];
  let index = 0;

  while (index < path.length) {
    const char = path[index];

    if (char === '.') {
      return null;
    }

    if (char === '[') {
      index += 1;
      if (index >= path.length) {
        return null;
      }

      if (path[index] === "'") {
        index += 1;
        const keyStart = index;
        while (index < path.length && path[index] !== "'") {
          index += 1;
        }

        if (index >= path.length) {
          return null;
        }

        const key = path.slice(keyStart, index);
        index += 1;
        if (path[index] !== ']') {
          return null;
        }

        segments.push(key);
        index += 1;
      } else {
        const numberStart = index;
        while (index < path.length && /[0-9]/.test(path[index] ?? '')) {
          index += 1;
        }

        if (numberStart === index || path[index] !== ']') {
          return null;
        }

        const raw = path.slice(numberStart, index);
        segments.push(Number(raw));
        index += 1;
      }

      if (index < path.length && path[index] === '.') {
        index += 1;
        if (index >= path.length) {
          return null;
        }
      }

      continue;
    }

    const start = index;
    while (index < path.length && path[index] !== '.' && path[index] !== '[') {
      index += 1;
    }

    if (start === index) {
      return null;
    }

    segments.push(path.slice(start, index));

    if (index < path.length && path[index] === '.') {
      index += 1;
      if (index >= path.length) {
        return null;
      }
    }
  }

  return segments;
}

function descendForSegment(node: SchemaNode, segment: PathSegment): SchemaNode | undefined {
  if (typeof segment === 'number') {
    return node.type === 'array' ? node.item : undefined;
  }

  if (node.children[segment]) {
    return node.children[segment];
  }

  if (node.type === 'array' && node.item) {
    return descendForSegment(node.item, segment);
  }

  return undefined;
}

function resolveNodeAtPath(root: SchemaNode, path: string): SchemaNode | undefined {
  const segments = tokenizePath(path);
  if (segments === null) {
    return undefined;
  }

  let current: SchemaNode | undefined = root;
  for (const segment of segments) {
    if (!current) {
      return undefined;
    }
    current = descendForSegment(current, segment);
  }

  return current;
}

function hasObjectishArrayItem(node: SchemaNode): boolean {
  if (!node.item) {
    return false;
  }

  if (Object.keys(node.item.children).length > 0) {
    return true;
  }

  return node.item.type === 'object';
}

function collectRequiredLeafPaths(
  node: SchemaNode,
  path: string,
  output: string[],
  parentRequired: boolean,
): void {
  const isRequired = parentRequired && node.required;

  if (node.type === 'array') {
    if (hasObjectishArrayItem(node)) {
      if (node.item) {
        const childEntries = Object.entries(node.item.children);
        for (const [childKey, childNode] of childEntries) {
          const childPath = path.length === 0 ? childKey : `${path}.${childKey}`;
          collectRequiredLeafPaths(childNode, childPath, output, isRequired);
        }
      }
      return;
    }

    if (isRequired && path.length > 0) {
      output.push(path);
    }
    return;
  }

  const children = Object.entries(node.children);
  if (children.length === 0) {
    if (isRequired && path.length > 0) {
      output.push(path);
    }
    return;
  }

  for (const [key, child] of children) {
    const childPath = path.length === 0 ? key : `${path}.${key}`;
    collectRequiredLeafPaths(child, childPath, output, isRequired);
  }
}

class SchemaTreeImpl implements SchemaTree {
  public constructor(
    private readonly rootNode: SchemaNode,
    public readonly diagnostics: readonly Diagnostic[] = [],
  ) {}

  public hasPath(path: string): boolean {
    if (path.length === 0) {
      return true;
    }
    return resolveNodeAtPath(this.rootNode, path) !== undefined;
  }

  public getTypeAtPath(path: string): ValueType | undefined {
    if (path.length === 0) {
      return this.rootNode.type;
    }
    return resolveNodeAtPath(this.rootNode, path)?.type;
  }

  public getRequiredLeafPaths(): string[] {
    const paths: string[] = [];
    collectRequiredLeafPaths(this.rootNode, '', paths, true);
    return paths;
  }

  public isArrayPath(path: string): boolean {
    if (path.length === 0) {
      return this.rootNode.type === 'array';
    }
    return resolveNodeAtPath(this.rootNode, path)?.type === 'array';
  }
}

function createPermissiveXsdTree(): SchemaTree {
  const infoDiagnostic: Diagnostic = {
    code: 'KEYRA-I001',
    severity: 'info',
    message:
      'XSD schema support is not yet implemented — schema-dependent validation checks are skipped',
  };

  return {
    diagnostics: [infoDiagnostic],
    hasPath: () => true,
    getTypeAtPath: () => undefined,
    getRequiredLeafPaths: () => [],
    isArrayPath: () => false,
  };
}

function buildJsonSchemaTree(schema: unknown): SchemaTree {
  const rootNode = buildNode(schema, {
    rootSchema: schema,
    required: true,
    seenRefs: new Set<string>(),
  });

  return new SchemaTreeImpl(rootNode, []);
}

export function buildSchemaTree(
  schema: unknown,
  format: 'json-schema' | 'xsd' = 'json-schema',
): SchemaTree {
  if (format === 'xsd') {
    return createPermissiveXsdTree();
  }

  return buildJsonSchemaTree(schema);
}

export function getOrBuildSchemaTree(
  schema: unknown,
  format: 'json-schema' | 'xsd' = 'json-schema',
): SchemaTree {
  if (!isRecord(schema)) {
    return buildSchemaTree(schema, format);
  }

  const cached = schemaTreeCache.get(schema);
  if (cached) {
    return cached;
  }

  const tree = buildSchemaTree(schema, format);
  schemaTreeCache.set(schema, tree);
  return tree;
}
