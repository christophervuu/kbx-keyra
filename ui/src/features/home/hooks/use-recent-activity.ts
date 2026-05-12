// useRecentActivity — localStorage-backed recent activity tracking (FS-049 T-03)
//
// Storage key : keyra:recent-activity
// Max entries : 10 (oldest evicted when exceeded)
// Dedup key   : type + id (updates timestamp on revisit)

import type { RecentActivityEntry } from '../types';

const STORAGE_KEY = 'keyra:recent-activity';
const MAX_ENTRIES = 10;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readFromStorage(): RecentActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Basic shape validation — discard malformed entries silently
    return parsed.filter(
      (item): item is RecentActivityEntry =>
        item !== null &&
        typeof item === 'object' &&
        (item.type === 'project' || item.type === 'mapping') &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.timestamp === 'string',
    );
  } catch {
    return [];
  }
}

function writeToStorage(entries: RecentActivityEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Silently fail (e.g. private browsing quota exceeded)
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseRecentActivityResult {
  /** Returns up to 10 entries sorted by timestamp descending (most recent first). */
  getRecentItems: () => RecentActivityEntry[];
  /**
   * Adds or updates an entry with the current timestamp.
   * Deduplicates by `type + id`. Maintains max 10 entries (oldest evicted).
   */
  recordActivity: (entry: Omit<RecentActivityEntry, 'timestamp'>) => void;
}

export function useRecentActivity(): UseRecentActivityResult {
  const getRecentItems = (): RecentActivityEntry[] => {
    const entries = readFromStorage();
    return [...entries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  };

  const recordActivity = (entry: Omit<RecentActivityEntry, 'timestamp'>): void => {
    const existing = readFromStorage();
    const timestamp = new Date().toISOString();

    // Remove any existing entry with the same type + id
    const filtered = existing.filter(
      (e) => !(e.type === entry.type && e.id === entry.id),
    );

    // Prepend the new/updated entry
    const updated: RecentActivityEntry[] = [
      { ...entry, timestamp },
      ...filtered,
    ].slice(0, MAX_ENTRIES);

    writeToStorage(updated);
  };

  return { getRecentItems, recordActivity };
}
