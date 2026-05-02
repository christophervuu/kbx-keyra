import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

function renderState(state: PreviewExecutionState) {
  return render(createElement(OutputDisplay, { state }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OutputDisplay', () => {
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
});
