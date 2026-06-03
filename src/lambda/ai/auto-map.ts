import { parse } from '../../engine/dsl/index.js';
import { registerAllFunctions } from '../../engine/functions/index.js';
import { defaultRegistry } from '../../engine/registry/function-registry.js';
import { searchSchemaNodes } from '../../lib/schema/index.js';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import type { Diagnostic } from '../../engine/types/index.js';
import { invokeAI, normalizeAIError } from '../../lib/ai/index.js';
import {
  ERROR_CODES,
  errorResponse,
  getItem,
  generateRequestId,
  jsonResponse,
  notFound,
  parseBody,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

const AUTO_MAP_LOG_PREFIX = '[auto-map lambda]';
const LOG_TEXT_LIMIT = 400;
const MAX_QUERY_TERMS = 12;
const MAX_RESULTS_PER_TERM = 25;
const MAX_SELECTED_CONTEXT_LINES_SECTION = 120;
const MAX_SELECTED_CONTEXT_LINES_WHOLE = 220;
const DEFAULT_CHUNK_TARGET = 75;
const MIN_CHUNK_TARGET = 50;
const MAX_CHUNK_TARGET = 100;
const DEFAULT_MAX_CONCURRENCY = 4;
const HARD_MAX_CONCURRENCY = 4;
const DEFAULT_STEP_FUNCTIONS_TARGET_THRESHOLD = 600;
const DEFAULT_STEP_FUNCTIONS_CHUNK_THRESHOLD = 8;

type AutoMapMode = 'section' | 'whole';

interface MappingMetadataRecord {
  readonly mappingId: string;
  readonly sourceSchemaId?: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const AUTO_MAP_STEP_FUNCTIONS_ARN = getEnvValue('AUTO_MAP_STEP_FUNCTIONS_ARN');

function getMappingsTableOrThrow(): string {
  const value = MAPPINGS_TABLE?.trim();
  if (!value) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return value;
}

const sfnClient = new SFNClient({
  region: getEnvValue('AWS_REGION') ?? 'us-east-1',
});

let functionsInitialized = false;

function ensureEngineFunctionsRegistered(): void {
  if (functionsInitialized) {
    return;
  }

  const registryLike = defaultRegistry as unknown as { registerFunction?: unknown };
  if (typeof registryLike.registerFunction !== 'function') {
    console.info(`${AUTO_MAP_LOG_PREFIX} skipped function registration: registry is not initialized`);
    return;
  }

  registerAllFunctions(defaultRegistry);
  functionsInitialized = true;
}

ensureEngineFunctionsRegistered();

function truncateForLog(value: string): string {
  if (value.length <= LOG_TEXT_LIMIT) {
    return value;
  }

  return `${value.slice(0, LOG_TEXT_LIMIT)}... (truncated ${value.length - LOG_TEXT_LIMIT} chars)`;
}

function summarizeTextField(value: unknown):
  | {
      length: number;
      preview: string;
    }
  | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return {
    length: value.length,
    preview: truncateForLog(value),
  };
}

function autoMapJsonResponse(statusCode: number, payload: unknown, requestId?: string): APIGatewayProxyResult {
  const base = jsonResponse(statusCode, payload, requestId);
  return {
    ...base,
    headers: {
      ...(base.headers ?? {}),
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  };
}

function parseTargetListing(targetSection: string): Set<string> | null {
  const lines = targetSection.split('\n');
  const allowedTargets = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }

    const match = /^-\s+(.+?)\s+\(.+\)$/.exec(trimmed);
    if (match?.[1]) {
      allowedTargets.add(match[1]);
    }
  }

  return allowedTargets.size > 0 ? allowedTargets : null;
}

function parseTargetPaths(targetSection: string): string[] {
  const lines = targetSection.split('\n');
  const paths: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }

    const match = /^-\s+(.+?)\s+\(.+\)$/.exec(trimmed);
    if (match?.[1]) {
      paths.push(match[1]);
    }
  }

  return paths;
}

function parseTargetSectionLines(targetSection: string): string[] {
  return targetSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && line.startsWith('- '));
}

function parseTargetTypeMap(targetSection: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = targetSection.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }

    const match = /^-\s+(.+?)\s+\((.+)\)$/.exec(trimmed);
    const path = match?.[1]?.trim();
    const type = match?.[2]?.trim().toLowerCase();
    if (path && type) {
      map.set(path, type);
    }
  }

  return map;
}

