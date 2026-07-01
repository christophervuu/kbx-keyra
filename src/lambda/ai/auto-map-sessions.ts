import {
  assertExpectedSuggestionVersion,
  buildHistoryIndexAttributes,
  buildOpenSessionIndexAttributes,
  createRequestFingerprint,
  nextSuggestionVersion,
  runSk,
  sessionMetaSk,
  sessionPk,
  type AutoMapRunItem,
  type AutoMapRunStatus,
  type AutoMapScopeMode,
  type AutoMapSessionItem,
  type AutoMapSuggestionItem,
  type SuggestionReviewStatus,
} from '../../lib/persistence/auto-map.js';
import {
  getAutoMapRun,
  getAutoMapSession,
  getAutoMapSuggestion,
  listAutoMapRuns,
  listAutoMapSuggestions,
  listAutoMapWorkUnits,
  listOpenSessionsByMapping,
  putAutoMapRun,
  putAutoMapSession,
  putAutoMapSuggestion,
  supersedeSession,
  updateSessionRunPointer,
} from '../../lib/persistence/auto-map-store.js';
import {
  ERROR_CODES,
  conflict,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { aiErrorResponse, aiJsonResponse } from './cors.js';

type AutoMapExecutionMode = 'disabled' | 'legacy' | 'async';

type StartRunRequest = {
  readonly projectId?: string;
  readonly mappingId?: string;
  readonly baseMappingRevision?: number;
  readonly scope?: {
    readonly mode?: AutoMapScopeMode;
    readonly sectionPath?: string;
    readonly targetPaths?: readonly string[];
    readonly refreshOfRunId?: string;
    readonly retryWorkUnitIds?: readonly string[];
  };
  readonly idempotencyKey?: string;
};

type SuggestionFilter = {
  readonly status?: readonly SuggestionReviewStatus[];
};

const ACTIVE_RUN_STATUSES: readonly AutoMapRunStatus[] = ['queued', 'preparing', 'retrieving', 'generating', 'validating'];
const CURSOR_SORT_VERSION = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function plusDaysEpoch(days: number): number {
  return Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
}

function executionMode(): AutoMapExecutionMode {
  const raw = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.AUTO_MAP_EXECUTION_MODE ?? 'async').trim();
  if (raw === 'disabled' || raw === 'legacy' || raw === 'async') {
    return raw;
  }

  return 'async';
}

function featureDisabledResponse(): APIGatewayProxyResult {
  return aiErrorResponse(
    ERROR_CODES.FEATURE_NOT_ENABLED,
    'Auto-Map async session API is disabled in this environment',
    403,
    false,
  );
}

function isOptionsRequest(event: APIGatewayProxyEvent): boolean {
  return event.httpMethod?.toUpperCase() === 'OPTIONS';
}

function requireSessionId(event: APIGatewayProxyEvent): string | null {
  return parsePathParam(event, 'sessionId');
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== 'string') {
    return 100;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  if (parsed < 20) {
    return 20;
  }

  if (parsed > 250) {
    return 250;
  }

  return parsed;
}

function normalizeFilter(event: APIGatewayProxyEvent): SuggestionFilter {
  const rawStatus = event.queryStringParameters?.status;
  if (!rawStatus || rawStatus.trim() === '') {
    return {};
  }

  const normalized = rawStatus
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is SuggestionReviewStatus =>
      value === 'pending'
      || value === 'editing'
      || value === 'accepted'
      || value === 'accepted-edited'
      || value === 'dismissed'
      || value === 'kept-current'
      || value === 'stale'
      || value === 'conflict')
    .sort();

  return normalized.length > 0 ? { status: normalized } : {};
}

function filterHash(filter: SuggestionFilter): string {
  return JSON.stringify({ status: filter.status ?? [] });
}

function encodeCursor(payload: { readonly s: string; readonly fh: string; readonly sv: number; readonly o: number }): string {
  return encodeURIComponent(JSON.stringify(payload));
}

function decodeCursor(value: string): { readonly s: string; readonly fh: string; readonly sv: number; readonly o: number } | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as {
      readonly s?: unknown;
      readonly fh?: unknown;
      readonly sv?: unknown;
      readonly o?: unknown;
    };

    if (typeof parsed.s !== 'string' || typeof parsed.fh !== 'string' || typeof parsed.sv !== 'number' || typeof parsed.o !== 'number') {
      return null;
    }

    return {
      s: parsed.s,
      fh: parsed.fh,
      sv: parsed.sv,
      o: parsed.o,
    };
  } catch {
    return null;
  }
}

function applySuggestionFilter(items: readonly AutoMapSuggestionItem[], filter: SuggestionFilter): AutoMapSuggestionItem[] {
  if (!filter.status || filter.status.length === 0) {
    return [...items];
  }

  const allowed = new Set(filter.status);
  return items.filter((item) => allowed.has(item.reviewStatus));
}

