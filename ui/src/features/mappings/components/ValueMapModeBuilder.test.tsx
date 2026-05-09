import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { ValueMapModeBuilder } from './ValueMapModeBuilder';
import { UnifiedExpressionBuilder } from './UnifiedExpressionBuilder';
import { generateExpressionFromState } from '../lib/pipeline-expression-generator';
import type { ValueMapModeState } from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SCHEMA: ParsedSchema = {
  format: 'json-schema',
  totalFieldCount: 3,
  parseTimeMs: 1,
  inferred: false,
  nodes: [
    { path: 'country', fieldName: 'country', type: 'string', depth: 0, isArray: false, isRequired: true, parentPath: null, childCount: 0, children: [] },
    { path: 'status', fieldName: 'status', type: 'string', depth: 0, isArray: false, isRequired: true, parentPath: null, childCount: 0, children: [] },
    { path: 'code', fieldName: 'code', type: 'string', depth: 0, isArray: false, isRequired: false, parentPath: null, childCount: 0, children: [] },
  ],
};

function makeEmptyState(): ValueMapModeState {
  return {
    mode: 'valueMap',
    inputSource: '',
    mappings: [],
    fallback: { kind: 'null' },
  };
}

// Stateful wrapper
function StatefulValueMapBuilder(
  props: Omit<React.ComponentProps<typeof ValueMapModeBuilder>, 'state' | 'onStateChange'> & {
    initialState?: ValueMapModeState;
    onStateChange?: (s: ValueMapModeState) => void;
  },
) {
  const [state, setState] = useState<ValueMapModeState>(props.initialState ?? makeEmptyState());
  const handleChange = (s: ValueMapModeState) => {
    setState(s);
    props.onStateChange?.(s);
  };
  return (
    <ValueMapModeBuilder
      state={state}
      onStateChange={handleChange}
      parsedSourceSchema={props.parsedSourceSchema}
    />
  );
}

function renderBuilder(
  overrides: Partial<React.ComponentProps<typeof StatefulValueMapBuilder>> = {},
) {
  const onStateChange = vi.fn();
  render(
    <StatefulValueMapBuilder
      parsedSourceSchema={MOCK_SCHEMA}
      onStateChange={onStateChange}
      {...overrides}
    />,
  );
  return { onStateChange };
}

function renderUnified(
  overrides: Partial<React.ComponentProps<typeof UnifiedExpressionBuilder>> = {},
) {
  const onExpressionChange = vi.fn();
  const defaults: React.ComponentProps<typeof UnifiedExpressionBuilder> = {
    expression: '',
    onExpressionChange,
    onApply: vi.fn(),
    selectedTargetPath: 'target.field',
    parsedSourceSchema: MOCK_SCHEMA,
  };
  render(<UnifiedExpressionBuilder {...defaults} {...overrides} />);
  return { onExpressionChange };
}

// ---------------------------------------------------------------------------
// Structure tests
// ---------------------------------------------------------------------------