function chunkTargetSectionLines(lines: readonly string[], chunkTarget: number): string[] {
  if (lines.length <= chunkTarget) {
    return [lines.join('\n')];
  }

  const chunks: string[] = [];
  for (let index = 0; index < lines.length; index += chunkTarget) {
    chunks.push(lines.slice(index, index + chunkTarget).join('\n'));
  }

  return chunks;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function resolveChunkTarget(): number {
  const configured = parsePositiveInteger(getEnvValue('AUTO_MAP_CHUNK_TARGET'), DEFAULT_CHUNK_TARGET);
  return Math.max(MIN_CHUNK_TARGET, Math.min(MAX_CHUNK_TARGET, configured));
}

function resolveMaxConcurrency(): number {
  const configured = parsePositiveInteger(getEnvValue('AUTO_MAP_MAX_CONCURRENCY'), DEFAULT_MAX_CONCURRENCY);
  return Math.max(1, Math.min(HARD_MAX_CONCURRENCY, configured));
}

function resolveStepFunctionsThresholds(): {
  readonly targetThreshold: number;
  readonly chunkThreshold: number;
} {
  return {
    targetThreshold: parsePositiveInteger(
      getEnvValue('AUTO_MAP_STEP_FUNCTIONS_TARGET_THRESHOLD'),
      DEFAULT_STEP_FUNCTIONS_TARGET_THRESHOLD,
    ),
    chunkThreshold: parsePositiveInteger(
      getEnvValue('AUTO_MAP_STEP_FUNCTIONS_CHUNK_THRESHOLD'),
      DEFAULT_STEP_FUNCTIONS_CHUNK_THRESHOLD,
    ),
  };
}

function shouldHandoffToStepFunctions(params: {
  readonly mode: AutoMapMode;
  readonly targetCount: number;
  readonly chunkCount: number;
}): boolean {
  if (params.mode !== 'whole') {
    return false;
  }

  const thresholds = resolveStepFunctionsThresholds();
  return params.targetCount >= thresholds.targetThreshold || params.chunkCount >= thresholds.chunkThreshold;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index] as T, index);
    }
  };

  const workerCount = Math.min(Math.max(concurrency, 1), items.length);
  const runners = Array.from({ length: workerCount }, () => runWorker());
  await Promise.all(runners);

  return results;
}

async function startAutoMapStepFunctionExecution(params: {
  readonly requestId: string;
  readonly mappingId?: string;
  readonly sourceSchemaId?: string;
  readonly mode: AutoMapMode;
  readonly sectionPath?: string;
  readonly targetSection: string;
  readonly businessContext: string;
  readonly chunkCount: number;
  readonly chunkTarget: number;
}): Promise<string> {
  if (!AUTO_MAP_STEP_FUNCTIONS_ARN || AUTO_MAP_STEP_FUNCTIONS_ARN.trim() === '') {
    throw new Error('Step Functions handoff required but AUTO_MAP_STEP_FUNCTIONS_ARN is not configured');
  }

  const command = new StartExecutionCommand({
    stateMachineArn: AUTO_MAP_STEP_FUNCTIONS_ARN,
    name: `automap-${params.requestId}`,
    input: JSON.stringify({
      requestId: params.requestId,
      mode: params.mode,
      mappingId: params.mappingId,
      sourceSchemaId: params.sourceSchemaId,
      sectionPath: params.sectionPath,
      targetSection: params.targetSection,
      businessContext: params.businessContext,
      chunkCount: params.chunkCount,
      chunkTarget: params.chunkTarget,
    }),
  });

  const response = await sfnClient.send(command);
  if (!response.executionArn) {
    throw new Error('Step Functions execution did not return executionArn');
  }

  return response.executionArn;
}

