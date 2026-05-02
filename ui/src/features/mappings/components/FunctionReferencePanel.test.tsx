/**
 * Tests for FunctionReferencePanel — T-09
 */

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FunctionReferencePanel } from './FunctionReferencePanel';

describe('FunctionReferencePanel', () => {
  it('renders collapsed by default (toggle button visible)', () => {
    render(<FunctionReferencePanel onInsertFunction={vi.fn()} />);
    expect(screen.getByTestId('fn-reference-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('fn-reference-content')).not.toBeInTheDocument();
  });

  it('toggle opens the panel showing functions', () => {
    render(<FunctionReferencePanel onInsertFunction={vi.fn()} />);
    fireEvent.click(screen.getByTestId('fn-reference-toggle'));
    expect(screen.getByTestId('fn-reference-content')).toBeInTheDocument();
    expect(screen.getByTestId('fn-reference-list')).toBeInTheDocument();
  });

  it('toggle closes the panel again when clicked twice', () => {
    render(<FunctionReferencePanel onInsertFunction={vi.fn()} />);
    const toggle = screen.getByTestId('fn-reference-toggle');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByTestId('fn-reference-content')).not.toBeInTheDocument();
  });

  it('when open shows all non-SourceAccess categories', () => {
    render(<FunctionReferencePanel onInsertFunction={vi.fn()} />);
    fireEvent.click(screen.getByTestId('fn-reference-toggle'));
    // Check a few well-known functions appear
    expect(screen.getByTestId('fn-entry-concat')).toBeInTheDocument();
    expect(screen.getByTestId('fn-entry-formatDate')).toBeInTheDocument();
    expect(screen.getByTestId('fn-entry-if')).toBeInTheDocument();
    expect(screen.getByTestId('fn-entry-map')).toBeInTheDocument();
  });

  it('search filters functions by name', async () => {
    vi.useFakeTimers();
    render(<FunctionReferencePanel onInsertFunction={vi.fn()} />);
    fireEvent.click(screen.getByTestId('fn-reference-toggle'));
    fireEvent.change(screen.getByTestId('fn-reference-search'), { target: { value: 'upper' } });
    act(() => { vi.advanceTimersByTime(250); });
    await waitFor(() => {
      expect(screen.getByTestId('fn-entry-upper')).toBeInTheDocument();
      expect(screen.queryByTestId('fn-entry-lower')).not.toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it('search filters functions by description', async () => {
    vi.useFakeTimers();
    render(<FunctionReferencePanel onInsertFunction={vi.fn()} />);
    fireEvent.click(screen.getByTestId('fn-reference-toggle'));
    fireEvent.change(screen.getByTestId('fn-reference-search'), { target: { value: 'uppercase' } });
    act(() => { vi.advanceTimersByTime(250); });
    await waitFor(() => {
      expect(screen.getByTestId('fn-entry-upper')).toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it('empty search shows all functions (after clearing)', async () => {
    vi.useFakeTimers();
    render(<FunctionReferencePanel onInsertFunction={vi.fn()} />);
    fireEvent.click(screen.getByTestId('fn-reference-toggle'));
    fireEvent.change(screen.getByTestId('fn-reference-search'), { target: { value: 'upper' } });
    act(() => { vi.advanceTimersByTime(250); });
    fireEvent.click(screen.getByTestId('fn-reference-clear'));
    act(() => { vi.advanceTimersByTime(250); });
    await waitFor(() => {
      expect(screen.getByTestId('fn-entry-concat')).toBeInTheDocument();
      expect(screen.getByTestId('fn-entry-upper')).toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it('shows no-results state when query matches nothing', async () => {
    vi.useFakeTimers();
    render(<FunctionReferencePanel onInsertFunction={vi.fn()} />);
    fireEvent.click(screen.getByTestId('fn-reference-toggle'));
    fireEvent.change(screen.getByTestId('fn-reference-search'), { target: { value: 'xyzunknownfunction999' } });
    act(() => { vi.advanceTimersByTime(250); });
    await waitFor(() => {
      expect(screen.getByTestId('fn-reference-no-results')).toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it('click on function entry calls onInsertFunction with function name', () => {
    const onInsert = vi.fn();
    render(<FunctionReferencePanel onInsertFunction={onInsert} />);
    fireEvent.click(screen.getByTestId('fn-reference-toggle'));
    fireEvent.click(screen.getByTestId('fn-entry-concat'));
    expect(onInsert).toHaveBeenCalledWith('concat');
  });

  it('searching "date" and clicking formatDate fires onInsertFunction("formatDate") — AE-11', async () => {
    vi.useFakeTimers();
    const onInsert = vi.fn();
    render(<FunctionReferencePanel onInsertFunction={onInsert} />);
    fireEvent.click(screen.getByTestId('fn-reference-toggle'));
    fireEvent.change(screen.getByTestId('fn-reference-search'), { target: { value: 'date' } });
    act(() => { vi.advanceTimersByTime(250); });
    await waitFor(() => {
      expect(screen.getByTestId('fn-entry-formatDate')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('fn-entry-formatDate'));
    expect(onInsert).toHaveBeenCalledWith('formatDate');
    vi.useRealTimers();
  });
});
