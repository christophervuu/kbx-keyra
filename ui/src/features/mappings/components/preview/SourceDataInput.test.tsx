import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';

import { SourceDataInput } from './SourceDataInput';
import { PreviewProvider } from '../../context/preview-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(PreviewProvider, null, children);

function renderInput(onRawChange = vi.fn()) {
  render(createElement(SourceDataInput, { onRawChange }), { wrapper });
  return {
    textarea: screen.getByTestId('source-data-textarea'),
    onRawChange,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SourceDataInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the textarea with correct placeholder', () => {
    renderInput();
    expect(screen.getByTestId('source-data-textarea')).toHaveAttribute(
      'placeholder',
      'Paste or type JSON source data...',
    );
  });

  it('empty input: shows no error and calls onRawChange(null)', () => {
    const { textarea, onRawChange } = renderInput();

    fireEvent.change(textarea, { target: { value: '' } });

    // Empty path is immediate — no debounce
    expect(screen.queryByTestId('source-data-error')).not.toBeInTheDocument();
    expect(onRawChange).toHaveBeenCalledWith(null);
  });

  it('valid JSON: clears error and calls onRawChange with raw string after debounce', () => {
    const { textarea, onRawChange } = renderInput();

    fireEvent.change(textarea, { target: { value: '{"x": 1}' } });

    // Before debounce fires — no callback yet for valid path
    expect(screen.queryByTestId('source-data-error')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.queryByTestId('source-data-error')).not.toBeInTheDocument();
    expect(onRawChange).toHaveBeenCalledWith('{"x": 1}');
  });

  it('invalid JSON: shows error message and calls onRawChange(null) after debounce', () => {
    const { textarea, onRawChange } = renderInput();

    fireEvent.change(textarea, { target: { value: '{"x": 1,}' } });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByTestId('source-data-error')).toBeInTheDocument();
    expect(onRawChange).toHaveBeenCalledWith(null);
  });

  it('error display has role=alert', () => {
    const { textarea } = renderInput();

    fireEvent.change(textarea, { target: { value: '{bad' } });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByTestId('source-data-error')).toHaveAttribute('role', 'alert');
  });

  it('textarea has aria-invalid when JSON is invalid', () => {
    const { textarea } = renderInput();

    fireEvent.change(textarea, { target: { value: 'notjson' } });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('textarea does not have aria-invalid when JSON is valid', () => {
    const { textarea } = renderInput();

    fireEvent.change(textarea, { target: { value: '{"ok": true}' } });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(textarea).not.toHaveAttribute('aria-invalid');
  });

  it('correcting invalid JSON clears the error', () => {
    const { textarea } = renderInput();

    fireEvent.change(textarea, { target: { value: '{bad' } });
    act(() => { vi.advanceTimersByTime(150); });

    expect(screen.getByTestId('source-data-error')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: '{"ok": true}' } });
    act(() => { vi.advanceTimersByTime(150); });

    expect(screen.queryByTestId('source-data-error')).not.toBeInTheDocument();
  });

  it('debounce: rapid typing only triggers one validation', () => {
    const { textarea, onRawChange } = renderInput();

    fireEvent.change(textarea, { target: { value: '{"a' } });
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.change(textarea, { target: { value: '{"a":' } });
    act(() => { vi.advanceTimersByTime(50); });
    fireEvent.change(textarea, { target: { value: '{"a": 1}' } });

    // Advance past debounce once
    act(() => { vi.advanceTimersByTime(150); });

    // Should only have been called for the final value (plus any null calls for empty)
    const validCalls = onRawChange.mock.calls.filter(([arg]) => arg !== null);
    expect(validCalls).toHaveLength(1);
    expect(validCalls[0][0]).toBe('{"a": 1}');
  });
});