function deriveRetrievalTerms(params: {
  readonly targetSection: string;
  readonly mode: AutoMapMode;
  readonly sectionPath?: string;
}): string[] {
  const targetPaths = parseTargetPaths(params.targetSection);
  const terms = new Set<string>();

  for (const path of targetPaths) {
    const segments = path.split('.').filter(Boolean);
    const leaf = segments[segments.length - 1];
    if (leaf) {
      terms.add(leaf);
    }

    if (params.mode === 'section' && segments.length > 1) {
      terms.add(segments[segments.length - 2] ?? '');
    }
  }

  if (params.mode === 'section' && typeof params.sectionPath === 'string' && params.sectionPath !== '') {
    const sectionSegments = params.sectionPath.split('.').filter(Boolean);
    const leafSection = sectionSegments[sectionSegments.length - 1];
    if (leafSection) {
      terms.add(leafSection);
    }
  }

  return [...terms]
    .map((term) => term.trim())
    .filter((term) => term.length > 1)
    .slice(0, MAX_QUERY_TERMS);
}

function scoreCandidate(
  candidate: { readonly fieldName: string; readonly path: string; readonly score: number; readonly embeddingText: string },
  queryTerm: string,
): number {
  const normalizedTerm = queryTerm.toLowerCase();
  const fieldName = candidate.fieldName.toLowerCase();
  const path = candidate.path.toLowerCase();
  const embeddingText = candidate.embeddingText.toLowerCase();

  let weighted = candidate.score;
  if (fieldName === normalizedTerm) {
    weighted += 2;
  }
  if (path.endsWith(`.${normalizedTerm}`) || path === normalizedTerm) {
    weighted += 1.25;
  }
  if (embeddingText.includes(normalizedTerm)) {
    weighted += 0.5;
  }

  return weighted;
}

async function resolveSourceSchemaId(params: {
  readonly sourceSchemaIdFromBody?: string;
  readonly mappingId?: string;
  readonly requestId: string;
}): Promise<string | APIGatewayProxyResult> {
  if (typeof params.sourceSchemaIdFromBody === 'string' && params.sourceSchemaIdFromBody.trim() !== '') {
    return params.sourceSchemaIdFromBody.trim();
  }

  if (!params.mappingId) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Missing required retrieval identity: provide sourceSchemaId or mappingId',
      400,
      false,
      params.requestId,
    );
  }

  const mapping = await getItem<MappingMetadataRecord>({
    TableName: getMappingsTableOrThrow(),
    Key: { mappingId: params.mappingId },
  });

  if (!mapping) {
    const err = notFound('Mapping', params.mappingId, params.requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, params.requestId);
  }

  if (!mapping.sourceSchemaId || mapping.sourceSchemaId.trim() === '') {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      `Mapping '${params.mappingId}' is missing required source schema reference`,
      400,
      false,
      params.requestId,
    );
  }

  return mapping.sourceSchemaId;
}

function validateExpression(expression: string): { valid: boolean; diagnostics: string[] } {
  try {
    const parseResult = parse(expression, {
      registry: defaultRegistry,
    });

    const errorDiagnostics = parseResult.diagnostics.filter(
      (diagnostic: Diagnostic) => diagnostic.severity === 'error',
    );

    return {
      valid: errorDiagnostics.length === 0,
      diagnostics: errorDiagnostics.map((diagnostic) => diagnostic.message),
    };
  } catch {
    return {
      valid: false,
      diagnostics: ['Validation failed'],
    };
  }
}

function normalizeValidationDiagnostics(diagnostics: string[]): Array<{
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}> {
  return diagnostics.map((message) => ({
    code: 'PARSE_ERROR',
    severity: 'error',
    message,
  }));
}

function normalizeRuleValidation(rule: Record<string, unknown>): {
  valid: boolean;
  diagnostics: Array<{
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
  }>;
} {
  const validationRecord =
    typeof rule.validation === 'object' && rule.validation !== null
      ? (rule.validation as Record<string, unknown>)
      : null;

  const rawDiagnostics =
    validationRecord && Array.isArray(validationRecord.diagnostics)
      ? validationRecord.diagnostics
      : [];

  const diagnostics = rawDiagnostics
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (typeof item === 'object' && item !== null && typeof item.message === 'string') {
        return item.message;
      }

      return null;
    })
    .filter((item): item is string => typeof item === 'string');

  const hasExplicitValid = validationRecord && typeof validationRecord.valid === 'boolean';
  const valid = hasExplicitValid ? (validationRecord.valid as boolean) : false;

  if (valid) {
    return {
      valid: true,
      diagnostics: [],
    };
  }

  const messages = diagnostics.length > 0 ? diagnostics : ['Validation failed'];
  return {
    valid: false,
    diagnostics: normalizeValidationDiagnostics(messages),
  };
}