function randomId(prefix: string): string {
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

async function resolveRetryWorkUnitIds(sessionId: string, explicit: readonly string[] | undefined): Promise<readonly string[]> {
  if (explicit && explicit.length > 0) {
    return explicit;
  }

  const runs = await listAutoMapRuns(sessionId);
  const latest = runs[0];
  if (!latest) {
    return [];
  }

  const workUnits = await listAutoMapWorkUnits(sessionId, latest.runId);
  return workUnits.filter((item) => item.status === 'failed').map((item) => item.workUnitId);
}

async function createRunForSession(session: AutoMapSessionItem, request: StartRunRequest): Promise<{ run: AutoMapRunItem; deduped: boolean }> {
  const createdAt = nowIso();
  const idempotencyKey = typeof request.idempotencyKey === 'string' && request.idempotencyKey.trim() !== ''
    ? request.idempotencyKey.trim()
    : randomId('idk');

  const scopeMode = request.scope?.mode ?? 'whole';
  const retryWorkUnitIds = scopeMode === 'retry-failed'
    ? await resolveRetryWorkUnitIds(session.sessionId, request.scope?.retryWorkUnitIds)
    : request.scope?.retryWorkUnitIds;

  const fingerprint = await createRequestFingerprint({
    mappingId: session.mappingId,
    baseMappingRevision: session.baseMappingRevision,
    sourceSchemaVersion: session.generationFingerprint.sourceSchema.version,
    targetSchemaVersion: session.generationFingerprint.targetSchema.version,
    enrichmentSchemaVersions: session.generationFingerprint.enrichmentSchemas.map((schema) => ({ inputId: schema.inputId, version: schema.version })),
    scopeMode,
    sectionPath: request.scope?.sectionPath,
    targetPaths: request.scope?.targetPaths,
    promptVersion: session.generationFingerprint.promptVersion,
    model: session.generationFingerprint.model,
  });

  const existingRuns = await listAutoMapRuns(session.sessionId);
  const existingActive = existingRuns.find((run) =>
    ACTIVE_RUN_STATUSES.includes(run.status)
    && (run.requestFingerprint === fingerprint || run.idempotencyKey === idempotencyKey));
  if (existingActive) {
    return { run: existingActive, deduped: true };
  }

  const runId = randomId('run');
  const run: AutoMapRunItem = {
    PK: sessionPk(session.sessionId),
    SK: runSk(createdAt, runId),
    entityType: 'AutoMapRun',
    sessionId: session.sessionId,
    runId,
    status: 'queued',
    scope: {
      mode: scopeMode,
      ...(request.scope?.sectionPath ? { sectionPath: request.scope.sectionPath } : {}),
      ...(request.scope?.targetPaths ? { targetPaths: request.scope.targetPaths } : {}),
      ...(request.scope?.refreshOfRunId ? { refreshOfRunId: request.scope.refreshOfRunId } : {}),
      ...(retryWorkUnitIds && retryWorkUnitIds.length > 0 ? { retryWorkUnitIds } : {}),
    },
    requestFingerprint: fingerprint,
    idempotencyKey,
    progress: {
      completedWorkUnits: 0,
      totalWorkUnits: 0,
      completedTargets: 0,
      totalTargets: 0,
    },
    counts: {
      generated: 0,
      ready: 0,
      warning: 0,
      invalid: 0,
      failedTargets: 0,
    },
    createdAt,
    updatedAt: createdAt,
  };

  await putAutoMapRun(run);
  await updateSessionRunPointer(session.sessionId, run.runId, createdAt);

  return { run, deduped: false };
}

export async function getCapabilitiesHandler(): Promise<APIGatewayProxyResult> {
  return aiJsonResponse(200, {
    capabilities: {
      autoMap: {
        enabled: executionMode() !== 'disabled',
        executionMode: executionMode(),
      },
    },
  });
}

export async function createSessionHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (executionMode() === 'disabled') {
    return featureDisabledResponse();
  }

  const body = parseBody(event) as StartRunRequest | null;
  if (!body || !body.mappingId || !body.projectId || typeof body.baseMappingRevision !== 'number') {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request body', 400, false);
  }

  const now = nowIso();
  const openSessions = await listOpenSessionsByMapping(body.mappingId);
  const sameRevision = openSessions.find((session) => session.baseMappingRevision === body.baseMappingRevision);
  let session = sameRevision;

  if (!session) {
    for (const open of openSessions) {
      if (open.status !== 'superseded') {
        await supersedeSession(open.sessionId, now);
      }
    }

    const sessionId = randomId('ams');
    const sessionItem: AutoMapSessionItem = {
      PK: sessionPk(sessionId),
      SK: sessionMetaSk(),
      entityType: 'AutoMapSession',
      sessionId,
      mappingId: body.mappingId,
      projectId: body.projectId,
      status: 'open',
      baseMappingRevision: body.baseMappingRevision,
      generationFingerprint: {
        sourceSchema: { id: 'unknown', version: 'unknown' },
        targetSchema: { id: 'unknown', version: 'unknown' },
        enrichmentSchemas: [],
        engineVersion: 'unknown',
        dslVersion: 'unknown',
        promptId: 'auto-map',
        promptVersion: 'unknown',
        model: 'unknown',
      },
      reviewCounts: {
        pending: 0,
        editing: 0,
        accepted: 0,
        acceptedEdited: 0,
        dismissed: 0,
        keptCurrent: 0,
        stale: 0,
        conflict: 0,
        invalid: 0,
      },
      createdAt: now,
      updatedAt: now,
      expiresAt: plusDaysEpoch(30),
      ...buildHistoryIndexAttributes(body.mappingId, now, sessionId),
      ...buildOpenSessionIndexAttributes(body.mappingId, now, sessionId),
    };

    await putAutoMapSession(sessionItem);
    session = sessionItem;
  }

  const runResult = await createRunForSession(session, body);

  return aiJsonResponse(202, {
    sessionId: session.sessionId,
    runId: runResult.run.runId,
    status: runResult.run.status,
    deduped: runResult.deduped,
    capabilities: {
      autoMap: {
        enabled: true,
        executionMode: executionMode(),
      },
    },
  });
}

