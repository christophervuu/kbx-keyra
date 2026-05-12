import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoMapReview } from './use-auto-map-review';
import type { UseAutoMapReviewParams } from './use-auto-map-review';

import type { ApiAdapter } from '@/lib/api/types';
import type {
  AutoMapSectionInput,
  AutoMapSectionResult,
  AutoMapSuggestion,
  MappingRule,
  ParsedSchema,
} from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUGGESTION_HIGH_VALID: AutoMapSuggestion = {
  target: 'Order.Header.Currency',
  expression: 'default(source("Invoice.CurrencyCode"), "USD")',
  explanation: 'Uses source currency and falls back to USD.',
  confidence: 'high',
  validation: { valid: true, diagnostics: [] },
};

const SUGGESTION_MEDIUM_INVALID: AutoMapSuggestion = {
  target: 'Order.Header.Amount',
  expression: 'source("Invoice.InvoiceAmount")',
  explanation: 'Direct mapping.',
  confidence: 'medium',
  validation: { valid: false, diagnostics: [{ code: 'E001', severity: 'error', message: 'Type mismatch' }] },
};

const SUGGESTION_LOW_NO_VALIDATION: AutoMapSuggestion = {
  target: 'Order.Header.Reference',
  expression: 'source("Invoice.Reference")',
  explanation: 'Direct mapping.',
  confidence: 'low',
};

const SUGGESTION_WITH_WARNING: AutoMapSuggestion = {
  target: 'Order.Header.Date',
  expression: 'source("Invoice.Date")',
  explanation: 'Direct mapping.',
  confidence: 'high',
  validation: {
    valid: true,
    diagnostics: [{ code: 'W001', severity: 'warning', message: 'Possible null' }],
  },
};

const MOCK_RESULT: AutoMapSectionResult = {
  suggestions: [SUGGESTION_HIGH_VALID, SUGGESTION_MEDIUM_INVALID, SUGGESTION_LOW_NO_VALIDATION],
};

const MOCK_RULES: MappingRule[] = [
  {
    id: 'r1',
    target: 'Order.Header.Currency',
    expression: 'source("Invoice.OldCurrency")',
    type: 'direct',
  },
];

/**
 * Default parsed target schema used in tests that don't care about target derivation.
 * Provides eligible nodes under Order.Header and Order.Line so the empty-guard
 * does not fire when triggerAutoMap is called with those section paths.
 */
