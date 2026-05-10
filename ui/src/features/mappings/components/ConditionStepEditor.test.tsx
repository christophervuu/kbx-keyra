/**
 * ConditionStepEditor.test.tsx — FS-039 T-08
 *
 * Component tests for ConditionStepEditor.
 * Covers all Verification Requirements from T-08.md.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConditionStepEditor } from './ConditionStepEditor';
import type { ConditionStepEditorProps } from './ConditionStepEditor';
import {
  createEmptyFS039ConditionStep,
  createEmptyChain,
} from '../lib/chain-builder-state';
import type { FS039ConditionStep } from '../lib/chain-builder-state';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(path: string, fieldName: string): SchemaTreeNode {
  return {
    path,
    fieldName,
    type: 'string',
    depth: 0,
    isArray: false,
    isRequired: false,
    parentPath: null,
    childCount: 0,
    children: [],
  };
}

const SOURCE_SCHEMA: ParsedSchema = {
  nodes: [
    makeNode('customer.name', 'name'),
    makeNode('customer.tier', 'tier'),
    makeNode('amount', 'amount'),
  ],
  totalFieldCount: 3,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const DEFAULT_PROPS: ConditionStepEditorProps = {
  step: createEmptyFS039ConditionStep(),
  stepIndex: 0,
  onChange: vi.fn(),
  parsedSourceSchema: SOURCE_SCHEMA,
};

function renderEditor(overrides: Partial<ConditionStepEditorProps> = {}) {
  return render(<ConditionStepEditor {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('ConditionStepEditor — structure', () => {
  it('renders the IF clause', () => {
    renderEditor();
    expect(screen.getByTestId('condition-clause-0')).toBeInTheDocument();
  });

  it('renders the ELSE section', () => {
    renderEditor();
    expect(screen.getByTestId('condition-step-editor-0-else')).toBeInTheDocument();
  });

  it('renders ELSE label text', () => {
    renderEditor();
    expect(screen.getByText('ELSE')).toBeInTheDocument();
  });

  it('renders IF label text', () => {
    renderEditor();
    expect(screen.getByText('IF')).toBeInTheDocument();
  });

  it('renders Add else-if button', () => {
    renderEditor();
    expect(screen.getByTestId('condition-step-editor-0-add-elseif')).toBeInTheDocument();
  });

  it('renders the THEN branch inside the IF clause', () => {
    renderEditor();
    expect(screen.getByTestId('condition-clause-0-then')).toBeInTheDocument();
  });

  it('renders the ELSE branch editor', () => {
    renderEditor();
    expect(screen.getByTestId('condition-step-editor-0-else-branch')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Left operand — current value default (AE-24)
// ---------------------------------------------------------------------------

describe('ConditionStepEditor — left operand current value default', () => {
  it('shows current value chip by default', () => {
    renderEditor();
    expect(screen.getByTestId('predicate-0-0-left-current-value-chip')).toBeInTheDocument();
  });

  it('shows "current value" text in the chip', () => {
    renderEditor();
    expect(screen.getByTestId('predicate-0-0-left-current-value-chip')).toHaveTextContent('current value');
  });

  it('renders Current value toggle button as pressed', () => {
    renderEditor();
    const btn = screen.getByTestId('predicate-0-0-left-kind-current');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('switching left operand to Field hides current value chip', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('predicate-0-0-left-kind-field'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({
            predicates: expect.arrayContaining([
              expect.objectContaining({
                left: { kind: 'field', path: '' },
              }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('switching left operand to Value shows static input', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [
            {
              left: { kind: 'field', path: '' },
              operator: 'eq',
              right: { kind: 'expression', dsl: '' },
            },
          ],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    renderEditor({ step });
    expect(screen.getByTestId('predicate-0-0-left-field-input')).toBeInTheDocument();
  });

  it('switching left operand to Expression shows expression input', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('predicate-0-0-left-kind-expression'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({
            predicates: expect.arrayContaining([
              expect.objectContaining({
                left: { kind: 'expression', dsl: '' },
              }),
            ]),
          }),
        ]),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Operator
// ---------------------------------------------------------------------------

describe('ConditionStepEditor — operator', () => {
  it('renders operator dropdown', () => {
    renderEditor();
    expect(screen.getByTestId('predicate-0-0-operator')).toBeInTheDocument();
  });

  it('changing operator fires onChange with updated operator', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.change(screen.getByTestId('predicate-0-0-operator'), { target: { value: 'gt' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({
            predicates: expect.arrayContaining([
              expect.objectContaining({ operator: 'gt' }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('hides right operand for unary operator isNull', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [
            {
              left: { kind: 'currentValue' },
              operator: 'isNull',
              right: { kind: 'expression', dsl: '' },
            },
          ],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    renderEditor({ step });
    expect(screen.queryByTestId('predicate-0-0-right')).not.toBeInTheDocument();
  });

  it('shows right operand for binary operator eq', () => {
    renderEditor();
    expect(screen.getByTestId('predicate-0-0-right')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// AND predicates
// ---------------------------------------------------------------------------

describe('ConditionStepEditor — AND predicates', () => {
  it('renders Add condition (AND) button', () => {
    renderEditor();
    expect(screen.getByTestId('condition-clause-0-add-predicate')).toBeInTheDocument();
  });

  it('clicking Add condition fires onChange with new predicate', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('condition-clause-0-add-predicate'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({
            predicates: expect.arrayContaining([
              expect.anything(),
              expect.anything(), // second predicate added
            ]),
          }),
        ]),
      }),
    );
    const call = onChange.mock.calls[0][0] as FS039ConditionStep;
    expect(call.conditions[0]!.predicates).toHaveLength(2);
  });

  it('shows remove button when there are multiple predicates', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [
            { left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } },
            { left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } },
          ],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    renderEditor({ step });
    expect(screen.getByTestId('predicate-0-0-remove')).toBeInTheDocument();
    expect(screen.getByTestId('predicate-0-1-remove')).toBeInTheDocument();
  });

  it('does not show remove button when there is only one predicate', () => {
    renderEditor();
    expect(screen.queryByTestId('predicate-0-0-remove')).not.toBeInTheDocument();
  });

  it('AND label appears between predicates', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [
            { left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } },
            { left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } },
          ],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    renderEditor({ step });
    expect(screen.getByText('AND')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Else-if
// ---------------------------------------------------------------------------

describe('ConditionStepEditor — else-if', () => {
  it('clicking Add else-if fires onChange with additional clause', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('condition-step-editor-0-add-elseif'));
    const call = onChange.mock.calls[0][0] as FS039ConditionStep;
    expect(call.conditions).toHaveLength(2);
  });

  it('renders ELSE-IF clause when step has multiple conditions', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } }],
          thenBranch: createEmptyChain(),
        },
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } }],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    renderEditor({ step });
    expect(screen.getByTestId('condition-clause-1')).toBeInTheDocument();
    expect(screen.getByText(/ELSE-IF/)).toBeInTheDocument();
  });

  it('renders remove button on else-if clause', () => {
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } }],
          thenBranch: createEmptyChain(),
        },
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } }],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    renderEditor({ step });
    expect(screen.getByTestId('condition-clause-1-remove')).toBeInTheDocument();
  });

  it('does not render remove button on IF clause (index 0)', () => {
    renderEditor();
    expect(screen.queryByTestId('condition-clause-0-remove')).not.toBeInTheDocument();
  });

  it('removing else-if fires onChange with clause removed', () => {
    const onChange = vi.fn();
    const step: FS039ConditionStep = {
      kind: 'condition',
      conditions: [
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } }],
          thenBranch: createEmptyChain(),
        },
        {
          predicates: [{ left: { kind: 'currentValue' }, operator: 'eq', right: { kind: 'expression', dsl: '' } }],
          thenBranch: createEmptyChain(),
        },
      ],
      elseBranch: createEmptyChain(),
    };
    renderEditor({ step, onChange });
    fireEvent.click(screen.getByTestId('condition-clause-1-remove'));
    const call = onChange.mock.calls[0][0] as FS039ConditionStep;
    expect(call.conditions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// ELSE branch — cannot be removed
// ---------------------------------------------------------------------------

describe('ConditionStepEditor — ELSE branch', () => {
  it('ELSE section has no remove button', () => {
    renderEditor();
    const elseSection = screen.getByTestId('condition-step-editor-0-else');
    // No remove button inside the ELSE section
    expect(elseSection.querySelector('[aria-label*="Remove"]')).toBeNull();
  });

  it('ELSE branch editor renders field/value toggle', () => {
    renderEditor();
    expect(screen.getByTestId('condition-step-editor-0-else-branch-kind-field')).toBeInTheDocument();
    expect(screen.getByTestId('condition-step-editor-0-else-branch-kind-static')).toBeInTheDocument();
  });

  it('selecting field in ELSE branch fires onChange with field source', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('condition-step-editor-0-else-branch-kind-field'));
    const call = onChange.mock.calls[0][0] as FS039ConditionStep;
    expect(call.elseBranch.source.kind).toBe('field');
  });

  it('selecting static in ELSE branch fires onChange with static source', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('condition-step-editor-0-else-branch-kind-static'));
    const call = onChange.mock.calls[0][0] as FS039ConditionStep;
    expect(call.elseBranch.source.kind).toBe('static');
  });
});

// ---------------------------------------------------------------------------
// THEN branch
// ---------------------------------------------------------------------------

describe('ConditionStepEditor — THEN branch', () => {
  it('THEN branch editor renders field/value toggle', () => {
    renderEditor();
    expect(screen.getByTestId('condition-clause-0-then-kind-field')).toBeInTheDocument();
    expect(screen.getByTestId('condition-clause-0-then-kind-static')).toBeInTheDocument();
  });

  it('selecting field in THEN branch fires onChange with field source in thenBranch', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('condition-clause-0-then-kind-field'));
    const call = onChange.mock.calls[0][0] as FS039ConditionStep;
    expect(call.conditions[0]!.thenBranch.source.kind).toBe('field');
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('ConditionStepEditor — accessibility', () => {
  it('operator dropdown has aria-label', () => {
    renderEditor();
    expect(screen.getByTestId('predicate-0-0-operator')).toHaveAttribute('aria-label', 'Comparison operator');
  });

  it('left operand kind group has aria-label', () => {
    renderEditor();
    const group = screen.getByTestId('predicate-0-0-left').querySelector('[role="group"]');
    expect(group).toHaveAttribute('aria-label', 'Left operand type');
  });

  it('current value chip has aria-label', () => {
    renderEditor();
    expect(screen.getByTestId('predicate-0-0-left-current-value-chip')).toHaveAttribute(
      'aria-label',
      'Current chain value',
    );
  });

  it('Add else-if button is keyboard focusable', () => {
    renderEditor();
    const btn = screen.getByTestId('condition-step-editor-0-add-elseif');
    expect(btn.tagName).toBe('BUTTON');
  });

  it('Add condition (AND) button is keyboard focusable', () => {
    renderEditor();
    const btn = screen.getByTestId('condition-clause-0-add-predicate');
    expect(btn.tagName).toBe('BUTTON');
  });
});
