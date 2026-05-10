import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComparisonSidePanel } from './ComparisonSidePanel';

import type { ComparisonSideResult } from '@/lib/types';


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_METADATA = {
  executionContext: 'client' as const,
  configVersion: 5,
  engineVersion: '1.0.0',
};

function makeResult(overrides: Partial<ComparisonSideResult>): ComparisonSideResult {
  return {
    label: 'Current',
    status: 'idle',
    metadata: BASE_METADATA,
    output: null,
    diagnostics: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComparisonSidePanel', () => {
  it('renders the side panel container with correct test-id for left', () => {
    render(<ComparisonSidePanel side="left" result={makeResult({})} />);
    expect(screen.getByTestId('comparison-side-left')).toBeInTheDocument();
  });

  it('renders the side panel container with correct test-id for right', () => {
    render(<ComparisonSidePanel side="right" result={makeResult({})} />);
    expect(screen.getByTestId('comparison-side-right')).toBeInTheDocument();
  });

  it('idle state: shows placeholder text', () => {
    render(<ComparisonSidePanel side="left" result={makeResult({ status: 'idle' })} />);
    expect(screen.getByText(/run comparison to see results/i)).toBeInTheDocument();
  });

  it('idle state: does not show metadata bar', () => {
    render(<ComparisonSidePanel side="left" result={makeResult({ status: 'idle' })} />);
    expect(screen.queryByTestId('metadata-bar')).not.toBeInTheDocument();
  });

  it('executing state: shows spinner and "Executing…" text', () => {
    render(<ComparisonSidePanel side="left" result={makeResult({ status: 'executing' })} />);
    expect(screen.getByText(/executing/i)).toBeInTheDocument();
  });

  it('executing state: does not show metadata bar', () => {
    render(<ComparisonSidePanel side="left" result={makeResult({ status: 'executing' })} />);
    expect(screen.queryByTestId('metadata-bar')).not.toBeInTheDocument();
  });

  it('success state: shows metadata bar', () => {
    render(
      <ComparisonSidePanel
        side="left"
        result={makeResult({ status: 'success', output: { result: 'ok' } })}
      />,
    );
    expect(screen.getByTestId('metadata-bar')).toBeInTheDocument();
  });

  it('success state: shows formatted JSON output', () => {
    render(
      <ComparisonSidePanel
        side="left"
        result={makeResult({ status: 'success', output: { name: 'Alice', age: 30 } })}
      />,
    );
    const output = screen.getByTestId('comparison-side-output');
    expect(output).toBeInTheDocument();
    expect(output.textContent).toContain('Alice');
    expect(output.textContent).toContain('30');
  });

  it('success state: does not show error element', () => {
    render(
      <ComparisonSidePanel
        side="left"
        result={makeResult({ status: 'success', output: { x: 1 } })}
      />,
    );
    expect(screen.queryByTestId('comparison-side-error')).not.toBeInTheDocument();
  });

  it('error state: shows metadata bar', () => {
    render(
      <ComparisonSidePanel
        side="right"
        result={makeResult({ status: 'error', error: 'Engine crashed' })}
      />,
    );
    expect(screen.getByTestId('metadata-bar')).toBeInTheDocument();
  });

  it('error state: shows error message', () => {
    render(
      <ComparisonSidePanel
        side="right"
        result={makeResult({ status: 'error', error: 'Engine crashed' })}
      />,
    );
    const errorEl = screen.getByTestId('comparison-side-error');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl.textContent).toContain('Engine crashed');
  });

  it('error state: does not show output element', () => {
    render(
      <ComparisonSidePanel
        side="right"
        result={makeResult({ status: 'error', error: 'fail' })}
      />,
    );
    expect(screen.queryByTestId('comparison-side-output')).not.toBeInTheDocument();
  });

  it('error state: shows fallback message when error is undefined', () => {
    render(
      <ComparisonSidePanel
        side="left"
        result={makeResult({ status: 'error' })}
      />,
    );
    expect(screen.getByTestId('comparison-side-error').textContent).toContain('unknown error');
  });
});
