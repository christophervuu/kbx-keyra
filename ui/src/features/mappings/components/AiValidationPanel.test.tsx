import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AiValidationPanel } from './AiValidationPanel';

import type { MappingRule, ValidationReport } from '@/lib/types/domain';

const RULES: MappingRule[] = [
  { target: 'Order.Header.Currency', type: 'string', expression: 'source("currency")' },
  { target: 'Order.Header.Total', type: 'number', expression: 'source("total")' },
];

const REPORT: ValidationReport = {
  summary: {
    totalIssues: 2,
    bySeverity: { info: 0, warning: 1, error: 1 },
    byCategory: {
      correctness: 1,
      completeness: 1,
      maintainability: 0,
      risk: 0,
    },
  },
  issues: [
    {
      id: 'issue-1',
      category: 'correctness',
      severity: 'error',
      affectedRules: [{ ruleIndex: 0, targetPath: 'Order.Header.Currency' }],
      description: 'Expression may return invalid currency code.',
      recommendation: 'Normalize source currency before mapping.',
    },
    {
      id: 'issue-2',
      category: 'completeness',
      severity: 'warning',
      affectedRules: [{ targetPath: 'Order.Header.MissingPath' }],
      description: 'Fallback handling is incomplete.',
      recommendation: 'Add default() for missing inputs.',
    },
  ],
};

describe('AiValidationPanel', () => {
  it('renders advisory labeling distinct from deterministic diagnostics', () => {
    render(
      <AiValidationPanel
        status="idle"
        report={null}
        error={null}
        rules={RULES}
        onRun={vi.fn()}
        onRetry={vi.fn()}
        onReset={vi.fn()}
        onNavigateToRule={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-validation-advisory-label')).toHaveTextContent(
      'AI findings are advisory/additive. Deterministic engine diagnostics remain authoritative.',
    );
  });

  it('renders summary and issues with canonical category/severity fields', () => {
    render(
      <AiValidationPanel
        status="success"
        report={REPORT}
        error={null}
        rules={RULES}
        onRun={vi.fn()}
        onRetry={vi.fn()}
        onReset={vi.fn()}
        onNavigateToRule={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-validation-summary')).toHaveTextContent('2 issues');
    expect(screen.getByTestId('ai-validation-issue-issue-1')).toHaveTextContent('Correctness');
    expect(screen.getByTestId('ai-validation-issue-issue-1')).toHaveTextContent('error');
    expect(screen.getByTestId('ai-validation-issue-issue-2')).toHaveTextContent('Completeness');
    expect(screen.getByTestId('ai-validation-issue-issue-2')).toHaveTextContent('warning');
    expect(screen.getByTestId('ai-validation-issue-issue-1')).toHaveTextContent('Recommendation:');
  });

  it('navigates to rule when affected reference is resolvable', () => {
    const onNavigateToRule = vi.fn();

    render(
      <AiValidationPanel
        status="success"
        report={REPORT}
        error={null}
        rules={RULES}
        onRun={vi.fn()}
        onRetry={vi.fn()}
        onReset={vi.fn()}
        onNavigateToRule={onNavigateToRule}
      />,
    );

    fireEvent.click(screen.getByTestId('ai-validation-issue-link-issue-1-0'));
    expect(onNavigateToRule).toHaveBeenCalledWith(0);
  });

  it('renders non-click fallback for unresolvable references', () => {
    render(
      <AiValidationPanel
        status="success"
        report={REPORT}
        error={null}
        rules={RULES}
        onRun={vi.fn()}
        onRetry={vi.fn()}
        onReset={vi.fn()}
        onNavigateToRule={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-validation-issue-unresolved-issue-2-0')).toHaveTextContent(
      'Order.Header.MissingPath',
    );
    expect(screen.queryByTestId('ai-validation-issue-link-issue-2-0')).not.toBeInTheDocument();
  });

  it('renders error state with retry affordance', () => {
    const onRetry = vi.fn();

    render(
      <AiValidationPanel
        status="error"
        report={null}
        error="Could not reach AI Validation service."
        rules={RULES}
        onRun={vi.fn()}
        onRetry={onRetry}
        onReset={vi.fn()}
        onNavigateToRule={vi.fn()}
      />,
    );

    expect(screen.getByTestId('ai-validation-error')).toHaveTextContent(
      'Could not reach AI Validation service.',
    );

    fireEvent.click(screen.getByTestId('ai-validation-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
