/**
 * SourceChipPicker.test.tsx — FS-052 T-02
 *
 * Component tests for SourceChipPicker covering:
 * - Rendering, search, selection, removal
 * - 3-letter type badges in dropdown options and selected chips
 * - Test data display when PreviewContext has sourceData
 * - Graceful no-test-data when sourceData is null
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SourceChipPicker } from './SourceChipPicker';
import { PreviewProvider, usePreviewSetters } from '../context/preview-context';
import type { ParsedSchema } from '@/lib/types/domain';
import type { SourceSelection } from '../lib/expression-builder-state';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SCHEMA: ParsedSchema = {
  format: 'json-schema',
  totalFieldCount: 3,
  parseTimeMs: 1,
  inferred: false,
  nodes: [
    {
      path: 'name',
      fieldName: 'name',
      type: 'string',
      depth: 0,
      isArray: false,
      isRequired: true,
      parentPath: null,
      childCount: 0,
      children: [],
    },
    {
      path: 'age',
      fieldName: 'age',
      type: 'number',
      depth: 0,
      isArray: false,
      isRequired: false,
      parentPath: null,
      childCount: 0,
      children: [],
    },
    {
      path: 'active',
      fieldName: 'active',
      type: 'boolean',
      depth: 0,
      isArray: false,
      isRequired: false,
      parentPath: null,
      childCount: 0,
      children: [],
    },
  ],
};

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof SourceChipPicker>> = {},
) {
  const defaults: React.ComponentProps<typeof SourceChipPicker> = {
    parsedSourceSchema: MOCK_SCHEMA,
    selectedSources: [],
    onSourcesChange: vi.fn(),
    staticMode: false,
    onStaticModeChange: vi.fn(),
  };
  return render(<SourceChipPicker {...defaults} {...overrides} />);
}

/** Seeds PreviewContext with a parsed sourceData value */
function WithSourceData({
  sourceData,
  children,
}: {
  sourceData: unknown | null;
  children: React.ReactNode;
}) {
  const { setSourceData } = usePreviewSetters();
  useEffect(() => {
    setSourceData(sourceData);
  }, [sourceData, setSourceData]);
  return <>{children}</>;
}

