import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComparisonDiffDisplay } from './ComparisonDiffDisplay';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const LEFT_LABEL = 'Current';
const RIGHT_LABEL = 'Saved';

const MATCHING_OUTPUT = { name: 'Alice', age: 30 };
const LEFT_OUTPUT = { name: 'Alice', age: 30, extra: true };
const RIGHT_OUTPUT = { name: 'Bob', age: 30 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComparisonDiffDisplay', () => {
  it('renders nothing when overallStatus is idle', () => {
    const { container } = render(
      <ComparisonDiffDisplay
        leftOutput={MATCHING_OUTPUT}
        rightOutput={MATCHING_OUTPUT}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="idle"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when overallStatus is executing', () => {
    const { container } = render(
      <ComparisonDiffDisplay
        leftOutput={MATCHING_OUTPUT}
        rightOutput={MATCHING_OUTPUT}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="executing"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders "cannot compute" message when leftOutput is null', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={null}
        rightOutput={RIGHT_OUTPUT}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="partial-error"
      />,
    );
    expect(screen.getByTestId('comparison-diff-display')).toBeInTheDocument();
    expect(screen.getByText(/cannot compute diff/i)).toBeInTheDocument();
  });

  it('renders "cannot compute" message when rightOutput is null', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={LEFT_OUTPUT}
        rightOutput={null}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="partial-error"
      />,
    );
    expect(screen.getByText(/cannot compute diff/i)).toBeInTheDocument();
  });

  it('renders "cannot compute" message when both outputs are null', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={null}
        rightOutput={null}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="partial-error"
      />,
    );
    expect(screen.getByText(/cannot compute diff/i)).toBeInTheDocument();
  });

  it('renders green match indicator when outputs are identical', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={MATCHING_OUTPUT}
        rightOutput={MATCHING_OUTPUT}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="complete"
      />,
    );
    expect(screen.getByTestId('comparison-diff-match')).toBeInTheDocument();
    expect(screen.getByText(/outputs match/i)).toBeInTheDocument();
  });

  it('does not render diff entries when outputs match', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={MATCHING_OUTPUT}
        rightOutput={MATCHING_OUTPUT}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="complete"
      />,
    );
    expect(screen.queryAllByTestId('comparison-diff-entry')).toHaveLength(0);
  });

  it('renders diff count when outputs differ', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={LEFT_OUTPUT}
        rightOutput={RIGHT_OUTPUT}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="complete"
      />,
    );
    const countEl = screen.getByTestId('comparison-diff-count');
    expect(countEl).toBeInTheDocument();
    expect(countEl.textContent).toMatch(/difference/i);
  });

  it('renders diff entries when outputs differ', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={LEFT_OUTPUT}
        rightOutput={RIGHT_OUTPUT}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="complete"
      />,
    );
    const entries = screen.getAllByTestId('comparison-diff-entry');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('diff entries reference left and right labels', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={{ a: 1 }}
        rightOutput={{ a: 2 }}
        leftLabel="Current"
        rightLabel="DEV"
        overallStatus="complete"
      />,
    );
    const entry = screen.getAllByTestId('comparison-diff-entry')[0];
    expect(entry.textContent).toContain('Current');
    expect(entry.textContent).toContain('DEV');
  });

  it('missing_field entry references left label as present side', () => {
    // extra field in left = missing_field from right's perspective
    render(
      <ComparisonDiffDisplay
        leftOutput={{ name: 'Alice', extra: true }}
        rightOutput={{ name: 'Alice' }}
        leftLabel="Current"
        rightLabel="Saved"
        overallStatus="complete"
      />,
    );
    // The extra field in left is an "extra_field" type (present in left/actual, absent in right/expected)
    const entries = screen.getAllByTestId('comparison-diff-entry');
    const extraEntry = entries.find((el) => el.getAttribute('data-entry-type') === 'extra_field');
    expect(extraEntry).toBeDefined();
    expect(extraEntry!.textContent).toContain('Current');
    expect(extraEntry!.textContent).toContain('Saved');
  });

  it('truncates long values in diff entries', () => {
    const longValue = 'x'.repeat(100);
    render(
      <ComparisonDiffDisplay
        leftOutput={{ field: longValue }}
        rightOutput={{ field: 'short' }}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="complete"
      />,
    );
    const entries = screen.getAllByTestId('comparison-diff-entry');
    expect(entries[0].textContent).toContain('…');
  });

  it('renders the diff display container with correct test-id', () => {
    render(
      <ComparisonDiffDisplay
        leftOutput={MATCHING_OUTPUT}
        rightOutput={MATCHING_OUTPUT}
        leftLabel={LEFT_LABEL}
        rightLabel={RIGHT_LABEL}
        overallStatus="complete"
      />,
    );
    expect(screen.getByTestId('comparison-diff-display')).toBeInTheDocument();
  });
});
