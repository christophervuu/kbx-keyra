import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SourceFieldPicker } from './SourceFieldPicker';
import { PreviewProvider, usePreviewSetters } from '../context/preview-context';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SCHEMA: ParsedSchema = {
  format: 'json-schema',
  totalFieldCount: 4,
  parseTimeMs: 1,
  inferred: false,
  nodes: [
    {
      path: 'customer',
      fieldName: 'customer',
      type: 'object',
      depth: 0,
      isArray: false,
      isRequired: true,
      parentPath: null,
      childCount: 2,
      children: [
        {
          path: 'customer.name',
          fieldName: 'name',
          type: 'string',
          depth: 1,
          isArray: false,
          isRequired: true,
          parentPath: 'customer',
          childCount: 0,
          children: [],
        },
        {
          path: 'customer.age',
          fieldName: 'age',
          type: 'number',
          depth: 1,
          isArray: false,
          isRequired: false,
          parentPath: 'customer',
          childCount: 0,
          children: [],
        },
      ],
    },
    {
      path: 'orderId',
      fieldName: 'orderId',
      type: 'string',
      depth: 0,
      isArray: false,
      isRequired: true,
      parentPath: null,
      childCount: 0,
      children: [],
    },
  ],
};

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof SourceFieldPicker>> = {},
) {
  const defaults: React.ComponentProps<typeof SourceFieldPicker> = {
    parsedSourceSchema: MOCK_SCHEMA,
    selectedFields: [],
    onFieldSelect: vi.fn(),
    onFieldRemove: vi.fn(),
    staticMode: false,
    onStaticModeChange: vi.fn(),
    staticValue: '',
    staticType: 'string',
    onStaticValueChange: vi.fn(),
    onStaticTypeChange: vi.fn(),
  };
  return render(<SourceFieldPicker {...defaults} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SourceFieldPicker — field selection mode', () => {
  it('renders the search input', () => {
    renderPicker();
    expect(screen.getByRole('combobox', { name: 'Search source fields' })).toBeInTheDocument();
  });

  it('shows suggestions from schema when input is focused', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // Schema has: customer, customer.name, customer.age, orderId
    expect(screen.getByText('customer.name')).toBeInTheDocument();
    expect(screen.getByText('orderId')).toBeInTheDocument();
  });

  it('filters suggestions by typed query', async () => {
    const user = userEvent.setup();
    renderPicker();
    const input = screen.getByRole('combobox', { name: 'Search source fields' });
    await user.type(input, 'name');
    expect(screen.getByText('customer.name')).toBeInTheDocument();
    expect(screen.queryByText('orderId')).not.toBeInTheDocument();
  });

  it('calls onFieldSelect when a suggestion is clicked', async () => {
    const onFieldSelect = vi.fn();
    const user = userEvent.setup();
    renderPicker({ onFieldSelect });
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    await user.click(screen.getByText('orderId'));
    expect(onFieldSelect).toHaveBeenCalledWith('orderId');
  });

  it('renders selected fields as pills', () => {
    renderPicker({ selectedFields: ['customer.name', 'orderId'] });
    const pills = screen.getAllByTestId('field-pill');
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveTextContent('customer.name');
    expect(pills[1]).toHaveTextContent('orderId');
  });

  it('calls onFieldRemove when the × button on a pill is clicked', () => {
    const onFieldRemove = vi.fn();
    renderPicker({
      selectedFields: ['customer.name'],
      onFieldRemove,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove field customer.name' }));
    expect(onFieldRemove).toHaveBeenCalledWith('customer.name');
  });

  it('excludes already-selected fields from suggestions', async () => {
    const user = userEvent.setup();
    renderPicker({ selectedFields: ['orderId'] });
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    // orderId should not appear in suggestions since it's already selected
    const listbox = screen.getByRole('listbox');
    expect(listbox).not.toHaveTextContent('orderId');
  });

  it('renders empty-schema state when parsedSourceSchema is null', () => {
    renderPicker({ parsedSourceSchema: null });
    expect(screen.getByText(/No source schema loaded/i)).toBeInTheDocument();
  });

  it('shows the static value toggle button', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: /Use a static value instead/i })).toBeInTheDocument();
  });

  it('calls onStaticModeChange(true) when static toggle is clicked', () => {
    const onStaticModeChange = vi.fn();
    renderPicker({ onStaticModeChange });
    fireEvent.click(screen.getByRole('button', { name: /Use a static value instead/i }));
    expect(onStaticModeChange).toHaveBeenCalledWith(true);
  });
});

