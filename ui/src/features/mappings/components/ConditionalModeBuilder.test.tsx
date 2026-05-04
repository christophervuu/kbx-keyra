import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { ConditionalModeBuilder } from './ConditionalModeBuilder';
import { UnifiedExpressionBuilder } from './UnifiedExpressionBuilder';
import type { ConditionalModeState } from '../lib/expression-builder-state';
import { generateExpressionFromState } from '../lib/pipeline-expression-generator';
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
    { path: 'status', fieldName: 'status', type: 'string', depth: 0, isArray: false, isRequired: true, parentPath: null, childCount: 0, children: [] },
    { path: 'amount', fieldName: 'amount', type: 'number', depth: 0, isArray: false, isRequired: true, parentPath: null, childCount: 0, children: [] },
    { path: 'channel', fieldName: 'channel', type: 'string', depth: 0, isArray: false, isRequired: false, parentPath: null, childCount: 0, children: [] },
    { path: 'priority', fieldName: 'priority', type: 'string', depth: 0, isArray: false, isRequired: false, parentPath: null, childCount: 0, children: [] },
  ],
};

function makeInitialState(): ConditionalModeState {
  return {
    mode: 'conditional',
    condition: {
      operator: 'and',
      conditions: [
        {
          leftOperand: { kind: 'source', value: '' },
          comparison: 'eq',
          rightOperand: { kind: 'static', value: '' },
        },
      ],
    },
    thenBranch: { kind: 'static', value: '' },
    elseBranch: { kind: 'static', value: '' },
  };
}

// Stateful wrapper so controlled component re-renders on state changes
function StatefulConditionalBuilder(
  props: Omit<React.ComponentProps<typeof ConditionalModeBuilder>, 'state' | 'onStateChange'> & {
    initialState?: ConditionalModeState;
    onStateChange?: (s: ConditionalModeState) => void;
  },
) {
  const [state, setState] = useState<ConditionalModeState>(
    props.initialState ?? makeInitialState(),
  );
  const handleChange = (s: ConditionalModeState) => {
    setState(s);
    props.onStateChange?.(s);
  };
  return (
    <ConditionalModeBuilder
      state={state}
      onStateChange={handleChange}
      parsedSourceSchema={props.parsedSourceSchema}
      depth={props.depth}
    />
  );
}

function renderConditional(
  overrides: Partial<React.ComponentProps<typeof StatefulConditionalBuilder>> = {},
) {
  const onStateChange = vi.fn();
  render(
    <StatefulConditionalBuilder
      parsedSourceSchema={MOCK_SCHEMA}
      onStateChange={onStateChange}
      {...overrides}
    />,
  );
  return { onStateChange };
}