export async function createRunHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (executionMode() === 'disabled') {
    return featureDisabledResponse();
  }

  const sessionId = requireSessionId(event);
  if (!sessionId) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing sessionId path parameter', 400, false);
  }

  const session = await getAutoMapSession(sessionId);
  if (!session) {
    return aiErrorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Session with id '${sessionId}' not found`, 404, false);
  }

  const body = parseBody(event) as StartRunRequest | null;
  if (!body || !body.scope || !body.scope.mode) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request body', 400, false);
  }

  const runResult = await createRunForSession(session, body);
  return aiJsonResponse(202, {
    sessionId,
    runId: runResult.run.runId,
    status: runResult.run.status,
    scope: runResult.run.scope,
    deduped: runResult.deduped,
  });
}

export async function getRunStatusHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const sessionId = requireSessionId(event);
  const runId = parsePathParam(event, 'runId');
  if (!sessionId || !runId) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter', 400, false);
  }

  const run = await getAutoMapRun(sessionId, runId);
  if (!run) {
    return aiErrorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Run with id '${runId}' not found`, 404, false);
  }

  return aiJsonResponse(200, run);
}

export async function listSuggestionsHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const sessionId = requireSessionId(event);
  if (!sessionId) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing sessionId path parameter', 400, false);
  }

  const limit = normalizeLimit(event.queryStringParameters?.limit);
  const filter = normalizeFilter(event);
  const hash = filterHash(filter);
  const sortVersion = CURSOR_SORT_VERSION;
  const cursorRaw = event.queryStringParameters?.cursor;
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && (!cursor || cursor.s !== sessionId || cursor.fh !== hash || cursor.sv !== sortVersion)) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid cursor for session/filter/sort binding', 400, false);
  }

  const offset = cursor?.o ?? 0;
  const suggestions = applySuggestionFilter(await listAutoMapSuggestions(sessionId), filter);
  const items = suggestions.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const nextCursor = nextOffset < suggestions.length
    ? encodeCursor({ s: sessionId, fh: hash, sv: sortVersion, o: nextOffset })
    : null;

  return aiJsonResponse(200, {
    items,
    page: {
      limit,
      nextCursor,
      total: suggestions.length,
      offset,
    },
  });
}

function computeDecisionStatus(
  action: string,
  current: AutoMapSuggestionItem,
): SuggestionReviewStatus {
  if (action === 'accept') {
    return 'accepted';
  }
  if (action === 'apply-edit') {
    return 'accepted-edited';
  }
  if (action === 'dismiss') {
    return 'dismissed';
  }
  if (action === 'keep-current') {
    return 'kept-current';
  }
  if (action === 'undo' || action === 'cancel-edit') {
    return 'pending';
  }

  return current.reviewStatus;
}

