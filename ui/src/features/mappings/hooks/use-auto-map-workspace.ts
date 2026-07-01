import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadAutoMapSuggestions,
  saveAutoMapSuggestions,
} from '../lib/auto-map-persistence';
import { detectStaleSuggestions } from '../lib/auto-map-staleness';
import { deriveEligibleTargets } from '../lib/derive-eligible-targets';
import type {
  AutoMapWorkspaceSummary,
  PersistedSuggestionItem,
  SuggestionLifecycleStatus,
  SuggestionWorkspaceItem,
} from '../types';

import type { ApiAdapter, AutoMapRunSummary } from '@/lib/api/types';
import type {
  SuggestionActionEligibility,
  SuggestionApplyBlockReason,
  AutoMapSectionInput,
  AutoMapSectionResult,
  AutoMapSuggestion,
  AutoMapRunStatus,
  MappingRule,
  ParsedSchema,
} from '@/lib/types/domain';

// Re-export so consumers can import from the hook barrel without knowing the type lives in types.ts
export type { SuggestionWorkspaceItem };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_CONTEXT_LINE_LIMIT = 200;

const OFFLINE_MODE_FRAGMENT = 'offline mode';
const RATE_LIMIT_FRAGMENT = 'temporarily busy';
const RATE_LIMIT_FRAGMENT_ALT = 'rate limit';
const NETWORK_ERROR_FRAGMENT = 'Could not reach';
const UNEXPECTED_RESPONSE_FRAGMENT = 'unexpected response';
const FEATURE_NOT_ENABLED_FRAGMENT = 'not enabled in this mode';
const FEATURE_NOT_ENABLED_CODE = 'FEATURE_NOT_ENABLED';
const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';
const OFFLINE_USER_MESSAGE = 'Auto-Map is not available in offline mode';
const NO_ELIGIBLE_TARGETS_MESSAGE = 'No eligible target fields found in this section';

const ACTIVE_POLL_MS = 2000;
const UNCHANGED_BACKOFF_MS = {
  fast: 2000,
  medium: 5000,
  slow: 10000,
} as const;
const NETWORK_RETRY_MS = [2000, 4000, 8000, 15000, 30000] as const;
const JITTER_RATIO = 0.15;
const VISIBILITY_STALE_THRESHOLD_MS = 5000;
const POLLING_WARNING_MESSAGE =
  'Connection interrupted while checking Auto-Map progress. Retrying…';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Filter options for the Auto-Map workspace suggestion list.
 */
export type SuggestionFilter =
  | 'all'
  | 'needsReview'
  | 'unmapped'
  | 'replacing'
  | 'valid'
  | 'invalid'
  | 'lowConfidence'
  | 'accepted'
  | 'dismissed'
  | 'stale';

export interface UseAutoMapWorkspaceParams {
  adapter: ApiAdapter;
  mappingId: string;
  projectId: string;
  rules: readonly MappingRule[];
  updateDraft: (targetPath: string, expression: string) => void;
  setSelectedTargetPath: (path: string) => void;
  exitWorkspace: () => void;
  parsedSourceSchema?: ParsedSchema | null;
  parsedTargetSchema?: ParsedSchema | null;
  /** Optional accessor for in-flight draft expressions — used by staleness detection (T-04). */
  getDraftExpression?: (targetPath: string) => string | null;
  /** Current persisted mapping revision number (used for materialization transitions). */
  currentRevision?: number;
}

export interface UseAutoMapWorkspaceResult {
  // Lifecycle
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;

  // Data
  sectionPath: string | null;
  items: readonly SuggestionWorkspaceItem[];
  summary: AutoMapWorkspaceSummary;
  hasPersistedSuggestions: boolean;

  // Actions
  triggerAutoMap: (sectionPath: string, visibleTargetPaths?: readonly string[]) => void;
  acceptSuggestion: (targetPath: string) => void;
  editSuggestion: (targetPath: string) => void;
  dismissSuggestion: (targetPath: string) => void;
  undoDismiss: (targetPath: string) => void;
  bulkAcceptAllValid: () => void;
  lastBatchAcceptResult: BatchAcceptResult | null;
  clearBatchAcceptResult: () => void;

  // Refresh
  refreshAll: () => void;
  refreshUnmapped: () => void;
  refreshStale: () => void;

  // Staleness (for T-04)
  markStale: (targetPath: string) => void;
  undoAccept: (targetPath: string) => void;

  // Filtering
  activeFilters: Set<SuggestionFilter>;
  toggleFilter: (filter: SuggestionFilter) => void;
  clearFilters: () => void;
  targetSearchQuery: string;
  setTargetSearchQuery: (query: string) => void;
  clearTargetSearch: () => void;
  filteredItems: readonly SuggestionWorkspaceItem[];

  // Metadata
  generatedAt: string | null;
  previousSuggestionsAvailable: boolean;
  restorePreviousSuggestions: () => void;
  rehydrationConflicts: readonly string[];

  // Async run visibility (FS-101 T-14)
  runStatus: AutoMapRunStatus | null;
  runProgress: AutoMapRunSummary['progress'] | null;
  runCounts: AutoMapRunSummary['counts'] | null;
  runFailure: AutoMapRunSummary['failure'] | null;
  isPolling: boolean;
  pollingWarning: string | null;
}

export interface BatchAcceptSkipEntry {
  readonly targetPath: string;
  readonly reasons: readonly SuggestionApplyBlockReason[];
  readonly primaryReason: SuggestionApplyBlockReason;
}

export interface BatchAcceptResult {
  readonly attempted: number;
  readonly applied: number;
  readonly skipped: number;
  readonly skippedByReason: Readonly<Record<SuggestionApplyBlockReason, number>>;
  readonly skippedItems: readonly BatchAcceptSkipEntry[];
  readonly completedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapErrorToMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;

  if (code === FEATURE_NOT_ENABLED_CODE || message.includes(FEATURE_NOT_ENABLED_FRAGMENT)) {
    return message;
  }

  if (message.includes(OFFLINE_MODE_FRAGMENT)) return OFFLINE_USER_MESSAGE;
  if (message.includes(RATE_LIMIT_FRAGMENT) || message.includes(RATE_LIMIT_FRAGMENT_ALT)) return message;
  if (message.includes(NETWORK_ERROR_FRAGMENT)) return message;
  if (message.includes(UNEXPECTED_RESPONSE_FRAGMENT)) return message;
  return GENERIC_ERROR_MESSAGE;
}

