import { useCallback, useEffect, useRef, useState } from 'react';

import type { ApiAdapter } from '@/lib/api/types';
import type {
  AutoMapReviewSummary,
  AutoMapSectionInput,
  AutoMapSuggestion,
  MappingRule,
  ParsedSchema,
  SuggestionReviewItem,
  SuggestionReviewStatus,
} from '@/lib/types/domain';
import { deriveEligibleTargets } from '../lib/derive-eligible-targets';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OFFLINE_MODE_FRAGMENT = 'offline mode';
const RATE_LIMIT_FRAGMENT = 'temporarily busy';
const RATE_LIMIT_FRAGMENT_ALT = 'rate limit';
const NETWORK_ERROR_FRAGMENT = 'Could not reach';
const UNEXPECTED_RESPONSE_FRAGMENT = 'unexpected response';
const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';
const OFFLINE_USER_MESSAGE = 'Auto-Map is not available in offline mode';
const NO_ELIGIBLE_TARGETS_MESSAGE = 'No eligible target fields found in this section';

/** Maximum number of source field lines sent as context to the AI. */
const SOURCE_CONTEXT_LINE_LIMIT = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAutoMapReviewParams {
  adapter: ApiAdapter;
  projectId: string;
  mappingId: string;
  rules: readonly MappingRule[];
  updateDraft: (targetPath: string, expression: string) => void;
  setSelectedTargetPath: (path: string) => void;
  parsedSourceSchema?: ParsedSchema | null;
  parsedTargetSchema?: ParsedSchema | null;
}

export interface UseAutoMapReviewResult {
  // State
  status: 'idle' | 'loading' | 'success' | 'error';
  items: readonly SuggestionReviewItem[];
  summary: AutoMapReviewSummary;
  error: string | null;
  sectionPath: string | null;

  // Actions
  triggerAutoMap: (sectionPath: string | null) => Promise<void>;
  acceptSuggestion: (targetPath: string) => void;
  editSuggestion: (targetPath: string) => void;
  dismissSuggestion: (targetPath: string) => void;
  undoDismiss: (targetPath: string) => void;
  acceptAllValid: () => void;
  reset: () => void;

  // Drawer control
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapErrorToMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes(OFFLINE_MODE_FRAGMENT)) {
    return OFFLINE_USER_MESSAGE;
  }

  if (
    message.includes(RATE_LIMIT_FRAGMENT) ||
    message.includes(RATE_LIMIT_FRAGMENT_ALT)
  ) {
    return message;
  }

  if (message.includes(NETWORK_ERROR_FRAGMENT)) {
    return message;
  }

  if (message.includes(UNEXPECTED_RESPONSE_FRAGMENT)) {
    return message;
  }

  return GENERIC_ERROR_MESSAGE;
}

/**
 * Returns true when a suggestion has warnings:
 * validation.valid === true but diagnostics contains warning-severity entries.
 */
function hasWarnings(suggestion: AutoMapSuggestion): boolean {
  if (!suggestion.validation) return false;
  if (!suggestion.validation.valid) return false;
  return suggestion.validation.diagnostics.some((d) => d.severity === 'warning');
}

function computeSummary(items: readonly SuggestionReviewItem[]): AutoMapReviewSummary {
  return {
    total: items.length,
    pending: items.filter((i) => i.reviewStatus === 'pending').length,
    accepted: items.filter((i) => i.reviewStatus === 'accepted').length,
    edited: items.filter((i) => i.reviewStatus === 'edited').length,
    dismissed: items.filter((i) => i.reviewStatus === 'dismissed').length,
    validCount: items.filter((i) => i.suggestion.validation?.valid === true).length,
    warningCount: items.filter((i) => hasWarnings(i.suggestion)).length,
    invalidCount: items.filter((i) => i.suggestion.validation?.valid === false).length,
    highConfidence: items.filter((i) => i.suggestion.confidence === 'high').length,
    mediumConfidence: items.filter((i) => i.suggestion.confidence === 'medium').length,
    lowConfidence: items.filter((i) => i.suggestion.confidence === 'low').length,
  };
}

