import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoMapWorkspace } from './use-auto-map-workspace';

import type { AutoMapSectionResult, MappingRule, ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// sessionStorage mock
// ---------------------------------------------------------------------------

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    _store: () => store,
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

Object.defineProperty(document, 'visibilityState', {
  configurable: true,
  get: () => 'visible',
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAPPING_ID = 'mapping-abc';
const PROJECT_ID = 'project-xyz';
const SECTION_PATH = 'Order';

const SUGGESTION_A = {
  target: 'Order.Id',
  expression: 'source.orderId',
  explanation: 'Maps order ID',
  confidence: 'high' as const,
  validation: { valid: true, diagnostics: [] },
};

const SUGGESTION_B = {
  target: 'Order.Amount',
  expression: 'source.total',
  explanation: 'Maps total amount',
  confidence: 'medium' as const,
  validation: { valid: true, diagnostics: [] },
};

const SUGGESTION_INVALID = {
  target: 'Order.Status',
  expression: 'bad.expr',
  explanation: 'Invalid expression',
  confidence: 'low' as const,
  validation: { valid: false, diagnostics: [{ severity: 'error', code: 'E001', message: 'Bad expr' }] },
};

const MOCK_RESULT: AutoMapSectionResult = {
  suggestions: [SUGGESTION_A, SUGGESTION_B],
  retrievalMeta: {
    mode: 'section',
    chunkCount: 1,
    retrievalCandidatesCount: 4,
    retrievalSelectedCount: 2,
    noContext: false,
  },
  validationMeta: {
    validationPassCount: 2,
    validationFailCount: 0,
  },
  dedupMeta: {
    duplicatesCollapsed: 0,
  },
};

const MOCK_RULES: readonly MappingRule[] = [];
const MOCK_RULES_WITH_EXISTING: readonly MappingRule[] = [
  {
    target: 'Order.Id',
    type: 'string',
    expression: 'source.oldOrderId',
  },
];

const MOCK_SOURCE_SCHEMA: ParsedSchema = {
  nodes: [{ path: 'source.orderId', fieldName: 'orderId', type: 'string', depth: 0, isRequired: false, isArray: false, childCount: 0, children: [], parentPath: null }],
  totalFieldCount: 1,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const MOCK_TARGET_SCHEMA: ParsedSchema = {
  nodes: [
    {
      path: 'Order',
      fieldName: 'Order',
      type: 'object',
      depth: 0,
      isRequired: false,
      isArray: false,
      childCount: 2,
      parentPath: null,
      children: [
        { path: 'Order.Id', fieldName: 'Id', type: 'string', depth: 1, isRequired: false, isArray: false, childCount: 0, children: [], parentPath: 'Order' },
        { path: 'Order.Amount', fieldName: 'Amount', type: 'number', depth: 1, isRequired: false, isArray: false, childCount: 0, children: [], parentPath: 'Order' },
      ],
    },
  ],
  totalFieldCount: 2,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

// ---------------------------------------------------------------------------
// Adapter mock factory
// ---------------------------------------------------------------------------

function makeAdapter(result: AutoMapSectionResult = MOCK_RESULT) {
  return {
    autoMapSection: vi.fn().mockResolvedValue(result),
  };
}

// ---------------------------------------------------------------------------
// Default hook params
// ---------------------------------------------------------------------------

function makeParams(overrides: Partial<Parameters<typeof useAutoMapWorkspace>[0]> = {}) {
  return {
    adapter: makeAdapter() as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    mappingId: MAPPING_ID,
    projectId: PROJECT_ID,
    rules: MOCK_RULES,
    updateDraft: vi.fn(),
    setSelectedTargetPath: vi.fn(),
    exitWorkspace: vi.fn(),
    parsedSourceSchema: MOCK_SOURCE_SCHEMA,
    parsedTargetSchema: MOCK_TARGET_SCHEMA,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAutoMapWorkspace', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // AE-01: Trigger and receive suggestions
  // -------------------------------------------------------------------------

  it('starts idle and transitions to loading then success on triggerAutoMap', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    expect(result.current.status).toBe('idle');

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].targetPath).toBe('Order.Id');
    expect(result.current.items[0].status).toBe('suggested');
    expect(result.current.sectionPath).toBe(SECTION_PATH);
    expect(result.current.summary.mode).toBe('section');
    expect(result.current.summary.chunkCount).toBe(1);
    expect(result.current.summary.retrievalCandidatesCount).toBe(4);
    expect(result.current.summary.retrievalSelectedCount).toBe(2);
    expect(result.current.summary.validationPassCount).toBe(2);
    expect(result.current.summary.validationFailCount).toBe(0);
    expect(result.current.summary.duplicatesCollapsed).toBe(0);
    expect(result.current.summary.noContext).toBe(false);

    expect((params.adapter as { autoMapSection: ReturnType<typeof vi.fn> }).autoMapSection).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'section',
        sectionPath: SECTION_PATH,
      }),
    );
  });

  it('trims section path before request payload', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap('  Order  ');
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect((params.adapter as { autoMapSection: ReturnType<typeof vi.fn> }).autoMapSection).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'section',
        sectionPath: 'Order',
      }),
    );
  });

  it('passes visibleTargetPaths scope when provided to triggerAutoMap', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH, ['Order.Id']);
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect((params.adapter as { autoMapSection: ReturnType<typeof vi.fn> }).autoMapSection).toHaveBeenCalledWith(
      expect.objectContaining({
        visibleTargetPaths: ['Order.Id'],
      }),
    );
  });

  it('sends whole mode request when section path is root', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap('');
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect((params.adapter as { autoMapSection: ReturnType<typeof vi.fn> }).autoMapSection).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'whole',
        sectionPath: undefined,
      }),
    );
  });

  it('normalizes suggestions missing validation payload as invalid', async () => {
    const adapterMock = makeAdapter({
      suggestions: [
        {
          target: 'Order.Id',
          expression: 'source.orderId',
          explanation: 'Maps order id',
          confidence: 'high',
        },
      ],
    });
    const params = makeParams({
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.items[0]?.validation).toEqual({
      valid: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'VALIDATION_MISSING',
          message: 'No validation status returned',
        },
      ],
    });
  });

  it('surfaces no-context metadata in summary for explicit empty runs (AE-06)', async () => {
    const adapterMock = makeAdapter({
      suggestions: [],
      retrievalMeta: {
        mode: 'whole',
        noContext: true,
        noContextReason: 'No relevant source context found for target scope',
      },
      validationMeta: {
        validationPassCount: 0,
        validationFailCount: 0,
      },
    });
    const params = makeParams({
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap('');
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.items).toHaveLength(0);
    expect(result.current.summary.mode).toBe('whole');
    expect(result.current.summary.noContext).toBe(true);
    expect(result.current.summary.noContextReason).toBe('No relevant source context found for target scope');
  });

  it('sets error when no eligible targets exist', async () => {
    const params = makeParams({ parsedTargetSchema: undefined });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toMatch(/No eligible target fields/);
  });

  // -------------------------------------------------------------------------
  // AE-02: Restore persisted suggestions on re-entry
  // -------------------------------------------------------------------------

  it('restores persisted suggestions without fetching when available', async () => {
    const adapterMock = makeAdapter();
    const params = makeParams({ adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'] });

    // First render: fetch and persist
    const { result: r1 } = renderHook(() => useAutoMapWorkspace(params));
    act(() => { r1.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(r1.current.status).toBe('success'));

    // Second render: should restore from sessionStorage, not call adapter again
    adapterMock.autoMapSection.mockClear();
    const { result: r2 } = renderHook(() => useAutoMapWorkspace(params));
    act(() => { r2.current.triggerAutoMap(SECTION_PATH); });

    // Should be synchronously success (no loading state)
    expect(r2.current.status).toBe('success');
    expect(adapterMock.autoMapSection).not.toHaveBeenCalled();
    expect(r2.current.items).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // AE-05: Accept suggestion
  // -------------------------------------------------------------------------

  it('acceptSuggestion calls updateDraft and transitions status to accepted', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.acceptSuggestion('Order.Id'); });

    expect(updateDraft).toHaveBeenCalledWith('Order.Id', 'source.orderId');
    await waitFor(() => {
      const item = result.current.items.find((i) => i.targetPath === 'Order.Id');
      expect(item?.status).toBe('accepted');
    });
  });

  it('acceptSuggestion is blocked for stale suggestions (no draft mutation)', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.markStale('Order.Id'); });
    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('stale');
    });

    act(() => { result.current.acceptSuggestion('Order.Id'); });

    expect(updateDraft).not.toHaveBeenCalledWith('Order.Id', 'source.orderId');
    expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('stale');
  });

  it('acceptSuggestion is blocked for invalid suggestions (no draft mutation)', async () => {
    const updateDraft = vi.fn();
    const adapterMock = makeAdapter({
      suggestions: [SUGGESTION_INVALID],
    });
    const params = makeParams({
      updateDraft,
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.acceptSuggestion('Order.Status'); });

    expect(updateDraft).not.toHaveBeenCalled();
    expect(result.current.items.find((i) => i.targetPath === 'Order.Status')?.status).toBe('suggested');
  });

  it('generate/refresh/retry/failure lifecycle does not mutate drafts before explicit accept', async () => {
    const updateDraft = vi.fn();
    const adapterMock = {
      autoMapSection: vi
        .fn()
        .mockResolvedValueOnce(MOCK_RESULT)
        .mockRejectedValueOnce(new Error('Network error: Could not reach server'))
        .mockResolvedValueOnce(MOCK_RESULT),
    };
    const params = makeParams({
      updateDraft,
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    // Initial generate
    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(updateDraft).not.toHaveBeenCalled();

    // Refresh failure should remain non-mutating
    act(() => {
      result.current.refreshAll();
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(updateDraft).not.toHaveBeenCalled();

    // Retry via refresh should remain non-mutating
    act(() => {
      result.current.refreshAll();
    });
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(updateDraft).not.toHaveBeenCalled();

    // Explicit accept is the first mutation path
    act(() => {
      result.current.acceptSuggestion('Order.Id');
    });
    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft).toHaveBeenCalledWith('Order.Id', 'source.orderId');
  });

  // -------------------------------------------------------------------------
  // AE-05: Bulk accept all valid
  // -------------------------------------------------------------------------

  it('bulkAcceptAllValid accepts only suggested items with valid or absent validation', async () => {
    const updateDraft = vi.fn();
    const adapterMock = makeAdapter({
      suggestions: [SUGGESTION_A, SUGGESTION_B, SUGGESTION_INVALID],
    });
    const params = makeParams({
      updateDraft,
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.bulkAcceptAllValid(); });

    await waitFor(() => {
      const accepted = result.current.items.filter((i) => i.status === 'accepted');
      expect(accepted).toHaveLength(2); // A and B are valid; INVALID is not
    });
    expect(updateDraft).toHaveBeenCalledWith('Order.Id', 'source.orderId');
    expect(updateDraft).toHaveBeenCalledWith('Order.Amount', 'source.total');
    expect(updateDraft).not.toHaveBeenCalledWith('Order.Status', expect.anything());

    expect(result.current.lastBatchAcceptResult).toEqual(
      expect.objectContaining({
        attempted: 3,
        applied: 2,
        skipped: 1,
      }),
    );
    expect(result.current.lastBatchAcceptResult?.skippedByReason.invalid).toBe(1);
    expect(result.current.lastBatchAcceptResult?.skippedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetPath: 'Order.Status', primaryReason: 'invalid' }),
      ]),
    );
  });

  it('bulkAcceptAllValid only considers currently filtered rows (default needsReview excludes dismissed)', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.markStale('Order.Id'); });
    act(() => { result.current.dismissSuggestion('Order.Amount'); });

    act(() => { result.current.bulkAcceptAllValid(); });

    expect(updateDraft).not.toHaveBeenCalled();
    expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('stale');
    expect(result.current.items.find((i) => i.targetPath === 'Order.Amount')?.status).toBe('dismissed');

    expect(result.current.lastBatchAcceptResult).toEqual(
      expect.objectContaining({
        attempted: 1,
        applied: 0,
        skipped: 1,
      }),
    );
    expect(result.current.lastBatchAcceptResult?.skippedByReason.stale).toBe(1);
    expect(result.current.lastBatchAcceptResult?.skippedByReason.dismissed).toBe(0);
  });

  it('bulkAcceptAllValid only attempts currently filtered rows', async () => {
    const updateDraft = vi.fn();
    const adapterMock = makeAdapter({
      suggestions: [SUGGESTION_A, SUGGESTION_B, SUGGESTION_INVALID],
    });
    const params = makeParams({
      updateDraft,
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.clearFilters();
      result.current.toggleFilter('accepted');
    });

    expect(result.current.filteredItems).toHaveLength(0);

    act(() => { result.current.bulkAcceptAllValid(); });

    expect(updateDraft).not.toHaveBeenCalled();
    expect(result.current.lastBatchAcceptResult).toEqual(
      expect.objectContaining({
        attempted: 0,
        applied: 0,
        skipped: 0,
      }),
    );
  });

  it('bulkAcceptAllValid preserves ineligible item state and reports deterministic mixed skip reasons for filtered scope', async () => {
    const updateDraft = vi.fn();
    const adapterMock = makeAdapter({
      suggestions: [SUGGESTION_A, SUGGESTION_B, SUGGESTION_INVALID],
    });
    const params = makeParams({
      updateDraft,
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    // Pre-review one suggestion, stale one, keep one invalid.
    act(() => { result.current.acceptSuggestion('Order.Id'); });
    act(() => { result.current.markStale('Order.Amount'); });

    expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('accepted');
    expect(result.current.items.find((i) => i.targetPath === 'Order.Amount')?.status).toBe('stale');
    expect(result.current.items.find((i) => i.targetPath === 'Order.Status')?.status).toBe('suggested');

    // Batch apply should mutate none of the ineligible suggestions.
    act(() => { result.current.bulkAcceptAllValid(); });

    expect(updateDraft).toHaveBeenCalledTimes(1);
    expect(updateDraft).toHaveBeenCalledWith('Order.Id', 'source.orderId');

    expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('accepted');
    expect(result.current.items.find((i) => i.targetPath === 'Order.Amount')?.status).toBe('stale');
    expect(result.current.items.find((i) => i.targetPath === 'Order.Status')?.status).toBe('suggested');

    expect(result.current.lastBatchAcceptResult).toEqual(
      expect.objectContaining({
        attempted: 2,
        applied: 0,
        skipped: 2,
      }),
    );
    expect(result.current.lastBatchAcceptResult?.skippedByReason['already-reviewed']).toBe(0);
    expect(result.current.lastBatchAcceptResult?.skippedByReason.stale).toBe(1);
    expect(result.current.lastBatchAcceptResult?.skippedByReason.invalid).toBe(1);
    expect(result.current.lastBatchAcceptResult?.skippedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetPath: 'Order.Amount', primaryReason: 'stale' }),
        expect.objectContaining({ targetPath: 'Order.Status', primaryReason: 'invalid' }),
      ]),
    );
  });

  it('clearBatchAcceptResult clears prior batch summary', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({ updateDraft });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.bulkAcceptAllValid(); });
    expect(result.current.lastBatchAcceptResult).not.toBeNull();

    act(() => { result.current.clearBatchAcceptResult(); });
    expect(result.current.lastBatchAcceptResult).toBeNull();
  });

  it('starting a new triggerAutoMap run clears previous batch summary', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.bulkAcceptAllValid(); });
    expect(result.current.lastBatchAcceptResult).not.toBeNull();

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    expect(result.current.lastBatchAcceptResult).toBeNull();
  });

  // -------------------------------------------------------------------------
  // AE-06: Edit suggestion
  // -------------------------------------------------------------------------

  it('editSuggestion calls updateDraft, setSelectedTargetPath, exitWorkspace, and marks edited', async () => {
    const updateDraft = vi.fn();
    const setSelectedTargetPath = vi.fn();
    const exitWorkspace = vi.fn();
    const params = makeParams({ updateDraft, setSelectedTargetPath, exitWorkspace });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.editSuggestion('Order.Id'); });

    expect(updateDraft).toHaveBeenCalledWith('Order.Id', 'source.orderId');
    expect(setSelectedTargetPath).toHaveBeenCalledWith('Order.Id');
    expect(exitWorkspace).toHaveBeenCalled();

    await waitFor(() => {
      const item = result.current.items.find((i) => i.targetPath === 'Order.Id');
      expect(item?.status).toBe('edited');
    });
  });

  it('editSuggestion is blocked for stale suggestions', async () => {
    const updateDraft = vi.fn();
    const setSelectedTargetPath = vi.fn();
    const exitWorkspace = vi.fn();
    const params = makeParams({ updateDraft, setSelectedTargetPath, exitWorkspace });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.markStale('Order.Id'); });
    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('stale');
    });

    act(() => { result.current.editSuggestion('Order.Id'); });

    expect(updateDraft).not.toHaveBeenCalled();
    expect(setSelectedTargetPath).not.toHaveBeenCalled();
    expect(exitWorkspace).not.toHaveBeenCalled();
    expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('stale');
  });

  it('editSuggestion is blocked for stale suggestions only (invalid remains editable)', async () => {
    const updateDraft = vi.fn();
    const setSelectedTargetPath = vi.fn();
    const exitWorkspace = vi.fn();
    const adapterMock = makeAdapter({
      suggestions: [SUGGESTION_INVALID],
    });
    const params = makeParams({
      updateDraft,
      setSelectedTargetPath,
      exitWorkspace,
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.editSuggestion('Order.Status');
    });

    expect(updateDraft).toHaveBeenCalledWith('Order.Status', 'bad.expr');
    expect(setSelectedTargetPath).toHaveBeenCalledWith('Order.Status');
    expect(exitWorkspace).toHaveBeenCalled();
    expect(result.current.items.find((i) => i.targetPath === 'Order.Status')?.status).toBe('edited');
  });

  it('editSuggestion remains available for invalid suggestions and marks edited', async () => {
    const updateDraft = vi.fn();
    const setSelectedTargetPath = vi.fn();
    const exitWorkspace = vi.fn();
    const adapterMock = makeAdapter({
      suggestions: [SUGGESTION_INVALID],
    });
    const params = makeParams({
      updateDraft,
      setSelectedTargetPath,
      exitWorkspace,
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.editSuggestion('Order.Status');
    });

    expect(updateDraft).toHaveBeenCalledWith('Order.Status', 'bad.expr');
    expect(setSelectedTargetPath).toHaveBeenCalledWith('Order.Status');
    expect(exitWorkspace).toHaveBeenCalled();
    expect(result.current.items.find((i) => i.targetPath === 'Order.Status')?.status).toBe('edited');
  });

  it('undoAccept reverts accepted suggestion to suggested and restores prior expression draft', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({
      updateDraft,
      rules: MOCK_RULES_WITH_EXISTING,
      adapter: makeAdapter({ suggestions: [SUGGESTION_A] }) as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.acceptSuggestion('Order.Id');
    });
    expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('accepted');

    act(() => {
      result.current.undoAccept('Order.Id');
    });

    expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('suggested');
    expect(updateDraft).toHaveBeenLastCalledWith('Order.Id', 'source.oldOrderId');
  });

  it('rehydrates accepted unsaved suggestion only when prior expression matches current saved rule', async () => {
    const updateDraft = vi.fn();
    const params = makeParams({
      updateDraft,
      rules: MOCK_RULES_WITH_EXISTING,
      adapter: makeAdapter({ suggestions: [SUGGESTION_A] }) as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });

    const { result: firstRender } = renderHook(() => useAutoMapWorkspace(params));
    act(() => {
      firstRender.current.triggerAutoMap(SECTION_PATH);
    });
    await waitFor(() => expect(firstRender.current.status).toBe('success'));

    act(() => {
      firstRender.current.acceptSuggestion('Order.Id');
    });

    const { result: secondRender } = renderHook(() => useAutoMapWorkspace(params));
    act(() => {
      secondRender.current.triggerAutoMap(SECTION_PATH);
    });

    expect(secondRender.current.status).toBe('success');
    expect(secondRender.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('accepted');
    expect(secondRender.current.rehydrationConflicts).toHaveLength(0);
    expect(updateDraft).toHaveBeenCalledWith('Order.Id', 'source.orderId');
  });

  it('marks rehydrate mismatch as conflict and does not overwrite draft', async () => {
    const updateDraft = vi.fn();
    const rulesAtAccept: readonly MappingRule[] = [
      {
        target: 'Order.Id',
        type: 'string',
        expression: 'source.oldOrderId',
      },
    ];
    const paramsAtAccept = makeParams({
      updateDraft,
      rules: rulesAtAccept,
      adapter: makeAdapter({ suggestions: [SUGGESTION_A] }) as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });

    const { result: firstRender } = renderHook(() => useAutoMapWorkspace(paramsAtAccept));
    act(() => {
      firstRender.current.triggerAutoMap(SECTION_PATH);
    });
    await waitFor(() => expect(firstRender.current.status).toBe('success'));

    act(() => {
      firstRender.current.acceptSuggestion('Order.Id');
    });

    const rulesAtReload: readonly MappingRule[] = [
      {
        target: 'Order.Id',
        type: 'string',
        expression: 'source.changedExternally',
      },
    ];
    const paramsAtReload = makeParams({
      updateDraft,
      rules: rulesAtReload,
      adapter: makeAdapter({ suggestions: [SUGGESTION_A] }) as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });

    const updateDraftCallsBeforeReload = updateDraft.mock.calls.length;
    const { result: secondRender } = renderHook(() => useAutoMapWorkspace(paramsAtReload));
    act(() => {
      secondRender.current.triggerAutoMap(SECTION_PATH);
    });

    expect(secondRender.current.status).toBe('success');
    expect(secondRender.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('conflict');
    expect(secondRender.current.rehydrationConflicts).toEqual(['Order.Id']);
    expect(updateDraft.mock.calls.length).toBe(updateDraftCallsBeforeReload);
  });

  it('marks accepted suggestion as materialized after current revision increases', async () => {
    const params = makeParams({
      currentRevision: 1,
      rules: MOCK_RULES_WITH_EXISTING,
      adapter: makeAdapter({ suggestions: [SUGGESTION_A] }) as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });

    const { result, rerender } = renderHook(
      ({ revision }: { revision: number }) => useAutoMapWorkspace({ ...params, currentRevision: revision }),
      { initialProps: { revision: 1 } },
    );

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.acceptSuggestion('Order.Id');
    });

    expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.isMaterialized).toBe(false);

    rerender({ revision: 2 });

    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.isMaterialized).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AE-10: Dismiss with undo
  // -------------------------------------------------------------------------

  it('dismissSuggestion transitions to dismissed; undoDismiss restores to suggested', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.dismissSuggestion('Order.Id'); });
    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('dismissed');
    });

    act(() => { result.current.undoDismiss('Order.Id'); });
    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('suggested');
    });
  });

  it('undoDismiss is a no-op when item is not dismissed', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    // Item is 'suggested', not 'dismissed'
    act(() => { result.current.undoDismiss('Order.Id'); });
    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('suggested');
    });
  });

  // -------------------------------------------------------------------------
  // AE-13: Refresh all with merge logic
  // -------------------------------------------------------------------------

  it('refreshAll preserves accepted items and replaces suggested items', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    // Accept one item
    act(() => { result.current.acceptSuggestion('Order.Id'); });
    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('accepted');
    });

    // Refresh all
    act(() => { result.current.refreshAll(); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    // Accepted item must be preserved
    const acceptedItem = result.current.items.find((i) => i.targetPath === 'Order.Id');
    expect(acceptedItem?.status).toBe('accepted');
  });

  it('refreshAll does not overwrite accepted expressions with newer AI suggestions', async () => {
    const updateDraft = vi.fn();
    const adapterMock = {
      autoMapSection: vi
        .fn()
        .mockResolvedValueOnce({
          ...MOCK_RESULT,
          suggestions: [
            {
              ...SUGGESTION_A,
              expression: 'source.orderId',
            },
          ],
        })
        .mockResolvedValueOnce({
          ...MOCK_RESULT,
          suggestions: [
            {
              ...SUGGESTION_A,
              expression: 'source.changedOrderId',
            },
          ],
        }),
    };
    const params = makeParams({
      updateDraft,
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });

    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => {
      result.current.acceptSuggestion('Order.Id');
    });
    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('accepted');
    });

    act(() => {
      result.current.refreshAll();
    });
    await waitFor(() => expect(result.current.status).toBe('success'));

    const accepted = result.current.items.find((i) => i.targetPath === 'Order.Id');
    expect(accepted?.status).toBe('accepted');
    expect(accepted?.suggestedExpression).toBe('source.orderId');
    expect(updateDraft).toHaveBeenCalledWith('Order.Id', 'source.orderId');
    expect(updateDraft).not.toHaveBeenCalledWith('Order.Id', 'source.changedOrderId');
  });

  // -------------------------------------------------------------------------
  // AE-15: Error recovery with previous suggestions
  // -------------------------------------------------------------------------

  it('preserves previous suggestions on refresh error and allows restoration', async () => {
    const adapterMock = makeAdapter();
    const params = makeParams({ adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'] });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    const originalItems = result.current.items;

    // Make next call fail
    adapterMock.autoMapSection.mockRejectedValueOnce(new Error('Network error: Could not reach server'));

    act(() => { result.current.refreshAll(); });
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.previousSuggestionsAvailable).toBe(true);

    act(() => { result.current.restorePreviousSuggestions(); });

    expect(result.current.status).toBe('success');
    expect(result.current.items).toHaveLength(originalItems.length);
    expect(result.current.previousSuggestionsAvailable).toBe(false);
  });

  it('maps FEATURE_NOT_ENABLED from canonical adapter path as explicit user-facing error', async () => {
    const featureDisabledError = Object.assign(new Error('"autoMapSection" is not enabled in this mode.'), {
      code: 'FEATURE_NOT_ENABLED',
      retryable: false,
    });

    const adapterMock = {
      autoMapSection: vi.fn().mockRejectedValue(featureDisabledError),
    };
    const params = makeParams({ adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'] });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.error).toBe('"autoMapSection" is not enabled in this mode.');
  });

  // -------------------------------------------------------------------------
  // Filter computation
  // -------------------------------------------------------------------------

  it('toggleFilter adds and removes filters; filteredItems reflects active filters', async () => {
    const adapterMock = makeAdapter({
      suggestions: [SUGGESTION_A, SUGGESTION_INVALID],
    });
    const params = makeParams({ adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'] });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    // Default needsReview filter is active; both fixture items are unresolved.
    expect(result.current.activeFilters.has('needsReview')).toBe(true);
    expect(result.current.filteredItems).toHaveLength(2);

    // Filter to valid only
    act(() => { result.current.toggleFilter('valid'); });
    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0].targetPath).toBe('Order.Id');

    // Toggle off valid filter returns to default needsReview-only view
    act(() => { result.current.toggleFilter('valid'); });
    expect(result.current.filteredItems).toHaveLength(2);
  });

  it('enforces exclusive primary status filters', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.activeFilters.has('needsReview')).toBe(true);

    act(() => { result.current.toggleFilter('accepted'); });
    expect(result.current.activeFilters.has('accepted')).toBe(true);
    expect(result.current.activeFilters.has('needsReview')).toBe(false);

    act(() => { result.current.toggleFilter('dismissed'); });
    expect(result.current.activeFilters.has('dismissed')).toBe(true);
    expect(result.current.activeFilters.has('accepted')).toBe(false);
  });

  it('applies targetPath search to filteredItems and clearTargetSearch resets it', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.clearFilters(); });
    act(() => { result.current.setTargetSearchQuery('Order.Id'); });

    expect(result.current.targetSearchQuery).toBe('Order.Id');
    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0]?.targetPath).toBe('Order.Id');

    act(() => { result.current.clearTargetSearch(); });
    expect(result.current.targetSearchQuery).toBe('');
    expect(result.current.filteredItems).toHaveLength(result.current.items.length);
  });

  it('clearFilters removes all active filters', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.toggleFilter('valid'); });
    expect(result.current.activeFilters.size).toBe(2);
    expect(result.current.activeFilters.has('valid')).toBe(true);
    expect(result.current.activeFilters.has('needsReview')).toBe(true);

    act(() => { result.current.clearFilters(); });
    expect(result.current.activeFilters.size).toBe(0);
    expect(result.current.filteredItems).toHaveLength(result.current.items.length);
  });

  // -------------------------------------------------------------------------
  // Summary computation
  // -------------------------------------------------------------------------

  it('summary counts are accurate after accept and dismiss', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.summary.total).toBe(2);
    expect(result.current.summary.pending).toBe(2);

    act(() => { result.current.acceptSuggestion('Order.Id'); });
    await waitFor(() => expect(result.current.summary.accepted).toBe(1));
    expect(result.current.summary.pending).toBe(1);

    act(() => { result.current.dismissSuggestion('Order.Amount'); });
    await waitFor(() => expect(result.current.summary.dismissed).toBe(1));
    expect(result.current.summary.pending).toBe(0);
  });

  it('needsReview/unmapped/replacing filters exclude reviewed items', async () => {
    const replacementRule: MappingRule = {
      target: 'Order.Amount',
      type: 'number',
      expression: 'source.previousTotal',
    };

    const params = makeParams({ rules: [replacementRule] });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    // Default needsReview should include both unresolved suggestions.
    expect(result.current.filteredItems).toHaveLength(2);

    // Accept one suggestion; it should drop out of needsReview queue.
    act(() => { result.current.acceptSuggestion('Order.Id'); });
    await waitFor(() => {
      expect(result.current.filteredItems.some((i) => i.targetPath === 'Order.Id')).toBe(false);
    });

    // Narrow to unmapped unresolved suggestions.
    act(() => { result.current.clearFilters(); });
    act(() => { result.current.toggleFilter('unmapped'); });
    expect(result.current.filteredItems).toHaveLength(0);

    // Narrow to replacing unresolved suggestions (Order.Amount has an existing rule).
    act(() => { result.current.clearFilters(); });
    act(() => { result.current.toggleFilter('replacing'); });
    expect(result.current.filteredItems).toHaveLength(1);
    expect(result.current.filteredItems[0].targetPath).toBe('Order.Amount');
  });

  // -------------------------------------------------------------------------
  // markStale (for T-04)
  // -------------------------------------------------------------------------

  it('markStale transitions item status to stale', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    await waitFor(() => expect(result.current.status).toBe('success'));

    act(() => { result.current.markStale('Order.Id'); });
    await waitFor(() => {
      expect(result.current.items.find((i) => i.targetPath === 'Order.Id')?.status).toBe('stale');
    });
    expect(result.current.summary.stale).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Abort on reinvoke
  // -------------------------------------------------------------------------

  it('ignores stale response when a second triggerAutoMap is called before first resolves', async () => {
    let resolveFirst!: (v: AutoMapSectionResult) => void;
    const firstPromise = new Promise<AutoMapSectionResult>((res) => { resolveFirst = res; });

    const adapterMock = {
      autoMapSection: vi.fn()
        .mockReturnValueOnce(firstPromise)
        .mockResolvedValueOnce({ suggestions: [SUGGESTION_B] }),
    };

    const params = makeParams({ adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'] });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    // Second call before first resolves
    act(() => { result.current.triggerAutoMap(SECTION_PATH); });

    await waitFor(() => expect(result.current.status).toBe('success'));

    // Resolve the first (stale) promise — should be ignored
    act(() => { resolveFirst({ suggestions: [SUGGESTION_A] }); });

    await waitFor(() => expect(result.current.status).toBe('success'));
    // Result should be from the second call (SUGGESTION_B), not the first (SUGGESTION_A)
    expect(result.current.items.some((i) => i.targetPath === 'Order.Amount')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Abort on unmount
  // -------------------------------------------------------------------------

  it('does not update state after unmount', async () => {
    let resolve!: (v: AutoMapSectionResult) => void;
    const promise = new Promise<AutoMapSectionResult>((res) => { resolve = res; });
    const adapterMock = { autoMapSection: vi.fn().mockReturnValue(promise) };

    const params = makeParams({ adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'] });
    const { result, unmount } = renderHook(() => useAutoMapWorkspace(params));

    act(() => { result.current.triggerAutoMap(SECTION_PATH); });
    unmount();

    // Resolve after unmount — should not throw or update state
    await act(async () => { resolve(MOCK_RESULT); });
    // No assertion needed — absence of error is the test
  });

  it('polls active async runs and applies unchanged-response backoff tiers', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const adapterMock = {
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [],
        session: {
          sessionId: 'ams_1',
          runId: 'run_1',
          runStatus: 'queued',
          executionMode: 'async',
          queued: true,
        },
      }),
      getAutoMapRunStatus: vi
        .fn()
        .mockResolvedValue({
          sessionId: 'ams_1',
          runId: 'run_1',
          status: 'generating',
          scope: { mode: 'section', sectionPath: SECTION_PATH },
          progress: {
            completedWorkUnits: 0,
            totalWorkUnits: 4,
            completedTargets: 0,
            totalTargets: 4,
          },
          counts: {
            generated: 0,
            ready: 0,
            warning: 0,
            invalid: 0,
            failedTargets: 0,
          },
        }),
      listAutoMapSuggestions: vi.fn().mockResolvedValue({
        items: [],
        page: { limit: 250, nextCursor: null, total: 0, offset: 0 },
      }),
    };

    const params = makeParams({
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    await waitFor(() => expect(result.current.runStatus).toBe('generating'));
    await waitFor(() => expect(adapterMock.getAutoMapRunStatus).toHaveBeenCalledTimes(4), { timeout: 12000 });

    const delays = timeoutSpy.mock.calls
      .map(([, delay]) => Number(delay ?? 0))
      .filter((delay) => delay >= 1500);

    const twoSecondDelays = delays.filter((delay) => delay === 2000).length;
    expect(twoSecondDelays).toBeGreaterThanOrEqual(2);
    expect(delays.some((delay) => delay >= 5000 && delay <= 10000)).toBe(true);
  }, 20000);

  it('keeps prior state on polling network errors and retries with warning', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const adapterMock = {
      autoMapSection: vi.fn().mockResolvedValue({
        suggestions: [SUGGESTION_A],
        session: {
          sessionId: 'ams_1',
          runId: 'run_1',
          runStatus: 'queued',
          executionMode: 'async',
          queued: true,
        },
      }),
      getAutoMapRunStatus: vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          sessionId: 'ams_1',
          runId: 'run_1',
          status: 'completed',
          scope: { mode: 'section', sectionPath: SECTION_PATH },
        }),
      listAutoMapSuggestions: vi.fn().mockResolvedValue({
        items: [SUGGESTION_A],
        page: { limit: 250, nextCursor: null, total: 1, offset: 0 },
      }),
    };

    const params = makeParams({
      adapter: adapterMock as unknown as Parameters<typeof useAutoMapWorkspace>[0]['adapter'],
    });
    const { result } = renderHook(() => useAutoMapWorkspace(params));

    act(() => {
      result.current.triggerAutoMap(SECTION_PATH);
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.runStatus).toBe('queued');

    await waitFor(() => {
      expect(result.current.pollingWarning).toMatch(/Connection interrupted/i);
    });
    expect(result.current.status).toBe('success');
    expect(result.current.items).toHaveLength(1);

    await waitFor(() => expect(result.current.runStatus).toBe('completed'), { timeout: 10000 });
    expect(result.current.pollingWarning).toBeNull();
  }, 12000);
});
