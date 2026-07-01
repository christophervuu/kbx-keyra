import type {
  AutoMapRunItem,
  AutoMapSessionItem,
  AutoMapSuggestionItem,
  AutoMapWorkUnitItem,
} from '../persistence/auto-map.js';
import { planAutoMapWorkUnits, type PlannedAutoMapWorkUnit } from './auto-map-work-unit-planner.js';
import type { SchemaNode } from '../schema/types.js';

export interface WorkUnitExecutionSuggestion {
  readonly targetPath: string;
  readonly sectionPath: string;
  readonly expression: string;
  readonly reviewStatus?: AutoMapSuggestionItem['reviewStatus'];
  readonly validationState?: AutoMapSuggestionItem['validationState'];
}

export interface WorkUnitExecutionResult {
  readonly suggestions: readonly WorkUnitExecutionSuggestion[];
}

export interface AutoMapRunOrchestrationDependencies {
  readonly listAutoMapRuns: (sessionId: string) => Promise<AutoMapRunItem[]>;
  readonly listAutoMapSuggestions: (sessionId: string) => Promise<AutoMapSuggestionItem[]>;
  readonly listAutoMapWorkUnits: (sessionId: string, runId: string) => Promise<AutoMapWorkUnitItem[]>;
  readonly putAutoMapWorkUnitIfAbsent: (item: AutoMapWorkUnitItem) => Promise<void>;
  readonly updateAutoMapWorkUnitStatus: (input: {
    readonly sessionId: string;
    readonly runId: string;
    readonly order: number;
    readonly workUnitId: string;
    readonly status: AutoMapWorkUnitItem['status'];
    readonly updatedAt: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly generatedSuggestions?: number;
    readonly failedTargets?: number;
    readonly outcome?: AutoMapWorkUnitItem['outcome'];
    readonly failure?: AutoMapWorkUnitItem['failure'];
  }) => Promise<void>;
  readonly updateAutoMapRunStatus: (input: {
    readonly sessionId: string;
    readonly runId: string;
    readonly fromCreatedAt: string;
    readonly status: AutoMapRunItem['status'];
    readonly updatedAt: string;
    readonly startedAt?: string;
    readonly completedAt?: string;
    readonly failure?: AutoMapRunItem['failure'];
  }) => Promise<void>;
  readonly updateAutoMapRunProgress: (input: {
    readonly sessionId: string;
    readonly runId: string;
    readonly fromCreatedAt: string;
    readonly progress: AutoMapRunItem['progress'];
    readonly counts: AutoMapRunItem['counts'];
    readonly updatedAt: string;
  }) => Promise<void>;
  readonly putAutoMapSuggestions: (items: readonly AutoMapSuggestionItem[]) => Promise<void>;
  readonly updateAutoMapSessionSummary: (input: {
    readonly sessionId: string;
    readonly status: AutoMapSessionItem['status'];
    readonly updatedAt: string;
    readonly reviewCounts: AutoMapSessionItem['reviewCounts'];
    readonly completedAt?: string;
    readonly clearOpenSessionIndex?: boolean;
  }) => Promise<void>;
  readonly executeWorkUnit: (
    unit: PlannedAutoMapWorkUnit,
    attempt: number,
  ) => Promise<WorkUnitExecutionResult>;
  readonly sleepMs?: (ms: number) => Promise<void>;
}

export interface AutoMapRunOrchestrationInput {
  readonly session: AutoMapSessionItem;
  readonly run: AutoMapRunItem;
  readonly targetSchemaNodes: readonly SchemaNode[];
  readonly maxRetries?: number;
  readonly retryBackoffMs?: readonly number[];
}

export interface AutoMapRunOrchestrationOutput {
  readonly sessionId: string;
  readonly runId: string;
  readonly finalRunStatus: AutoMapRunItem['status'];
  readonly totalWorkUnits: number;
  readonly completedWorkUnits: number;
  readonly failedWorkUnits: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isConditionalCheckFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = (error as { name?: unknown }).name;
  const code = (error as { code?: unknown }).code;
  return name === 'ConditionalCheckFailedException' || code === 'ConditionalCheckFailedException';
}

function isTransientFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const name = (error as { name?: unknown }).name;
  return name === 'TimeoutError' || name === 'ThrottlingException' || name === 'ServiceUnavailableException';
}

function toFailure(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    const retryable = (error as { retryable?: unknown }).retryable;
    if (typeof code === 'string' && typeof message === 'string') {
      return {
        code,
        message,
        retryable: typeof retryable === 'boolean' ? retryable : false,
      };
    }
  }

  return {
    code: 'WORK_UNIT_FAILED',
    message: error instanceof Error ? error.message : 'Unknown work-unit failure',
    retryable: isTransientFailure(error),
  };
}

function makeSuggestionId(runId: string, workUnitId: string, targetPath: string, index: number): string {
  const payload = `${runId}|${workUnitId}|${targetPath}|${index}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return `sg_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function toSuggestionItems(params: {
  sessionId: string;
  runId: string;
  workUnitId: string;
  workUnitOrder: number;
  suggestions: readonly WorkUnitExecutionSuggestion[];
}): AutoMapSuggestionItem[] {
  const sorted = [...params.suggestions].sort((left, right) => left.targetPath.localeCompare(right.targetPath));
  return sorted.map((item, index) => ({
    PK: `SESSION#${params.sessionId}`,
    SK: `SUGGESTION#${String(params.workUnitOrder).padStart(6, '0')}#${String(index).padStart(6, '0')}#${makeSuggestionId(params.runId, params.workUnitId, item.targetPath, index)}`,
    entityType: 'AutoMapSuggestion',
    sessionId: params.sessionId,
    runId: params.runId,
    workUnitId: params.workUnitId,
    suggestionId: makeSuggestionId(params.runId, params.workUnitId, item.targetPath, index),
    sectionOrder: params.workUnitOrder,
    targetOrder: index,
    sectionPath: item.sectionPath,
    targetPath: item.targetPath,
    reviewStatus: item.reviewStatus ?? 'pending',
    validationState: item.validationState ?? 'ready',
    sourceReferences: [],
    version: 1,
  }));
}

function baseReviewCounts(): AutoMapSessionItem['reviewCounts'] {
  return {
    pending: 0,
    editing: 0,
    accepted: 0,
    acceptedEdited: 0,
    dismissed: 0,
    keptCurrent: 0,
    stale: 0,
    conflict: 0,
    invalid: 0,
  };
}

function activeRunStatuses(): readonly AutoMapRunItem['status'][] {
  return ['queued', 'preparing', 'retrieving', 'generating', 'validating'];
}

function isResolvedReviewStatus(status: AutoMapSuggestionItem['reviewStatus']): boolean {
  return status === 'accepted'
    || status === 'accepted-edited'
    || status === 'dismissed'
    || status === 'kept-current';
}

function deriveReviewCounts(suggestions: readonly AutoMapSuggestionItem[]): AutoMapSessionItem['reviewCounts'] {
  const counts: {
    pending: number;
    editing: number;
    accepted: number;
    acceptedEdited: number;
    dismissed: number;
    keptCurrent: number;
    stale: number;
    conflict: number;
    invalid: number;
  } = {
    ...baseReviewCounts(),
  };
  for (const item of suggestions) {
    if (item.reviewStatus === 'pending') {
      counts.pending += 1;
    } else if (item.reviewStatus === 'editing') {
      counts.editing += 1;
    } else if (item.reviewStatus === 'accepted') {
      counts.accepted += 1;
    } else if (item.reviewStatus === 'accepted-edited') {
      counts.acceptedEdited += 1;
    } else if (item.reviewStatus === 'dismissed') {
      counts.dismissed += 1;
    } else if (item.reviewStatus === 'kept-current') {
      counts.keptCurrent += 1;
    } else if (item.reviewStatus === 'stale') {
      counts.stale += 1;
    } else if (item.reviewStatus === 'conflict') {
      counts.conflict += 1;
    }

    if (item.validationState === 'invalid') {
      counts.invalid += 1;
    }
  }

  return counts;
}

function canResolveSession(suggestions: readonly AutoMapSuggestionItem[]): boolean {
  if (suggestions.length === 0) {
    return false;
  }

  for (const item of suggestions) {
    if (!isResolvedReviewStatus(item.reviewStatus)) {
      return false;
    }

    if ((item.reviewStatus === 'accepted' || item.reviewStatus === 'accepted-edited')
      && item.materializedMappingRevision === undefined) {
      return false;
    }
  }

  return true;
}

function mergeSuggestionByTargetPath(params: {
  readonly existingSuggestions: readonly AutoMapSuggestionItem[];
  readonly incoming: readonly AutoMapSuggestionItem[];
}): AutoMapSuggestionItem[] {
  const byTarget = new Map<string, AutoMapSuggestionItem>();
  for (const existing of params.existingSuggestions) {
    if (!byTarget.has(existing.targetPath)) {
      byTarget.set(existing.targetPath, existing);
    }
  }

  return params.incoming.map((candidate) => {
    const existing = byTarget.get(candidate.targetPath);
    if (!existing) {
      return candidate;
    }

    return {
      ...candidate,
      PK: existing.PK,
      SK: existing.SK,
      suggestionId: existing.suggestionId,
      version: existing.version + 1,
      acceptedExpression: undefined,
      priorExpressionAtAcceptance: undefined,
      acceptedAtMappingRevision: undefined,
      materializedMappingRevision: undefined,
      materializedAt: undefined,
    };
  });
}

async function resolveRetryFailedTargetPaths(params: {
  readonly dependencies: AutoMapRunOrchestrationDependencies;
  readonly sessionId: string;
  readonly currentRunId: string;
  readonly retryWorkUnitIds: readonly string[];
}): Promise<readonly string[]> {
  const unresolved = new Set(params.retryWorkUnitIds);
  if (unresolved.size === 0) {
    return [];
  }

  const runs = await params.dependencies.listAutoMapRuns(params.sessionId);
  const orderedRuns = runs
    .filter((run) => run.runId !== params.currentRunId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const resolvedById = new Map<string, readonly string[]>();
  for (const run of orderedRuns) {
    if (unresolved.size === 0) {
      break;
    }

    const workUnits = await params.dependencies.listAutoMapWorkUnits(params.sessionId, run.runId);
    for (const workUnit of workUnits) {
      if (!unresolved.has(workUnit.workUnitId)) {
        continue;
      }

      resolvedById.set(workUnit.workUnitId, workUnit.targetPaths ?? []);
      unresolved.delete(workUnit.workUnitId);
    }
  }

  const targetPaths: string[] = [];
  const seen = new Set<string>();
  for (const workUnitId of params.retryWorkUnitIds) {
    const paths = resolvedById.get(workUnitId) ?? [];
    for (const path of paths) {
      if (seen.has(path)) {
        continue;
      }

      seen.add(path);
      targetPaths.push(path);
    }
  }

  return targetPaths;
}

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries: number,
  retryBackoffMs: readonly number[],
  sleepMs: (ms: number) => Promise<void>,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (error) {
      const retryable = isTransientFailure(error);
      if (!retryable || attempt >= maxRetries) {
        throw error;
      }

      const backoff = retryBackoffMs[attempt] ?? retryBackoffMs[retryBackoffMs.length - 1] ?? 0;
      if (backoff > 0) {
        await sleepMs(backoff);
      }
      attempt += 1;
    }
  }
}

