import type { ExecutionResult } from '@keyra/engine';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { OutputDisplay } from './OutputDisplay';

import {
  INLINE_OUTPUT_NODE_LIMIT_HARD,
  INLINE_OUTPUT_NODE_LIMIT_SOFT,
} from '@/features/mappings/lib';
import type { PreviewExecutionState } from '@/lib/types/domain';

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
  extra?: Partial<ComponentProps<typeof OutputDisplay>>,
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

    expect(screen.getByTestId('output-json-view')).toBeInTheDocument();
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

  it('renders copy button for success output', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({ name: 'Alice' }),
    });

    expect(screen.getByTestId('output-copy-button')).toBeInTheDocument();
  });

  it('copy button writes output payload to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderState({
      status: 'success',
      result: makeSuccessResult({ name: 'Alice' }),
    });

    fireEvent.click(screen.getByTestId('output-copy-button'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(JSON.stringify({ name: 'Alice' }, null, 2));
    });
  });

  it('copy uses full serialized payload (not highlighted/visible subset)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderState(
      {
        status: 'success',
        result: makeSuccessResult({ Order: { Status: 'Active', Amount: 99 } }),
      },
      { highlightPath: 'Order.Status' },
    );

    fireEvent.click(screen.getByTestId('output-copy-button'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        JSON.stringify({ Order: { Status: 'Active', Amount: 99 } }, null, 2),
      );
    });
  });

  it('copy button shows copied feedback after success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderState({
      status: 'success',
      result: makeSuccessResult({ name: 'Alice' }),
    });

    fireEvent.click(screen.getByTestId('output-copy-button'));
    await waitFor(() => {
      expect(screen.getByTestId('output-copy-button')).toHaveTextContent('Copied');
    });
  });

  it('copy button shows failure feedback when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    renderState({
      status: 'success',
      result: makeSuccessResult({ name: 'Alice' }),
    });

    fireEvent.click(screen.getByTestId('output-copy-button'));
    await waitFor(() => {
      expect(screen.getByTestId('output-copy-button')).toHaveTextContent('Copy failed');
    });
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

  it('search no-results in JSON renderer is explicit', () => {
    renderState({
      status: 'success',
      result: makeSuccessResult({ name: 'Alice' }),
    });

    fireEvent.change(screen.getByTestId('output-search-input'), {
      target: { value: 'does-not-exist' },
    });

    expect(screen.getByTestId('output-search-no-results')).toHaveTextContent('No matching output nodes');
  });

  it('renders limited mode when output is at soft thresholds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const bigArray = Array.from({ length: INLINE_OUTPUT_NODE_LIMIT_SOFT }, (_, i) => ({ i }));
    renderState({
      status: 'success',
      result: makeSuccessResult({ rows: bigArray }),
    });

    expect(screen.getByTestId('output-limited-mode')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('output-copy-button'));

    await waitFor(() => {
      const copied = writeText.mock.calls[0]?.[0] as string;
      expect(copied.length).toBeGreaterThan(0);
      expect(copied).toContain('"rows"');
    });
  });

  it('renders fallback mode at hard thresholds and copy still uses full payload', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const hugeArray = Array.from({ length: INLINE_OUTPUT_NODE_LIMIT_HARD }, (_, i) => ({ value: i }));
    renderState({
      status: 'success',
      result: makeSuccessResult({ rows: hugeArray }),
    });

    expect(screen.getByTestId('output-fallback-mode')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('output-copy-button'));

    await waitFor(() => {
      const copied = writeText.mock.calls[0]?.[0] as string;
      expect(copied).toContain('"rows"');
      expect(copied).toContain(`"value": ${INLINE_OUTPUT_NODE_LIMIT_HARD - 1}`);
    });
  });

  it('keeps complete copy semantics in limited/fallback modes', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const limitedArray = Array.from({ length: INLINE_OUTPUT_NODE_LIMIT_SOFT }, (_, i) => ({ i }));
    renderState({ status: 'success', result: makeSuccessResult({ rows: limitedArray }) });

    fireEvent.click(screen.getByTestId('output-copy-button'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });

    const fallbackArray = Array.from({ length: INLINE_OUTPUT_NODE_LIMIT_HARD }, (_, i) => ({ value: i }));
    renderState({ status: 'success', result: makeSuccessResult({ rows: fallbackArray }) });

    fireEvent.click(screen.getAllByTestId('output-copy-button')[1]!);
    await waitFor(() => {
      const copied = writeText.mock.calls.at(-1)?.[0] as string;
      expect(copied).toContain(`"value": ${INLINE_OUTPUT_NODE_LIMIT_HARD - 1}`);
    });
  });
});
