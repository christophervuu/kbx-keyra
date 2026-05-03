import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ActiveFilterChips } from '../ActiveFilterChips';
import { SchemaLibraryFiltersPanel } from '../SchemaLibraryFiltersPanel';
import { SchemaLibraryNoResults } from '../SchemaLibraryNoResults';
import { SchemaLibrarySearch } from '../SchemaLibrarySearch';
import { SchemaLibrarySortControl } from '../SchemaLibrarySortControl';

// ===========================================================================
// SchemaLibrarySearch
// ===========================================================================

describe('SchemaLibrarySearch', () => {
  it('renders input with placeholder text', () => {
    render(<SchemaLibrarySearch value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText('Search schemas...')).toBeInTheDocument();
  });

  it('has aria-label', () => {
    render(<SchemaLibrarySearch value="" onChange={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: 'Search schemas' })).toBeInTheDocument();
  });

  it('calls onChange when user types', async () => {
    const onChange = vi.fn();
    render(<SchemaLibrarySearch value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox'), 'hello');
    expect(onChange).toHaveBeenCalled();
  });

  it('does not show clear button when value is empty', () => {
    render(<SchemaLibrarySearch value="" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('shows clear button when value is non-empty', () => {
    render(<SchemaLibrarySearch value="customer" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('clear button calls onChange with empty string', async () => {
    const onChange = vi.fn();
    render(<SchemaLibrarySearch value="customer" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows result count when resultCount < totalCount', () => {
    render(<SchemaLibrarySearch value="c" onChange={vi.fn()} resultCount={3} totalCount={10} />);
    expect(screen.getByTestId('result-count')).toHaveTextContent('Showing 3 of 10');
  });

  it('does not show result count when resultCount === totalCount', () => {
    render(<SchemaLibrarySearch value="" onChange={vi.fn()} resultCount={10} totalCount={10} />);
    expect(screen.queryByTestId('result-count')).not.toBeInTheDocument();
  });

  it('does not show result count when props are absent', () => {
    render(<SchemaLibrarySearch value="" onChange={vi.fn()} />);
    expect(screen.queryByTestId('result-count')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// SchemaLibraryFiltersPanel
// ===========================================================================

describe('SchemaLibraryFiltersPanel', () => {
  const noop = vi.fn();
  const defaultProps = {
    origins: [] as Array<'cdm' | 'published' | 'local'>,
    formats: [] as Array<'JSON Schema' | 'XSD' | 'Inferred'>,
    scopes: [] as Array<'global' | 'project'>,
    onToggleOrigin: noop,
    onToggleFormat: noop,
    onToggleScope: noop,
  };

  it('renders all three origin options', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'CDM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Published' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local' })).toBeInTheDocument();
  });

  it('renders all three format options', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'JSON Schema' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'XSD' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inferred' })).toBeInTheDocument();
  });

  it('renders both scope options', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Global' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Project-Level' })).toBeInTheDocument();
  });

  it('calls onToggleOrigin when origin button clicked', async () => {
    const onToggleOrigin = vi.fn();
    render(<SchemaLibraryFiltersPanel {...defaultProps} onToggleOrigin={onToggleOrigin} />);
    await userEvent.click(screen.getByRole('button', { name: 'CDM' }));
    expect(onToggleOrigin).toHaveBeenCalledWith('cdm');
  });

  it('calls onToggleFormat when format button clicked', async () => {
    const onToggleFormat = vi.fn();
    render(<SchemaLibraryFiltersPanel {...defaultProps} onToggleFormat={onToggleFormat} />);
    await userEvent.click(screen.getByRole('button', { name: 'XSD' }));
    expect(onToggleFormat).toHaveBeenCalledWith('XSD');
  });

  it('calls onToggleScope when scope button clicked', async () => {
    const onToggleScope = vi.fn();
    render(<SchemaLibraryFiltersPanel {...defaultProps} onToggleScope={onToggleScope} />);
    await userEvent.click(screen.getByRole('button', { name: 'Global' }));
    expect(onToggleScope).toHaveBeenCalledWith('global');
  });

  it('active origin button has aria-pressed=true', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} origins={['published']} />);
    expect(screen.getByRole('button', { name: 'Published' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('inactive button has aria-pressed=false', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'CDM' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('active button has filled styling', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} formats={['XSD']} />);
    const btn = screen.getByRole('button', { name: 'XSD' });
    expect(btn.className).toContain('bg-blue-600');
  });

  it('filter groups have aria-label', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    expect(screen.getByRole('group', { name: 'Filter by origin' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by format' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by scope' })).toBeInTheDocument();
  });
});

// ===========================================================================
// SchemaLibrarySortControl
// ===========================================================================

describe('SchemaLibrarySortControl', () => {
  it('renders all four sort field options', () => {
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={vi.fn()} />);
    const select = screen.getByTestId('sort-field-select');
    expect(select).toHaveValue('name');
    expect(screen.getByRole('option', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Field Count' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Last Modified' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Origin' })).toBeInTheDocument();
  });

  it('select shows the current sort field', () => {
    render(<SchemaLibrarySortControl field="fieldCount" direction="asc" onSort={vi.fn()} />);
    expect(screen.getByTestId('sort-field-select')).toHaveValue('fieldCount');
  });

  it('calls onSort with new field when select changes', async () => {
    const onSort = vi.fn();
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={onSort} />);
    await userEvent.selectOptions(screen.getByTestId('sort-field-select'), 'updatedAt');
    expect(onSort).toHaveBeenCalledWith('updatedAt');
  });

  it('direction button shows ↑ for ascending', () => {
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={vi.fn()} />);
    expect(screen.getByTestId('sort-direction-button')).toHaveTextContent('↑');
  });

  it('direction button shows ↓ for descending', () => {
    render(<SchemaLibrarySortControl field="name" direction="desc" onSort={vi.fn()} />);
    expect(screen.getByTestId('sort-direction-button')).toHaveTextContent('↓');
  });

  it('direction button has ascending aria-label', () => {
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={vi.fn()} />);
    expect(screen.getByTestId('sort-direction-button')).toHaveAttribute(
      'aria-label',
      'Sort ascending',
    );
  });

  it('clicking direction button calls onSort with current field (toggling direction)', async () => {
    const onSort = vi.fn();
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={onSort} />);
    await userEvent.click(screen.getByTestId('sort-direction-button'));
    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('has wrapper aria-label="Sort schemas"', () => {
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={vi.fn()} />);
    expect(screen.getByRole('group', { hidden: true })).toBeFalsy; // fallback check
    // The wrapper div has aria-label; verify it's present in DOM
    const wrapper = document.querySelector('[aria-label="Sort schemas"]');
    expect(wrapper).toBeInTheDocument();
  });
});

// ===========================================================================
// ActiveFilterChips
// ===========================================================================

describe('ActiveFilterChips', () => {
  const emptyProps = {
    origins: [] as Array<'cdm' | 'published' | 'local'>,
    formats: [] as Array<'JSON Schema' | 'XSD' | 'Inferred'>,
    scopes: [] as Array<'global' | 'project'>,
    onRemoveOrigin: vi.fn(),
    onRemoveFormat: vi.fn(),
    onRemoveScope: vi.fn(),
    onClearAll: vi.fn(),
  };

  it('renders nothing when no filters are active', () => {
    const { container } = render(<ActiveFilterChips {...emptyProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders chips for active origin filters', () => {
    render(<ActiveFilterChips {...emptyProps} origins={['cdm', 'local']} />);
    const chips = screen.getAllByTestId('filter-chip');
    expect(chips).toHaveLength(2);
  });

  it('renders chips for active format filters', () => {
    render(<ActiveFilterChips {...emptyProps} formats={['XSD']} />);
    expect(screen.getByTestId('filter-chip')).toHaveTextContent('XSD');
  });

  it('renders chips for active scope filters', () => {
    render(<ActiveFilterChips {...emptyProps} scopes={['global']} />);
    expect(screen.getByTestId('filter-chip')).toHaveTextContent('Global');
  });

  it('renders "Project-Level" label for project scope', () => {
    render(<ActiveFilterChips {...emptyProps} scopes={['project']} />);
    expect(screen.getByTestId('filter-chip')).toHaveTextContent('Project-Level');
  });

  it('× button on origin chip calls onRemoveOrigin', async () => {
    const onRemoveOrigin = vi.fn();
    render(<ActiveFilterChips {...emptyProps} origins={['cdm']} onRemoveOrigin={onRemoveOrigin} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Cdm filter' }));
    expect(onRemoveOrigin).toHaveBeenCalledWith('cdm');
  });

  it('× button on format chip calls onRemoveFormat', async () => {
    const onRemoveFormat = vi.fn();
    render(
      <ActiveFilterChips {...emptyProps} formats={['JSON Schema']} onRemoveFormat={onRemoveFormat} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove JSON Schema filter' }));
    expect(onRemoveFormat).toHaveBeenCalledWith('JSON Schema');
  });

  it('× button on scope chip calls onRemoveScope', async () => {
    const onRemoveScope = vi.fn();
    render(
      <ActiveFilterChips {...emptyProps} scopes={['global']} onRemoveScope={onRemoveScope} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove Global filter' }));
    expect(onRemoveScope).toHaveBeenCalledWith('global');
  });

  it('shows Clear all button when filters are active', () => {
    render(<ActiveFilterChips {...emptyProps} origins={['local']} />);
    expect(screen.getByTestId('clear-all-button')).toBeInTheDocument();
  });

  it('Clear all button calls onClearAll', async () => {
    const onClearAll = vi.fn();
    render(<ActiveFilterChips {...emptyProps} origins={['local']} onClearAll={onClearAll} />);
    await userEvent.click(screen.getByTestId('clear-all-button'));
    expect(onClearAll).toHaveBeenCalled();
  });
});

// ===========================================================================
// SchemaLibraryNoResults
// ===========================================================================

describe('SchemaLibraryNoResults', () => {
  it('renders the no-results message', () => {
    render(<SchemaLibraryNoResults onClearFilters={vi.fn()} />);
    expect(screen.getByText(/no schemas match the current filters/i)).toBeInTheDocument();
  });

  it('renders a clear filters button', () => {
    render(<SchemaLibraryNoResults onClearFilters={vi.fn()} />);
    expect(screen.getByTestId('no-results-clear')).toBeInTheDocument();
  });

  it('clear filters button calls onClearFilters', async () => {
    const onClearFilters = vi.fn();
    render(<SchemaLibraryNoResults onClearFilters={onClearFilters} />);
    await userEvent.click(screen.getByTestId('no-results-clear'));
    expect(onClearFilters).toHaveBeenCalled();
  });
});
