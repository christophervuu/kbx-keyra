/**
 * Tests for ExpressionPreview component — T-10
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ExpressionPreview } from './ExpressionPreview';

describe('ExpressionPreview', () => {
  it('shows "Enter an expression" placeholder when expression is empty', () => {
    render(
      <ExpressionPreview
        expression=""
        result={null}
        error={null}
        isEvaluating={false}
        hasSourceData={false}
      />,
    );
    expect(screen.getByTestId('preview-result-no-expression')).toBeInTheDocument();
  });

  it('shows no-source-data placeholder when expression provided but no data', () => {
    render(
      <ExpressionPreview
        expression='source("x")'
        result={null}
        error={null}
        isEvaluating={false}
        hasSourceData={false}
      />,
    );
    expect(screen.getByTestId('preview-result-no-data')).toBeInTheDocument();
  });

  it('shows loading spinner when isEvaluating=true', () => {
    render(
      <ExpressionPreview
        expression='source("x")'
        result={null}
        error={null}
        isEvaluating={true}
        hasSourceData={true}
      />,
    );
    expect(screen.getByTestId('preview-result-loading')).toBeInTheDocument();
  });

  it('shows error display when error is provided', () => {
    render(
      <ExpressionPreview
        expression='source("x")'
        result={null}
        error="Unknown function: foo"
        isEvaluating={false}
        hasSourceData={true}
      />,
    );
    expect(screen.getByTestId('preview-result-error')).toBeInTheDocument();
    expect(screen.getByText(/Unknown function: foo/)).toBeInTheDocument();
  });

  it('shows string result in quotes with green styling', () => {
    render(
      <ExpressionPreview
        expression='source("name")'
        result="Alice"
        error={null}
        isEvaluating={false}
        hasSourceData={true}
      />,
    );
    const el = screen.getByTestId('preview-result-primitive');
    expect(el).toBeInTheDocument();
    expect(el.textContent).toBe('"Alice"');
  });

  it('shows number result in orange', () => {
    render(
      <ExpressionPreview
        expression='source("qty")'
        result={42}
        error={null}
        isEvaluating={false}
        hasSourceData={true}
      />,
    );
    const el = screen.getByTestId('preview-result-primitive');
    expect(el.textContent).toBe('42');
    expect(el.className).toContain('text-orange-400');
  });

  it('shows object result as pre-formatted JSON', () => {
    render(
      <ExpressionPreview
        expression='source("address")'
        result={{ city: 'London', country: 'UK' }}
        error={null}
        isEvaluating={false}
        hasSourceData={true}
      />,
    );
    const el = screen.getByTestId('preview-result-complex');
    expect(el.textContent).toContain('London');
    expect(el.textContent).toContain('UK');
  });

  it('shows null result text when result is null and no error', () => {
    render(
      <ExpressionPreview
        expression='source("x")'
        result={null}
        error={null}
        isEvaluating={false}
        hasSourceData={true}
      />,
    );
    expect(screen.getByTestId('preview-result-null')).toBeInTheDocument();
  });

  it('shows syntax-highlighted expression string', () => {
    render(
      <ExpressionPreview
        expression='upper(source("name"))'
        result="ALICE"
        error={null}
        isEvaluating={false}
        hasSourceData={true}
      />,
    );
    expect(screen.getByTestId('preview-expression-highlighted')).toBeInTheDocument();
  });
});
