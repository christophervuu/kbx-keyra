import { generateEmbeddingText } from '../embedding-text.js';
import type { SchemaNode } from '../types.js';

export interface ParseResult {
  readonly nodes: SchemaNode[];
  readonly fieldCount: number;
  readonly errors?: readonly string[];
}

export function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) {
    return [];
  }

  return (Array.isArray(value) ? value : [value]) as readonly T[];
}

interface MutableSchemaNode {
  readonly schemaId: string;
  readonly path: string;
  readonly fieldName: string;
  type: string;
  description?: string;
  readonly depth: number;
  isArray: boolean;
  isRequired: boolean;
  parentPath?: string;
  childCount: number;
  subtreeFieldCount: number;
  embeddingText: string;
  embedding?: readonly number[];
  readonly children: Set<string>;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getEmbeddingDimension(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const raw = env?.SCHEMA_NODE_EMBEDDING_DIMENSION;
  if (!raw) {
    return 12;
  }

  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 128) {
    return 12;
  }

  return parsed;
}

function computeEmbedding(text: string, dimension: number): readonly number[] {
  const vector = new Array<number>(dimension).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return vector;
  }

  for (const token of tokens) {
    const hash = hashString(token);
    const sign = hash % 2 === 0 ? 1 : -1;
    const index = hash % dimension;
    vector[index] = (vector[index] ?? 0) + (sign * (1 + Math.min(token.length, 24) / 24));
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (norm === 0) {
    return vector;
  }

  return vector.map((value) => value / norm);
}

export class SchemaNodeAccumulator {
  private readonly nodes = new Map<string, MutableSchemaNode>();

  private readonly order: string[] = [];

  public upsertNode(node: {
    readonly schemaId: string;
    readonly path: string;
    readonly fieldName: string;
    readonly type: string;
    readonly description?: string;
    readonly depth: number;
    readonly isArray: boolean;
    readonly isRequired: boolean;
    readonly parentPath?: string;
  }): void {
    const existing = this.nodes.get(node.path);
    if (!existing) {
      this.nodes.set(node.path, {
        schemaId: node.schemaId,
        path: node.path,
        fieldName: node.fieldName,
        type: node.type,
        description: node.description,
        depth: node.depth,
        isArray: node.isArray,
        isRequired: node.isRequired,
        parentPath: node.parentPath,
        childCount: 0,
        subtreeFieldCount: 1,
        embeddingText: '',
        children: new Set<string>(),
      });
      this.order.push(node.path);
      return;
    }

    existing.isArray = existing.isArray || node.isArray;
    existing.isRequired = existing.isRequired || node.isRequired;

    if (!existing.parentPath && node.parentPath) {
      existing.parentPath = node.parentPath;
    }

    if (!existing.description && node.description) {
      existing.description = node.description;
    }

    if (existing.type === 'object' && node.type !== 'object') {
      existing.type = node.type;
    }
  }

  public link(parentPath: string, childPath: string): void {
    const parent = this.nodes.get(parentPath);
    if (!parent) {
      return;
    }

    parent.children.add(childPath);
  }

  public finalize(): ParseResult {
    const embeddingDimension = getEmbeddingDimension();
    const subtreeCache = new Map<string, number>();

    const computeSubtree = (path: string): number => {
      const cached = subtreeCache.get(path);
      if (cached !== undefined) {
        return cached;
      }

      const node = this.nodes.get(path);
      if (!node) {
        return 0;
      }

      if (node.children.size === 0) {
        subtreeCache.set(path, 1);
        return 1;
      }

      let sum = 0;
      for (const childPath of node.children) {
        sum += computeSubtree(childPath);
      }

      subtreeCache.set(path, sum);
      return sum;
    };

    let leafCount = 0;
    for (const path of this.order) {
      const node = this.nodes.get(path);
      if (!node) {
        continue;
      }

      node.childCount = node.children.size;
      node.subtreeFieldCount = computeSubtree(path);

      if (node.childCount === 0) {
        leafCount += 1;
      }

      node.embeddingText = generateEmbeddingText({
        schemaId: node.schemaId,
        path: node.path,
        fieldName: node.fieldName,
        type: node.type,
        description: node.description,
        depth: node.depth,
        isArray: node.isArray,
        isRequired: node.isRequired,
        parentPath: node.parentPath,
        childCount: node.childCount,
        subtreeFieldCount: node.subtreeFieldCount,
        embeddingText: '',
      });
      node.embedding = computeEmbedding(node.embeddingText, embeddingDimension);
    }

    const finalizedNodes: SchemaNode[] = this.order
      .map((path) => this.nodes.get(path))
      .filter((node): node is MutableSchemaNode => node !== undefined)
      .map((node) => ({
        schemaId: node.schemaId,
        path: node.path,
        fieldName: node.fieldName,
        type: node.type,
        description: node.description,
        depth: node.depth,
        isArray: node.isArray,
        isRequired: node.isRequired,
        parentPath: node.parentPath,
        childCount: node.childCount,
        subtreeFieldCount: node.subtreeFieldCount,
        embeddingText: node.embeddingText,
        embedding: node.embedding,
      }));

    return {
      nodes: finalizedNodes,
      fieldCount: leafCount,
    };
  }
}
