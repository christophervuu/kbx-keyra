import { useCallback, useEffect, useState } from 'react';

export type EditorPanelLayout = 'target-first' | 'input-first';

const PANEL_LAYOUT_STORAGE_KEY = 'keyra:preferences:editorPanelLayout';
const ANNOUNCEMENT_LAYOUT_PRESETS_V1_KEY = 'keyra.dismissedAnnouncements.editorLayoutPresets.v1';
const PREFERENCES_CHANGED_EVENT = 'keyra:editor-preferences:changed';

const VALID_LAYOUTS: readonly EditorPanelLayout[] = ['target-first', 'input-first'] as const;

function isValidLayout(value: unknown): value is EditorPanelLayout {
  return typeof value === 'string' && VALID_LAYOUTS.includes(value as EditorPanelLayout);
}

function notifyPreferencesChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
}

export function readEditorPanelLayoutPreference(): EditorPanelLayout {
  try {
    const raw = localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY);
    return isValidLayout(raw) ? raw : 'target-first';
  } catch {
    return 'target-first';
  }
}

export function writeEditorPanelLayoutPreference(layout: EditorPanelLayout): void {
  try {
    localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // ignore storage failures
  }
  notifyPreferencesChanged();
}

export function resetEditorPanelLayoutPreference(): void {
  try {
    localStorage.removeItem(PANEL_LAYOUT_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
  notifyPreferencesChanged();
}

export function isEditorLayoutAnnouncementDismissed(): boolean {
  try {
    return localStorage.getItem(ANNOUNCEMENT_LAYOUT_PRESETS_V1_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissEditorLayoutAnnouncement(): void {
  try {
    localStorage.setItem(ANNOUNCEMENT_LAYOUT_PRESETS_V1_KEY, '1');
  } catch {
    // ignore storage failures
  }
  notifyPreferencesChanged();
}

export interface UseEditorPanelLayoutPreferenceResult {
  panelLayout: EditorPanelLayout;
  setPanelLayout: (layout: EditorPanelLayout) => void;
  resetPanelLayout: () => void;
}

export function useEditorPanelLayoutPreference(): UseEditorPanelLayoutPreferenceResult {
  const [panelLayout, setPanelLayoutState] = useState<EditorPanelLayout>(readEditorPanelLayoutPreference);

  useEffect(() => {
    const syncFromStorage = () => {
      setPanelLayoutState(readEditorPanelLayoutPreference());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== PANEL_LAYOUT_STORAGE_KEY) return;
      syncFromStorage();
    };

    window.addEventListener(PREFERENCES_CHANGED_EVENT, syncFromStorage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, syncFromStorage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setPanelLayout = useCallback((layout: EditorPanelLayout) => {
    setPanelLayoutState(layout);
    writeEditorPanelLayoutPreference(layout);
  }, []);

  const resetPanelLayout = useCallback(() => {
    setPanelLayoutState('target-first');
    resetEditorPanelLayoutPreference();
  }, []);

  return { panelLayout, setPanelLayout, resetPanelLayout };
}