function buildSuggestions(
  enrichedRules: unknown[],
  parsedTargetListing: Set<string> | null,
): Array<{
  target: string;
  expression: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  validation: {
    valid: boolean;
    diagnostics: Array<{
      code: string;
      severity: 'error' | 'warning' | 'info';
      message: string;
    }>;
  };
}> {
  const normalizeConfidence = (value: unknown): 'high' | 'medium' | 'low' => {
    if (value === 'high' || value === 'medium' || value === 'low') {
      return value;
    }

    return 'low';
  };

  return enrichedRules
    .filter((rule): rule is Record<string, unknown> => typeof rule === 'object' && rule !== null)
    .map((rule) => {
      const normalizedValidation = normalizeRuleValidation(rule);

      return {
        target: typeof rule.target === 'string' ? rule.target : '',
        expression: typeof rule.expression === 'string' ? rule.expression : '',
        explanation: typeof rule.explanation === 'string' ? rule.explanation : '',
        confidence: normalizeConfidence(rule.confidence),
        validation: normalizedValidation,
      };
    })
    .filter((suggestion) => suggestion.target !== '' && suggestion.expression !== '')
    .filter((suggestion) => {
      if (parsedTargetListing === null) {
        return true;
      }

      const isAllowed = parsedTargetListing.has(suggestion.target);
      if (!isAllowed) {
        console.warn(
          `[auto-map] Suggestion target not in listing, filtered: ${suggestion.target}`,
        );
      }
      return isAllowed;
    });
}

function confidenceScore(confidence: 'high' | 'medium' | 'low'): number {
  if (confidence === 'high') {
    return 3;
  }
  if (confidence === 'medium') {
    return 2;
  }
  return 1;
}

function isScalarType(typeName: string | undefined): boolean {
  if (!typeName) {
    return false;
  }

  return typeName !== 'object' && typeName !== 'array';
}