function deriveSourceContext(schema: ParsedSchema | null | undefined): string | undefined {
  if (!schema) return undefined;
  const lines: string[] = [];
  for (const node of schema.nodes) {
    if (lines.length >= SOURCE_CONTEXT_LINE_LIMIT) break;
    lines.push(`- ${node.path} (${node.type})`);
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

function normalizeSectionPath(path: string): string {
  return path.trim();
}

function normalizeSuggestionValidation(suggestion: AutoMapSuggestion): {
  valid: boolean;
  diagnostics: readonly {
    severity: string;
    code: string;
    message: string;
  }[];
} {
  const diagnostics = suggestion.validation?.diagnostics ?? [];
  const normalizedDiagnostics = diagnostics.map((item) => ({
    severity: item.severity,
    code: item.code,
    message: item.message,
  }));

  if (suggestion.validation && typeof suggestion.validation.valid === 'boolean') {
    return {
      valid: suggestion.validation.valid,
      diagnostics: normalizedDiagnostics,
    };
  }

  return {
    valid: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'VALIDATION_MISSING',
        message: 'No validation status returned',
      },
    ],
  };
}

function deriveSuggestionActionEligibility(item: {
  status: SuggestionLifecycleStatus;
  validation?: { valid: boolean };
}): SuggestionActionEligibility {
  const blockReasons: SuggestionApplyBlockReason[] = [];

  if (item.validation?.valid !== true) {
    blockReasons.push('invalid');
  }

  if (item.status === 'stale') {
    blockReasons.push('stale');
  }

  if (item.status === 'dismissed') {
    blockReasons.push('dismissed');
  }

  if (item.status === 'accepted' || item.status === 'edited' || item.status === 'conflict') {
    blockReasons.push('already-reviewed');
  }

  const canAccept = blockReasons.length === 0;

  return {
    canAccept,
    canBatchAccept: canAccept && item.status === 'suggested',
    blockReasons,
  };
}

function extractRunMeta(result: AutoMapSectionResult): WorkspaceRunMeta {
  const mode = result.retrievalMeta?.mode;
  return {
    mode: mode === 'section' || mode === 'whole' ? mode : null,
    chunkCount: result.retrievalMeta?.chunkCount ?? null,
    retrievalCandidatesCount: result.retrievalMeta?.retrievalCandidatesCount ?? null,
    retrievalSelectedCount: result.retrievalMeta?.retrievalSelectedCount ?? null,
    validationPassCount: result.validationMeta?.validationPassCount ?? null,
    validationFailCount: result.validationMeta?.validationFailCount ?? null,
    duplicatesCollapsed: result.dedupMeta?.duplicatesCollapsed ?? null,
    noContext: result.retrievalMeta?.noContext === true,
    noContextReason: result.retrievalMeta?.noContextReason ?? null,
  };
}

function suggestionToWorkspaceItem(
  suggestion: AutoMapSuggestion,
  rules: readonly MappingRule[],
  overrideStatus?: SuggestionLifecycleStatus,
): SuggestionWorkspaceItem {
  const existingRule = rules.find((r) => r.target === suggestion.target);
  return {
    targetPath: suggestion.target,
    suggestedExpression: suggestion.expression,
    explanation: suggestion.explanation,
    confidence: suggestion.confidence,
    validation: normalizeSuggestionValidation(suggestion),
    status: overrideStatus ?? 'suggested',
    isNew: existingRule === undefined,
    existingExpressionAtGeneration: existingRule?.expression ?? null,
    acceptedExpression: null,
    priorExpressionAtAcceptance: null,
    isMaterialized: false,
  };
}

function workspaceItemToPersistedItem(item: SuggestionWorkspaceItem): PersistedSuggestionItem {
  return {
    targetPath: item.targetPath,
    suggestedExpression: item.suggestedExpression,
    explanation: item.explanation,
    confidence: item.confidence,
    validation: item.validation,
    status: item.status,
    isNew: item.isNew,
    existingExpressionAtGeneration: item.existingExpressionAtGeneration,
    acceptedExpression: item.acceptedExpression ?? null,
    priorExpressionAtAcceptance: item.priorExpressionAtAcceptance ?? null,
    isMaterialized: item.isMaterialized ?? false,
  };
}

function persistedItemToWorkspaceItem(item: PersistedSuggestionItem): SuggestionWorkspaceItem {
  return {
    targetPath: item.targetPath,
    suggestedExpression: item.suggestedExpression,
    explanation: item.explanation,
    confidence: item.confidence,
    validation: item.validation,
    status: item.status,
    isNew: item.isNew,
    existingExpressionAtGeneration: item.existingExpressionAtGeneration,
    acceptedExpression: item.acceptedExpression ?? null,
    priorExpressionAtAcceptance: item.priorExpressionAtAcceptance ?? null,
    isMaterialized: item.isMaterialized ?? false,
  };
}

/** Terminal statuses that must never be overwritten by a refresh. */
const TERMINAL_STATUSES: ReadonlySet<SuggestionLifecycleStatus> = new Set(['accepted', 'edited']);

/**
 * Merge fresh suggestions from the API with existing items.
 * - Accepted/edited items are always preserved from `existing`.
 * - New suggestions replace existing suggested/dismissed/stale items.
 * - Suggestions for targets not in the fresh set are dropped (unless terminal).
 */
function mergeItems(
  existing: readonly SuggestionWorkspaceItem[],
  fresh: readonly SuggestionWorkspaceItem[],
): readonly SuggestionWorkspaceItem[] {
  const terminalByPath = new Map<string, SuggestionWorkspaceItem>();
  for (const item of existing) {
    if (TERMINAL_STATUSES.has(item.status)) {
      terminalByPath.set(item.targetPath, item);
    }
  }

  const merged: SuggestionWorkspaceItem[] = [];
  for (const freshItem of fresh) {
    const terminal = terminalByPath.get(freshItem.targetPath);
    merged.push(terminal ?? freshItem);
  }

  // Re-append terminal items whose target was not in the fresh set
  for (const [path, item] of terminalByPath.entries()) {
    if (!merged.some((m) => m.targetPath === path)) {
      merged.push(item);
    }
  }

  return merged;
}