function renderBuilder(overrides: Partial<React.ComponentProps<typeof UnifiedExpressionBuilder>> = {}) {
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
// ConditionalModeBuilder structure tests
// ---------------------------------------------------------------------------

describe('ConditionalModeBuilder — structure', () => {
  it('renders IF / THEN / ELSE sections', () => {
    renderConditional();
    expect(screen.getByText('IF')).toBeInTheDocument();
    expect(screen.getByText('THEN')).toBeInTheDocument();
    expect(screen.getByText('ELSE')).toBeInTheDocument();
  });

  it('renders condition row with left operand, operator, right operand', () => {
    renderConditional();
    expect(screen.getByTestId('condition-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('condition-operator-0')).toBeInTheDocument();
    expect(screen.getByTestId('condition-left-0')).toBeInTheDocument();
    expect(screen.getByTestId('condition-right-0')).toBeInTheDocument();
  });

  it('renders then and else branch selectors', () => {
    renderConditional();
    expect(screen.getByTestId('branch-then')).toBeInTheDocument();
    expect(screen.getByTestId('branch-else')).toBeInTheDocument();
  });

  it('renders [+ Add condition] button', () => {
    renderConditional();
    expect(screen.getByTestId('add-condition-btn')).toBeInTheDocument();
  });

  it('renders [+ Add nested group] button', () => {
    renderConditional();
    expect(screen.getByTestId('add-nested-group-btn')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Operator tests
// ---------------------------------------------------------------------------

describe('ConditionalModeBuilder — operators', () => {
  it('isNull operator hides right operand', async () => {
    const user = userEvent.setup();
    renderConditional();
    await user.selectOptions(screen.getByTestId('condition-operator-0'), 'isNull');
    expect(screen.queryByTestId('condition-right-0')).not.toBeInTheDocument();
  });

  it('isNotNull operator hides right operand', async () => {
    const user = userEvent.setup();
    renderConditional();
    await user.selectOptions(screen.getByTestId('condition-operator-0'), 'isNotNull');
    expect(screen.queryByTestId('condition-right-0')).not.toBeInTheDocument();
  });

  it('eq operator shows right operand', () => {
    renderConditional();
    expect(screen.getByTestId('condition-right-0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Compound conditions
// ---------------------------------------------------------------------------

describe('ConditionalModeBuilder — compound conditions', () => {
  it('[+ Add condition] appends a row', async () => {
    const user = userEvent.setup();
    renderConditional();
    await user.click(screen.getByTestId('add-condition-btn'));
    expect(screen.getByTestId('condition-row-1')).toBeInTheDocument();
  });

  it('AND/OR toggle appears when >1 condition', async () => {
    const user = userEvent.setup();
    renderConditional();
    await user.click(screen.getByTestId('add-condition-btn'));
    expect(screen.getByTestId('condition-group-operator-toggle')).toBeInTheDocument();
  });

  it('AND/OR toggle changes group operator', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderConditional();
    await user.click(screen.getByTestId('add-condition-btn'));
    // Click the OR side of the toggle
    await user.click(screen.getByText('ANY (OR)'));
    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0] as ConditionalModeState;
    expect(lastCall.condition.operator).toBe('or');
  });

  it('[+ Add nested group] creates a nested group', async () => {
    const user = userEvent.setup();
    renderConditional();
    await user.click(screen.getByTestId('add-nested-group-btn'));
    expect(screen.getByTestId('condition-group-nested-1')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Branch value selector
// ---------------------------------------------------------------------------

describe('ConditionalModeBuilder — branch value selector', () => {
  it('then branch static input renders', () => {
    renderConditional();
    expect(screen.getByTestId('branch-then-static-input')).toBeInTheDocument();
  });

  it('else branch has Else-if option', () => {
    renderConditional();
    expect(screen.getByTestId('branch-else-kind-elseif')).toBeInTheDocument();
  });

  it('then branch does NOT have Else-if option', () => {
    renderConditional();
    expect(screen.queryByTestId('branch-then-kind-elseif')).not.toBeInTheDocument();
  });

  it('selecting Else-if renders nested conditional builder (AE-05)', async () => {
    const user = userEvent.setup();
    renderConditional();
    await user.click(screen.getByTestId('branch-else-kind-elseif'));
    // Nested conditional builder should appear
    const nestedBuilders = screen.getAllByTestId('conditional-builder');
    expect(nestedBuilders.length).toBeGreaterThan(1);
  });

  it('typing in then static input fires onStateChange with accumulated value', async () => {
    const user = userEvent.setup();
    const { onStateChange } = renderConditional();
    await user.type(screen.getByTestId('branch-then-static-input'), 'Yes');
    const lastCall = onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0] as ConditionalModeState;
    expect((lastCall.thenBranch as { kind: 'static'; value: string }).value).toBe('Yes');
  });
});

// ---------------------------------------------------------------------------
// Else-if depth cap
// ---------------------------------------------------------------------------

describe('ConditionalModeBuilder — else-if depth cap', () => {
  it('shows depth cap message at depth 5', () => {
    renderConditional({ depth: 5 });
    expect(screen.queryByTestId('branch-else-kind-elseif')).not.toBeInTheDocument();
    expect(screen.getByTestId('branch-else-depth-cap')).toBeInTheDocument();
  });

  it('does not show depth cap at depth 4', () => {
    renderConditional({ depth: 4 });
    expect(screen.getByTestId('branch-else-kind-elseif')).toBeInTheDocument();
    expect(screen.queryByTestId('branch-else-depth-cap')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Expression generation (AE-04, AE-05, AE-15)
// ---------------------------------------------------------------------------

describe('ConditionalModeBuilder — expression generation', () => {
  it('AE-04: eq(source("status"), "active") with then="Yes" else="No"', () => {
    const state: ConditionalModeState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'status' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'active' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'Yes' },
      elseBranch: { kind: 'static', value: 'No' },
    };
    const expr = generateExpressionFromState(state);
    expect(expr).toBe('if(eq(source("status"), "active"), "Yes", "No")');
  });

  it('AE-05: nested else-if produces correct DSL', () => {
    const state: ConditionalModeState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'priority' },
            comparison: 'eq',
            rightOperand: { kind: 'static', value: 'high' },
          },
        ],
      },
      thenBranch: { kind: 'static', value: '1' },
      elseBranch: {
        kind: 'conditional',
        value: {
          mode: 'conditional',
          condition: {
            operator: 'and',
            conditions: [
              {
                leftOperand: { kind: 'source', value: 'priority' },
                comparison: 'eq',
                rightOperand: { kind: 'static', value: 'medium' },
              },
            ],
          },
          thenBranch: { kind: 'static', value: '2' },
          elseBranch: { kind: 'static', value: '3' },
        },
      },
    };
    const expr = generateExpressionFromState(state);
    expect(expr).toBe(
      'if(eq(source("priority"), "high"), "1", if(eq(source("priority"), "medium"), "2", "3"))',
    );
  });

  it('AE-15: compound AND with nested OR group', () => {
    const state: ConditionalModeState = {
      mode: 'conditional',
      condition: {
        operator: 'and',
        conditions: [
          {
            leftOperand: { kind: 'source', value: 'amount' },
            comparison: 'gt',
            rightOperand: { kind: 'expression', value: '1000' },
          },
          {
            operator: 'or',
            conditions: [
              {
                leftOperand: { kind: 'source', value: 'channel' },
                comparison: 'eq',
                rightOperand: { kind: 'static', value: 'web' },
              },
              {
                leftOperand: { kind: 'source', value: 'channel' },
                comparison: 'eq',
                rightOperand: { kind: 'static', value: 'mobile' },
              },
            ],
          },
        ],
      },
      thenBranch: { kind: 'static', value: 'approved' },
      elseBranch: { kind: 'static', value: 'pending' },
    };
    const expr = generateExpressionFromState(state);
    expect(expr).toBe(
      'if(and(gt(source("amount"), 1000), or(eq(source("channel"), "web"), eq(source("channel"), "mobile"))), "approved", "pending")',
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: UnifiedExpressionBuilder conditional mode
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — conditional mode integration', () => {
  it('switching to Conditional tab renders ConditionalModeBuilder', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('mode-tab-conditional'));
    expect(screen.getByTestId('conditional-builder')).toBeInTheDocument();
  });

  it('conditional mode section replaces placeholder', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByTestId('mode-tab-conditional'));
    expect(screen.queryByTestId('conditional-mode-placeholder')).not.toBeInTheDocument();
    expect(screen.getByTestId('conditional-mode-section')).toBeInTheDocument();
  });
});