describe('ValueMapModeBuilder — structure', () => {
  it('renders the builder container', () => {
    renderBuilder();
    expect(screen.getByTestId('value-map-builder')).toBeInTheDocument();
  });

  it('renders source picker', () => {
    renderBuilder();
    expect(screen.getByTestId('value-map-source-picker')).toBeInTheDocument();
  });

  it('renders empty state when no rows', () => {
    renderBuilder();
    expect(screen.getByTestId('value-map-empty-state')).toBeInTheDocument();
  });

  it('renders [+ Add row] button', () => {
    renderBuilder();
    expect(screen.getByTestId('value-map-add-row-btn')).toBeInTheDocument();
  });

  it('renders fallback null radio selected by default', () => {
    renderBuilder();
    const nullRadio = screen.getByTestId('value-map-fallback-null') as HTMLInputElement;
    expect(nullRadio.checked).toBe(true);
  });

  it('does not render fallback text input when null selected', () => {
    renderBuilder();
    expect(screen.queryByTestId('value-map-fallback-input')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Source picker tests
// ---------------------------------------------------------------------------

describe('ValueMapModeBuilder — source picker', () => {
  it('shows search input when no source selected', () => {
    renderBuilder();
    expect(screen.getByTestId('value-map-source-search')).toBeInTheDocument();
  });

  it('selecting a source field shows it as a chip', async () => {
    const user = userEvent.setup();
    renderBuilder();
    const search = screen.getByTestId('value-map-source-search');
    await user.click(search);
    await user.click(screen.getByText('country'));
    expect(screen.queryByTestId('value-map-source-search')).not.toBeInTheDocument();
    expect(screen.getByText('country')).toBeInTheDocument();
  });

  it('clearing the source field restores search input', async () => {
    const user = userEvent.setup();
    renderBuilder({ initialState: { ...makeEmptyState(), inputSource: 'country' } });
    await user.click(screen.getByTestId('value-map-source-clear'));
    expect(screen.getByTestId('value-map-source-search')).toBeInTheDocument();
  });

  it('fires onStateChange with selected source path', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderBuilder();
    await user.click(screen.getByTestId('value-map-source-search'));
    await user.click(screen.getByText('country'));
    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0] as ValueMapModeState;
    expect(lastCall.inputSource).toBe('country');
  });
});

// ---------------------------------------------------------------------------
// Mapping table tests
// ---------------------------------------------------------------------------

describe('ValueMapModeBuilder — mapping table', () => {
  it('[+ Add row] appends an empty row', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('value-map-add-row-btn'));
    expect(screen.getByTestId('value-map-row-0')).toBeInTheDocument();
    expect(screen.queryByTestId('value-map-empty-state')).not.toBeInTheDocument();
  });

  it('adding two rows shows row-0 and row-1', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('value-map-add-row-btn'));
    await user.click(screen.getByTestId('value-map-add-row-btn'));
    expect(screen.getByTestId('value-map-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('value-map-row-1')).toBeInTheDocument();
  });

  it('typing in when/to inputs fires onStateChange', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderBuilder();
    await user.click(screen.getByTestId('value-map-add-row-btn'));
    await user.type(screen.getByTestId('value-map-when-0'), 'US');
    await user.type(screen.getByTestId('value-map-to-0'), 'United States');
    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0] as ValueMapModeState;
    expect(lastCall.mappings[0].whenValue).toBe('US');
    expect(lastCall.mappings[0].mapTo).toBe('United States');
  });

  it('row output type can be switched to boolean', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderBuilder();
    await user.click(screen.getByTestId('value-map-add-row-btn'));
    await user.selectOptions(screen.getByTestId('value-map-to-type-0'), 'boolean');

    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0] as ValueMapModeState;
    expect(lastCall.mappings[0]).toMatchObject({ mapToType: 'boolean', mapTo: 'true' });
  });

  it('removing a row removes it from state', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderBuilder({
      initialState: {
        ...makeEmptyState(),
        mappings: [
          { whenValue: 'US', mapTo: 'United States' },
          { whenValue: 'GB', mapTo: 'United Kingdom' },
        ],
      },
    });
    await user.click(screen.getByTestId('value-map-remove-row-0'));
    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0] as ValueMapModeState;
    expect(lastCall.mappings).toHaveLength(1);
    expect(lastCall.mappings[0].whenValue).toBe('GB');
  });

  it('removing last row shows empty state', async () => {
    const user = userEvent.setup();
    renderBuilder({
      initialState: {
        ...makeEmptyState(),
        mappings: [{ whenValue: 'US', mapTo: 'United States' }],
      },
    });
    await user.click(screen.getByTestId('value-map-remove-row-0'));
    expect(screen.getByTestId('value-map-empty-state')).toBeInTheDocument();
  });

  it('pre-populated rows render correctly', () => {
    renderBuilder({
      initialState: {
        ...makeEmptyState(),
        mappings: [
          { whenValue: 'US', mapTo: 'United States' },
          { whenValue: 'GB', mapTo: 'United Kingdom' },
        ],
      },
    });
    expect(screen.getByTestId('value-map-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('value-map-row-1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('US')).toBeInTheDocument();
    expect(screen.getByDisplayValue('United States')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fallback tests
// ---------------------------------------------------------------------------

describe('ValueMapModeBuilder — fallback', () => {
  it('switching to "Return specific value" shows text input', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('value-map-fallback-value-radio'));
    expect(screen.getByTestId('value-map-fallback-input')).toBeInTheDocument();
  });

  it('typing fallback value fires onStateChange', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderBuilder();
    await user.click(screen.getByTestId('value-map-fallback-value-radio'));
    await user.type(screen.getByTestId('value-map-fallback-input'), 'Unknown');
    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0] as ValueMapModeState;
    expect(lastCall.fallback.kind).toBe('value');
    expect((lastCall.fallback as { kind: 'value'; value?: string }).value).toBe('Unknown');
  });

  it('fallback value type can be switched to boolean', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderBuilder();
    await user.click(screen.getByTestId('value-map-fallback-value-radio'));
    await user.selectOptions(screen.getByTestId('value-map-fallback-type'), 'boolean');

    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0] as ValueMapModeState;
    expect(lastCall.fallback).toMatchObject({ kind: 'value', valueType: 'boolean', value: 'true' });
  });

  it('switching back to null hides text input', async () => {
    const user = userEvent.setup();
    renderBuilder({ initialState: { ...makeEmptyState(), fallback: { kind: 'value', value: 'x' } } });
    await user.click(screen.getByTestId('value-map-fallback-null'));
    expect(screen.queryByTestId('value-map-fallback-input')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Expression generation (AE-06)
// ---------------------------------------------------------------------------

describe('ValueMapModeBuilder — expression generation', () => {
  it('AE-06: country mapping with fallback "Unknown"', () => {
    const state: ValueMapModeState = {
      mode: 'valueMap',
      inputSource: 'country',
      mappings: [
        { whenValue: 'US', mapTo: 'United States' },
        { whenValue: 'GB', mapTo: 'United Kingdom' },
      ],
      fallback: { kind: 'value', value: 'Unknown' },
    };
    const expr = generateExpressionFromState(state);
    expect(expr).toBe(
      'valueMap(source("country"), {"US": "United States", "GB": "United Kingdom"}, "Unknown")',
    );
  });

  it('fallback null produces null as third argument', () => {
    const state: ValueMapModeState = {
      mode: 'valueMap',
      inputSource: 'country',
      mappings: [{ whenValue: 'US', mapTo: 'United States' }],
      fallback: { kind: 'null' },
    };
    const expr = generateExpressionFromState(state);
    expect(expr).toBe('valueMap(source("country"), {"US": "United States"}, null)');
  });

  it('empty whenValue rows are skipped in expression', () => {
    const state: ValueMapModeState = {
      mode: 'valueMap',
      inputSource: 'country',
      mappings: [
        { whenValue: 'US', mapTo: 'United States' },
        { whenValue: '', mapTo: 'incomplete' },
      ],
      fallback: { kind: 'null' },
    };
    const expr = generateExpressionFromState(state);
    expect(expr).toBe('valueMap(source("country"), {"US": "United States"}, null)');
  });

  it('empty inputSource returns empty string', () => {
    const state: ValueMapModeState = {
      mode: 'valueMap',
      inputSource: '',
      mappings: [],
      fallback: { kind: 'null' },
    };
    const expr = generateExpressionFromState(state);
    expect(expr).toBe('');
  });

  it('boolean row outputs and fallback generate unquoted booleans', () => {
    const state: ValueMapModeState = {
      mode: 'valueMap',
      inputSource: 'notes',
      mappings: [
        { whenValue: '', mapTo: 'false', mapToType: 'boolean' },
        { whenValue: 'present', mapTo: 'true', mapToType: 'boolean' },
      ],
      fallback: { kind: 'value', value: 'false', valueType: 'boolean' },
    };

    const expr = generateExpressionFromState(state);
    expect(expr).toBe('valueMap(source("notes"), {"present": true}, false)');
  });
});

// ---------------------------------------------------------------------------
// Integration: UnifiedExpressionBuilder value map mode
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — value map mode integration', () => {
  it('switching to Value Map tab renders ValueMapModeBuilder', async () => {
    const user = userEvent.setup();
    renderUnified();
    await user.click(screen.getByTestId('mode-tab-valueMap'));
    expect(screen.getByTestId('value-map-builder')).toBeInTheDocument();
  });

  it('value map mode section replaces placeholder', async () => {
    const user = userEvent.setup();
    renderUnified();
    await user.click(screen.getByTestId('mode-tab-valueMap'));
    expect(screen.queryByTestId('value-map-mode-placeholder')).not.toBeInTheDocument();
    expect(screen.getByTestId('value-map-mode-section')).toBeInTheDocument();
  });
});
