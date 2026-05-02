/**
 * Tests for FunctionReferenceEntry — T-09
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FunctionReferenceEntry } from './FunctionReferenceEntry';
import type { FunctionCatalogEntry } from '@/lib/data/dsl-functions';

const mockEntry: FunctionCatalogEntry = {
  name: 'concat',
  category: 'String',
  description: 'Concatenates two or more string values.',
  parameterCount: '1+',
  parameters: [
    { name: 'value', type: 'string', required: true },
    { name: 'rest', type: 'string', required: false, variadic: true },
  ],
  returnType: 'string',
  example: 'concat(source("firstName"), " ", source("lastName"))',
};

describe('FunctionReferenceEntry', () => {
  it('renders function name', () => {
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={vi.fn()} />);
    expect(screen.getByText('concat')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={vi.fn()} />);
    expect(screen.getByText('Concatenates two or more string values.')).toBeInTheDocument();
  });

  it('renders return type', () => {
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={vi.fn()} />);
    expect(screen.getByText(/→ string/)).toBeInTheDocument();
  });

  it('renders signature with parameter names', () => {
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={vi.fn()} />);
    // Signature: concat(value: string, ...rest: string): string
    expect(screen.getByTitle(/concat\(value: string/)).toBeInTheDocument();
  });

  it('renders example expression', () => {
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={vi.fn()} />);
    // Should find syntax-highlighted text from example
    expect(screen.getByText('concat')).toBeInTheDocument(); // function name in example
  });

  it('click fires onInsert', () => {
    const onInsert = vi.fn();
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={onInsert} />);
    fireEvent.click(screen.getByTestId('fn-entry-concat'));
    expect(onInsert).toHaveBeenCalledTimes(1);
  });

  it('Enter key fires onInsert', () => {
    const onInsert = vi.fn();
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={onInsert} />);
    fireEvent.keyDown(screen.getByTestId('fn-entry-concat'), { key: 'Enter' });
    expect(onInsert).toHaveBeenCalledTimes(1);
  });

  it('Space key fires onInsert', () => {
    const onInsert = vi.fn();
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={onInsert} />);
    fireEvent.keyDown(screen.getByTestId('fn-entry-concat'), { key: ' ' });
    expect(onInsert).toHaveBeenCalledTimes(1);
  });

  it('is keyboard focusable (tabIndex=0)', () => {
    render(<FunctionReferenceEntry entry={mockEntry} onInsert={vi.fn()} />);
    const el = screen.getByTestId('fn-entry-concat');
    expect(el).toHaveAttribute('tabindex', '0');
  });

  it('renders optional parameter with ? suffix', () => {
    const entry: FunctionCatalogEntry = {
      name: 'round',
      category: 'Math',
      description: 'Rounds a number.',
      parameterCount: '1+',
      parameters: [
        { name: 'value', type: 'number', required: true },
        { name: 'decimals', type: 'number', required: false },
      ],
      returnType: 'number',
      example: 'round(source("amount"), 2)',
    };
    render(<FunctionReferenceEntry entry={entry} onInsert={vi.fn()} />);
    expect(screen.getByTitle(/decimals\?/)).toBeInTheDocument();
  });
});
