import { schemaNodes } from '../persistence/schema-nodes.js';
import type { SchemaNodeItem } from '../persistence/types.js';
import { getRetrievalCaps } from './constants.js';
import type {
  SchemaRetriever,
  SchemaRetrieverMode,
  SchemaRetrieverSearchRequest,
  SchemaSearchResult,
} from './types.js';

const RETRIEVER_MODE_ENV = 'RAG_RETRIEVER';

interface ScoredCandidate {
  readonly item: SchemaNodeItem;
  readonly lexicalScore: number;
  readonly vectorScore?: number;
  readonly score: number;
  readonly isExpandedContext?: boolean;
}

interface EmbeddingRerankOutcome {
  readonly candidates: readonly ScoredCandidate[];
  readonly queryEmbeddingComputed: boolean;
  readonly rerankApplied: boolean;
  readonly embeddingCandidates: number;
  readonly approxEmbeddingReadBytes: number;
  readonly rerankMs: number;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return 20;
  }

  const floored = Math.floor(limit);
  if (floored <= 0) {
    return 20;
  }

  return Math.min(floored, 100);
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase();
}

function tokenizeQuery(query: string): string[] {
  const unique = new Set(
    normalizeTerm(query)
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  );

  return [...unique];
}

function startsWithAny(value: string, terms: readonly string[]): boolean {
  const normalized = normalizeTerm(value);
  return terms.some((term) => normalized.startsWith(term));
}

function includesAny(value: string, terms: readonly string[]): boolean {
  const normalized = normalizeTerm(value);
  return terms.some((term) => normalized.includes(term));
}

function scoreLexicalCandidate(item: SchemaNodeItem, terms: readonly string[]): number {
  const path = normalizeTerm(item.path);
  const fieldName = normalizeTerm(item.fieldName);

  let score = 0;

  for (const term of terms) {
    if (fieldName === term) {
      score += 120;
      continue;
    }

    if (path === term) {
      score += 100;
      continue;
    }

    if (fieldName.startsWith(term)) {
      score += 80;
    } else if (fieldName.includes(term)) {
      score += 60;
    }

    if (path.startsWith(term)) {
      score += 50;
    } else if (path.includes(term)) {
      score += 35;
    }

    if (includesAny(item.embeddingText ?? '', [term])) {
      score += 12;
    }
  }

  if (startsWithAny(item.fieldName, terms)) {
    score += 8;
  }

  if (typeof item.depth === 'number') {
    score += Math.max(0, 10 - item.depth);
  }

  return score;
}

function passesFilters(item: SchemaNodeItem, filters: SchemaRetrieverSearchRequest['filters']): boolean {
  if (!filters) {
    return true;
  }

  if (filters.type && filters.type.length > 0 && !filters.type.includes(item.type)) {
    return false;
  }

  if (typeof filters.isArray === 'boolean' && item.isArray !== filters.isArray) {
    return false;
  }

  if (typeof filters.depth === 'number' && item.depth !== Math.floor(filters.depth)) {
    return false;
  }

  return true;
}

function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const pathCompare = a.item.path.localeCompare(b.item.path);
  if (pathCompare !== 0) {
    return pathCompare;
  }

  const fieldCompare = a.item.fieldName.localeCompare(b.item.fieldName);
  if (fieldCompare !== 0) {
    return fieldCompare;
  }

  return a.item.type.localeCompare(b.item.type);
}

function toSchemaSearchResultWithScore(candidate: ScoredCandidate): SchemaSearchResult {
  return {
    path: candidate.item.path,
    fieldName: candidate.item.fieldName,
    type: candidate.item.type,
    depth: candidate.item.depth,
    isArray: candidate.item.isArray,
    score: candidate.score,
    embeddingText: candidate.item.embeddingText,
  };
}

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  return defaultValue;
}

