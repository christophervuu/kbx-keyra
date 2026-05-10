import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';

import { OutputDisplay } from './OutputDisplay';
import type { PreviewExecutionState } from '@/lib/types/domain';
import type { ExecutionResult } from '@keyra/engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessResult(output: unknown): ExecutionResult {
  return {
    output,
    diagnostics: [],
    trace: [],
    stats: { durationMs: 5, rulesEvaluated: 1 },
  } as unknown as ExecutionResult;
}

function renderState(
  state: PreviewExecutionState,
  extra?: Partial<React.ComponentProps<typeof OutputDisplay>>,
) {
  return render(createElement(OutputDisplay, { state, ...extra }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OutputDisplay', () => {
  // -------------------------------------------------------------------------
  // Existing state-variant tests (backward-compatible)
  // -------------------------------------------------------------------------

  it('idle: shows "Run a mapping to see output"', () => {
    renderState({ status: 'idle' });
    expect(screen.getByTestId('output-idle')).toBeInTheDocument();
    expect(screen.getByText('Run a mapping to see output')).toBeInTheDocument();
  });

  it('executing: shows executing state', () => {
    renderState({ status: 'executing' });
    expect(screen.getByTestId('output-executing')).toBeInTheDocument();
  });

  it('timeout: shows timeout message', () => {
    renderState({ status: 'timeout' });
    expect(screen.getByTestId('output-timeout')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Execution timed out — consider reducing rule count or simplifying expressions',
      ),
    ).toBeInTheDocument();
  });

  it('error: shows error message in red', () => {
    renderState({ status: 'error', error: 'Something exploded' });
    expect(screen.getByTestId('output-error')).toBeInTheDocument();
    const msg = screen.getByText(/Execution failed: Something exploded/);
    expect(msg).toBeInTheDocument();
    expect(msg.className).toMatch(/text-red/);
  });

  it('success: renders formatted JSON with colored tokens', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({ name: 'Alice' }),
    });

    const container = screen.getByTestId('output-success');
    expect(container).toBeInTheDocument();

    // aria-label on pre
    expect(screen.getByLabelText('Execution output')).toBeInTheDocument();

    // Key token colored blue
    const keySpan = screen.getByText('"name":');
    expect(keySpan.className).toContain('text-blue-400');

    // String value colored green
    const strSpan = screen.getByText('"Alice"');
    expect(strSpan.className).toContain('text-green-400');
  });

  it('success: renders number tokens in amber', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({ age: 30 }),
    });

    const numSpan = screen.getByText('30');
    expect(numSpan.className).toContain('text-amber-400');
  });

  it('success: renders boolean tokens in purple', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({ active: true }),
    });

    const boolSpan = screen.getByText('true');
    expect(boolSpan.className).toContain('text-purple-400');
  });

  it('success: renders null tokens in gray', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({ value: null }),
    });

    const nullSpan = screen.getByText('null');
    expect(nullSpan.className).toContain('text-gray-400');
  });

  it('success: output container has overflow-auto for large content', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({ name: 'Alice' }),
    });

    const container = screen.getByTestId('output-success');
    expect(container.className).toContain('overflow-auto');
  });

  it('success: pre element has font-mono and whitespace-pre', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({ x: 1 }),
    });

    const pre = screen.getByLabelText('Execution output');
    expect(pre.className).toContain('font-mono');
    expect(pre.className).toContain('whitespace-pre');
  });

  it('success: empty object renders without error', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({}),
    });

    expect(screen.getByTestId('output-success')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Path highlighting — top-level key
  // -------------------------------------------------------------------------

  it('highlightPath matching a top-level key applies highlight class', () => {
    renderState(
      { status: 'success', result: makeSuccessResult({ name: 'Alice', age: 30 }) },
      { highlightPath: 'name' },
    );

    const highlighted = screen.getByTestId('output-highlighted');
    expect(highlighted).toBeInTheDocument();
    expect(highlighted.className).toContain('bg-blue-500/20');
    expect(highlighted.className).toContain('ring-blue-500/40');
  });

  it('highlightPath matching a nested path highlights the correct key-value', () => {
    renderState(
      {
        status: 'success',
        result: makeSuccessResult({ Order: { Status: 'Active', Code: 'ORD-1' } }),
      },
      { highlightPath: 'Order.Status' },
    );

    const highlighted = screen.getByTestId('output-highlighted');
    expect(highlighted).toBeInTheDocument();
    expect(highlighted.className).toContain('bg-blue-500/20');
  });

  it('highlightPath not matching any path — no highlight applied', () => {
    renderState(
      { status: 'success', result: makeSuccessResult({ name: 'Alice' }) },
      { highlightPath: 'nonexistent.path' },
    );

    expect(screen.queryByTestId('output-highlighted')).not.toBeInTheDocument();
  });

  it('highlightPath null — no highlight applied', () => {
    renderState(
      { status: 'success', result: makeSuccessResult({ name: 'Alice' }) },
      { highlightPath: null },
    );

    expect(screen.queryByTestId('output-highlighted')).not.toBeInTheDocument();
  });

  it('highlightPath undefined — no highlight applied', () => {
    renderState(
      { status: 'success', result: makeSuccessResult({ name: 'Alice' }) },
    );

    expect(screen.queryByTestId('output-highlighted')).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // onPathClick
  // -------------------------------------------------------------------------

  it('clicking a key with onPathClick fires callback with correct path', () => {
    const onPathClick = vi.fn();
    renderState(
      { status: 'success', result: makeSuccessResult({ name: 'Alice' }) },
      { onPathClick },
    );

    fireEvent.click(screen.getByTestId('output-key-name'));
    expect(onPathClick).toHaveBeenCalledOnce();
    expect(onPathClick).toHaveBeenCalledWith('name');
  });

  it('clicking a nested key fires callback with full dot-separated path', () => {
    const onPathClick = vi.fn();
    renderState(
      {
        status: 'success',
        result: makeSuccessResult({ Order: { Status: 'Active' } }),
      },
      { onPathClick },
    );

    fireEvent.click(screen.getByTestId('output-key-Order.Status'));
    expect(onPathClick).toHaveBeenCalledWith('Order.Status');
  });

  it('without onPathClick, keys are not rendered as buttons', () => {
    renderState(
      { status: 'success', result: makeSuccessResult({ name: 'Alice' }) },
    );

    // The key element should be a span, not a button
    const keyEl = screen.getByTestId('output-key-name');
    expect(keyEl.tagName.toLowerCase()).toBe('span');
  });

  it('with onPathClick, keys are rendered as buttons', () => {
    const onPathClick = vi.fn();
    renderState(
      { status: 'success', result: makeSuccessResult({ name: 'Alice' }) },
      { onPathClick },
    );

    const keyEl = screen.getByTestId('output-key-name');
    expect(keyEl.tagName.toLowerCase()).toBe('button');
  });

  it('key button has aria-label', () => {
    const onPathClick = vi.fn();
    renderState(
      { status: 'success', result: makeSuccessResult({ name: 'Alice' }) },
      { onPathClick },
    );

    expect(screen.getByLabelText('Select path name')).toBeInTheDocument();
  });
});