function deduplicateRulesByTarget(
  rules: Array<Record<string, unknown>>,
  targetTypeByPath: Map<string, string>,
): {
  readonly deduped: Array<Record<string, unknown>>;
  readonly dedupDecisions: Array<{
    target: string;
    winnerSourceChunkRef: string | null;
    loserSourceChunkRef: string | null;
    reason: 'validation' | 'confidence' | 'target-type' | 'expression-lexicographic' | 'stable-order';
  }>;
} {
  const bestByTarget = new Map<string, { rule: Record<string, unknown>; index: number }>();
  const dedupDecisions: Array<{
    target: string;
    winnerSourceChunkRef: string | null;
    loserSourceChunkRef: string | null;
    reason: 'validation' | 'confidence' | 'target-type' | 'expression-lexicographic' | 'stable-order';
  }> = [];

  const compare = (
    incumbent: Record<string, unknown>,
    challenger: Record<string, unknown>,
  ): {
    winner: 'incumbent' | 'challenger';
    reason: 'validation' | 'confidence' | 'target-type' | 'expression-lexicographic' | 'stable-order';
  } => {
    const incumbentValidation = (incumbent.validation as { valid?: boolean } | undefined)?.valid === true;
    const challengerValidation = (challenger.validation as { valid?: boolean } | undefined)?.valid === true;
    if (incumbentValidation !== challengerValidation) {
      return {
        winner: challengerValidation ? 'challenger' : 'incumbent',
        reason: 'validation',
      };
    }

    const incumbentConfidence = confidenceScore(
      (incumbent.confidence as 'high' | 'medium' | 'low' | undefined) ?? 'low',
    );
    const challengerConfidence = confidenceScore(
      (challenger.confidence as 'high' | 'medium' | 'low' | undefined) ?? 'low',
    );
    if (incumbentConfidence !== challengerConfidence) {
      return {
        winner: challengerConfidence > incumbentConfidence ? 'challenger' : 'incumbent',
        reason: 'confidence',
      };
    }

    const target = typeof incumbent.target === 'string' ? incumbent.target : '';
    const targetType = targetTypeByPath.get(target);
    const incumbentScalar = isScalarType(
      targetType ?? (typeof incumbent.targetType === 'string' ? incumbent.targetType.toLowerCase() : undefined),
    );
    const challengerScalar = isScalarType(
      targetType ?? (typeof challenger.targetType === 'string' ? challenger.targetType.toLowerCase() : undefined),
    );
    if (incumbentScalar !== challengerScalar) {
      return {
        winner: challengerScalar ? 'challenger' : 'incumbent',
        reason: 'target-type',
      };
    }

    const incumbentExpression = typeof incumbent.expression === 'string' ? incumbent.expression : '';
    const challengerExpression = typeof challenger.expression === 'string' ? challenger.expression : '';
    if (incumbentExpression !== challengerExpression) {
      return {
        winner: challengerExpression.localeCompare(incumbentExpression) < 0 ? 'challenger' : 'incumbent',
        reason: 'expression-lexicographic',
      };
    }

    return {
      winner: 'incumbent',
      reason: 'stable-order',
    };
  };

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index] as Record<string, unknown>;
    const target = typeof rule.target === 'string' ? rule.target : '';
    if (target === '') {
      continue;
    }

    const incumbent = bestByTarget.get(target);
    if (!incumbent) {
      bestByTarget.set(target, { rule, index });
      continue;
    }

    const decision = compare(incumbent.rule, rule);
    const winnerRule = decision.winner === 'challenger' ? rule : incumbent.rule;
    const loserRule = decision.winner === 'challenger' ? incumbent.rule : rule;

    if (decision.winner === 'challenger') {
      bestByTarget.set(target, { rule, index });
    }

    dedupDecisions.push({
      target,
      winnerSourceChunkRef:
        typeof winnerRule.sourceChunkRef === 'string' ? winnerRule.sourceChunkRef : null,
      loserSourceChunkRef:
        typeof loserRule.sourceChunkRef === 'string' ? loserRule.sourceChunkRef : null,
      reason: decision.reason,
    });
  }

  const deduped = [...bestByTarget.values()]
    .sort((a, b) => {
      const targetA = typeof a.rule.target === 'string' ? a.rule.target : '';
      const targetB = typeof b.rule.target === 'string' ? b.rule.target : '';
      if (targetA === targetB) {
        return a.index - b.index;
      }
      return targetA.localeCompare(targetB);
    })
    .map((entry) => entry.rule);

  return {
    deduped,
    dedupDecisions,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  console.info(`${AUTO_MAP_LOG_PREFIX} request received`, {
    httpMethod: event.httpMethod ?? 'UNKNOWN',
    hasBody: typeof event.body === 'string',
    bodyLength: typeof event.body === 'string' ? event.body.length : 0,
  });

  if (event.httpMethod === 'OPTIONS') {
    console.info(`${AUTO_MAP_LOG_PREFIX} options preflight`);
    return autoMapJsonResponse(200, {
      ok: true,
    }, requestId);
  }

  const requestBody = parseBody(event);
  if (!requestBody) {
    console.error(`${AUTO_MAP_LOG_PREFIX} invalid request body`, {
      bodyPreview: typeof event.body === 'string' ? truncateForLog(event.body) : null,
    });
    return autoMapJsonResponse(400, {
      error: 'Invalid request body',
    }, requestId);
  }

  const targetSectionRaw = requestBody.targetSection;
  const sectionPathRaw = requestBody.sectionPath;
  const modeRaw = requestBody.mode;
  const mappingId = typeof requestBody.mappingId === 'string' && requestBody.mappingId !== ''
    ? requestBody.mappingId
    : undefined;
  const sourceSchemaIdFromBody =
    typeof requestBody.sourceSchemaId === 'string' && requestBody.sourceSchemaId !== ''
      ? requestBody.sourceSchemaId
      : undefined;

  let mode: AutoMapMode;
  if (modeRaw === undefined || modeRaw === null || modeRaw === '') {
    mode = typeof sectionPathRaw === 'string' && sectionPathRaw !== '' ? 'section' : 'whole';
  } else if (modeRaw === 'section' || modeRaw === 'whole') {
    mode = modeRaw;
  } else {
    return autoMapJsonResponse(400, {
      error: 'Invalid mode: expected "section" or "whole"',
    }, requestId);
  }

  const targetSection =
    typeof targetSectionRaw === 'string' && targetSectionRaw !== ''
      ? targetSectionRaw
      : typeof sectionPathRaw === 'string' && sectionPathRaw !== ''
        ? sectionPathRaw
        : null;
  const parsedTargetListing =
    typeof targetSectionRaw === 'string' && targetSectionRaw !== ''
      ? parseTargetListing(targetSectionRaw)
      : null;

  if (targetSection === null) {
    console.error(`${AUTO_MAP_LOG_PREFIX} missing target section`, {
      hasTargetSection: typeof targetSectionRaw === 'string' && targetSectionRaw !== '',
      hasSectionPath: typeof sectionPathRaw === 'string' && sectionPathRaw !== '',
    });
    return autoMapJsonResponse(400, {
      error: 'Missing required field: targetSection or sectionPath',
    }, requestId);
  }

  const sourceContextFromBody = requestBody.sourceContext;

  const businessContext = typeof requestBody.businessContext === 'string' ? requestBody.businessContext : '';
  const isSectionRequest = mode === 'section';

  let sourceContext: string | null = null;
  let retrievalCandidatesCount = 0;
  let retrievalSelectedCount = 0;
  let sourceSchemaId: string | undefined;
  let noContextReason: string | undefined;

  if (typeof sourceContextFromBody === 'string' && sourceContextFromBody.trim() !== '') {
    sourceContext = sourceContextFromBody;
    retrievalSelectedCount = sourceContextFromBody.split('\n').filter((line) => line.trim() !== '').length;
  } else {
    const resolvedSourceSchemaId = await resolveSourceSchemaId({
      sourceSchemaIdFromBody,
      mappingId,
      requestId,
    });

    if (typeof resolvedSourceSchemaId !== 'string') {
      return resolvedSourceSchemaId;
    }

    sourceSchemaId = resolvedSourceSchemaId;

    const retrievalTerms = deriveRetrievalTerms({
      targetSection,
      mode,
      sectionPath: typeof sectionPathRaw === 'string' ? sectionPathRaw : undefined,
    });

    if (retrievalTerms.length > 0) {
      const searchResultsByTerm = await Promise.all(
        retrievalTerms.map(async (term) => {
          const results = await searchSchemaNodes(
            resolvedSourceSchemaId,
            term,
            undefined,
            MAX_RESULTS_PER_TERM,
          );

          retrievalCandidatesCount += results.length;
          return { term, results };
        }),
      );

      const weightedByPath = new Map<string, {
        path: string;
        fieldName: string;
        type: string;
        embeddingText: string;
        score: number;
      }>();

      for (const { term, results } of searchResultsByTerm) {
        for (const candidate of results) {
          const weighted = scoreCandidate(candidate, term);
          const existing = weightedByPath.get(candidate.path);
          if (!existing || weighted > existing.score) {
            weightedByPath.set(candidate.path, {
              path: candidate.path,
              fieldName: candidate.fieldName,
              type: candidate.type,
              embeddingText: candidate.embeddingText,
              score: weighted,
            });
          }
        }
      }

      const selectedLimit = mode === 'section'
        ? MAX_SELECTED_CONTEXT_LINES_SECTION
        : MAX_SELECTED_CONTEXT_LINES_WHOLE;

      const selected = [...weightedByPath.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, selectedLimit);

      retrievalSelectedCount = selected.length;
      sourceContext = selected
        .map((candidate) => `- ${candidate.path} (${candidate.type})`)
        .join('\n');
    }

    if (!sourceContext || sourceContext.trim() === '') {
      noContextReason = 'No relevant source context found for target scope';
    }
  }

  const targetLines = parseTargetSectionLines(targetSection);
  const targetTypeByPath = parseTargetTypeMap(targetSection);
  const chunkTarget = resolveChunkTarget();
  const maxConcurrency = resolveMaxConcurrency();
  const targetChunks = targetLines.length > 0
    ? chunkTargetSectionLines(targetLines, chunkTarget)
    : [targetSection];

  const retrievalMeta = {
    requestId,
    mappingId: mappingId ?? null,
    sourceSchemaId: sourceSchemaId ?? sourceSchemaIdFromBody ?? null,
    mode,
    retrievalCandidatesCount,
    retrievalSelectedCount,
    chunkCount: targetChunks.length,
    chunkIds: targetChunks.map((_, index) => `chunk-${index + 1}`),
    chunkTarget,
    maxConcurrency,
    noContext: noContextReason !== undefined,
    noContextReason,
  };

  console.info(`${AUTO_MAP_LOG_PREFIX} validated request`, {
    isSectionRequest,
    mode,
    mappingId: mappingId ?? null,
    sourceSchemaId: sourceSchemaId ?? sourceSchemaIdFromBody ?? null,
    sectionPath: typeof sectionPathRaw === 'string' ? sectionPathRaw : null,
    targetSection: summarizeTextField(targetSection),
    sourceContext: summarizeTextField(sourceContext),
    businessContext: summarizeTextField(businessContext),
    parsedTargetListingCount: parsedTargetListing ? parsedTargetListing.size : null,
    retrievalCandidatesCount,
    retrievalSelectedCount,
    noContextReason,
  });

  if (noContextReason !== undefined) {
    return autoMapJsonResponse(200, {
      success: true,
      promptId: 'auto-map',
      model: 'none',
      data: {
        rules: [],
        suggestions: [],
        retrievalMeta,
      },
    }, requestId);
  }

  if (typeof sourceContext !== 'string' || sourceContext.trim() === '') {
    return autoMapJsonResponse(400, {
      error: 'Missing required field: sourceContext',
    }, requestId);
  }

  if (shouldHandoffToStepFunctions({
    mode,
    targetCount: targetLines.length,
    chunkCount: targetChunks.length,
  })) {
    try {
      const executionArn = await startAutoMapStepFunctionExecution({
        requestId,
        mappingId,
        sourceSchemaId: sourceSchemaId ?? sourceSchemaIdFromBody,
        mode,
        sectionPath: typeof sectionPathRaw === 'string' ? sectionPathRaw : undefined,
        targetSection,
        businessContext,
        chunkCount: targetChunks.length,
        chunkTarget,
      });

      return autoMapJsonResponse(202, {
        success: true,
        promptId: 'auto-map',
        model: 'orchestrated',
        data: {
          rules: [],
          suggestions: [],
          retrievalMeta,
          orchestration: {
            executionArn,
            stateMachineArn: AUTO_MAP_STEP_FUNCTIONS_ARN,
            queued: true,
          },
        },
      }, requestId);
    } catch (error) {
      console.error(`${AUTO_MAP_LOG_PREFIX} step functions handoff failed`, {
        message: error instanceof Error ? error.message : 'unknown-handoff-error',
      });
      return errorResponse(
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Auto-Map orchestration is temporarily unavailable',
        503,
        true,
        requestId,
      );
    }
  }

  try {
    console.info(`${AUTO_MAP_LOG_PREFIX} invoking ai runtime`, {
      promptId: 'auto-map',
    });

    const chunkInvocationResults = await mapWithConcurrency(
      targetChunks,
      maxConcurrency,
      async (chunkTargetSection, index) => {
        const chunkId = `chunk-${index + 1}`;
        const chunkResult = await invokeAI('auto-map', {
          targetSection: chunkTargetSection,
          sourceContext,
          businessContext,
          mode,
          chunkId,
          chunkCount: String(targetChunks.length),
        });

        return {
          chunkId,
          result: chunkResult,
        };
      },
    );

    const successfulChunkResults: Array<{ chunkId: string; result: Record<string, unknown> }> = [];
    const chunkWarnings: Array<{ chunkId: string; code: string; message: string }> = [];
    let firstFailureNormalized: ReturnType<typeof normalizeAIError> | null = null;

    for (const item of chunkInvocationResults) {
      if (item.result.success) {
        successfulChunkResults.push({
          chunkId: item.chunkId,
          result: item.result as unknown as Record<string, unknown>,
        });
      } else {
        const normalized = normalizeAIError(item.result.error);
        chunkWarnings.push({
          chunkId: item.chunkId,
          code: normalized.code,
          message: normalized.message,
        });
        if (firstFailureNormalized === null) {
          firstFailureNormalized = normalized;
        }
      }
    }

    if (successfulChunkResults.length === 0) {
      if (!firstFailureNormalized) {
        return errorResponse(
          ERROR_CODES.INTERNAL_ERROR,
          'Auto-Map produced no chunk results',
          500,
          true,
          requestId,
        );
      }

      return errorResponse(
        firstFailureNormalized.code,
        firstFailureNormalized.message,
        firstFailureNormalized.statusCode,
        firstFailureNormalized.retryable,
        requestId,
      );
    }

    const baseSuccess = successfulChunkResults[0]?.result;
    const aggregatedRules: unknown[] = [];
    for (const chunkSuccess of successfulChunkResults) {
      const rulesValue = (chunkSuccess.result.data as Record<string, unknown> | undefined)?.rules;
      if (Array.isArray(rulesValue)) {
        for (const rule of rulesValue) {
          if (typeof rule === 'object' && rule !== null) {
            aggregatedRules.push({
              ...(rule as Record<string, unknown>),
              sourceChunkRef: chunkSuccess.chunkId,
            });
          } else {
            aggregatedRules.push(rule);
          }
        }
      }
    }

    const result = {
      success: true as const,
      promptId: typeof baseSuccess?.promptId === 'string' ? baseSuccess.promptId : 'auto-map',
      model: typeof baseSuccess?.model === 'string' ? baseSuccess.model : 'unknown',
      data: {
        rules: aggregatedRules,
        warnings: chunkWarnings,
      },
    };

    console.info(`${AUTO_MAP_LOG_PREFIX} ai runtime result`, {
      success: true,
      promptId: result.promptId,
      model: result.model,
      chunkCount: targetChunks.length,
      successfulChunks: successfulChunkResults.length,
      failedChunks: chunkWarnings.length,
      hasData: true,
    });

    const rulesValue = (result.data as Record<string, unknown>)?.rules;
    if (!Array.isArray(rulesValue)) {
      console.error(`${AUTO_MAP_LOG_PREFIX} ai success payload missing rules array`, {
        rulesType: typeof rulesValue,
      });
      return autoMapJsonResponse(200, {
        ...result,
        data: {
          ...(result.data as Record<string, unknown>),
          retrievalMeta,
        },
      }, requestId);
    }

    console.info(`${AUTO_MAP_LOG_PREFIX} ai rules received`, {
      ruleCount: rulesValue.length,
    });

    const enrichedRules = rulesValue.map((rule) => {
      if (typeof rule !== 'object' || rule === null) {
        return rule;
      }

      const ruleRecord = rule as Record<string, unknown>;
      const expression = ruleRecord.expression;

      const validation =
        typeof expression === 'string'
          ? validateExpression(expression)
          : { valid: false, diagnostics: ['No expression to validate'] };

        return {
          ...ruleRecord,
          validation,
        };
      });

    const dedupInput = enrichedRules.filter(
      (rule): rule is Record<string, unknown> => typeof rule === 'object' && rule !== null,
    );
    const dedupResult = deduplicateRulesByTarget(dedupInput, targetTypeByPath);
    const dedupedRules = dedupResult.deduped;

    const suggestions = buildSuggestions(dedupedRules, parsedTargetListing);
    const validationOutcomes = dedupedRules.map((rule) => {
      const normalizedValidation = normalizeRuleValidation(rule);
      return {
        target: typeof rule.target === 'string' ? rule.target : null,
        sourceChunkRef: typeof rule.sourceChunkRef === 'string' ? rule.sourceChunkRef : null,
        valid: normalizedValidation.valid,
      };
    });
    const validationPassCount = validationOutcomes.filter((item) => item.valid).length;
    const validationFailCount = validationOutcomes.length - validationPassCount;

    console.info(`${AUTO_MAP_LOG_PREFIX} suggestions prepared`, {
      enrichedRuleCount: enrichedRules.length,
      dedupedRuleCount: dedupedRules.length,
      suggestionCount: suggestions.length,
      validationPassCount,
      validationFailCount,
      isSectionRequest,
    });

    console.info(`${AUTO_MAP_LOG_PREFIX} returning enriched rules response`, {
      enrichedRuleCount: enrichedRules.length,
    });

    return autoMapJsonResponse(200, {
      ...result,
      data: {
        ...(result.data as Record<string, unknown>),
        rules: dedupedRules,
        suggestions,
        dedupMeta: {
          duplicatesCollapsed: Math.max(0, dedupInput.length - dedupedRules.length),
          inputRuleCount: dedupInput.length,
          outputRuleCount: dedupedRules.length,
          dedupDecisions: dedupResult.dedupDecisions,
        },
        validationMeta: {
          validationPassCount,
          validationFailCount,
          outcomes: validationOutcomes,
        },
        retrievalMeta,
      },
    }, requestId);
  } catch {
    console.error(`${AUTO_MAP_LOG_PREFIX} unexpected handler error`);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Unexpected error while handling request',
      500,
      true,
      requestId,
    );
  }
}
