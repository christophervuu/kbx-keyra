import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PersistedSuggestionItem } from '../types';
import {
  clearAutoMapSuggestions,
  getPendingAutoMapSession,
  hasPersistedSuggestions,
  listPersistedSections,
  loadAutoMapSuggestions,
  saveAutoMapSuggestions,
} from './auto-map-persistence';

// ---------------------------------------------------------------------------
// sessionStorage mock
// ---------------------------------------------------------------------------

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
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

function makeItem(overrides?: Partial<PersistedSuggestionItem>): PersistedSuggestionItem {
  return {
    targetPath: 'Order.Header.Currency',
    suggestedExpression: 'default(source("CurrencyCode"), "USD")',
    explanation: 'Fallback to USD when missing',
    confidence: 0.82,
    validation: {
      valid: true,
      diagnostics: [],
    },
    status: 'suggested',
    isNew: false,
    existingExpressionAtGeneration: 'source("CurrencyCode")',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('auto-map-persistence', () => {
  beforeEach(() => {
    sessionStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('save/load round-trip for a section', () => {
    const mappingId = 'mapping-1';
    const sectionPath = 'Order.Header';
    const items = [makeItem()];

    const saved = saveAutoMapSuggestions(mappingId, sectionPath, items, {
      generatedAt: '2026-05-12T10:00:00.000Z',
      sourceContext: '- InvoiceAmount (number)',
    });

    expect(saved).toBe(true);

    const loaded = loadAutoMapSuggestions(mappingId, sectionPath);
    expect(loaded).not.toBeNull();
    expect(loaded?.sectionPath).toBe(sectionPath);
    expect(loaded?.generatedAt).toBe('2026-05-12T10:00:00.000Z');
    expect(loaded?.items).toHaveLength(1);
    expect(loaded?.items[0]?.targetPath).toBe('Order.Header.Currency');
    expect(loaded?.generationContext.sourceContextHash).toBeDefined();
  });

  it('load returns null when storage key is missing', () => {
    const loaded = loadAutoMapSuggestions('mapping-empty', 'Order.Header');
    expect(loaded).toBeNull();
  });

  it('load with corrupted JSON returns null and logs warning', () => {
    const key = 'keyra:automap-suggestions:mapping-corrupt';
    sessionStorageMock.setItem(key, 'not-valid-json');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const loaded = loadAutoMapSuggestions('mapping-corrupt', 'Order.Header');

    expect(loaded).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('clear single section removes only that section', () => {
    const mappingId = 'mapping-1';

    saveAutoMapSuggestions(mappingId, 'Order.Header', [makeItem()]);
    saveAutoMapSuggestions(mappingId, 'Order.Lines', [makeItem({ targetPath: 'Order.Lines[0].Id' })]);

    const cleared = clearAutoMapSuggestions(mappingId, 'Order.Header');
    expect(cleared).toBe(true);

    expect(loadAutoMapSuggestions(mappingId, 'Order.Header')).toBeNull();
    expect(loadAutoMapSuggestions(mappingId, 'Order.Lines')).not.toBeNull();
  });

  it('clear all sections removes mapping storage key', () => {
    const mappingId = 'mapping-1';

    saveAutoMapSuggestions(mappingId, 'Order.Header', [makeItem()]);
    saveAutoMapSuggestions(mappingId, 'Order.Lines', [makeItem({ targetPath: 'Order.Lines[0].Id' })]);

    const cleared = clearAutoMapSuggestions(mappingId);
    expect(cleared).toBe(true);

    expect(loadAutoMapSuggestions(mappingId, 'Order.Header')).toBeNull();
    expect(loadAutoMapSuggestions(mappingId, 'Order.Lines')).toBeNull();
  });

  it('hasPersistedSuggestions returns accurate existence status', () => {
    const mappingId = 'mapping-1';

    expect(hasPersistedSuggestions(mappingId, 'Order.Header')).toBe(false);

    saveAutoMapSuggestions(mappingId, 'Order.Header', [makeItem()]);

    expect(hasPersistedSuggestions(mappingId, 'Order.Header')).toBe(true);
    expect(hasPersistedSuggestions(mappingId, 'Order.Lines')).toBe(false);
  });

  it('listPersistedSections returns section paths with counts', () => {
    const mappingId = 'mapping-1';

    saveAutoMapSuggestions(mappingId, 'Order.Header', [makeItem(), makeItem({ targetPath: 'Order.Header.Date' })], {
      generatedAt: '2026-05-12T10:00:00.000Z',
    });
    saveAutoMapSuggestions(mappingId, 'Order.Lines', [makeItem({ targetPath: 'Order.Lines[0].Id' })], {
      generatedAt: '2026-05-12T11:00:00.000Z',
    });

    const sections = listPersistedSections(mappingId);

    expect(sections).toHaveLength(2);
    expect(sections).toContainEqual({
      sectionPath: 'Order.Header',
      suggestionCount: 2,
      generatedAt: '2026-05-12T10:00:00.000Z',
    });
    expect(sections).toContainEqual({
      sectionPath: 'Order.Lines',
      suggestionCount: 1,
      generatedAt: '2026-05-12T11:00:00.000Z',
    });
  });

  it('handles storage quota exceeded gracefully on save', () => {
    sessionStorageMock.setItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const ok = saveAutoMapSuggestions('mapping-1', 'Order.Header', [makeItem()]);

    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('normalizes non-record stored values to empty record', () => {
    sessionStorageMock.setItem('keyra:automap-suggestions:mapping-bad', JSON.stringify(['x']));

    const sections = listPersistedSections('mapping-bad');

    expect(sections).toEqual([]);
  });

  it('returns mapping-level pending session metadata (suggested + stale only)', () => {
    const mappingId = 'mapping-session';

    saveAutoMapSuggestions(mappingId, 'Order.Header', [
      makeItem({ targetPath: 'Order.Header.Currency', status: 'suggested' }),
      makeItem({ targetPath: 'Order.Header.Total', status: 'accepted' }),
    ], {
      generatedAt: '2026-06-08T10:00:00.000Z',
    });

    saveAutoMapSuggestions(mappingId, 'Order.Lines', [
      makeItem({ targetPath: 'Order.Lines[0].Sku', status: 'stale' }),
      makeItem({ targetPath: 'Order.Lines[0].Qty', status: 'dismissed' }),
    ], {
      generatedAt: '2026-06-08T11:00:00.000Z',
    });

    const session = getPendingAutoMapSession(mappingId);

    expect(session).toEqual({
      pendingCount: 2,
      primarySectionPath: 'Order.Lines',
    });
  });

  it('returns empty pending session when no pending suggestions exist', () => {
    const mappingId = 'mapping-no-pending';

    saveAutoMapSuggestions(mappingId, 'Order.Header', [
      makeItem({ status: 'accepted' }),
      makeItem({ targetPath: 'Order.Header.Total', status: 'dismissed' }),
    ]);

    expect(getPendingAutoMapSession(mappingId)).toEqual({
      pendingCount: 0,
      primarySectionPath: null,
    });
  });
});