export async function updateSuggestionHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const sessionId = requireSessionId(event);
  const suggestionId = parsePathParam(event, 'suggestionId');
  if (!sessionId || !suggestionId) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter', 400, false);
  }

  const body = parseBody(event) as { action?: string; expectedVersion?: number; editedExpression?: string } | null;
  if (!body || typeof body.action !== 'string' || typeof body.expectedVersion !== 'number') {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid suggestion decision payload', 400, false);
  }

  const current = await getAutoMapSuggestion(sessionId, suggestionId);
  if (!current) {
    return aiErrorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Suggestion with id '${suggestionId}' not found`, 404, false);
  }

  try {
    assertExpectedSuggestionVersion(current.version, body.expectedVersion);
  } catch {
    const appError = conflict('Suggestion version conflict. Refresh and retry with latest expectedVersion.');
    return aiErrorResponse(appError.code, appError.message, appError.statusCode, appError.retryable);
  }

  const now = nowIso();
  const updated: AutoMapSuggestionItem = {
    ...current,
    reviewStatus: computeDecisionStatus(body.action, current),
    version: nextSuggestionVersion(current.version),
    ...(body.action === 'accept' || body.action === 'apply-edit'
      ? {
          acceptedExpression: typeof body.editedExpression === 'string' && body.editedExpression.trim() !== ''
            ? body.editedExpression
            : current.acceptedExpression,
          priorExpressionAtAcceptance: current.priorExpressionAtAcceptance ?? null,
          acceptedAtMappingRevision: current.acceptedAtMappingRevision ?? 0,
          materializedAt: current.materializedAt ?? now,
        }
      : {}),
  };

  await putAutoMapSuggestion(updated);
  return aiJsonResponse(200, updated);
}

function batchSkipReason(action: string, item: AutoMapSuggestionItem): string | null {
  if (action === 'accept' && (item.validationState === 'invalid' || item.reviewStatus === 'stale' || item.reviewStatus === 'conflict')) {
    return item.validationState === 'invalid' ? 'invalid' : item.reviewStatus;
  }

  return null;
}

export async function batchSuggestionActionsHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const sessionId = requireSessionId(event);
  if (!sessionId) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing sessionId path parameter', 400, false);
  }

  const body = parseBody(event) as {
    action?: 'accept' | 'dismiss' | 'keep-current';
    suggestionIds?: readonly string[];
  } | null;
  if (!body || !body.action) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid batch action payload', 400, false);
  }

  const suggestions = await listAutoMapSuggestions(sessionId);
  const targetIds = new Set(body.suggestionIds ?? suggestions.map((item) => item.suggestionId));
  const skipped: Array<{ suggestionId: string; reason: string }> = [];
  let appliedCount = 0;

  for (const item of suggestions) {
    if (!targetIds.has(item.suggestionId)) {
      continue;
    }

    const reason = batchSkipReason(body.action, item);
    if (reason) {
      skipped.push({ suggestionId: item.suggestionId, reason });
      continue;
    }

    const updated: AutoMapSuggestionItem = {
      ...item,
      reviewStatus: computeDecisionStatus(body.action, item),
      version: nextSuggestionVersion(item.version),
    };
    await putAutoMapSuggestion(updated);
    appliedCount += 1;
  }

  return aiJsonResponse(200, {
    appliedCount,
    skippedCount: skipped.length,
    skipped,
  });
}

export async function getOpenSessionByMappingHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId');
  if (!mappingId) {
    return aiErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing mappingId path parameter', 400, false);
  }

  const sessions = await listOpenSessionsByMapping(mappingId);
  const session = sessions.find((item) => item.status === 'open' || item.status === 'generating' || item.status === 'reviewing') ?? null;
  return aiJsonResponse(200, session);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (isOptionsRequest(event)) {
    return aiJsonResponse(200, { ok: true });
  }

  const method = event.httpMethod?.toUpperCase() ?? 'GET';
  const hasSessionId = Boolean(parsePathParam(event, 'sessionId'));
  const hasRunId = Boolean(parsePathParam(event, 'runId'));
  const hasSuggestionId = Boolean(parsePathParam(event, 'suggestionId'));
  const hasMappingId = Boolean(parsePathParam(event, 'mappingId'));

  if (method === 'GET' && !hasSessionId && !hasMappingId) {
    return getCapabilitiesHandler();
  }

  if (method === 'GET' && hasMappingId && !hasSessionId) {
    return getOpenSessionByMappingHandler(event);
  }

  if (method === 'POST' && !hasSessionId) {
    return createSessionHandler(event);
  }

  if (method === 'POST' && hasSessionId && hasRunId === false) {
    const body = parseBody(event) as { action?: string; scope?: { mode?: string } } | null;
    if (body?.action) {
      return batchSuggestionActionsHandler(event);
    }

    return createRunHandler(event);
  }

  if (method === 'GET' && hasSessionId && hasRunId) {
    return getRunStatusHandler(event);
  }

  if (method === 'GET' && hasSessionId && !hasRunId && !hasSuggestionId) {
    return listSuggestionsHandler(event);
  }

  if (method === 'PATCH' && hasSessionId && hasSuggestionId) {
    return updateSuggestionHandler(event);
  }

  return aiErrorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, 'Auto-Map route not found', 404, false);
}