const DEFAULT_TARGET_SCHEMA: ParsedSchema = {
  nodes: [
    { path: 'Order', fieldName: 'Order', type: 'object', depth: 0, isArray: false, isRequired: true, parentPath: null, childCount: 3, children: [] },
    { path: 'Order.Header', fieldName: 'Header', type: 'object', depth: 1, isArray: false, isRequired: true, parentPath: 'Order', childCount: 3, children: [] },
    { path: 'Order.Header.Currency', fieldName: 'Currency', type: 'string', depth: 2, isArray: false, isRequired: false, parentPath: 'Order.Header', childCount: 0, children: [] },
    { path: 'Order.Header.Amount', fieldName: 'Amount', type: 'number', depth: 2, isArray: false, isRequired: false, parentPath: 'Order.Header', childCount: 0, children: [] },
    { path: 'Order.Header.Reference', fieldName: 'Reference', type: 'string', depth: 2, isArray: false, isRequired: false, parentPath: 'Order.Header', childCount: 0, children: [] },
    { path: 'Order.Line', fieldName: 'Line', type: 'object', depth: 1, isArray: false, isRequired: false, parentPath: 'Order', childCount: 1, children: [] },
    { path: 'Order.Line.LineNumber', fieldName: 'LineNumber', type: 'number', depth: 2, isArray: false, isRequired: false, parentPath: 'Order.Line', childCount: 0, children: [] },
  ],
  totalFieldCount: 7,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdapter(
  autoMapSection: ApiAdapter['autoMapSection'],
): Partial<ApiAdapter> {
  return { autoMapSection };
}

function makeParams(
  overrides: Partial<UseAutoMapReviewParams> & { autoMapSection?: ApiAdapter['autoMapSection'] },
): UseAutoMapReviewParams {
  const { autoMapSection, ...rest } = overrides;
  return {
    adapter: makeAdapter(autoMapSection ?? vi.fn().mockResolvedValue(MOCK_RESULT)) as ApiAdapter,
    projectId: 'project-1',
    mappingId: 'mapping-1',
    rules: MOCK_RULES,
    updateDraft: vi.fn(),
    setSelectedTargetPath: vi.fn(),
    parsedSourceSchema: null,
    parsedTargetSchema: DEFAULT_TARGET_SCHEMA,
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutoMapReview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('returns idle initial state', () => {
    const params = makeParams({});
    const { result } = renderHook(() => useAutoMapReview(params));

    expect(result.current.status).toBe('idle');
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.sectionPath).toBeNull();
    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.summary.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('transitions to loading state when triggerAutoMap is called', async () => {
    let resolve!: (v: AutoMapSectionResult) => void;
    const pending = new Promise<AutoMapSectionResult>((res) => { resolve = res; });
    const params = makeParams({ autoMapSection: vi.fn().mockReturnValue(pending) });

    const { result } = renderHook(() => useAutoMapReview(params));

    act(() => {
      void result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.status).toBe('loading');
    expect(result.current.sectionPath).toBe('Order.Header');

    // Resolve to avoid dangling promise
    await act(async () => { resolve(MOCK_RESULT); });
  });

  // -------------------------------------------------------------------------
  // Success state
  // -------------------------------------------------------------------------

  it('transitions to success with items and summary after adapter resolves', async () => {
    const params = makeParams({});
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.status).toBe('success');
    expect(result.current.items).toHaveLength(3);
    expect(result.current.isDrawerOpen).toBe(true);

    const summary = result.current.summary;
    expect(summary.total).toBe(3);
    expect(summary.pending).toBe(3);
    expect(summary.accepted).toBe(0);
    expect(summary.validCount).toBe(1);
    expect(summary.invalidCount).toBe(1);
    expect(summary.highConfidence).toBe(1);
    expect(summary.mediumConfidence).toBe(1);
    expect(summary.lowConfidence).toBe(1);
  });

  it('correctly looks up currentExpression from rules', async () => {
    const params = makeParams({});
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    const currencyItem = result.current.items.find(
      (i) => i.suggestion.target === 'Order.Header.Currency',
    );
    expect(currencyItem?.currentExpression).toBe('source("Invoice.OldCurrency")');
    expect(currencyItem?.isNew).toBe(false);
  });

  it('sets isNew=true when no matching rule exists', async () => {
    const params = makeParams({});
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    const amountItem = result.current.items.find(
      (i) => i.suggestion.target === 'Order.Header.Amount',
    );
    expect(amountItem?.currentExpression).toBeNull();
    expect(amountItem?.isNew).toBe(true);
  });

  it('initialises all items with reviewStatus=pending', async () => {
    const params = makeParams({});
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.items.every((i) => i.reviewStatus === 'pending')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Empty response (AE-10)
  // -------------------------------------------------------------------------

  it('handles empty suggestions array (AE-10)', async () => {
    const params = makeParams({
      autoMapSection: vi.fn().mockResolvedValue({ suggestions: [] }),
    });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.status).toBe('success');
    expect(result.current.items).toHaveLength(0);
    expect(result.current.summary.total).toBe(0);
    expect(result.current.isDrawerOpen).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Error state (AE-11)
  // -------------------------------------------------------------------------

  it('transitions to error state with user-friendly message (AE-11)', async () => {
    const params = makeParams({
      autoMapSection: vi.fn().mockRejectedValue(new Error('Some unknown failure')),
    });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('An unexpected error occurred. Please try again.');
    expect(result.current.isDrawerOpen).toBe(true);
  });

  it('maps offline mode error to user-friendly message', async () => {
    const params = makeParams({
      autoMapSection: vi.fn().mockRejectedValue(new Error('Not available in offline mode')),
    });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.error).toBe('Auto-Map is not available in offline mode');
  });

  it('passes through rate limit error message', async () => {
    const msg = 'The AI service is temporarily busy. Please try again in a moment.';
    const params = makeParams({
      autoMapSection: vi.fn().mockRejectedValue(new Error(msg)),
    });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.error).toBe(msg);
  });

  // -------------------------------------------------------------------------
  // Duplicate deduplication
  // -------------------------------------------------------------------------

  it('deduplicates suggestions by target — first occurrence wins', async () => {
    const dup: AutoMapSuggestion = {
      ...SUGGESTION_HIGH_VALID,
      expression: 'source("Invoice.DuplicateCurrency")',
    };
    const params = makeParams({
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_HIGH_VALID, dup],
      }),
    });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    const currencyItems = result.current.items.filter(
      (i) => i.suggestion.target === 'Order.Header.Currency',
    );
    expect(currencyItems).toHaveLength(1);
    expect(currencyItems[0].suggestion.expression).toBe(SUGGESTION_HIGH_VALID.expression);
  });

  // -------------------------------------------------------------------------
  // acceptSuggestion (AE-02, AE-03)
  // -------------------------------------------------------------------------

  it('acceptSuggestion updates reviewStatus to accepted and calls updateDraft', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    act(() => {
      result.current.acceptSuggestion('Order.Header.Currency');
    });

    const item = result.current.items.find((i) => i.suggestion.target === 'Order.Header.Currency');
    expect(item?.reviewStatus).toBe('accepted');
    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Currency',
      SUGGESTION_HIGH_VALID.expression,
    );
    expect(result.current.summary.accepted).toBe(1);
    expect(result.current.summary.pending).toBe(2);
  });

  // -------------------------------------------------------------------------
  // editSuggestion (AE-04)
  // -------------------------------------------------------------------------

  it('editSuggestion updates reviewStatus to edited, calls updateDraft and setSelectedTargetPath', async () => {
    const updateDraft = vi.fn();
    const setSelectedTargetPath = vi.fn();
    const params = makeParams({ updateDraft, setSelectedTargetPath });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    act(() => {
      result.current.editSuggestion('Order.Header.Currency');
    });

    const item = result.current.items.find((i) => i.suggestion.target === 'Order.Header.Currency');
    expect(item?.reviewStatus).toBe('edited');
    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Currency',
      SUGGESTION_HIGH_VALID.expression,
    );
    expect(setSelectedTargetPath).toHaveBeenCalledWith('Order.Header.Currency');
    expect(result.current.summary.edited).toBe(1);
  });

  // -------------------------------------------------------------------------
  // dismissSuggestion (AE-05)
  // -------------------------------------------------------------------------

  it('dismissSuggestion updates reviewStatus to dismissed and does NOT call updateDraft', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    act(() => {
      result.current.dismissSuggestion('Order.Header.Currency');
    });

    const item = result.current.items.find((i) => i.suggestion.target === 'Order.Header.Currency');
    expect(item?.reviewStatus).toBe('dismissed');
    expect(updateDraft).not.toHaveBeenCalled();
    expect(result.current.summary.dismissed).toBe(1);
    expect(result.current.summary.pending).toBe(2);
  });

  // -------------------------------------------------------------------------
  // undoDismiss (AE-16)
  // -------------------------------------------------------------------------

  it('undoDismiss restores dismissed → pending and does NOT call updateDraft', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    act(() => {
      result.current.dismissSuggestion('Order.Header.Currency');
    });
    expect(result.current.summary.dismissed).toBe(1);

    act(() => {
      result.current.undoDismiss('Order.Header.Currency');
    });

    const item = result.current.items.find((i) => i.suggestion.target === 'Order.Header.Currency');
    expect(item?.reviewStatus).toBe('pending');
    expect(updateDraft).not.toHaveBeenCalled();
    expect(result.current.summary.dismissed).toBe(0);
    expect(result.current.summary.pending).toBe(3);
  });

  it('undoDismiss is a no-op when item is not dismissed', async () => {
    const params = makeParams({});
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    // Item is pending, not dismissed
    const before = result.current.items.find((i) => i.suggestion.target === 'Order.Header.Currency');
    expect(before?.reviewStatus).toBe('pending');

    act(() => {
      result.current.undoDismiss('Order.Header.Currency');
    });

    const after = result.current.items.find((i) => i.suggestion.target === 'Order.Header.Currency');
    expect(after?.reviewStatus).toBe('pending');
    expect(result.current.summary.pending).toBe(3);
  });

  // -------------------------------------------------------------------------
  // acceptAllValid (AE-06)
  // -------------------------------------------------------------------------

  it('acceptAllValid accepts only valid/unvalidated pending items (AE-06)', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    act(() => {
      result.current.acceptAllValid();
    });

    // SUGGESTION_HIGH_VALID (valid=true) → accepted
    // SUGGESTION_MEDIUM_INVALID (valid=false) → still pending
    // SUGGESTION_LOW_NO_VALIDATION (no validation) → accepted
    expect(result.current.summary.accepted).toBe(2);
    expect(result.current.summary.pending).toBe(1);

    const invalidItem = result.current.items.find(
      (i) => i.suggestion.target === 'Order.Header.Amount',
    );
    expect(invalidItem?.reviewStatus).toBe('pending');

    expect(updateDraft).toHaveBeenCalledTimes(2);
    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Currency',
      SUGGESTION_HIGH_VALID.expression,
    );
    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Reference',
      SUGGESTION_LOW_NO_VALIDATION.expression,
    );
  });

  it('acceptAllValid skips already-dismissed items', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    act(() => {
      result.current.dismissSuggestion('Order.Header.Currency');
    });

    act(() => {
      result.current.acceptAllValid();
    });

    // Currency is dismissed, Reference (no validation) accepted
    expect(result.current.summary.accepted).toBe(1);
    expect(result.current.summary.dismissed).toBe(1);
    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft).toHaveBeenCalledWith(
      'Order.Header.Reference',
      SUGGESTION_LOW_NO_VALIDATION.expression,
    );
  });

  // -------------------------------------------------------------------------
  // All resolved (AE-13)
  // -------------------------------------------------------------------------

  it('summary reflects all-resolved when all items are accepted or dismissed (AE-13)', async () => {
    const params = makeParams({
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_HIGH_VALID, SUGGESTION_LOW_NO_VALIDATION],
      }),
    });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    act(() => {
      result.current.acceptSuggestion('Order.Header.Currency');
      result.current.dismissSuggestion('Order.Header.Reference');
    });

    expect(result.current.summary.pending).toBe(0);
    expect(result.current.summary.accepted).toBe(1);
    expect(result.current.summary.dismissed).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Absent validation (AE-14)
  // -------------------------------------------------------------------------

  it('counts absent validation correctly in summary (AE-14)', async () => {
    const params = makeParams({
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_LOW_NO_VALIDATION],
      }),
    });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    // No validation → not counted in validCount or invalidCount
    expect(result.current.summary.validCount).toBe(0);
    expect(result.current.summary.invalidCount).toBe(0);
    expect(result.current.summary.warningCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Warning count
  // -------------------------------------------------------------------------

  it('counts warnings correctly in summary', async () => {
    const params = makeParams({
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_WITH_WARNING],
      }),
    });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.summary.validCount).toBe(1);
    expect(result.current.summary.warningCount).toBe(1);
    expect(result.current.summary.invalidCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Abort / stale response
  // -------------------------------------------------------------------------

  it('ignores stale response when a new request is triggered before the first resolves', async () => {
    let firstResolve!: (v: AutoMapSectionResult) => void;
    const firstPending = new Promise<AutoMapSectionResult>((res) => { firstResolve = res; });

    const autoMapSection = vi
      .fn()
      .mockReturnValueOnce(firstPending)
      .mockResolvedValueOnce({ suggestions: [SUGGESTION_LOW_NO_VALIDATION] });

    const params = makeParams({ autoMapSection });
    const { result } = renderHook(() => useAutoMapReview(params));

    // Start first request
    act(() => {
      void result.current.triggerAutoMap('Order.Header');
    });
    expect(result.current.status).toBe('loading');

    // Start second request while first is in-flight
    await act(async () => {
      await result.current.triggerAutoMap('Order.Line');
    });

    // Second request resolved — state should reflect second result
    expect(result.current.status).toBe('success');
    expect(result.current.sectionPath).toBe('Order.Line');
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].suggestion.target).toBe('Order.Header.Reference');

    // Resolve first request — should NOT update state
    await act(async () => {
      firstResolve(MOCK_RESULT);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.sectionPath).toBe('Order.Line');
  });

  it('abort is called on unmount', () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

    let resolve!: (v: AutoMapSectionResult) => void;
    const pending = new Promise<AutoMapSectionResult>((res) => { resolve = res; });
    const params = makeParams({ autoMapSection: vi.fn().mockReturnValue(pending) });

    const { result, unmount } = renderHook(() => useAutoMapReview(params));

    act(() => {
      void result.current.triggerAutoMap('Order.Header');
    });

    unmount();
    expect(abortSpy).toHaveBeenCalled();

    // Resolve to avoid dangling promise
    resolve(MOCK_RESULT);
    abortSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------

  it('reset clears all state back to idle and closes drawer', async () => {
    const params = makeParams({});
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });
    expect(result.current.status).toBe('success');
    expect(result.current.isDrawerOpen).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.items).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(result.current.sectionPath).toBeNull();
    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.summary.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Drawer control
  // -------------------------------------------------------------------------

  it('openDrawer and closeDrawer toggle isDrawerOpen', () => {
    const params = makeParams({});
    const { result } = renderHook(() => useAutoMapReview(params));

    act(() => { result.current.openDrawer(); });
    expect(result.current.isDrawerOpen).toBe(true);

    act(() => { result.current.closeDrawer(); });
    expect(result.current.isDrawerOpen).toBe(false);
  });

  // -------------------------------------------------------------------------
  // sourceContext derivation
  // -------------------------------------------------------------------------

  it('passes sourceContext derived from parsedSourceSchema to adapter', async () => {
    const autoMapSection = vi.fn().mockResolvedValue(MOCK_RESULT);
    const parsedSourceSchema: ParsedSchema = {
      nodes: [
        { path: 'Invoice.Amount', fieldName: 'Amount', type: 'number', depth: 1, isArray: false, isRequired: true, parentPath: 'Invoice', childCount: 0, children: [] },
        { path: 'Invoice.CurrencyCode', fieldName: 'CurrencyCode', type: 'string', depth: 1, isArray: false, isRequired: false, parentPath: 'Invoice', childCount: 0, children: [] },
      ],
      totalFieldCount: 2,
      format: 'json-schema',
      parseTimeMs: 1,
      inferred: false,
    };

    const params = makeParams({ autoMapSection, parsedSourceSchema });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    const calledInput: AutoMapSectionInput = autoMapSection.mock.calls[0][0];
    expect(calledInput.sourceContext).toBe(
      '- Invoice.Amount (number)\n- Invoice.CurrencyCode (string)',
    );
  });

  it('omits sourceContext when parsedSourceSchema is null', async () => {
    const autoMapSection = vi.fn().mockResolvedValue(MOCK_RESULT);
    const params = makeParams({ autoMapSection, parsedSourceSchema: null });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    const calledInput: AutoMapSectionInput = autoMapSection.mock.calls[0][0];
    expect(calledInput.sourceContext).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // targetSection derivation (FS-047 T-05)
  // -------------------------------------------------------------------------

  it('sends targetSection derived from parsedTargetSchema descendants for section mode', async () => {
    const autoMapSection = vi.fn().mockResolvedValue(MOCK_RESULT);
    const params = makeParams({ autoMapSection });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    const calledInput: AutoMapSectionInput = autoMapSection.mock.calls[0][0];
    expect(calledInput.targetSection).toBe(
      '- Order.Header.Currency (string)\n- Order.Header.Amount (number)\n- Order.Header.Reference (string)',
    );
    expect(calledInput.sectionPath).toBe('Order.Header');
  });

  it('sends targetSection covering full schema when sectionPath is null (header mode)', async () => {
    const autoMapSection = vi.fn().mockResolvedValue(MOCK_RESULT);
    const params = makeParams({ autoMapSection });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap(null);
    });

    const calledInput: AutoMapSectionInput = autoMapSection.mock.calls[0][0];
    // All non-object nodes in DEFAULT_TARGET_SCHEMA
    expect(calledInput.targetSection).toContain('- Order.Header.Currency (string)');
    expect(calledInput.targetSection).toContain('- Order.Line.LineNumber (number)');
    expect(calledInput.sectionPath).toBeUndefined();
  });

  it('sets error state and does not call adapter when no eligible targets exist', async () => {
    const autoMapSection = vi.fn().mockResolvedValue(MOCK_RESULT);
    const emptyTargetSchema: ParsedSchema = {
      nodes: [
        { path: 'Order', fieldName: 'Order', type: 'object', depth: 0, isArray: false, isRequired: true, parentPath: null, childCount: 1, children: [] },
        { path: 'Order.Header', fieldName: 'Header', type: 'object', depth: 1, isArray: false, isRequired: true, parentPath: 'Order', childCount: 0, children: [] },
      ],
      totalFieldCount: 2,
      format: 'json-schema',
      parseTimeMs: 0,
      inferred: false,
    };
    const params = makeParams({ autoMapSection, parsedTargetSchema: emptyTargetSchema });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('No eligible target fields found in this section');
    expect(result.current.isDrawerOpen).toBe(true);
    expect(autoMapSection).not.toHaveBeenCalled();
  });

  it('sets error state and does not call adapter when parsedTargetSchema is null', async () => {
    const autoMapSection = vi.fn().mockResolvedValue(MOCK_RESULT);
    const params = makeParams({ autoMapSection, parsedTargetSchema: null });
    const { result } = renderHook(() => useAutoMapReview(params));

    await act(async () => {
      await result.current.triggerAutoMap('Order.Header');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('No eligible target fields found in this section');
    expect(result.current.isDrawerOpen).toBe(true);
    expect(autoMapSection).not.toHaveBeenCalled();
  });
});