export async function orchestrateAutoMapRun(
  dependencies: AutoMapRunOrchestrationDependencies,
  input: AutoMapRunOrchestrationInput,
): Promise<AutoMapRunOrchestrationOutput> {
  const retryBackoffMs = input.retryBackoffMs ?? [100, 250, 500];
  const maxRetries = Math.max(0, input.maxRetries ?? 2);
  const sleepMs = dependencies.sleepMs ?? (async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const plannerScope =
    input.run.scope.mode === 'retry-failed'
      ? {
          ...input.run.scope,
          targetPaths: input.run.scope.targetPaths && input.run.scope.targetPaths.length > 0
            ? input.run.scope.targetPaths
            : await resolveRetryFailedTargetPaths({
                dependencies,
                sessionId: input.session.sessionId,
                currentRunId: input.run.runId,
                retryWorkUnitIds: input.run.scope.retryWorkUnitIds ?? [],
              }),
        }
      : input.run.scope;

  const plan = planAutoMapWorkUnits({
    targetSchemaNodes: input.targetSchemaNodes,
    scope: plannerScope,
  });

  const seededAt = nowIso();
  const existing = await dependencies.listAutoMapWorkUnits(input.session.sessionId, input.run.runId);
  const existingById = new Map(existing.map((item) => [item.workUnitId, item] as const));

  for (const unit of plan.workUnits) {
    if (existingById.has(unit.workUnitId)) {
      continue;
    }

    await dependencies.putAutoMapWorkUnitIfAbsent({
      PK: `SESSION#${input.session.sessionId}`,
      SK: `WORK_UNIT#${input.run.runId}#${String(unit.workUnitOrder).padStart(6, '0')}#${unit.workUnitId}`,
      entityType: 'AutoMapWorkUnit',
      sessionId: input.session.sessionId,
      runId: input.run.runId,
      workUnitId: unit.workUnitId,
      order: unit.workUnitOrder,
      status: 'queued',
      targetPaths: unit.targetPaths,
      contextPaths: unit.contextPaths,
      updatedAt: seededAt,
    });
  }

  const startedAt = nowIso();
  try {
    await dependencies.updateAutoMapRunStatus({
      sessionId: input.session.sessionId,
      runId: input.run.runId,
      fromCreatedAt: input.run.createdAt,
      status: 'retrieving',
      updatedAt: startedAt,
      startedAt,
    });
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return {
        sessionId: input.session.sessionId,
        runId: input.run.runId,
        finalRunStatus: 'superseded',
        totalWorkUnits: plan.workUnits.length,
        completedWorkUnits: 0,
        failedWorkUnits: 0,
      };
    }

    throw error;
  }

  let generatedTotal = 0;
  let warningTotal = 0;
  let invalidTotal = 0;
  let failedTargetsTotal = 0;
  let completedWorkUnits = 0;
  let failedWorkUnits = 0;
  for (const unit of plan.workUnits) {
    const existingUnit = existingById.get(unit.workUnitId);
    if (existingUnit && (existingUnit.status === 'completed' || existingUnit.status === 'failed' || existingUnit.status === 'superseded')) {
      continue;
    }

    const unitStartedAt = nowIso();
    try {
      await dependencies.updateAutoMapWorkUnitStatus({
        sessionId: input.session.sessionId,
        runId: input.run.runId,
        order: unit.workUnitOrder,
        workUnitId: unit.workUnitId,
        status: 'generating',
        updatedAt: unitStartedAt,
        startedAt: unitStartedAt,
      });

      const execution = await withRetry(
        (attempt) => dependencies.executeWorkUnit(unit, attempt),
        maxRetries,
        retryBackoffMs,
        sleepMs,
      );

      const items = toSuggestionItems({
        sessionId: input.session.sessionId,
        runId: input.run.runId,
        workUnitId: unit.workUnitId,
        workUnitOrder: unit.workUnitOrder,
        suggestions: execution.suggestions,
      });

      if (items.length > 0) {
        const existingSuggestions = await dependencies.listAutoMapSuggestions(input.session.sessionId);
        const merged = mergeSuggestionByTargetPath({
          existingSuggestions,
          incoming: items,
        });
        await dependencies.putAutoMapSuggestions(merged);
      }

      const generatedSuggestions = items.length;
      const failedTargets = 0;
      const invalid = items.filter((item) => item.validationState === 'invalid').length;
      const warnings = items.filter((item) => item.validationState === 'warning').length;

      generatedTotal += generatedSuggestions;
      failedTargetsTotal += failedTargets;
      warningTotal += warnings;
      invalidTotal += invalid;
      completedWorkUnits += 1;
      const unitCompletedAt = nowIso();
      await dependencies.updateAutoMapWorkUnitStatus({
        sessionId: input.session.sessionId,
        runId: input.run.runId,
        order: unit.workUnitOrder,
        workUnitId: unit.workUnitId,
        status: 'completed',
        updatedAt: unitCompletedAt,
        completedAt: unitCompletedAt,
        generatedSuggestions,
        failedTargets,
        outcome: generatedSuggestions > 0 ? 'suggestions' : 'no-suggestions',
      });
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        return {
          sessionId: input.session.sessionId,
          runId: input.run.runId,
          finalRunStatus: 'superseded',
          totalWorkUnits: plan.workUnits.length,
          completedWorkUnits,
          failedWorkUnits,
        };
      }

      failedWorkUnits += 1;
      failedTargetsTotal += unit.targetPaths.length;
      const failure = toFailure(error);
      const unitFailedAt = nowIso();

      await dependencies.updateAutoMapWorkUnitStatus({
        sessionId: input.session.sessionId,
        runId: input.run.runId,
        order: unit.workUnitOrder,
        workUnitId: unit.workUnitId,
        status: 'failed',
        updatedAt: unitFailedAt,
        completedAt: unitFailedAt,
        generatedSuggestions: 0,
        failedTargets: unit.targetPaths.length,
        outcome: 'failed',
        failure,
      });
    }

    const progressUpdatedAt = nowIso();
    await dependencies.updateAutoMapRunProgress({
      sessionId: input.session.sessionId,
      runId: input.run.runId,
      fromCreatedAt: input.run.createdAt,
      updatedAt: progressUpdatedAt,
      progress: {
        completedWorkUnits: completedWorkUnits + failedWorkUnits,
        totalWorkUnits: plan.workUnits.length,
        completedTargets: generatedTotal,
        totalTargets: plan.normalizedTargetPaths.length,
      },
      counts: {
        generated: generatedTotal,
        ready: generatedTotal - warningTotal - invalidTotal,
        warning: warningTotal,
        invalid: invalidTotal,
        failedTargets: failedTargetsTotal,
      },
    });
  }

  const terminalCompletedAt = nowIso();
  const finalStatus: AutoMapRunItem['status'] =
    failedWorkUnits === 0
      ? 'completed'
      : completedWorkUnits === 0
        ? 'failed'
        : 'partial';

  await dependencies.updateAutoMapRunStatus({
    sessionId: input.session.sessionId,
    runId: input.run.runId,
    fromCreatedAt: input.run.createdAt,
    status: finalStatus,
    updatedAt: terminalCompletedAt,
    completedAt: terminalCompletedAt,
    ...(finalStatus === 'failed'
      ? {
          failure: {
            code: 'RUN_FAILED',
            message: 'All work units failed',
            retryable: true,
          },
        }
      : {}),
  });

  const [sessionRuns, sessionSuggestions] = await Promise.all([
    dependencies.listAutoMapRuns(input.session.sessionId),
    dependencies.listAutoMapSuggestions(input.session.sessionId),
  ]);

  const reviewCounts = deriveReviewCounts(sessionSuggestions);
  const activeRunSet = new Set(activeRunStatuses());
  const hasActiveRuns = sessionRuns.some((run) => activeRunSet.has(run.status));
  const resolved = !hasActiveRuns && canResolveSession(sessionSuggestions);

  await dependencies.updateAutoMapSessionSummary({
    sessionId: input.session.sessionId,
    status: hasActiveRuns ? 'generating' : resolved ? 'resolved' : 'reviewing',
    updatedAt: terminalCompletedAt,
    reviewCounts,
    ...(resolved ? { completedAt: terminalCompletedAt, clearOpenSessionIndex: true } : {}),
  });

  return {
    sessionId: input.session.sessionId,
    runId: input.run.runId,
    finalRunStatus: finalStatus,
    totalWorkUnits: plan.workUnits.length,
    completedWorkUnits,
    failedWorkUnits,
  };
}
