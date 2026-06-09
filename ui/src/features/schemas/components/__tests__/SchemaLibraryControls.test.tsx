import { render, screen, within } from '@testing-library/react';
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
    ownerships: [] as Array<'cdm' | 'user'>,
    dataFormats: [] as Array<'JSON' | 'XML'>,
    statuses: [] as Array<'ready' | 'processing' | 'needs_review' | 'error'>,
    onToggleOwnership: noop,
    onToggleDataFormat: noop,
    onToggleStatus: noop,
  };

  it('renders ownership options only', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    const ownershipGroup = screen.getByRole('group', { name: 'Filter by ownership' });
    expect(ownershipGroup).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CDM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Global' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Published' })).not.toBeInTheDocument();
  });

  it('renders data format options only', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    const formatGroup = screen.getByRole('group', { name: 'Filter by data format' });
    expect(formatGroup).toBeInTheDocument();
    expect(within(formatGroup).getByRole('button', { name: 'JSON' })).toBeInTheDocument();
    expect(within(formatGroup).getByRole('button', { name: 'XML' })).toBeInTheDocument();
  });

  it('renders status options', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    const statusGroup = screen.getByRole('group', { name: 'Filter by status' });
    expect(statusGroup).toBeInTheDocument();
    expect(within(statusGroup).getByRole('button', { name: 'Ready' })).toBeInTheDocument();
    expect(within(statusGroup).getByRole('button', { name: 'Processing' })).toBeInTheDocument();
    expect(within(statusGroup).getByRole('button', { name: 'Needs review' })).toBeInTheDocument();
    expect(within(statusGroup).getByRole('button', { name: 'Error' })).toBeInTheDocument();
  });

  it('calls onToggleOwnership when ownership button clicked', async () => {
    const onToggleOwnership = vi.fn();
    render(<SchemaLibraryFiltersPanel {...defaultProps} onToggleOwnership={onToggleOwnership} />);
    await userEvent.click(screen.getByRole('button', { name: 'CDM' }));
    expect(onToggleOwnership).toHaveBeenCalledWith('cdm');
  });

  it('calls onToggleDataFormat when format button clicked', async () => {
    const onToggleDataFormat = vi.fn();
    render(<SchemaLibraryFiltersPanel {...defaultProps} onToggleDataFormat={onToggleDataFormat} />);
    await userEvent.click(screen.getByRole('button', { name: 'XML' }));
    expect(onToggleDataFormat).toHaveBeenCalledWith('XML');
  });

  it('calls onToggleStatus when status button clicked', async () => {
    const onToggleStatus = vi.fn();
    render(<SchemaLibraryFiltersPanel {...defaultProps} onToggleStatus={onToggleStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Needs review' }));
    expect(onToggleStatus).toHaveBeenCalledWith('needs_review');
  });

  it('active ownership button has aria-pressed=true', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} ownerships={['user']} />);
    expect(screen.getByRole('button', { name: 'User' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('inactive button has aria-pressed=false', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'CDM' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('active button has filled styling', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} dataFormats={['XML']} />);
    const btn = screen.getByRole('button', { name: 'XML' });
    expect(btn.className).toContain('bg-blue-600');
  });

  it('filter groups have aria-label', () => {
    render(<SchemaLibraryFiltersPanel {...defaultProps} />);
    expect(screen.getByRole('group', { name: 'Filter by ownership' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by data format' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by status' })).toBeInTheDocument();
  });
});

// ===========================================================================
// SchemaLibrarySortControl
// ===========================================================================

describe('SchemaLibrarySortControl', () => {
  it('renders all four sort field options', () => {
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={vi.fn()} />);
    const select = screen.getByTestId('sort-field-select');
    expect(select).toHaveValue('name:asc');
    expect(screen.getByRole('option', { name: 'Name A-Z' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Name Z-A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Status Ready-Error' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Format JSON-XML' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Used by High-Low' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Updated Newest' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Updated Oldest' })).toBeInTheDocument();
  });

  it('select shows the current sort field', () => {
    render(<SchemaLibrarySortControl field="fieldCount" direction="desc" onSort={vi.fn()} />);
    expect(screen.getByTestId('sort-field-select')).toHaveValue('fieldCount:desc');
  });

  it('calls onSort with new field when select changes', async () => {
    const onSort = vi.fn();
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={onSort} />);
    await userEvent.selectOptions(screen.getByTestId('sort-field-select'), 'name:desc');
    expect(onSort).toHaveBeenCalledWith('name', 'desc');
  });

  it('has wrapper aria-label="Sort schemas"', () => {
    render(<SchemaLibrarySortControl field="name" direction="asc" onSort={vi.fn()} />);
    const wrapper = document.querySelector('[aria-label="Sort schemas"]');
    expect(wrapper).toBeInTheDocument();
  });
});

// ===========================================================================
// ActiveFilterChips
// ===========================================================================

describe('ActiveFilterChips', () => {
  const emptyProps = {
    ownerships: [] as Array<'cdm' | 'user'>,
    dataFormats: [] as Array<'JSON' | 'XML'>,
    statuses: [] as Array<'ready' | 'processing' | 'needs_review' | 'error'>,
    onRemoveOwnership: vi.fn(),
    onRemoveDataFormat: vi.fn(),
    onRemoveStatus: vi.fn(),
    onClearAll: vi.fn(),
  };

  it('renders nothing when no filters are active', () => {
    const { container } = render(<ActiveFilterChips {...emptyProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders chips for active ownership filters', () => {
    render(<ActiveFilterChips {...emptyProps} ownerships={['cdm', 'user']} />);
    const chips = screen.getAllByTestId('filter-chip');
    expect(chips).toHaveLength(2);
  });

  it('renders chips for active data format filters', () => {
    render(<ActiveFilterChips {...emptyProps} dataFormats={['XML']} />);
    expect(screen.getByTestId('filter-chip')).toHaveTextContent('XML');
  });

  it('renders chips for active status filters', () => {
    render(<ActiveFilterChips {...emptyProps} statuses={['needs_review']} />);
    expect(screen.getByTestId('filter-chip')).toHaveTextContent('Needs review');
  });

  it('× button on ownership chip calls onRemoveOwnership', async () => {
    const onRemoveOwnership = vi.fn();
    render(<ActiveFilterChips {...emptyProps} ownerships={['cdm']} onRemoveOwnership={onRemoveOwnership} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove CDM filter' }));
    expect(onRemoveOwnership).toHaveBeenCalledWith('cdm');
  });

  it('× button on data format chip calls onRemoveDataFormat', async () => {
    const onRemoveDataFormat = vi.fn();
    render(
      <ActiveFilterChips {...emptyProps} dataFormats={['JSON']} onRemoveDataFormat={onRemoveDataFormat} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove JSON filter' }));
    expect(onRemoveDataFormat).toHaveBeenCalledWith('JSON');
  });

  it('× button on status chip calls onRemoveStatus', async () => {
    const onRemoveStatus = vi.fn();
    render(<ActiveFilterChips {...emptyProps} statuses={['error']} onRemoveStatus={onRemoveStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Error filter' }));
    expect(onRemoveStatus).toHaveBeenCalledWith('error');
  });

  it('shows Clear all button when filters are active', () => {
    render(<ActiveFilterChips {...emptyProps} ownerships={['user']} />);
    expect(screen.getByTestId('clear-all-button')).toBeInTheDocument();
  });

  it('Clear all button calls onClearAll', async () => {
    const onClearAll = vi.fn();
    render(<ActiveFilterChips {...emptyProps} ownerships={['user']} onClearAll={onClearAll} />);
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
