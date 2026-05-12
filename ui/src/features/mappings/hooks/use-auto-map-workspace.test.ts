import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AutoMapSectionResult, MappingRule, ParsedSchema } from '@/lib/types/domain';

import { useAutoMapWorkspace } from './use-auto-map-workspace';

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
};

const MOCK_RULES: readonly MappingRule[] = [];

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
});
