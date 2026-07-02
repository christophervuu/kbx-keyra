import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  dismissEditorLayoutAnnouncement,
  isEditorLayoutAnnouncementDismissed,
  readEditorPanelLayoutPreference,
  resetEditorPanelLayoutPreference,
  useEditorPanelLayoutPreference,
  writeEditorPanelLayoutPreference,
} from './editor-preferences';

function installStorageMock() {
  const store: Record<string, string> = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((key) => delete store[key]);
      },
    },
  });
}

function LayoutProbe({ testId }: { testId: string }) {
  const { panelLayout, setPanelLayout } = useEditorPanelLayoutPreference();
  return (
    <div>
      <div data-testid={testId}>{panelLayout}</div>
      <button type="button" data-testid={`${testId}-set-input`} onClick={() => setPanelLayout('input-first')}>
        Set input-first
      </button>
      <button type="button" data-testid={`${testId}-set-target`} onClick={() => setPanelLayout('target-first')}>
        Set target-first
      </button>
    </div>
  );
}

describe('editor-preferences', () => {
  installStorageMock();

  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to target-first when no preference exists', () => {
    resetEditorPanelLayoutPreference();
    expect(readEditorPanelLayoutPreference()).toBe('target-first');
  });

  it('persists and reads panel layout preference', () => {
    writeEditorPanelLayoutPreference('input-first');
    expect(readEditorPanelLayoutPreference()).toBe('input-first');

    writeEditorPanelLayoutPreference('target-first');
    expect(readEditorPanelLayoutPreference()).toBe('target-first');
  });

  it('reset restores target-first default', () => {
    writeEditorPanelLayoutPreference('input-first');
    expect(readEditorPanelLayoutPreference()).toBe('input-first');

    resetEditorPanelLayoutPreference();
    expect(readEditorPanelLayoutPreference()).toBe('target-first');
  });

  it('tracks one-time announcement dismissal', () => {
    localStorage.removeItem('keyra.dismissedAnnouncements.editorLayoutPresets.v1');
    expect(isEditorLayoutAnnouncementDismissed()).toBe(false);

    dismissEditorLayoutAnnouncement();
    expect(isEditorLayoutAnnouncementDismissed()).toBe(true);
  });

  it('synchronizes layout changes across independent hook consumers', async () => {
    resetEditorPanelLayoutPreference();
    render(
      <>
        <LayoutProbe testId="probe-a" />
        <LayoutProbe testId="probe-b" />
      </>,
    );

    expect(screen.getByTestId('probe-a')).toHaveTextContent('target-first');
    expect(screen.getByTestId('probe-b')).toHaveTextContent('target-first');

    act(() => {
      screen.getByTestId('probe-a-set-input').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-b')).toHaveTextContent('input-first');
    });

    act(() => {
      screen.getByTestId('probe-b-set-target').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-a')).toHaveTextContent('target-first');
    });
  });
});