function parseWeight(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function computeTopKHitDepth(results: readonly SchemaSearchResult[], topK: number): number | undefined {
  const slice = results.slice(0, Math.max(1, topK));
  if (slice.length === 0) {
    return undefined;
  }

  return Math.min(...slice.map((item) => item.depth));
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createQueryEmbedding(query: string, dimension: number): readonly number[] | null {
  if (!Number.isInteger(dimension) || dimension <= 0) {
    return null;
  }

  const terms = tokenizeQuery(query);
  if (terms.length === 0) {
    return null;
  }

  const vector = new Array<number>(dimension).fill(0);
  for (const term of terms) {
    const hashA = hashString(term);
    const hashB = hashString(`sign:${term}`);
    const index = hashA % dimension;
    const sign = hashB % 2 === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + (sign * (1 + Math.min(term.length, 24) / 24));
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (norm === 0) {
    return null;
  }

  return vector.map((value) => value / norm);
}

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    const aValue = a[i] ?? 0;
    const bValue = b[i] ?? 0;
    dot += aValue * bValue;
    aNorm += aValue * aValue;
    bNorm += bValue * bValue;
  }

  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function getEmbeddingDimension(item: SchemaNodeItem): number | null {
  if (!Array.isArray(item.embedding) || item.embedding.length === 0) {
    return null;
  }

  return item.embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
    ? item.embedding.length
    : null;
}

function resolveRerankEnabled(request: SchemaRetrieverSearchRequest): boolean {
  if (typeof request.enableRerank === 'boolean') {
    return request.enableRerank;
  }

  return parseBooleanFlag(getEnvValue('RAG_ENABLE_EMBEDDING_RERANK'), true);
}

function resolveContextExpansionEnabled(request: SchemaRetrieverSearchRequest): boolean {
  return request.includeContextExpansion === true;
}

function resolveRerankWeights(): { lexicalWeight: number; vectorWeight: number; boostWeight: number } {
  const lexicalWeight = parseWeight(getEnvValue('RAG_RERANK_LEXICAL_WEIGHT'), 0.55);
  const vectorWeight = parseWeight(getEnvValue('RAG_RERANK_VECTOR_WEIGHT'), 0.35);
  const boostWeight = parseWeight(getEnvValue('RAG_RERANK_BOOST_WEIGHT'), 0.1);
  const total = lexicalWeight + vectorWeight + boostWeight;

  if (total <= 0) {
    return { lexicalWeight: 0.55, vectorWeight: 0.35, boostWeight: 0.1 };
  }

  return {
    lexicalWeight: lexicalWeight / total,
    vectorWeight: vectorWeight / total,
    boostWeight: boostWeight / total,
  };
}

function scorePathTypeBoost(item: SchemaNodeItem): number {
  let score = 0;
  if (item.type === 'object') {
    score += 0.05;
  }

  if (item.type === 'array') {
    score += 0.03;
  }

  if (item.path.includes('.')) {
    score += 0.02;
  }

  if (item.isRequired) {
    score += 0.03;
  }

  if (typeof item.depth === 'number' && item.depth <= 2) {
    score += 0.03;
  }

  return Math.min(score, 0.2);
}

function rerankCandidates(
  request: SchemaRetrieverSearchRequest,
  candidates: readonly ScoredCandidate[],
  rerankCap: number,
): EmbeddingRerankOutcome {
  const rerankStartedAt = Date.now();
  if (!resolveRerankEnabled(request) || candidates.length === 0 || rerankCap <= 0) {
    return {
      candidates,
      queryEmbeddingComputed: false,
      rerankApplied: false,
      embeddingCandidates: 0,
      approxEmbeddingReadBytes: 0,
      rerankMs: Date.now() - rerankStartedAt,
    };
  }

  const rerankSlice = candidates.slice(0, Math.min(rerankCap, candidates.length));
  const embeddingDimensions = rerankSlice
    .map((candidate) => getEmbeddingDimension(candidate.item))
    .filter((dimension): dimension is number => typeof dimension === 'number');

  if (embeddingDimensions.length === 0) {
    return {
      candidates,
      queryEmbeddingComputed: false,
      rerankApplied: false,
      embeddingCandidates: 0,
      approxEmbeddingReadBytes: 0,
      rerankMs: Date.now() - rerankStartedAt,
    };
  }

  const dimension = embeddingDimensions[0] ?? 0;
  const queryEmbedding = createQueryEmbedding(request.query, dimension);
  if (!queryEmbedding) {
    return {
      candidates,
      queryEmbeddingComputed: false,
      rerankApplied: false,
      embeddingCandidates: 0,
      approxEmbeddingReadBytes: 0,
      rerankMs: Date.now() - rerankStartedAt,
    };
  }

  const maxLexical = rerankSlice.reduce(
    (max, candidate) => Math.max(max, candidate.lexicalScore),
    1,
  );
  const weights = resolveRerankWeights();
  let embeddingCandidates = 0;
  let approxEmbeddingReadBytes = 0;

  const rerankedSlice = rerankSlice.map((candidate) => {
    const itemEmbedding = candidate.item.embedding;
    if (!Array.isArray(itemEmbedding) || itemEmbedding.length !== dimension) {
      return candidate;
    }

    if (!itemEmbedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return candidate;
    }

    embeddingCandidates += 1;
    approxEmbeddingReadBytes += itemEmbedding.length * 8;

    const vectorRaw = cosineSimilarity(queryEmbedding, itemEmbedding);
    const vectorNormalized = Math.max(0, Math.min(1, (vectorRaw + 1) / 2));
    const lexicalNormalized = Math.max(0, Math.min(1, candidate.lexicalScore / maxLexical));
    const boost = scorePathTypeBoost(candidate.item);
    const blended = (lexicalNormalized * weights.lexicalWeight)
      + (vectorNormalized * weights.vectorWeight)
      + (boost * weights.boostWeight);

    return {
      ...candidate,
      vectorScore: vectorRaw,
      score: blended,
    };
  });

  const sortedReranked = [...rerankedSlice].sort(compareCandidates);
  const combined = [...sortedReranked, ...candidates.slice(rerankSlice.length)];

  return {
    candidates: combined,
    queryEmbeddingComputed: true,
    rerankApplied: embeddingCandidates > 0,
    embeddingCandidates,
    approxEmbeddingReadBytes,
    rerankMs: Date.now() - rerankStartedAt,
  };
}

function parentPathOf(path: string): string | undefined {
  const index = path.lastIndexOf('.');
  if (index <= 0) {
    return undefined;
  }

  return path.slice(0, index);
}

function expandContext(
  ranked: readonly ScoredCandidate[],
  allNodes: readonly SchemaNodeItem[],
  finalLimit: number,
  caps: ReturnType<typeof getRetrievalCaps>,
): readonly ScoredCandidate[] {
  const baseCount = Math.min(ranked.length, Math.min(finalLimit, caps.topK));
  const base = ranked.slice(0, baseCount);
  const expansionCap = Math.max(0, caps.contextExpansionCap);

  if (base.length === 0 || expansionCap === 0) {
    return ranked.slice(0, finalLimit);
  }

  const existingByPath = new Set(base.map((candidate) => candidate.item.path));
  const allByPath = new Map(allNodes.map((node) => [node.path, node] as const));
  const childrenByParent = new Map<string, SchemaNodeItem[]>();

  for (const node of allNodes) {
    if (typeof node.parentPath !== 'string' || node.parentPath === '') {
      continue;
    }

    const bucket = childrenByParent.get(node.parentPath) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parentPath, bucket);
  }

  for (const bucket of childrenByParent.values()) {
    bucket.sort((a, b) => a.path.localeCompare(b.path));
  }

  const expansions: ScoredCandidate[] = [];
  const baseByPath = new Map(base.map((candidate) => [candidate.item.path, candidate] as const));

  const pushExpansion = (node: SchemaNodeItem | undefined): void => {
    if (!node || existingByPath.has(node.path) || expansions.length >= expansionCap) {
      return;
    }

    existingByPath.add(node.path);
    const existingBase = baseByPath.get(node.path);
    expansions.push({
      item: node,
      lexicalScore: existingBase?.lexicalScore ?? 0,
      score: existingBase?.score ?? 0,
      isExpandedContext: true,
    });
  };

  for (const candidate of base) {
    if (expansions.length >= expansionCap) {
      break;
    }

    const parentPath = candidate.item.parentPath ?? parentPathOf(candidate.item.path);
    pushExpansion(parentPath ? allByPath.get(parentPath) : undefined);

    if (expansions.length >= expansionCap) {
      break;
    }

    if (parentPath) {
      const siblings = childrenByParent.get(parentPath) ?? [];
      for (const sibling of siblings) {
        if (sibling.path === candidate.item.path) {
          continue;
        }

        pushExpansion(sibling);
        if (expansions.length >= expansionCap) {
          break;
        }
      }
    }

    if (expansions.length >= expansionCap) {
      break;
    }

    const children = childrenByParent.get(candidate.item.path) ?? [];
    for (const child of children) {
      pushExpansion(child);
      if (expansions.length >= expansionCap) {
        break;
      }
    }
  }

  const combined = [...base, ...expansions];
  return combined.slice(0, Math.min(finalLimit, base.length + expansionCap));
}

export function parseSchemaRetrieverMode(raw: string | undefined): SchemaRetrieverMode {
  const normalized = raw?.trim().toLowerCase();

  if (normalized === undefined || normalized === '') {
    return 'dynamodb';
  }

  if (normalized === 'dynamodb') {
    return normalized;
  }

  throw new Error(
    `Invalid ${RETRIEVER_MODE_ENV} value '${raw}'. Expected one of: dynamodb`,
  );
}

export function getSchemaRetrieverMode(): SchemaRetrieverMode {
  return parseSchemaRetrieverMode(getEnvValue(RETRIEVER_MODE_ENV));
}

async function searchViaDynamo(request: SchemaRetrieverSearchRequest): Promise<SchemaSearchResult[]> {
  const retrievalStartedAt = Date.now();
  const normalizedLimit = normalizeLimit(request.limit);
  const caps = getRetrievalCaps();
  const lexicalCap = caps.lexicalCap;
  const terms = tokenizeQuery(request.query);

  if (terms.length === 0) {
    return [];
  }

  const fetchLimit = Math.max(lexicalCap * 3, normalizedLimit, 50);
  const nodes = await schemaNodes.queryContains(request.schemaId, request.query, fetchLimit);

  const scored: ScoredCandidate[] = [];
  for (const node of nodes) {
    if (!passesFilters(node, request.filters)) {
      continue;
    }

    const score = scoreLexicalCandidate(node, terms);
    if (score <= 0) {
      continue;
    }

    scored.push({ item: node, lexicalScore: score, score });
  }

  scored.sort(compareCandidates);

  const limitedByLexical = scored.slice(0, lexicalCap);
  const reranked = rerankCandidates(request, limitedByLexical, caps.rerankCap);

  console.info('[schema-retriever] dynamodb rerank stage', {
    schemaId: request.schemaId,
    requestId: request.requestId,
    correlationId: request.correlationId,
    queryLength: request.query.length,
    lexicalCandidateCount: limitedByLexical.length,
    rerankCap: caps.rerankCap,
    queryEmbeddingComputed: reranked.queryEmbeddingComputed,
    rerankApplied: reranked.rerankApplied,
    embeddingCandidates: reranked.embeddingCandidates,
    approxEmbeddingReadBytes: reranked.approxEmbeddingReadBytes,
    rerankMs: reranked.rerankMs,
  });

  const finalLimit = Math.min(normalizedLimit, lexicalCap);

  if (!resolveContextExpansionEnabled(request)) {
    return reranked.candidates.slice(0, finalLimit).map(toSchemaSearchResultWithScore);
  }

  const allNodes = await schemaNodes.listBySchema(request.schemaId);
  const expanded = expandContext(reranked.candidates, allNodes, finalLimit, caps);

  console.info('[schema-retriever] dynamodb context expansion stage', {
    schemaId: request.schemaId,
    queryLength: request.query.length,
    topK: caps.topK,
    contextExpansionCap: caps.contextExpansionCap,
    baseCount: Math.min(reranked.candidates.length, Math.min(finalLimit, caps.topK)),
    expandedCount: expanded.length,
  });

  const finalResults = expanded.map(toSchemaSearchResultWithScore);
  console.info('[schema-retriever] dynamodb retrieval completed', {
    schemaId: request.schemaId,
    requestId: request.requestId,
    correlationId: request.correlationId,
    candidate_count: limitedByLexical.length,
    result_count: finalResults.length,
    retrieval_ms: Date.now() - retrievalStartedAt,
    rerank_ms: reranked.rerankMs,
    topk_hit_depth: computeTopKHitDepth(finalResults, caps.topK),
    include_context_expansion: true,
  });

  return finalResults;
}

async function searchViaDynamoWithoutExpansion(request: SchemaRetrieverSearchRequest): Promise<SchemaSearchResult[]> {
  const retrievalStartedAt = Date.now();
  const normalizedLimit = normalizeLimit(request.limit);
  const caps = getRetrievalCaps();
  const lexicalCap = caps.lexicalCap;
  const terms = tokenizeQuery(request.query);

  if (terms.length === 0) {
    return [];
  }

  const fetchLimit = Math.max(lexicalCap * 3, normalizedLimit, 50);
  const nodes = await schemaNodes.queryContains(request.schemaId, request.query, fetchLimit);

  const scored: ScoredCandidate[] = [];
  for (const node of nodes) {
    if (!passesFilters(node, request.filters)) {
      continue;
    }

    const score = scoreLexicalCandidate(node, terms);
    if (score <= 0) {
      continue;
    }

    scored.push({ item: node, lexicalScore: score, score });
  }

  scored.sort(compareCandidates);
  const limitedByLexical = scored.slice(0, lexicalCap);
  const reranked = rerankCandidates(request, limitedByLexical, caps.rerankCap);
  const finalLimit = Math.min(normalizedLimit, lexicalCap);
  const finalResults = reranked.candidates.slice(0, finalLimit).map(toSchemaSearchResultWithScore);

  console.info('[schema-retriever] dynamodb rerank stage', {
    schemaId: request.schemaId,
    requestId: request.requestId,
    correlationId: request.correlationId,
    queryLength: request.query.length,
    lexicalCandidateCount: limitedByLexical.length,
    rerankCap: caps.rerankCap,
    queryEmbeddingComputed: reranked.queryEmbeddingComputed,
    rerankApplied: reranked.rerankApplied,
    embeddingCandidates: reranked.embeddingCandidates,
    approxEmbeddingReadBytes: reranked.approxEmbeddingReadBytes,
    rerankMs: reranked.rerankMs,
  });

  console.info('[schema-retriever] dynamodb retrieval completed', {
    schemaId: request.schemaId,
    requestId: request.requestId,
    correlationId: request.correlationId,
    candidate_count: limitedByLexical.length,
    result_count: finalResults.length,
    retrieval_ms: Date.now() - retrievalStartedAt,
    rerank_ms: reranked.rerankMs,
    topk_hit_depth: computeTopKHitDepth(finalResults, caps.topK),
    include_context_expansion: false,
  });

  return finalResults;
}

class RuntimeSchemaRetriever implements SchemaRetriever {
  async searchSchemaNodes(request: SchemaRetrieverSearchRequest): Promise<SchemaSearchResult[]> {
    const mode = getSchemaRetrieverMode();

    if (mode !== 'dynamodb') {
      throw new Error(`Unsupported retriever mode '${mode}' after OpenSearch decommission`);
    }

    return resolveContextExpansionEnabled(request)
      ? searchViaDynamo(request)
      : searchViaDynamoWithoutExpansion(request);
  }
}

const runtimeSchemaRetriever = new RuntimeSchemaRetriever();

export function getSchemaRetriever(): SchemaRetriever {
  return runtimeSchemaRetriever;
}
