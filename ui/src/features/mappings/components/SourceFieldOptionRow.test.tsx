/**
 * SourceFieldOptionRow.test.tsx — FS-052 T-01
 *
 * Component tests for SourceFieldOptionRow and SourceFieldChipBadge.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  SourceFieldOptionRow,
  SourceFieldChipBadge,
} from './SourceFieldOptionRow';

// ---------------------------------------------------------------------------
// SourceFieldOptionRow
// ---------------------------------------------------------------------------

describe('SourceFieldOptionRow', () => {
  // --- Badge zone ---

  it('renders the type badge with the correct code for string', () => {
    render(<SourceFieldOptionRow path="name" type="string" />);
    expect(screen.getByText('str')).toBeDefined();
  });

  it('renders the type badge with the correct code for number', () => {
    render(<SourceFieldOptionRow path="age" type="number" />);
    expect(screen.getByText('num')).toBeDefined();
  });

  it('renders the type badge with the correct code for boolean', () => {
    render(<SourceFieldOptionRow path="active" type="boolean" />);
    expect(screen.getByText('bool')).toBeDefined();
  });

  it('renders the type badge with the correct code for array', () => {
    render(<SourceFieldOptionRow path="tags" type="array" />);
    expect(screen.getByText('arr')).toBeDefined();
  });

  it('renders the type badge with the correct code for object', () => {
    render(<SourceFieldOptionRow path="address" type="object" />);
    expect(screen.getByText('obj')).toBeDefined();
  });

  it('renders "any" badge for an unknown type', () => {
    render(<SourceFieldOptionRow path="x" type="unknown-type" />);
    expect(screen.getByText('any')).toBeDefined();
  });

  it('applies the correct color class for string (blue)', () => {
    const { container } = render(<SourceFieldOptionRow path="name" type="string" />);
    const badge = container.querySelector('[aria-label="type: string"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('blue');
  });

  it('applies the correct color class for array (amber)', () => {
    const { container } = render(<SourceFieldOptionRow path="tags" type="array" />);
    const badge = container.querySelector('[aria-label="type: array"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('amber');
  });

  // --- Path zone ---

  it('renders the field path text', () => {
    render(<SourceFieldOptionRow path="address.city" type="string" />);
    expect(screen.getByText('address.city')).toBeDefined();
  });

  // --- Test data zone ---

  it('renders test data when testValue is provided', () => {
    render(
      <SourceFieldOptionRow
        path="email"
        type="string"
        testValue='"test@example.com"'
      />,
    );
    expect(screen.getByText('"test@example.com"')).toBeDefined();
  });

  it('does not render test data zone when testValue is undefined', () => {
    render(<SourceFieldOptionRow path="email" type="string" />);
    // No element with aria-label "test value: ..." should exist
    expect(screen.queryByLabelText(/test value/)).toBeNull();
  });

  it('does not render test data zone when testValue is null', () => {
    render(
      <SourceFieldOptionRow
        path="email"
        type="string"
        testValue={undefined}
      />,
    );
    expect(screen.queryByLabelText(/test value/)).toBeNull();
  });

  it('renders test data with aria-label', () => {
    render(
      <SourceFieldOptionRow
        path="email"
        type="string"
        testValue='"hello"'
      />,
    );
    expect(screen.getByLabelText('test value: "hello"')).toBeDefined();
  });

  // --- Scope zone ---

  it('renders scope badge when scope is provided', () => {
    render(<SourceFieldOptionRow path="id" type="number" scope="item" />);
    expect(screen.getByText('item')).toBeDefined();
  });

  it('renders parent scope badge', () => {
    render(<SourceFieldOptionRow path="orderId" type="string" scope="parent" />);
    expect(screen.getByText('parent')).toBeDefined();
  });

  it('does not render scope zone when scope is undefined', () => {
    render(<SourceFieldOptionRow path="name" type="string" />);
    // No scope text should be present
    expect(screen.queryByText('item')).toBeNull();
    expect(screen.queryByText('parent')).toBeNull();
    expect(screen.queryByText('root')).toBeNull();
  });

  // --- All zones together ---

  it('renders all four zones when all props are provided', () => {
    render(
      <SourceFieldOptionRow
        path="address.city"
        type="string"
        testValue='"San Francisco"'
        scope="item"
      />,
    );
    expect(screen.getByText('str')).toBeDefined();
    expect(screen.getByText('address.city')).toBeDefined();
    expect(screen.getByText('"San Francisco"')).toBeDefined();
    expect(screen.getByText('item')).toBeDefined();
  });

  // --- className passthrough ---

  it('applies extra className to the root element', () => {
    const { container } = render(
      <SourceFieldOptionRow path="x" type="string" className="custom-class" />,
    );
    expect(container.firstChild).not.toBeNull();
    expect((container.firstChild as HTMLElement).className).toContain('custom-class');
  });
});

// ---------------------------------------------------------------------------
// SourceFieldChipBadge
// ---------------------------------------------------------------------------

describe('SourceFieldChipBadge', () => {
  it('renders the correct badge code for string', () => {
    render(<SourceFieldChipBadge type="string" />);
    expect(screen.getByText('str')).toBeDefined();
  });

  it('renders the correct badge code for number', () => {
    render(<SourceFieldChipBadge type="number" />);
    expect(screen.getByText('num')).toBeDefined();
  });

  it('renders the correct badge code for boolean', () => {
    render(<SourceFieldChipBadge type="boolean" />);
    expect(screen.getByText('bool')).toBeDefined();
  });

  it('renders the correct badge code for array', () => {
    render(<SourceFieldChipBadge type="array" />);
    expect(screen.getByText('arr')).toBeDefined();
  });

  it('renders "any" for an unknown type', () => {
    render(<SourceFieldChipBadge type="mystery" />);
    expect(screen.getByText('any')).toBeDefined();
  });

  it('applies the correct color class for string (blue)', () => {
    const { container } = render(<SourceFieldChipBadge type="string" />);
    const badge = container.querySelector('[aria-label="type: string"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('blue');
  });

  it('applies the correct color class for array (amber)', () => {
    const { container } = render(<SourceFieldChipBadge type="array" />);
    const badge = container.querySelector('[aria-label="type: array"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('amber');
  });

  it('has an aria-label describing the type', () => {
    render(<SourceFieldChipBadge type="number" />);
    expect(screen.getByLabelText('type: number')).toBeDefined();
  });

  it('badge style matches SourceFieldOptionRow badge style for the same type', () => {
    const { container: chipContainer } = render(<SourceFieldChipBadge type="string" />);
    const { container: rowContainer } = render(
      <SourceFieldOptionRow path="x" type="string" />,
    );

    const chipBadge = chipContainer.querySelector('[aria-label="type: string"]');
    const rowBadge = rowContainer.querySelector('[aria-label="type: string"]');

    expect(chipBadge).not.toBeNull();
    expect(rowBadge).not.toBeNull();
    // Both should have the same className (same badge style)
    expect(chipBadge!.className).toBe(rowBadge!.className);
  });
});