describe('SourceFieldPicker — static value mode', () => {
  it('renders the static value type selector', () => {
    renderPicker({ staticMode: true });
    expect(screen.getByRole('combobox', { name: 'Static value type' })).toBeInTheDocument();
  });

  it('renders the static string value input', () => {
    renderPicker({ staticMode: true, staticType: 'string' });
    expect(screen.getByRole('textbox', { name: 'Static string value' })).toBeInTheDocument();
  });

  it('renders a boolean dropdown for boolean type', () => {
    renderPicker({ staticMode: true, staticType: 'boolean', staticValue: 'true' });
    expect(screen.getByRole('combobox', { name: 'Static boolean value' })).toBeInTheDocument();
  });

  it('shows null description for null type', () => {
    renderPicker({ staticMode: true, staticType: 'null' });
    expect(screen.getByText(/Value will be null/i)).toBeInTheDocument();
  });

  it('calls onStaticValueChange when text value changes', () => {
    const onStaticValueChange = vi.fn();
    renderPicker({ staticMode: true, staticType: 'string', onStaticValueChange });
    fireEvent.change(screen.getByRole('textbox', { name: 'Static string value' }), {
      target: { value: 'hello' },
    });
    expect(onStaticValueChange).toHaveBeenCalledWith('hello');
  });

  it('calls onStaticTypeChange when type selector changes', () => {
    const onStaticTypeChange = vi.fn();
    renderPicker({ staticMode: true, onStaticTypeChange });
    fireEvent.change(screen.getByRole('combobox', { name: 'Static value type' }), {
      target: { value: 'number' },
    });
    expect(onStaticTypeChange).toHaveBeenCalledWith('number');
  });

  it('shows the back-to-source-field toggle in static mode', () => {
    renderPicker({ staticMode: true });
    expect(
      screen.getByRole('button', { name: /Use source field instead/i }),
    ).toBeInTheDocument();
  });

  it('calls onStaticModeChange(false) when back-to-source toggle is clicked', () => {
    const onStaticModeChange = vi.fn();
    renderPicker({ staticMode: true, onStaticModeChange });
    fireEvent.click(screen.getByRole('button', { name: /Use source field instead/i }));
    expect(onStaticModeChange).toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// FS-052 T-02: type badges + test data
// ---------------------------------------------------------------------------

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
  overrides: Partial<React.ComponentProps<typeof SourceFieldPicker>> = {},
  sourceData: unknown | null = null,
) {
  const defaults: React.ComponentProps<typeof SourceFieldPicker> = {
    parsedSourceSchema: MOCK_SCHEMA,
    selectedFields: [],
    onFieldSelect: vi.fn(),
    onFieldRemove: vi.fn(),
    staticMode: false,
    onStaticModeChange: vi.fn(),
    staticValue: '',
    staticType: 'string',
    onStaticValueChange: vi.fn(),
    onStaticTypeChange: vi.fn(),
  };
  return render(
    <PreviewProvider>
      <WithSourceData sourceData={sourceData}>
        <SourceFieldPicker {...defaults} {...overrides} />
      </WithSourceData>
    </PreviewProvider>,
  );
}

describe('SourceFieldPicker — FS-052 T-02 type badges and test data', () => {
  it('renders 3-letter type badge (str) in suggestion dropdown for string fields', async () => {
    const user = userEvent.setup();
    renderPickerWithContext();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    // customer.name is type string → badge code 'str'
    expect(screen.getAllByText('str').length).toBeGreaterThan(0);
  });

  it('renders 3-letter type badge (num) in suggestion dropdown for number fields', async () => {
    const user = userEvent.setup();
    renderPickerWithContext();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    // customer.age is type number → badge code 'num'
    expect(screen.getByText('num')).toBeInTheDocument();
  });

  it('shows resolved test value in dropdown when PreviewContext has sourceData', async () => {
    const user = userEvent.setup();
    renderPickerWithContext({}, { customer: { name: 'Alice', age: 30 }, orderId: 'ORD-1' });
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    // customer.name resolves to "Alice" → displayed as '"Alice"'
    expect(screen.getByText('"Alice"')).toBeInTheDocument();
  });

  it('does not show test data zone when PreviewContext sourceData is null', async () => {
    const user = userEvent.setup();
    renderPickerWithContext({}, null);
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    expect(screen.queryByLabelText(/test value/)).toBeNull();
  });

  it('renders SourceFieldChipBadge (3-letter code) in selected field pills', () => {
    renderPickerWithContext({ selectedFields: ['customer.name'] });
    // customer.name is string → chip badge shows 'str'
    expect(screen.getByText('str')).toBeInTheDocument();
  });
});
