import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import Settings from './Settings';

const localStorageMock = {
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
};

const store: Record<string, string> = {};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

describe('Settings page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders Editor preferences section with panel layout selector', () => {
    render(<Settings />);

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByTestId('editor-preferences-section')).toBeInTheDocument();
    expect(screen.getByLabelText('Panel layout')).toBeInTheDocument();
    expect(screen.getByTestId('editor-panel-layout-help')).toHaveTextContent(
      'Choose how the Mapping Editor arranges the Target Mapping Fields and Input Fields panels.',
    );
  });

  it('reads persisted panel layout and updates preference when changed', () => {
    localStorage.setItem('keyra:preferences:editorPanelLayout', 'input-first');

    render(<Settings />);

    const select = screen.getByTestId('editor-panel-layout-select') as HTMLSelectElement;
    expect(select.value).toBe('input-first');

    fireEvent.change(select, { target: { value: 'target-first' } });
    expect(localStorage.getItem('keyra:preferences:editorPanelLayout')).toBe('target-first');
  });
});