const EMPTY_WORKSPACE_SUMMARY: AutoMapWorkspaceSummary = {
  total: 0,
  pending: 0,
  accepted: 0,
  edited: 0,
  dismissed: 0,
  validCount: 0,
  warningCount: 0,
  invalidCount: 0,
  highConfidence: 0,
  mediumConfidence: 0,
  lowConfidence: 0,
  stale: 0,
  generatedAt: null,
  lastRefreshedAt: null,
  mode: null,
  chunkCount: null,
  retrievalCandidatesCount: null,
  retrievalSelectedCount: null,
  validationPassCount: null,
  validationFailCount: null,
  duplicatesCollapsed: null,
  noContext: false,
  noContextReason: null,
};

type WorkspaceRunMeta = Pick<
  AutoMapWorkspaceSummary,
  | 'mode'
  | 'chunkCount'
  | 'retrievalCandidatesCount'
  | 'retrievalSelectedCount'
  | 'validationPassCount'
  | 'validationFailCount'
  | 'duplicatesCollapsed'
  | 'noContext'
  | 'noContextReason'
>;

const ACTIVE_RUN_STATUSES: ReadonlySet<AutoMapRunStatus> = new Set([
  'queued',
  'preparing',
  'retrieving',
  'generating',
  'validating',
]);

const TERMINAL_RUN_STATUSES: ReadonlySet<AutoMapRunStatus> = new Set([
  'completed',
  'partial',
  'failed',
  'superseded',
]);

function isActiveRunStatus(status: AutoMapRunStatus | null | undefined): status is AutoMapRunStatus {
  return Boolean(status && ACTIVE_RUN_STATUSES.has(status));
}

function isTerminalRunStatus(status: AutoMapRunStatus | null | undefined): status is AutoMapRunStatus {
  return Boolean(status && TERMINAL_RUN_STATUSES.has(status));
}

function withJitter(baseMs: number): number {
  const jitterWindow = baseMs * JITTER_RATIO;
  const delta = (Math.random() * jitterWindow * 2) - jitterWindow;
  return Math.max(250, Math.round(baseMs + delta));
}

function nextUnchangedDelay(unchangedCount: number): number {
  if (unchangedCount <= 2) return UNCHANGED_BACKOFF_MS.fast;
  if (unchangedCount <= 11) return UNCHANGED_BACKOFF_MS.medium;
  return UNCHANGED_BACKOFF_MS.slow;
}

const EMPTY_RUN_META: WorkspaceRunMeta = {
  mode: null,
  chunkCount: null,
  retrievalCandidatesCount: null,
  retrievalSelectedCount: null,
  validationPassCount: null,
  validationFailCount: null,
  duplicatesCollapsed: null,
  noContext: false,
  noContextReason: null,
};

function computeSummary(
  items: readonly SuggestionWorkspaceItem[],
  generatedAt: string | null,
  lastRefreshedAt: string | null,
  runMeta: WorkspaceRunMeta,
): AutoMapWorkspaceSummary {
  return {
    total: items.length,
    pending: items.filter((i) => i.status === 'suggested').length,
    accepted: items.filter((i) => i.status === 'accepted').length,
    edited: items.filter((i) => i.status === 'edited').length,
    dismissed: items.filter((i) => i.status === 'dismissed').length,
    stale: items.filter((i) => i.status === 'stale').length,
    validCount: items.filter((i) => i.validation?.valid === true).length,
    warningCount: items.filter(
      (i) => i.validation?.valid === true && i.validation.diagnostics.some((d) => d.severity === 'warning'),
    ).length,
    invalidCount: items.filter((i) => i.validation?.valid === false).length,
    highConfidence: items.filter((i) => i.confidence === 'high').length,
    mediumConfidence: items.filter((i) => i.confidence === 'medium').length,
    lowConfidence: items.filter((i) => i.confidence === 'low').length,
    generatedAt,
    lastRefreshedAt,
    mode: runMeta.mode,
    chunkCount: runMeta.chunkCount,
    retrievalCandidatesCount: runMeta.retrievalCandidatesCount,
    retrievalSelectedCount: runMeta.retrievalSelectedCount,
    validationPassCount: runMeta.validationPassCount,
    validationFailCount: runMeta.validationFailCount,
    duplicatesCollapsed: runMeta.duplicatesCollapsed,
    noContext: runMeta.noContext,
    noContextReason: runMeta.noContextReason,
  };
}

function applyFilters(
  items: readonly SuggestionWorkspaceItem[],
  filters: Set<SuggestionFilter>,
): readonly SuggestionWorkspaceItem[] {
  if (filters.size === 0 || filters.has('all')) return items;

  const isReviewed = (status: SuggestionLifecycleStatus): boolean =>
    status === 'accepted' || status === 'edited' || status === 'dismissed';

  return items.filter((item) => {
    for (const filter of filters) {
      switch (filter) {
        case 'needsReview':
          if (isReviewed(item.status)) return false;
          break;
        case 'unmapped':
          if (!item.isNew || isReviewed(item.status)) return false;
          break;
        case 'replacing':
          if (item.isNew || isReviewed(item.status)) return false;
          break;
        case 'valid':
          if (item.validation?.valid !== true) return false;
          break;
        case 'invalid':
          if (item.validation?.valid !== false) return false;
          break;
        case 'lowConfidence':
          if (item.confidence !== 'low') return false;
          break;
        case 'accepted':
          if (item.status !== 'accepted') return false;
          break;
        case 'dismissed':
          if (item.status !== 'dismissed') return false;
          break;
        case 'stale':
          if (item.status !== 'stale') return false;
          break;
      }
    }
    return true;
  });
}

function applyTargetSearch(
  items: readonly SuggestionWorkspaceItem[],
  query: string,
): readonly SuggestionWorkspaceItem[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return items;

  return items.filter((item) => item.targetPath.toLowerCase().includes(normalized));
}

