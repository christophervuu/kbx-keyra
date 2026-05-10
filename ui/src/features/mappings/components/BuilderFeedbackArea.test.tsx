/**
 * BuilderFeedbackArea component tests (FS-040 T-02).
 *
 * Covers:
 * - Expression row rendering (empty, non-empty, incomplete label)
 * - Result row (no data, evaluating, error, value)
 * - Validation badges (structure valid/invalid, output type valid/mismatch)
 * - ARIA attributes
 * - Mode-specific behaviour (editor vs builder)
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BuilderFeedbackArea } from './BuilderFeedbackArea';
import type { BuilderValidationState } from '../lib/builder-validation-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_STATE: BuilderValidationState = {
  structureValid: true,
  structureIssues: [],
  outputTypeValid: true,
  outputTypeMismatch: null,
  canApply: true,
  canSave: true,
};

const INVALID_STRUCTURE_STATE: BuilderValidationState = {
  structureValid: false,
  structureIssues: [{ key: 'missing_source', message: 'Select a source field or enter a static value', severity: 'error' }],
  outputTypeValid: true,
  outputTypeMismatch: null,
  canApply: false,
  canSave: false,
};

const OUTPUT_TYPE_MISMATCH_STATE: BuilderValidationState = {
  structureValid: true,
  structureIssues: [],
  outputTypeValid: false,
  outputTypeMismatch: {
    inferredType: 'number',
    targetType: 'string',
    message: 'Expression produces number but target expects string',
  },
  canApply: true,
  canSave: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mock useExpressionPreview to avoid async evaluation in tests
vi.mock('../hooks/use-expression-preview', () => ({
  useExpressionPreview: ({ expression, sourceData }: { expression: string; sourceData: unknown }) => {
    if (!sourceData) return { result: null, error: null, isEvaluating: false };
    if (expression === 'error()') return { result: null, error: 'Evaluation failed', isEvaluating: false };
    if (expression === 'loading()') return { result: null, error: null, isEvaluating: true };
    if (expression) return { result: 'test-result', error: null, isEvaluating: false };
    return { result: null, error: null, isEvaluating: false };
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BuilderFeedbackArea', () => {
  describe('container', () => {
    it('renders with correct ARIA region attributes', () => {
      render(
        <BuilderFeedbackArea
          expression=""
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      const region = screen.getByRole('region', { name: 'Expression feedback' });
      expect(region).toBeDefined();
      expect(region.getAttribute('data-testid')).toBe('builder-feedback-area');
    });
  });

  describe('Expression row', () => {
    it('shows placeholder when expression is empty', () => {
      render(
        <BuilderFeedbackArea
          expression=""
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      expect(screen.getByTestId('feedback-expression-placeholder')).toBeDefined();
      expect(screen.getByText('No expression yet')).toBeDefined();
    });

    it('renders expression with "Expression" label when non-empty and structure valid', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      expect(screen.getByText('Expression')).toBeDefined();
      expect(screen.queryByText('Expression (incomplete)')).toBeNull();
    });

    it('renders "Expression (incomplete)" label when non-empty and structure invalid in builder mode', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={INVALID_STRUCTURE_STATE}
          mode="builder"
        />,
      );
      expect(screen.getByText('Expression (incomplete)')).toBeDefined();
    });

    it('renders "Expression" label in editor mode even when structure invalid', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={INVALID_STRUCTURE_STATE}
          mode="editor"
        />,
      );
      expect(screen.getByText('Expression')).toBeDefined();
      expect(screen.queryByText('Expression (incomplete)')).toBeNull();
    });

    it('has aria-live="polite" on expression content', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      const expressionEl = screen.getByTestId('feedback-expression');
      const liveEl = expressionEl.querySelector('[aria-live="polite"]');
      expect(liveEl).not.toBeNull();
    });
  });

  describe('Result row', () => {
    it('shows "Load test data" prompt when sourceData is null', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      expect(screen.getByTestId('feedback-result-no-data')).toBeDefined();
      expect(screen.getByText('Load test data to see live results.')).toBeDefined();
    });

    it('shows evaluated result when sourceData is provided and expression evaluates', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={{ email: 'test@example.com' }}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      expect(screen.getByTestId('feedback-result-value')).toBeDefined();
    });

    it('shows error when evaluation fails', () => {
      render(
        <BuilderFeedbackArea
          expression="error()"
          sourceData={{ email: 'test@example.com' }}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      expect(screen.getByTestId('feedback-result-error')).toBeDefined();
      expect(screen.getByText('Evaluation failed')).toBeDefined();
    });

    it('shows loading indicator when evaluating', () => {
      render(
        <BuilderFeedbackArea
          expression="loading()"
          sourceData={{ email: 'test@example.com' }}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      expect(screen.getByTestId('feedback-result-loading')).toBeDefined();
    });

    it('has aria-live="polite" on result content', () => {
      render(
        <BuilderFeedbackArea
          expression=""
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      const resultEl = screen.getByTestId('feedback-result');
      const liveEl = resultEl.querySelector('[aria-live="polite"]');
      expect(liveEl).not.toBeNull();
    });
  });

  describe('Validation row — Structure badge', () => {
    it('shows green Structure badge when structureValid is true in builder mode', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      const badge = screen.getByTestId('validation-structure-badge');
      expect(badge.getAttribute('aria-label')).toBe('Structure valid');
      expect(badge.textContent).toContain('Structure');
    });

    it('shows red Structure badge with issue message when structureValid is false', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={INVALID_STRUCTURE_STATE}
          mode="builder"
        />,
      );
      const badge = screen.getByTestId('validation-structure-badge');
      expect(badge.getAttribute('aria-label')).toContain('Structure invalid');
      expect(badge.textContent).toContain('Select a source field or enter a static value');
    });

    it('shows neutral Structure badge in editor mode', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={VALID_STATE}
          mode="editor"
        />,
      );
      const badge = screen.getByTestId('validation-structure-badge');
      expect(badge.getAttribute('aria-label')).toContain('not applicable');
    });

    it('has role="status" on structure badge', () => {
      render(
        <BuilderFeedbackArea
          expression=""
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      const badge = screen.getByTestId('validation-structure-badge');
      expect(badge.getAttribute('role')).toBe('status');
    });
  });

  describe('Validation row — Output Type badge', () => {
    it('shows green Output Type badge when outputTypeValid is true', () => {
      render(
        <BuilderFeedbackArea
          expression='source("email")'
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      const badge = screen.getByTestId('validation-output-type-badge');
      expect(badge.getAttribute('aria-label')).toBe('Output type compatible');
      expect(badge.textContent).toContain('Output type');
    });

    it('shows amber Output Type badge with mismatch message when outputTypeMismatch is present', () => {
      render(
        <BuilderFeedbackArea
          expression='source("amount")'
          sourceData={null}
          validationState={OUTPUT_TYPE_MISMATCH_STATE}
          mode="builder"
        />,
      );
      const badge = screen.getByTestId('validation-output-type-badge');
      expect(badge.getAttribute('aria-label')).toContain('Output type mismatch');
      expect(badge.textContent).toContain('Expression produces number but target expects string');
    });

    it('has role="status" on output type badge', () => {
      render(
        <BuilderFeedbackArea
          expression=""
          sourceData={null}
          validationState={VALID_STATE}
          mode="builder"
        />,
      );
      const badge = screen.getByTestId('validation-output-type-badge');
      expect(badge.getAttribute('role')).toBe('status');
    });
  });
});
