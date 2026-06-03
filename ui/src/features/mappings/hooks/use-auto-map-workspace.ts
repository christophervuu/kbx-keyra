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

import type { ApiAdapter } from '@/lib/api/types';
import type {
  AutoMapSectionInput,
  AutoMapSectionResult,
  AutoMapSuggestion,
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
  triggerAutoMap: (sectionPath: string) => void;
  acceptSuggestion: (targetPath: string) => void;
  editSuggestion: (targetPath: string) => void;
  dismissSuggestion: (targetPath: string) => void;
  undoDismiss: (targetPath: string) => void;
  bulkAcceptAllValid: () => void;

  // Refresh
  refreshAll: () => void;
  refreshUnmapped: () => void;
  refreshStale: () => void;

  // Staleness (for T-04)
  markStale: (targetPath: string) => void;

  // Filtering
  activeFilters: Set<SuggestionFilter>;
  toggleFilter: (filter: SuggestionFilter) => void;
  clearFilters: () => void;
  filteredItems: readonly SuggestionWorkspaceItem[];

  // Metadata
  generatedAt: string | null;
  previousSuggestionsAvailable: boolean;
  restorePreviousSuggestions: () => void;
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

  // Stale-run guard
  const requestIdRef = useRef(0);

  // Track generatedAt in a ref so runFetch always sees the current value
  const generatedAtRef = useRef<string | null>(null);

  // Abort controller for unmount cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

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
          if (staleSet.has(item.targetPath) && item.status !== 'stale') {
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

  // ---------------------------------------------------------------------------
  // Core fetch logic (shared by triggerAutoMap + refresh variants)
  // ---------------------------------------------------------------------------

  type RefreshMode = 'all' | 'unmapped' | 'stale';

  const runFetch = useCallback(
    async (path: string, mode: RefreshMode, existingItems: readonly SuggestionWorkspaceItem[]) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentRequestId = ++requestIdRef.current;

      setStatus('loading');
      setError(null);

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
      };

      try {
        const result = await adapterRef.current.autoMapSection(input);
        const nextRunMeta = extractRunMeta(result);

        if (requestIdRef.current !== currentRequestId || controller.signal.aborted) return;

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
        const merged = mergeItems(existingItems, freshItems);

        commitItems(merged, generatedAtRef.current ?? now, now, path, nextRunMeta);
        setStatus('success');
      } catch (err) {
        if (requestIdRef.current !== currentRequestId || controller.signal.aborted) return;
        setStatus('error');
        setError(mapErrorToMessage(err));
      }
    },
    [projectId, mappingId, commitItems],
  );

  // ---------------------------------------------------------------------------
  // triggerAutoMap — initial entry for a section
  // ---------------------------------------------------------------------------

  const triggerAutoMap = useCallback(
    (path: string): void => {
      const normalizedPath = normalizeSectionPath(path);
      setSectionPath(normalizedPath);

      // Check for persisted suggestions first (AE-02)
      const persisted = loadAutoMapSuggestions(mappingId, normalizedPath);
      if (persisted !== null) {
        const restoredItems = persisted.items.map(persistedItemToWorkspaceItem);
        const restoredAt = persisted.generatedAt;
        setItems(restoredItems);
        setGeneratedAt(restoredAt);
        generatedAtRef.current = restoredAt;
        setLastRefreshedAt(restoredAt);
        setRunMeta(EMPTY_RUN_META);
        setSummary(computeSummary(restoredItems, restoredAt, restoredAt, EMPTY_RUN_META));
        setStatus('success');
        setError(null);
        // Run staleness detection on restored items (AE-03)
        applyStaleDetection(restoredItems, rulesRef.current, normalizedPath);
        return;
      }

      // No persisted suggestions — fetch fresh
      void runFetch(normalizedPath, 'all', []);
    },
    [mappingId, runFetch, applyStaleDetection],
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
        if (!item || item.status === 'accepted') return prev;
        updateDraftRef.current(targetPath, item.suggestedExpression);
        const idx = prev.findIndex((i) => i.targetPath === targetPath);
        const next = [...prev];
        next[idx] = { ...next[idx], status: 'accepted' };
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
        updateDraftRef.current(targetPath, item.suggestedExpression);
        setSelectedTargetPathRef.current(targetPath);
        exitWorkspaceRef.current();
        const idx = prev.findIndex((i) => i.targetPath === targetPath);
        const next = [...prev];
        next[idx] = { ...next[idx], status: 'edited' };
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

  const bulkAcceptAllValid = useCallback((): void => {
    setItems((prev) => {
      const next = prev.map((item): SuggestionWorkspaceItem => {
        if (item.status !== 'suggested') return item;
        const isValid =
          item.validation === undefined || item.validation.valid === true;
        if (!isValid) return item;
        updateDraftRef.current(item.targetPath, item.suggestedExpression);
        return { ...item, status: 'accepted' };
      });
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

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const toggleFilter = useCallback((filter: SuggestionFilter): void => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
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

  const filteredItems = applyFilters(items, activeFilters);

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
    refreshAll,
    refreshUnmapped,
    refreshStale,
    markStale,
    activeFilters,
    toggleFilter,
    clearFilters,
    filteredItems,
    generatedAt,
    previousSuggestionsAvailable: previousItems !== null,
    restorePreviousSuggestions,
  };
}