function renderPickerWithContext(
  overrides: Partial<React.ComponentProps<typeof SourceChipPicker>> = {},
  sourceData: unknown | null = null,
) {
  const defaults: React.ComponentProps<typeof SourceChipPicker> = {
    parsedSourceSchema: MOCK_SCHEMA,
    selectedSources: [],
    onSourcesChange: vi.fn(),
    staticMode: false,
    onStaticModeChange: vi.fn(),
  };
  return render(
    <PreviewProvider>
      <WithSourceData sourceData={sourceData}>
        <SourceChipPicker {...defaults} {...overrides} />
      </WithSourceData>
    </PreviewProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests — field selection mode
// ---------------------------------------------------------------------------

describe('SourceChipPicker — field selection mode', () => {
  it('renders the search input', () => {
    renderPicker();
    expect(screen.getByRole('combobox', { name: 'Search source fields' })).toBeInTheDocument();
  });

  it('shows suggestions from schema when input is focused', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('age')).toBeInTheDocument();
  });

  it('filters suggestions by typed query', async () => {
    const user = userEvent.setup();
    renderPicker();
    const input = screen.getByRole('combobox', { name: 'Search source fields' });
    await user.type(input, 'age');
    expect(screen.getByText('age')).toBeInTheDocument();
    expect(screen.queryByText('name')).not.toBeInTheDocument();
  });

  it('calls onSourcesChange when a suggestion is clicked', async () => {
    const onSourcesChange = vi.fn();
    const user = userEvent.setup();
    renderPicker({ onSourcesChange });
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    await user.click(screen.getByTestId('suggestion-name'));
    expect(onSourcesChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ path: 'name' })]),
    );
  });

  it('renders selected sources as chips', () => {
    const selectedSources: SourceSelection[] = [
      { path: 'name', type: 'string' },
      { path: 'age', type: 'number' },
    ];
    renderPicker({ selectedSources });
    const chips = screen.getAllByTestId('source-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0]).toHaveTextContent('name');
    expect(chips[1]).toHaveTextContent('age');
  });

  it('calls onSourcesChange (removing) when × button on a chip is clicked', () => {
    const onSourcesChange = vi.fn();
    const selectedSources: SourceSelection[] = [{ path: 'name', type: 'string' }];
    renderPicker({ selectedSources, onSourcesChange });
    fireEvent.click(screen.getByRole('button', { name: 'Remove source name' }));
    expect(onSourcesChange).toHaveBeenCalledWith([]);
  });

  it('excludes already-selected fields from suggestions', async () => {
    const user = userEvent.setup();
    const selectedSources: SourceSelection[] = [{ path: 'name', type: 'string' }];
    renderPicker({ selectedSources });
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    const listbox = screen.getByRole('listbox');
    expect(listbox).not.toHaveTextContent('name');
  });

  it('shows no-schema message when parsedSourceSchema is null', () => {
    renderPicker({ parsedSourceSchema: null });
    expect(screen.getByText(/No source schema loaded/i)).toBeInTheDocument();
  });

  it('handles Enter key to select first suggestion', async () => {
    const onSourcesChange = vi.fn();
    const user = userEvent.setup();
    renderPicker({ onSourcesChange });
    const input = screen.getByRole('combobox', { name: 'Search source fields' });
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onSourcesChange).toHaveBeenCalled();
  });

  it('handles Escape key to close suggestions', async () => {
    const user = userEvent.setup();
    renderPicker();
    const input = screen.getByRole('combobox', { name: 'Search source fields' });
    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests — static value mode
// ---------------------------------------------------------------------------

describe('SourceChipPicker — static value mode', () => {
  it('renders the input-type segmented control', () => {
    renderPicker();
    expect(screen.getByRole('tablist', { name: 'Input type' })).toBeInTheDocument();
  });

  it('shows static value input when staticMode is true', () => {
    renderPicker({ staticMode: true });
    expect(screen.getByTestId('static-value-input')).toBeInTheDocument();
  });

  it('calls onStaticModeChange(true) when Static value tab is clicked', () => {
    const onStaticModeChange = vi.fn();
    renderPicker({ onStaticModeChange });
    fireEvent.click(screen.getByTestId('input-type-static'));
    expect(onStaticModeChange).toHaveBeenCalledWith(true);
  });

  it('calls onStaticModeChange(false) when Source field tab is clicked', () => {
    const onStaticModeChange = vi.fn();
    renderPicker({ staticMode: true, onStaticModeChange });
    fireEvent.click(screen.getByTestId('input-type-source'));
    expect(onStaticModeChange).toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — FS-052 T-02: type badges and test data
// ---------------------------------------------------------------------------

describe('SourceChipPicker — FS-052 T-02 type badges and test data', () => {
  it('renders 3-letter type badge (str) in suggestion dropdown for string fields', async () => {
    const user = userEvent.setup();
    renderPickerWithContext();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    expect(screen.getAllByText('str').length).toBeGreaterThan(0);
  });

  it('renders 3-letter type badge (num) in suggestion dropdown for number fields', async () => {
    const user = userEvent.setup();
    renderPickerWithContext();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    expect(screen.getByText('num')).toBeInTheDocument();
  });

  it('renders 3-letter type badge (bool) in suggestion dropdown for boolean fields', async () => {
    const user = userEvent.setup();
    renderPickerWithContext();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    expect(screen.getByText('bool')).toBeInTheDocument();
  });

  it('shows resolved test value in dropdown when PreviewContext has sourceData', async () => {
    const user = userEvent.setup();
    renderPickerWithContext({}, { name: 'Bob', age: 42, active: true });
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    expect(screen.getByText('"Bob"')).toBeInTheDocument();
  });

  it('does not show test data zone when PreviewContext sourceData is null', async () => {
    const user = userEvent.setup();
    renderPickerWithContext({}, null);
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    expect(screen.queryByLabelText(/test value/)).toBeNull();
  });

  it('renders SourceFieldChipBadge (3-letter code) in selected source chips', () => {
    const selectedSources: SourceSelection[] = [{ path: 'name', type: 'string' }];
    renderPickerWithContext({ selectedSources });
    expect(screen.getByText('str')).toBeInTheDocument();
  });

  it('renders without crashing when rendered outside PreviewProvider (no context)', async () => {
    const user = userEvent.setup();
    renderPicker(); // no PreviewProvider wrapper
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    // Should render suggestions without test data
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.queryByLabelText(/test value/)).toBeNull();
  });
});