function isPrimaryStatusFilter(filter: SuggestionFilter): boolean {
  return filter === 'needsReview'
    || filter === 'accepted'
    || filter === 'dismissed'
    || filter === 'stale';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestration hook for the Auto-Map Review Workspace (FS-048).
 *
 * Canonical Auto-Map workspace hook (FS-048) with:
 * - Persistent suggestion state via sessionStorage (T-01 utilities)
 * - Extended lifecycle: suggested → accepted | edited | dismissed | stale
 * - Refresh/merge logic that preserves terminal states
 * - Filter computation
 * - Error recovery with previous suggestion restoration
 * - Abort-on-reinvoke and abort-on-unmount semantics
 */
export function useAutoMapWorkspace({
  adapter,
  mappingId,
  projectId,
  rules,
  updateDraft,
  setSelectedTargetPath,
  exitWorkspace,
  parsedSourceSchema,
  parsedTargetSchema,
  getDraftExpression,
  currentRevision = 0,
}: UseAutoMapWorkspaceParams): UseAutoMapWorkspaceResult {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sectionPath, setSectionPath] = useState<string | null>(null);
  const [items, setItems] = useState<readonly SuggestionWorkspaceItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [runMeta, setRunMeta] = useState<WorkspaceRunMeta>(EMPTY_RUN_META);
  const [summary, setSummary] = useState<AutoMapWorkspaceSummary>(EMPTY_WORKSPACE_SUMMARY);
  const [activeFilters, setActiveFilters] = useState<Set<SuggestionFilter>>(
    () => new Set(['needsReview']),
  );
  const [targetSearchQuery, setTargetSearchQueryState] = useState('');
  const [lastBatchAcceptResult, setLastBatchAcceptResult] = useState<BatchAcceptResult | null>(null);
  const [rehydrationConflicts, setRehydrationConflicts] = useState<readonly string[]>([]);
  const [runSessionId, setRunSessionId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<AutoMapRunStatus | null>(null);
  const [runProgress, setRunProgress] = useState<AutoMapRunSummary['progress'] | null>(null);
  const [runCounts, setRunCounts] = useState<AutoMapRunSummary['counts'] | null>(null);
  const [runFailure, setRunFailure] = useState<AutoMapRunSummary['failure'] | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingWarning, setPollingWarning] = useState<string | null>(null);
  const filteredItemsRef = useRef<readonly SuggestionWorkspaceItem[]>([]);

  const runMetaRef = useRef<WorkspaceRunMeta>(EMPTY_RUN_META);
  useEffect(() => {
    runMetaRef.current = runMeta;
  }, [runMeta]);

  // Previous suggestions snapshot for error recovery (AE-15)
  const [previousItems, setPreviousItems] = useState<readonly SuggestionWorkspaceItem[] | null>(null);
  const [previousGeneratedAt, setPreviousGeneratedAt] = useState<string | null>(null);

  // Stable refs
  const adapterRef = useRef(adapter);
  useEffect(() => { adapterRef.current = adapter; });

  const rulesRef = useRef(rules);
  useEffect(() => { rulesRef.current = rules; });

  const updateDraftRef = useRef(updateDraft);
  useEffect(() => { updateDraftRef.current = updateDraft; });

  const setSelectedTargetPathRef = useRef(setSelectedTargetPath);
  useEffect(() => { setSelectedTargetPathRef.current = setSelectedTargetPath; });

  const exitWorkspaceRef = useRef(exitWorkspace);
  useEffect(() => { exitWorkspaceRef.current = exitWorkspace; });

  const parsedSourceSchemaRef = useRef(parsedSourceSchema);
  useEffect(() => { parsedSourceSchemaRef.current = parsedSourceSchema; });

  const parsedTargetSchemaRef = useRef(parsedTargetSchema);
  useEffect(() => { parsedTargetSchemaRef.current = parsedTargetSchema; });

  const getDraftExpressionRef = useRef(getDraftExpression);
  useEffect(() => { getDraftExpressionRef.current = getDraftExpression; });

  const currentRevisionRef = useRef(currentRevision);
  useEffect(() => {
    currentRevisionRef.current = currentRevision;
  }, [currentRevision]);

  const previousRevisionRef = useRef(currentRevision);

  // Stale-run guard
  const requestIdRef = useRef(0);

  // Track generatedAt in a ref so runFetch always sees the current value
  const generatedAtRef = useRef<string | null>(null);

  // Abort controller for unmount cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRunStatusRef = useRef<((options?: { force?: boolean }) => Promise<void>) | null>(null);
  const lastPollAtRef = useRef<number | null>(null);
  const unchangedCountRef = useRef(0);
  const networkRetryAttemptRef = useRef(0);
  const pollingSignatureRef = useRef<string | null>(null);
  const isDocumentHiddenRef = useRef(
    typeof document !== 'undefined' && typeof document.visibilityState === 'string'
      ? document.visibilityState === 'hidden'
      : false,
  );

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    clearPollingTimer();
    setIsPolling(false);
    unchangedCountRef.current = 0;
    networkRetryAttemptRef.current = 0;
  }, [clearPollingTimer]);

  useEffect(() => {
    return () => {
      clearPollingTimer();
      abortControllerRef.current?.abort();
    };
  }, [clearPollingTimer]);

  // ---------------------------------------------------------------------------
  // Internal: update items + summary + persist
  // ---------------------------------------------------------------------------

  const commitItems = useCallback(
    (
      nextItems: readonly SuggestionWorkspaceItem[],
      nextGeneratedAt: string | null,
      nextLastRefreshedAt: string | null,
      path: string | null,
      nextRunMeta: WorkspaceRunMeta,
    ) => {
      setItems(nextItems);
      setGeneratedAt(nextGeneratedAt);
      generatedAtRef.current = nextGeneratedAt;
      setLastRefreshedAt(nextLastRefreshedAt);
      setRunMeta(nextRunMeta);
      setSummary(computeSummary(nextItems, nextGeneratedAt, nextLastRefreshedAt, nextRunMeta));

      if (path !== null) {
        const persistedItems = nextItems.map(workspaceItemToPersistedItem);
        saveAutoMapSuggestions(mappingId, path, persistedItems, {
          generatedAt: nextGeneratedAt ?? undefined,
          sourceContext: deriveSourceContext(parsedSourceSchemaRef.current) ?? undefined,
        });
      }
    },
    [mappingId],
  );

  const applyRunSummary = useCallback((summary: AutoMapRunSummary) => {
    setRunSessionId(summary.sessionId);
    setRunId(summary.runId);
    setRunStatus(summary.status);
    setRunProgress(summary.progress ?? null);
    setRunCounts(summary.counts ?? null);
    setRunFailure(summary.failure ?? null);
  }, []);

  const clearRunState = useCallback(() => {
    setRunSessionId(null);
    setRunId(null);
    setRunStatus(null);
    setRunProgress(null);
    setRunCounts(null);
    setRunFailure(null);
    pollingSignatureRef.current = null;
    stopPolling();
  }, [stopPolling]);

  // ---------------------------------------------------------------------------
  // Staleness detection (T-04)
  // ---------------------------------------------------------------------------

  /**
   * Batch-mark a set of target paths as stale in a single setItems call.
   * Used internally by staleness detection effects.
   */
  const applyStaleDetection = useCallback(
    (currentItems: readonly SuggestionWorkspaceItem[], currentRules: readonly MappingRule[], path: string | null) => {
      const stalePaths = detectStaleSuggestions(
        currentItems,
        currentRules,
        getDraftExpressionRef.current,
      );
      if (stalePaths.length === 0) return;

      const staleSet = new Set(stalePaths);
      setItems((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          if (staleSet.has(item.targetPath) && item.status !== 'stale' && item.status !== 'conflict') {
            changed = true;
            return { ...item, status: 'stale' as SuggestionLifecycleStatus };
          }
          return item;
        });
        if (!changed) return prev;
        const nextItems = next as readonly SuggestionWorkspaceItem[];
        setSummary(computeSummary(nextItems, generatedAtRef.current, null, runMetaRef.current));
        if (path !== null) {
          saveAutoMapSuggestions(mappingId, path, nextItems.map(workspaceItemToPersistedItem), {
            generatedAt: generatedAtRef.current ?? undefined,
          });
        }
        return nextItems;
      });
    },
    [mappingId],
  );

  // Effect: re-run staleness detection when rules change while workspace is active.
  // Uses a ref snapshot of items to avoid adding items to the dep array (which would
  // cause the effect to fire on every action, not just rule changes).
  const itemsRef = useRef<readonly SuggestionWorkspaceItem[]>([]);
  useEffect(() => { itemsRef.current = items; });

  const sectionPathRef = useRef<string | null>(null);
  useEffect(() => { sectionPathRef.current = sectionPath; });

  useEffect(() => {
    // Only run when workspace is active (sectionPath set) and we have items
    if (sectionPathRef.current === null) return;
    if (itemsRef.current.length === 0) return;
    applyStaleDetection(itemsRef.current, rules, sectionPathRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules]); // intentionally only rules — applyStaleDetection is stable

  const pollRunStatus = useCallback(
    async (options?: { force?: boolean }) => {
      if (!runSessionId || !runId) {
        stopPolling();
        return;
      }

      if (isDocumentHiddenRef.current && options?.force !== true) {
        stopPolling();
        return;
      }

      const getRunStatus = adapterRef.current.getAutoMapRunStatus;
      if (!getRunStatus) {
        stopPolling();
        return;
      }

      clearPollingTimer();
      setIsPolling(true);

      try {
        const runSummary = await getRunStatus(runSessionId, runId);
        lastPollAtRef.current = Date.now();
        applyRunSummary(runSummary);

        const listSuggestions = adapterRef.current.listAutoMapSuggestions;
        if (listSuggestions) {
          const page = await listSuggestions(runSessionId, { limit: 250 });
          const currentRules = rulesRef.current;

          const seen = new Set<string>();
          const deduped = page.items.filter((s) => {
            if (seen.has(s.target)) return false;
            seen.add(s.target);
            return true;
          });

          const freshItems = deduped.map((suggestion) => suggestionToWorkspaceItem(suggestion, currentRules));
          const previousItems = itemsRef.current;
          const merged = mergeItems(previousItems, freshItems);
          const now = new Date().toISOString();
          const path = sectionPathRef.current;
          commitItems(
            merged,
            generatedAtRef.current ?? now,
            now,
            path,
            runMetaRef.current,
          );

          const signature = JSON.stringify({
            status: runSummary.status,
            progress: runSummary.progress ?? null,
            counts: runSummary.counts ?? null,
            failure: runSummary.failure ?? null,
            suggestions: page.items.map((item) => [item.target, item.expression, item.reviewStatus ?? null]),
          });

          if (pollingSignatureRef.current === signature) {
            unchangedCountRef.current += 1;
          } else {
            pollingSignatureRef.current = signature;
            unchangedCountRef.current = 0;
          }
        }

        networkRetryAttemptRef.current = 0;
        setPollingWarning(null);

        if (isTerminalRunStatus(runSummary.status)) {
          stopPolling();
          return;
        }

        const delayMs = unchangedCountRef.current === 0
          ? ACTIVE_POLL_MS
          : nextUnchangedDelay(unchangedCountRef.current);
        pollingTimerRef.current = setTimeout(() => {
          void pollRunStatusRef.current?.();
        }, withJitter(delayMs));
      } catch {
        setPollingWarning(POLLING_WARNING_MESSAGE);

        const attempt = Math.min(networkRetryAttemptRef.current, NETWORK_RETRY_MS.length - 1);
        const nextDelay = NETWORK_RETRY_MS[attempt] ?? NETWORK_RETRY_MS[NETWORK_RETRY_MS.length - 1];
        networkRetryAttemptRef.current = Math.min(attempt + 1, NETWORK_RETRY_MS.length - 1);

        pollingTimerRef.current = setTimeout(() => {
          void pollRunStatusRef.current?.();
        }, withJitter(nextDelay));
      }
    },
    [
      applyRunSummary,
      clearPollingTimer,
      commitItems,
      runId,
      runSessionId,
      stopPolling,
    ],
  );

  useEffect(() => {
    pollRunStatusRef.current = pollRunStatus;
  }, [pollRunStatus]);

  useEffect(() => {
    if (!isActiveRunStatus(runStatus) || !runSessionId || !runId) {
      clearPollingTimer();
      return;
    }

    if (isDocumentHiddenRef.current) {
      clearPollingTimer();
      return;
    }

    if (pollingTimerRef.current !== null || isPolling) {
      return;
    }

    void pollRunStatus({ force: true });
  }, [clearPollingTimer, isPolling, pollRunStatus, runId, runSessionId, runStatus]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.visibilityState === 'hidden';
      isDocumentHiddenRef.current = hidden;

      if (hidden) {
        clearPollingTimer();
        setIsPolling(false);
        const lastPoll = lastPollAtRef.current;
        if (!lastPoll || Date.now() - lastPoll > VISIBILITY_STALE_THRESHOLD_MS) {
          void pollRunStatus({ force: true });
        }
        return;
      }

      unchangedCountRef.current = 0;
      networkRetryAttemptRef.current = 0;
      void pollRunStatus({ force: true });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [clearPollingTimer, pollRunStatus]);

  // ---------------------------------------------------------------------------
  // Core fetch logic (shared by triggerAutoMap + refresh variants)
  // ---------------------------------------------------------------------------

  type RefreshMode = 'all' | 'unmapped' | 'stale';

  const runFetch = useCallback(
    async (
      path: string,
      mode: RefreshMode,
      existingItems: readonly SuggestionWorkspaceItem[],
      visibleTargetPaths?: readonly string[],
    ) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentRequestId = ++requestIdRef.current;

      setStatus('loading');
      setError(null);
      setPollingWarning(null);
      setLastBatchAcceptResult(null);

      const normalizedPath = normalizeSectionPath(path);
      const targetSection = deriveEligibleTargets(
        parsedTargetSchemaRef.current,
        normalizedPath === '' ? null : normalizedPath,
      );
      if (targetSection === '') {
        setStatus('error');
        setError(NO_ELIGIBLE_TARGETS_MESSAGE);
        return;
      }

      const input: AutoMapSectionInput = {
        projectId,
        mappingId,
        mode: normalizedPath === '' ? 'whole' : 'section',
        sectionPath: normalizedPath === '' ? undefined : normalizedPath,
        targetSection,
        sourceContext: deriveSourceContext(parsedSourceSchemaRef.current),
        visibleTargetPaths,
      };

      try {
        const result = await adapterRef.current.autoMapSection(input);
        const nextRunMeta = extractRunMeta(result);

        if (requestIdRef.current !== currentRequestId || controller.signal.aborted) return;

        if (result.session) {
          setRunSessionId(result.session.sessionId);
          setRunId(result.session.runId);
          setRunStatus(result.session.runStatus);
          setRunProgress(null);
          setRunCounts(null);
          setRunFailure(null);
          if (isTerminalRunStatus(result.session.runStatus)) {
            stopPolling();
          }
        } else {
          clearRunState();
        }

        // Deduplicate by target path
        const seen = new Set<string>();
        const deduped = result.suggestions.filter((s) => {
          if (seen.has(s.target)) {
            console.warn(`[useAutoMapWorkspace] Duplicate suggestion target ignored: ${s.target}`);
            return false;
          }
          seen.add(s.target);
          return true;
        });

        // Apply mode filter before building workspace items
        const currentRules = rulesRef.current;
        let filteredSuggestions = deduped;

        if (mode === 'unmapped') {
          filteredSuggestions = deduped.filter(
            (s) => !currentRules.some((r) => r.target === s.target),
          );
        } else if (mode === 'stale') {
          const stalePaths = new Set(
            existingItems.filter((i) => i.status === 'stale').map((i) => i.targetPath),
          );
          filteredSuggestions = deduped.filter((s) => stalePaths.has(s.target));
        }

        const freshItems = filteredSuggestions.map((s) =>
          suggestionToWorkspaceItem(s, currentRules),
        );

        const now = new Date().toISOString();
        const shouldPreserveExisting =
          result.session !== undefined
          && isActiveRunStatus(result.session.runStatus)
          && freshItems.length === 0;
        const merged = shouldPreserveExisting ? existingItems : mergeItems(existingItems, freshItems);

        commitItems(merged, generatedAtRef.current ?? now, now, path, nextRunMeta);
        setStatus('success');
      } catch (err) {
        if (requestIdRef.current !== currentRequestId || controller.signal.aborted) return;
        setStatus('error');
        setError(mapErrorToMessage(err));
      }
    },
    [projectId, mappingId, commitItems, clearRunState, stopPolling],
  );

  // ---------------------------------------------------------------------------
  // triggerAutoMap — initial entry for a section
  // ---------------------------------------------------------------------------

  const triggerAutoMap = useCallback(
    (path: string, visibleTargetPaths?: readonly string[]): void => {
      const normalizedPath = normalizeSectionPath(path);
      clearRunState();
      setSectionPath(normalizedPath);
      setLastBatchAcceptResult(null);
      setRehydrationConflicts([]);

      // Check for persisted suggestions first (AE-02)
      const persisted = loadAutoMapSuggestions(mappingId, normalizedPath);
      if (persisted !== null) {
        const restoredItems = persisted.items.map(persistedItemToWorkspaceItem);
        const conflicts: string[] = [];
        const rehydrated = restoredItems.map((item): SuggestionWorkspaceItem => {
          if (
            (item.status === 'accepted' || item.status === 'edited')
            && item.isMaterialized !== true
            && item.acceptedExpression
            && item.priorExpressionAtAcceptance !== undefined
          ) {
            const currentSaved = rulesRef.current.find((rule) => rule.target === item.targetPath)?.expression ?? null;
            if (currentSaved === item.priorExpressionAtAcceptance) {
              updateDraftRef.current(item.targetPath, item.acceptedExpression);
              return item;
            }

            conflicts.push(item.targetPath);
            return {
              ...item,
              status: 'conflict',
            };
          }
          return item;
        });

        setRehydrationConflicts(conflicts);
        const restoredAt = persisted.generatedAt;
        setItems(rehydrated);
        setGeneratedAt(restoredAt);
        generatedAtRef.current = restoredAt;
        setLastRefreshedAt(restoredAt);
        setRunMeta(EMPTY_RUN_META);
        setSummary(computeSummary(rehydrated, restoredAt, restoredAt, EMPTY_RUN_META));
        setStatus('success');
        setError(null);
        // Run staleness detection on restored items (AE-03)
        applyStaleDetection(rehydrated, rulesRef.current, normalizedPath);
        return;
      }

      // No persisted suggestions — fetch fresh
      void runFetch(normalizedPath, 'all', [], visibleTargetPaths);
    },
    [mappingId, runFetch, applyStaleDetection, clearRunState],
  );

  // ---------------------------------------------------------------------------
  // Refresh variants
  // ---------------------------------------------------------------------------

  const refreshAll = useCallback((): void => {
    if (sectionPath === null) return;
    // Snapshot current items for error recovery before refresh
    setPreviousItems(items);
    setPreviousGeneratedAt(generatedAt);
    void runFetch(sectionPath, 'all', items);
  }, [sectionPath, items, generatedAt, runFetch]);

  const refreshUnmapped = useCallback((): void => {
    if (sectionPath === null) return;
    setPreviousItems(items);
    setPreviousGeneratedAt(generatedAt);
    void runFetch(sectionPath, 'unmapped', items);
  }, [sectionPath, items, generatedAt, runFetch]);

  const refreshStale = useCallback((): void => {
    if (sectionPath === null) return;
    setPreviousItems(items);
    setPreviousGeneratedAt(generatedAt);
    void runFetch(sectionPath, 'stale', items);
  }, [sectionPath, items, generatedAt, runFetch]);

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const updateItemStatus = useCallback(
    (targetPath: string, nextStatus: SuggestionLifecycleStatus) => {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.targetPath === targetPath);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], status: nextStatus };
        const nextItems = next as readonly SuggestionWorkspaceItem[];
        setSummary(computeSummary(nextItems, generatedAt, lastRefreshedAt, runMetaRef.current));
        // Persist updated state
        if (sectionPath !== null) {
          saveAutoMapSuggestions(mappingId, sectionPath, nextItems.map(workspaceItemToPersistedItem), {
            generatedAt: generatedAt ?? undefined,
          });
        }
        return nextItems;
      });
    },
    [generatedAt, lastRefreshedAt, mappingId, sectionPath],
  );

  const acceptSuggestion = useCallback(
    (targetPath: string): void => {
      setItems((prev) => {
        const item = prev.find((i) => i.targetPath === targetPath);
        if (!item) return prev;
        const eligibility = deriveSuggestionActionEligibility(item);
        if (!eligibility.canAccept) return prev;
        updateDraftRef.current(targetPath, item.suggestedExpression);
        const idx = prev.findIndex((i) => i.targetPath === targetPath);
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: 'accepted',
          acceptedExpression: item.suggestedExpression,
          priorExpressionAtAcceptance: item.existingExpressionAtGeneration ?? null,
          isMaterialized: false,
        };
        const nextItems = next as readonly SuggestionWorkspaceItem[];
        setSummary(computeSummary(nextItems, generatedAt, lastRefreshedAt, runMetaRef.current));
        if (sectionPath !== null) {
          saveAutoMapSuggestions(mappingId, sectionPath, nextItems.map(workspaceItemToPersistedItem), {
            generatedAt: generatedAt ?? undefined,
          });
        }
        return nextItems;
      });
    },
    [generatedAt, lastRefreshedAt, mappingId, sectionPath],
  );

  const editSuggestion = useCallback(
    (targetPath: string): void => {
      setItems((prev) => {
        const item = prev.find((i) => i.targetPath === targetPath);
        if (!item) return prev;
        if (item.status === 'dismissed' || item.status === 'stale') return prev;
        updateDraftRef.current(targetPath, item.suggestedExpression);
        setSelectedTargetPathRef.current(targetPath);
        exitWorkspaceRef.current();
        const idx = prev.findIndex((i) => i.targetPath === targetPath);
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: 'edited',
          acceptedExpression: item.suggestedExpression,
          priorExpressionAtAcceptance: item.existingExpressionAtGeneration ?? null,
          isMaterialized: false,
        };
        const nextItems = next as readonly SuggestionWorkspaceItem[];
        setSummary(computeSummary(nextItems, generatedAt, lastRefreshedAt, runMetaRef.current));
        if (sectionPath !== null) {
          saveAutoMapSuggestions(mappingId, sectionPath, nextItems.map(workspaceItemToPersistedItem), {
            generatedAt: generatedAt ?? undefined,
          });
        }
        return nextItems;
      });
    },
    [generatedAt, lastRefreshedAt, mappingId, sectionPath],
  );

  const dismissSuggestion = useCallback(
    (targetPath: string): void => {
      updateItemStatus(targetPath, 'dismissed');
    },
    [updateItemStatus],
  );

  const undoDismiss = useCallback(
    (targetPath: string): void => {
      setItems((prev) => {
        const item = prev.find((i) => i.targetPath === targetPath);
        if (!item || item.status !== 'dismissed') return prev;
        const idx = prev.findIndex((i) => i.targetPath === targetPath);
        const next = [...prev];
        next[idx] = { ...next[idx], status: 'suggested' };
        const nextItems = next as readonly SuggestionWorkspaceItem[];
        setSummary(computeSummary(nextItems, generatedAt, lastRefreshedAt, runMetaRef.current));
        if (sectionPath !== null) {
          saveAutoMapSuggestions(mappingId, sectionPath, nextItems.map(workspaceItemToPersistedItem), {
            generatedAt: generatedAt ?? undefined,
          });
        }
        return nextItems;
      });
    },
    [generatedAt, lastRefreshedAt, mappingId, sectionPath],
  );

  const undoAccept = useCallback(
    (targetPath: string): void => {
      setItems((prev) => {
        const item = prev.find((i) => i.targetPath === targetPath);
        if (!item || (item.status !== 'accepted' && item.status !== 'edited' && item.status !== 'conflict')) {
          return prev;
        }

        const idx = prev.findIndex((i) => i.targetPath === targetPath);
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: 'suggested',
          acceptedExpression: null,
          priorExpressionAtAcceptance: null,
          isMaterialized: false,
        };

        updateDraftRef.current(targetPath, item.priorExpressionAtAcceptance ?? '');

        const nextItems = next as readonly SuggestionWorkspaceItem[];
        setSummary(computeSummary(nextItems, generatedAt, lastRefreshedAt, runMetaRef.current));
        if (sectionPath !== null) {
          saveAutoMapSuggestions(mappingId, sectionPath, nextItems.map(workspaceItemToPersistedItem), {
            generatedAt: generatedAt ?? undefined,
          });
        }
        return nextItems;
      });
    },
    [generatedAt, lastRefreshedAt, mappingId, sectionPath],
  );

  const bulkAcceptAllValid = useCallback((): void => {
    const filteredTargetPaths = new Set(filteredItemsRef.current.map((item) => item.targetPath));

    setItems((prev) => {
      const skippedByReason: Record<SuggestionApplyBlockReason, number> = {
        invalid: 0,
        stale: 0,
        dismissed: 0,
        'already-reviewed': 0,
        'not-ready': 0,
      };
      const skippedItems: BatchAcceptSkipEntry[] = [];
      let applied = 0;
      let attempted = 0;

      const next = prev.map((item): SuggestionWorkspaceItem => {
        if (!filteredTargetPaths.has(item.targetPath)) {
          return item;
        }

        attempted += 1;
        const eligibility = deriveSuggestionActionEligibility(item);
        if (!eligibility.canBatchAccept) {
          const primaryReason = eligibility.blockReasons[0] ?? 'not-ready';
          skippedByReason[primaryReason] += 1;
          skippedItems.push({
            targetPath: item.targetPath,
            reasons: eligibility.blockReasons,
            primaryReason,
          });
          return item;
        }

        updateDraftRef.current(item.targetPath, item.suggestedExpression);
        applied += 1;
        return { ...item, status: 'accepted' };
      });

      const computedResult: BatchAcceptResult = {
        attempted,
        applied,
        skipped: attempted - applied,
        skippedByReason,
        skippedItems,
        completedAt: new Date().toISOString(),
      };

      setLastBatchAcceptResult(computedResult);

      const nextItems = next as readonly SuggestionWorkspaceItem[];
      setSummary(computeSummary(nextItems, generatedAt, lastRefreshedAt, runMetaRef.current));
      if (sectionPath !== null) {
        saveAutoMapSuggestions(mappingId, sectionPath, nextItems.map(workspaceItemToPersistedItem), {
          generatedAt: generatedAt ?? undefined,
        });
      }
      return nextItems;
    });
  }, [generatedAt, lastRefreshedAt, mappingId, sectionPath]);

  const clearBatchAcceptResult = useCallback(() => {
    setLastBatchAcceptResult(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Staleness (for T-04)
  // ---------------------------------------------------------------------------

  const markStale = useCallback(
    (targetPath: string): void => {
      updateItemStatus(targetPath, 'stale');
    },
    [updateItemStatus],
  );

  // ---------------------------------------------------------------------------
  // Error recovery
  // ---------------------------------------------------------------------------

  const restorePreviousSuggestions = useCallback((): void => {
    if (previousItems === null) return;
    const restoredAt = previousGeneratedAt;
    setItems(previousItems);
    setGeneratedAt(restoredAt);
    setLastRefreshedAt(restoredAt);
    setSummary(computeSummary(previousItems, restoredAt, restoredAt, runMetaRef.current));
    setStatus('success');
    setError(null);
    setPreviousItems(null);
    setPreviousGeneratedAt(null);
  }, [previousItems, previousGeneratedAt]);

  useEffect(() => {
    if (currentRevision <= previousRevisionRef.current) {
      previousRevisionRef.current = currentRevision;
      return;
    }

    previousRevisionRef.current = currentRevision;

    setItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if ((item.status !== 'accepted' && item.status !== 'edited') || item.isMaterialized === true) {
          return item;
        }

        changed = true;
        return {
          ...item,
          isMaterialized: true,
        };
      });

      if (!changed) return prev;

      const nextItems = next as readonly SuggestionWorkspaceItem[];
      setSummary(computeSummary(nextItems, generatedAt, lastRefreshedAt, runMetaRef.current));
      if (sectionPath !== null) {
        saveAutoMapSuggestions(mappingId, sectionPath, nextItems.map(workspaceItemToPersistedItem), {
          generatedAt: generatedAt ?? undefined,
        });
      }
      return nextItems;
    });
  }, [currentRevision, generatedAt, lastRefreshedAt, mappingId, sectionPath]);

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const toggleFilter = useCallback((filter: SuggestionFilter): void => {
    setActiveFilters((prev) => {
      const next = new Set(prev);

      if (isPrimaryStatusFilter(filter)) {
        const wasActive = next.has(filter);
        next.delete('needsReview');
        next.delete('accepted');
        next.delete('dismissed');
        next.delete('stale');
        if (!wasActive) {
          next.add(filter);
        }
        return next;
      }

      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback((): void => {
    setActiveFilters(new Set());
  }, []);

  const setTargetSearchQuery = useCallback((query: string): void => {
    setTargetSearchQueryState(query);
  }, []);

  const clearTargetSearch = useCallback((): void => {
    setTargetSearchQueryState('');
  }, []);

  const filteredItems = applyTargetSearch(applyFilters(items, activeFilters), targetSearchQuery);
  useEffect(() => {
    filteredItemsRef.current = filteredItems;
  }, [filteredItems]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const hasPersistedSuggestionsValue =
    sectionPath !== null && loadAutoMapSuggestions(mappingId, sectionPath) !== null;

  return {
    status,
    error,
    sectionPath,
    items,
    summary,
    hasPersistedSuggestions: hasPersistedSuggestionsValue,
    triggerAutoMap,
    acceptSuggestion,
    editSuggestion,
    dismissSuggestion,
    undoDismiss,
    bulkAcceptAllValid,
    lastBatchAcceptResult,
    clearBatchAcceptResult,
    refreshAll,
    refreshUnmapped,
    refreshStale,
    markStale,
    undoAccept,
    activeFilters,
    toggleFilter,
    clearFilters,
    targetSearchQuery,
    setTargetSearchQuery,
    clearTargetSearch,
    filteredItems,
    generatedAt,
    previousSuggestionsAvailable: previousItems !== null,
    restorePreviousSuggestions,
    rehydrationConflicts,
    runStatus,
    runProgress,
    runCounts,
    runFailure,
    isPolling,
    pollingWarning,
  };
}
