import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';

import { DiagnosticsDisplay } from './DiagnosticsDisplay';
import type { PreviewExecutionState } from '@/lib/types/domain';
import type { ExecutionResult, Diagnostic } from '@keyra/engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(diagnostics: Diagnostic[]): ExecutionResult {
  return {
    output: {},
    diagnostics,
    trace: [],
    stats: { durationMs: 5, rulesEvaluated: 1, rulesSucceeded: 1, rulesFailed: 0 },
  } as unknown as ExecutionResult;
}

function renderState(state: PreviewExecutionState) {
  return render(createElement(DiagnosticsDisplay, { state }));
}

const errorDiag: Diagnostic = {
  code: 'KEYRA-E030',
  severity: 'error',
  message: "Path 'source.missing' not found",
  targetPath: 'output.value',
  expression: 'source.missing',
};

const warningDiag: Diagnostic = {
  code: 'KEYRA-W006',
  severity: 'warning',
  message: 'Duplicate target path detected',
  targetPath: 'output.name',
};

const infoDiag: Diagnostic = {
  code: 'KEYRA-I001',
  severity: 'info',
  message: 'Optional field omitted',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiagnosticsDisplay', () => {
  it('idle: shows "Run a mapping to see diagnostics"', () => {
    renderState({ status: 'idle' });
    expect(screen.getByTestId('diagnostics-idle')).toBeInTheDocument();
    expect(screen.getByText('Run a mapping to see diagnostics')).toBeInTheDocument();
  });

  it('executing: shows executing placeholder', () => {
    renderState({ status: 'executing' });
    expect(screen.getByTestId('diagnostics-executing')).toBeInTheDocument();
  });

  it('timeout: shows timeout message', () => {
    renderState({ status: 'timeout' });
    expect(screen.getByTestId('diagnostics-timeout')).toBeInTheDocument();
    expect(screen.getByText(/Execution timed out/)).toBeInTheDocument();
  });

  it('error: shows error message', () => {
    renderState({ status: 'error', error: 'Engine threw' });
    expect(screen.getByTestId('diagnostics-error')).toBeInTheDocument();
    expect(screen.getByText(/Execution failed/)).toBeInTheDocument();
  });

  it('success with no diagnostics: shows "No issues found"', () => {
    renderState({ status: 'success', result: makeResult([]) });
    expect(screen.getByTestId('diagnostics-empty')).toBeInTheDocument();
    expect(screen.getByText('No issues found')).toBeInTheDocument();
  });

  it('success with diagnostics: renders list items', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag, infoDiag]),
    });

    expect(screen.getByTestId('diagnostics-list')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('diagnostic-item-2')).toBeInTheDocument();
  });

  it('error diagnostic: icon labeled Error, message in red', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });

    const icon = screen.getByRole('img', { name: 'Error' });
    expect(icon.className).toContain('text-red-400');

    const message = screen.getByText(errorDiag.message);
    expect(message.className).toContain('text-red-400');
  });

  it('warning diagnostic: icon labeled Warning, message in amber', () => {
    renderState({ status: 'success', result: makeResult([warningDiag]) });

    const icon = screen.getByRole('img', { name: 'Warning' });
    expect(icon.className).toContain('text-amber-400');

    const message = screen.getByText(warningDiag.message);
    expect(message.className).toContain('text-amber-400');
  });

  it('info diagnostic: icon labeled Info, message in blue', () => {
    renderState({ status: 'success', result: makeResult([infoDiag]) });

    const icon = screen.getByRole('img', { name: 'Info' });
    expect(icon.className).toContain('text-blue-400');
  });

  it('shows targetPath when present', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    expect(screen.getByTestId('diagnostic-path-0')).toHaveTextContent('output.value');
  });

  it('shows expression when present', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    expect(screen.getByTestId('diagnostic-expression-0')).toHaveTextContent('source.missing');
  });

  it('does not show path element when targetPath is absent', () => {
    renderState({ status: 'success', result: makeResult([infoDiag]) });
    expect(screen.queryByTestId('diagnostic-path-0')).not.toBeInTheDocument();
  });

  it('list container has overflow-auto for scrollable output', () => {
    renderState({ status: 'success', result: makeResult([errorDiag]) });
    const container = screen.getByTestId('diagnostics-list-container');
    expect(container.className).toContain('overflow-auto');
  });

  it('list has accessible aria-label with count', () => {
    renderState({
      status: 'success',
      result: makeResult([errorDiag, warningDiag]),
    });

    const list = screen.getByRole('list', { name: '2 diagnostics' });
    expect(list).toBeInTheDocument();
  });

  it('singular aria-label for one diagnostic', () => {
    renderState({ status: 'success', result: makeResult([warningDiag]) });
    expect(screen.getByRole('list', { name: '1 diagnostic' })).toBeInTheDocument();
  });
});
