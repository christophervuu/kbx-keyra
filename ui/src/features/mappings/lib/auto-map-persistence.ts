import type {
  PersistedSectionInfo,
  PersistedSectionSuggestions,
  PersistedSuggestionItem,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'keyra:automap-suggestions:';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PersistedSectionsRecord = Readonly<Record<string, PersistedSectionSuggestions>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(mappingId: string): string {
  return `${STORAGE_KEY_PREFIX}${mappingId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSectionsRecord(value: unknown): PersistedSectionsRecord {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value).filter(([, sectionValue]) => isRecord(sectionValue));
  return Object.fromEntries(entries) as PersistedSectionsRecord;
}

function readSections(mappingId: string): PersistedSectionsRecord {
  const key = storageKey(mappingId);

  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return {};

    const parsed: unknown = JSON.parse(raw);
    return normalizeSectionsRecord(parsed);
  } catch {
    console.warn(
      `[auto-map-persistence] Failed to parse sessionStorage value for key "${key}" — resetting to empty record.`,
    );
    return {};
  }
}

function writeSections(mappingId: string, sections: PersistedSectionsRecord): boolean {
  const key = storageKey(mappingId);

  try {
    sessionStorage.setItem(key, JSON.stringify(sections));
    return true;
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.code === 22)
    ) {
      console.warn(
        `[auto-map-persistence] sessionStorage quota exceeded for key "${key}" — write skipped.`,
      );
      return false;
    }

    console.warn(
      `[auto-map-persistence] Failed to write sessionStorage value for key "${key}" — write skipped.`,
    );
    return false;
  }
}

function makeSourceContextHash(sourceContext?: string): string | undefined {
  if (!sourceContext) return undefined;
  if (sourceContext.length === 0) return '0';

  const first = sourceContext.at(0) ?? '';
  const last = sourceContext.at(-1) ?? '';
  return `${sourceContext.length}:${first}:${last}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist suggestions for a single section under one mapping-level storage key.
 */
export function saveAutoMapSuggestions(
  mappingId: string,
  sectionPath: string,
  items: readonly PersistedSuggestionItem[],
  options?: {
    generatedAt?: string;
    sourceContext?: string;
  },
): boolean {
  const sections = readSections(mappingId);
  const generatedAt = options?.generatedAt ?? new Date().toISOString();

  const nextSection: PersistedSectionSuggestions = {
    sectionPath,
    generatedAt,
    items: [...items],
    generationContext: {
      sourceContextHash: makeSourceContextHash(options?.sourceContext),
    },
  };

  const nextSections: PersistedSectionsRecord = {
    ...sections,
    [sectionPath]: nextSection,
  };

  return writeSections(mappingId, nextSections);
}

/**
 * Load persisted suggestions for a single section.
 */
export function loadAutoMapSuggestions(
  mappingId: string,
  sectionPath: string,
): PersistedSectionSuggestions | null {
  const sections = readSections(mappingId);
  return sections[sectionPath] ?? null;
}

/**
 * Clear persisted suggestions for one section or all sections in a mapping.
 */
export function clearAutoMapSuggestions(mappingId: string, sectionPath?: string): boolean {
  if (sectionPath === undefined) {
    const key = storageKey(mappingId);
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch {
      console.warn(
        `[auto-map-persistence] Failed to clear sessionStorage key "${key}".`,
      );
      return false;
    }
  }

  const sections = readSections(mappingId);
  if (!(sectionPath in sections)) return true;

  const { [sectionPath]: __removed, ...rest } = sections;
  void __removed;
  if (Object.keys(rest).length === 0) {
    const key = storageKey(mappingId);
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch {
      console.warn(
        `[auto-map-persistence] Failed to clear sessionStorage key "${key}".`,
      );
      return false;
    }
  }

  return writeSections(mappingId, rest);
}

/**
 * Fast check for whether a section has persisted suggestions.
 */
export function hasPersistedSuggestions(mappingId: string, sectionPath: string): boolean {
  return loadAutoMapSuggestions(mappingId, sectionPath) !== null;
}

/**
 * List persisted sections for a mapping with lightweight metadata.
 */
export function listPersistedSections(mappingId: string): readonly PersistedSectionInfo[] {
  const sections = readSections(mappingId);
  return Object.values(sections).map((section) => ({
    sectionPath: section.sectionPath,
    suggestionCount: section.items.length,
    generatedAt: section.generatedAt,
  }));
}