const EMPTY_SUMMARY: AutoMapReviewSummary = {
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
};

/**
 * Derive a compact source context string from a ParsedSchema.
 * Format: "- {path} ({type})" per leaf field, limited to SOURCE_CONTEXT_LINE_LIMIT lines.
 * Mirrors the FS-042 showcase pattern.
 */
function deriveSourceContext(schema: ParsedSchema | null | undefined): string | undefined {
  if (!schema) return undefined;

  const lines: string[] = [];
  for (const node of schema.nodes) {
    if (lines.length >= SOURCE_CONTEXT_LINE_LIMIT) break;
    lines.push(`- ${node.path} (${node.type})`);
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Update a single item's reviewStatus by target path, returning a new array.
 * Returns the same array reference if the target is not found.
 */
function updateItemStatus(
  items: readonly SuggestionReviewItem[],
  targetPath: string,
  nextStatus: SuggestionReviewStatus,
): readonly SuggestionReviewItem[] {
  const idx = items.findIndex((i) => i.suggestion.target === targetPath);
  if (idx === -1) return items;

  const updated = [...items];
  updated[idx] = { ...updated[idx], reviewStatus: nextStatus };
  return updated;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages the full Auto-Map suggestion review lifecycle:
 * - Triggers `adapter.autoMapSection()` for a given section path
 * - Tracks per-suggestion review status (pending → accepted | edited | dismissed)
 * - Provides action handlers: accept, edit, dismiss, undoDismiss, acceptAllValid, reset
 * - Manages drawer open/close state co-located with review state
 *
 * Abort semantics: uses a requestId ref to ignore stale responses when a new
 * request is triggered before the previous one completes.
 */
export function useAutoMapReview({
  adapter,
  projectId,
  mappingId,
  rules,
  updateDraft,
  setSelectedTargetPath,
  parsedSourceSchema,
  parsedTargetSchema,
}: UseAutoMapReviewParams): UseAutoMapReviewResult {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [items, setItems] = useState<readonly SuggestionReviewItem[]>([]);
  const [summary, setSummary] = useState<AutoMapReviewSummary>(EMPTY_SUMMARY);
  const [error, setError] = useState<string | null>(null);
  const [sectionPath, setSectionPath] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Stable refs so async callbacks always see current values
  const adapterRef = useRef(adapter);
  useEffect(() => { adapterRef.current = adapter; });

  const rulesRef = useRef(rules);
  useEffect(() => { rulesRef.current = rules; });

  const updateDraftRef = useRef(updateDraft);
  useEffect(() => { updateDraftRef.current = updateDraft; });

  const setSelectedTargetPathRef = useRef(setSelectedTargetPath);
  useEffect(() => { setSelectedTargetPathRef.current = setSelectedTargetPath; });

  const parsedSourceSchemaRef = useRef(parsedSourceSchema);
  useEffect(() => { parsedSourceSchemaRef.current = parsedSourceSchema; });

  const parsedTargetSchemaRef = useRef(parsedTargetSchema);
  useEffect(() => { parsedTargetSchemaRef.current = parsedTargetSchema; });

  // Stale-run guard: increment on each new request; async callback checks before committing state
  const requestIdRef = useRef(0);

  // Abort controller for unmount cleanup
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // triggerAutoMap
  // ---------------------------------------------------------------------------

  const triggerAutoMap = useCallback(async (path: string | null): Promise<void> => {
    // Abort any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Increment request ID — any previous async callback will see a stale id
    const currentRequestId = ++requestIdRef.current;

    setStatus('loading');
    setSectionPath(path);
    setError(null);
    setIsDrawerOpen(true);

    // Derive eligible target listing (section mode or full-schema header mode)
    const targetSection = deriveEligibleTargets(parsedTargetSchemaRef.current, path);

    // Guard: no eligible targets → surface error without sending request
    if (targetSection === '') {
      setStatus('error');
      setError(NO_ELIGIBLE_TARGETS_MESSAGE);
      return;
    }

    const input: AutoMapSectionInput = {
      projectId,
      mappingId,
      sectionPath: path ?? undefined,
      targetSection,
      sourceContext: deriveSourceContext(parsedSourceSchemaRef.current),
    };

    try {
      const result = await adapterRef.current.autoMapSection(input);

      // Guard: stale response (new request was triggered) or unmounted
      if (requestIdRef.current !== currentRequestId || controller.signal.aborted) return;

      // Deduplicate by target path — first occurrence wins
      const seen = new Set<string>();
      const deduped = result.suggestions.filter((s) => {
        if (seen.has(s.target)) {
          console.warn(`[useAutoMapReview] Duplicate suggestion target ignored: ${s.target}`);
          return false;
        }
        seen.add(s.target);
        return true;
      });

      // Build review items
      const currentRules = rulesRef.current;
      const newItems: SuggestionReviewItem[] = deduped.map((suggestion) => {
        const existingRule = currentRules.find((r) => r.target === suggestion.target);
        return {
          suggestion,
          currentExpression: existingRule?.expression ?? null,
          reviewStatus: 'pending',
          isNew: existingRule === undefined,
        };
      });

      const newSummary = computeSummary(newItems);

      setItems(newItems);
      setSummary(newSummary);
      setStatus('success');
      setIsDrawerOpen(true);
    } catch (err) {
      if (requestIdRef.current !== currentRequestId || controller.signal.aborted) return;

      setStatus('error');
      setError(mapErrorToMessage(err));
    }
  }, [projectId, mappingId]);

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const acceptSuggestion = useCallback((targetPath: string): void => {
    setItems((prev) => {
      const item = prev.find((i) => i.suggestion.target === targetPath);
      if (!item) return prev;

      updateDraftRef.current(targetPath, item.suggestion.expression);

      const next = updateItemStatus(prev, targetPath, 'accepted');
      setSummary(computeSummary(next));
      return next;
    });
  }, []);

  const editSuggestion = useCallback((targetPath: string): void => {
    setItems((prev) => {
      const item = prev.find((i) => i.suggestion.target === targetPath);
      if (!item) return prev;

      updateDraftRef.current(targetPath, item.suggestion.expression);
      setSelectedTargetPathRef.current(targetPath);

      const next = updateItemStatus(prev, targetPath, 'edited');
      setSummary(computeSummary(next));
      return next;
    });
  }, []);

  const dismissSuggestion = useCallback((targetPath: string): void => {
    setItems((prev) => {
      const next = updateItemStatus(prev, targetPath, 'dismissed');
      setSummary(computeSummary(next));
      return next;
    });
  }, []);

  const undoDismiss = useCallback((targetPath: string): void => {
    setItems((prev) => {
      const item = prev.find((i) => i.suggestion.target === targetPath);
      // No-op if item is not in dismissed state
      if (!item || item.reviewStatus !== 'dismissed') return prev;

      const next = updateItemStatus(prev, targetPath, 'pending');
      setSummary(computeSummary(next));
      return next;
    });
  }, []);

  const acceptAllValid = useCallback((): void => {
    setItems((prev) => {
      const next = prev.map((item): SuggestionReviewItem => {
        if (item.reviewStatus !== 'pending') return item;
        // Accept if validation is absent OR validation.valid === true
        const isValid =
          item.suggestion.validation === undefined ||
          item.suggestion.validation.valid === true;
        if (!isValid) return item;

        updateDraftRef.current(item.suggestion.target, item.suggestion.expression);
        return { ...item, reviewStatus: 'accepted' };
      });

      setSummary(computeSummary(next));
      return next;
    });
  }, []);

  const reset = useCallback((): void => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestIdRef.current++;

    setStatus('idle');
    setItems([]);
    setSummary(EMPTY_SUMMARY);
    setError(null);
    setSectionPath(null);
    setIsDrawerOpen(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Drawer control
  // ---------------------------------------------------------------------------

  const openDrawer = useCallback((): void => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback((): void => setIsDrawerOpen(false), []);

  return {
    status,
    items,
    summary,
    error,
    sectionPath,
    triggerAutoMap,
    acceptSuggestion,
    editSuggestion,
    dismissSuggestion,
    undoDismiss,
    acceptAllValid,
    reset,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
  };
}
