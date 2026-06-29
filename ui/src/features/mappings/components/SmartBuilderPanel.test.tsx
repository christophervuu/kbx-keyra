import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SmartBuilderPanel } from './SmartBuilderPanel';
import { createEmptySmartBuilderDraft } from '../lib/smart-builder-state';

const valueMapProjectUiStateFixture = {
  scope: 'project' as const,
  tableId: 'vt-1',
  direction: 'a_to_b' as const,
  pinnedRevision: 2,
  currentRevision: 3,
  newerRevisionAvailable: true,
  selectedTableName: 'Status Codes',
  noMatchMode: 'fallback_value' as const,
  fallbackValue: 'UNKNOWN',
  availableTables: [
    {
      tableId: 'vt-1',
      label: 'Status Codes',
      revision: 3,
      status: 'active' as const,
      usageCount: 4,
      rowCount: 12,
    },
  ],
  directionOptions: [
    {
      direction: 'a_to_b' as const,
      label: 'A → B',
      enabled: true,
    },
    {
      direction: 'b_to_a' as const,
      label: 'B → A',
      enabled: false,
      reason: 'Unavailable: duplicate input keys on Side B.',
    },
  ],
};

describe('SmartBuilderPanel', () => {
  it('AE-01: renders focused empty start guidance and hides Build Output until started', () => {
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'customer.fullName',
      targetType: 'string',
      isRequired: false,
    });

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-builder-panel')).toBeInTheDocument();
    expect(screen.getByTestId('smart-builder-empty-state')).toHaveTextContent('No inputs selected yet.');
    expect(screen.getByTestId('smart-builder-empty-state')).toHaveTextContent('Select a field from Input Fields or add another value.');
    expect(screen.getByTestId('smart-empty-use-fixed-value')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-empty-use-constant')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-builder-empty-advanced-note')).toHaveTextContent('More complex logic can be created in Advanced DSL.');
    expect(screen.getByTestId('smart-input-tray-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-mapping-recipe')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-add-input-toggle')).toBeInTheDocument();
    expect(screen.queryByText('Smart Builder')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Base$/)).not.toBeInTheDocument();
  });

  it('shows Build Output once at least one input starts a recipe', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.firstName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'customer.firstName',
          path: 'customer.firstName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.firstName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-mapping-recipe')).toBeInTheDocument();
    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Use one value');
  });

  it('hides Build Output and returns to initial start state when inputs are removed', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.firstName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.firstName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-mapping-recipe')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-builder-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('smart-input-tray-empty')).toBeInTheDocument();
  });

  it('passes computed input usage metadata to tray rows for conditional drafts', () => {
    const base = createEmptySmartBuilderDraft({
      targetPath: 'customer.priorityLabel',
      targetType: 'string',
      isRequired: false,
    });

    const draft = {
      ...base,
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'input-1' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: 'HIGH' },
          }],
          thenOutput: { kind: 'input' as const, inputId: 'input-1' },
        }],
        elseOutput: { kind: 'static' as const, value: 'normal' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.priorityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-input-tray-usage-input-1')).toHaveTextContent('Used 2×');
  });

  it('shows undo button when smart draft has snapshot history and routes undo action', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'name',
          path: 'name',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      undoHistory: [
        {
          recipeStatus: { status: 'valid' as const },
          expression: 'source("name")',
          validExpression: 'source("name")',
          lastValidExpression: 'source("name")',
        },
      ],
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.name"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-undo-change'));
    expect(onApplyAction).toHaveBeenCalledWith('base.undo');
  });

  it('renders complex-expression banner for non-decomposable hydration and allows advanced entry', () => {
    const onEnterAdvancedMode = vi.fn();
    render(
      <SmartBuilderPanel
        targetPath="customer.matchFlag"
        targetType="string"
        hydration={{ kind: 'advanced', expression: 'if(...)', reason: 'complex-expression' }}
        onEnterAdvancedMode={onEnterAdvancedMode}
      />,
    );

    expect(screen.getByTestId('smart-builder-complex-banner')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay in Editor' }));
    expect(onEnterAdvancedMode).toHaveBeenCalled();
  });

  it('AE-16: complex banner try-builder action routes to advanced mode entry', () => {
    const onEnterAdvancedMode = vi.fn();
    render(
      <SmartBuilderPanel
        targetPath="customer.matchFlag"
        targetType="string"
        hydration={{ kind: 'advanced', expression: 'if(...)', reason: 'complex-expression' }}
        onEnterAdvancedMode={onEnterAdvancedMode}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try Builder anyway' }));
    expect(onEnterAdvancedMode).toHaveBeenCalled();
  });

  it('opens final-transformation picker and launches parameter editor for round', () => {
    const onApplyAction = vi.fn();
    const onBeginActionParameterEdit = vi.fn();
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'order.total',
      targetType: 'number',
      isRequired: false,
    });

    const hydrated = {
      kind: 'guided' as const,
      draft: {
        ...draft,
        inputs: [
          {
            id: 'input-1',
            sourceKind: 'primary' as const,
            label: 'subtotal',
            path: 'subtotal',
            valueType: 'number' as const,
            transforms: [],
          },
          {
            id: 'input-2',
            sourceKind: 'primary' as const,
            label: 'tax',
            path: 'tax',
            valueType: 'number' as const,
            transforms: [],
          },
        ],
        composition: {
          kind: 'math' as const,
          startInputId: 'input-1',
          operations: [{ operator: 'add' as const, inputId: 'input-2' }],
        },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="order.total"
        targetType="number"
        hydration={hydrated}
        onApplyAction={onApplyAction}
        onBeginActionParameterEdit={onBeginActionParameterEdit}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-add-step'));
    expect(screen.getByText('Add final transformation')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('smart-picker-action-number.round'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('number.round');
    expect(onApplyAction).not.toHaveBeenCalled();
  });

  it('routes fixed/constant quick actions to recipe-local base actions and stages enrichment/expression', () => {
    const onApplyAction = vi.fn();
    const onStageField = vi.fn();
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'customer.code',
      targetType: 'string',
      isRequired: false,
    });

    render(
      <SmartBuilderPanel
        targetPath="customer.code"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
        onStageField={onStageField}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-add-input-toggle'));
    fireEvent.click(screen.getByTestId('smart-add-static'));
    fireEvent.click(screen.getByTestId('smart-add-constant'));
    fireEvent.click(screen.getByTestId('smart-add-enrichment'));
    fireEvent.click(screen.getByTestId('smart-add-expression'));

    expect(onApplyAction).toHaveBeenCalledWith('base.fixed', { fixedValue: '' });
    expect(onApplyAction).toHaveBeenCalledWith('base.constant', { constantName: 'DEFAULT_CONSTANT' });
    expect(onStageField).toHaveBeenCalledWith(expect.objectContaining({ kind: 'enrichment' }));
    expect(onStageField).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expression' }));
  });

  it('renders editable fixed value input for base.fixed composition', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.code',
        targetType: 'string',
        isRequired: false,
      }),
      composition: {
        kind: 'direct' as const,
        inputId: 'fixed-input',
        value: { kind: 'static' as const, value: 'USD' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.code"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    expect(screen.getByTestId('smart-fixed-value-section')).toBeInTheDocument();
    const input = screen.getByTestId('smart-fixed-value-input');
    expect(input).toHaveValue('USD');

    fireEvent.change(input, { target: { value: 'CAD' } });
    expect(onApplyAction).toHaveBeenCalledWith('base.fixed', { fixedValue: 'CAD' });
  });

  it('AE-05: renders direct value selector and updates selected value deterministically', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'lastName',
          path: 'lastName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    expect(screen.getByTestId('smart-direct-value-section')).toBeInTheDocument();
    const optionA = screen.getByTestId('smart-direct-value-option-a');
    const optionB = screen.getByTestId('smart-direct-value-option-b');
    expect(optionA).toHaveAttribute('aria-checked', 'true');
    expect(optionB).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(optionB);
    expect(onApplyAction).toHaveBeenCalledWith('base.direct.select', { directInputId: 'b' });
  });

  it('AE-34: hides item/parent quick actions outside array scope', () => {
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'customer.code',
      targetType: 'string',
      isRequired: false,
    });

    render(
      <SmartBuilderPanel
        targetPath="customer.code"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-add-input-toggle'));
    expect(screen.queryByTestId('smart-add-item')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-add-parent')).not.toBeInTheDocument();
  });

  it('AE-24: enables item/parent quick actions in array scope and emits staged fields', () => {
    const onStageField = vi.fn();
    const onInputToggle = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.items',
        targetType: 'array',
        isRequired: false,
      }),
      inputs: [{
        id: 'i1',
        sourceKind: 'item' as const,
        label: 'Array item',
        path: 'value',
        valueType: 'string' as const,
        transforms: [],
      }],
    };

    render(
      <SmartBuilderPanel
        targetPath="order.items"
        targetType="array"
        hydration={{ kind: 'guided', draft }}
        onStageField={onStageField}
        onInputToggle={onInputToggle}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-add-input-toggle'));
    expect(screen.getByTestId('smart-add-item')).not.toBeDisabled();
    expect(screen.getByTestId('smart-add-parent')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('smart-add-item'));
    fireEvent.click(screen.getByTestId('smart-add-parent'));

    expect(onInputToggle).toHaveBeenCalledWith(expect.objectContaining({ sourceKind: 'item' }));
    expect(onStageField).toHaveBeenCalledWith(expect.objectContaining({ kind: 'parent' }));
  });

  it('AE-35: shows deterministic array-builder handoff and calls callback when array actions are enabled', () => {
    const onRequestArrayBuilderHandoff = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.items',
        targetType: 'array',
        isRequired: false,
      }),
      inputs: [{
        id: 'i1',
        sourceKind: 'item' as const,
        label: 'Array item',
        path: 'value',
        valueType: 'string' as const,
        transforms: [],
      }],
    };

    render(
      <SmartBuilderPanel
        targetPath="order.items"
        targetType="array"
        hydration={{ kind: 'guided', draft }}
        onRequestArrayBuilderHandoff={onRequestArrayBuilderHandoff}
      />,
    );

    expect(screen.getByTestId('smart-array-handoff')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('smart-array-handoff-open'));
    expect(onRequestArrayBuilderHandoff).toHaveBeenCalled();
  });

  it('does not show array handoff when no array handoff actions are available', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [{
        id: 's-1',
        sourceKind: 'primary' as const,
        label: 'name',
        path: 'name',
        valueType: 'string' as const,
        transforms: [],
      }],
      composition: { kind: 'direct' as const, inputId: 's-1' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.name"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-array-handoff')).not.toBeInTheDocument();
  });

  it('hides duplicate preview line for direct mapping', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.issuedDate',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'issuedOn',
          path: 'issuedOn',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.issuedDate"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Use one value');
    expect(screen.queryByTestId('smart-recipe-base-preview')).not.toBeInTheDocument();
  });

  it('renders mapping recipe section with explicit concat parts controls when concat is active', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'lastName',
          path: 'lastName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'concat' as const,
        inputIds: ['a', 'b'],
        parts: [
          { kind: 'input' as const, inputId: 'a' },
          { kind: 'static' as const, value: ' ' },
          { kind: 'input' as const, inputId: 'b' },
        ],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    expect(screen.getByTestId('smart-mapping-recipe')).toBeInTheDocument();
    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Combine values');
    expect(screen.getByTestId('smart-recipe-base-preview')).toHaveTextContent('firstName + [space] + lastName');
    expect(screen.getByTestId('smart-concat-parts-controls')).toBeInTheDocument();
    expect(screen.getByTestId('smart-concat-parts-list')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-concat-move-up-2'));
    expect(onApplyAction).toHaveBeenCalledWith('text.concat', { concatMove: { fromIndex: 2, toIndex: 1 } });

    fireEvent.click(screen.getByTestId('smart-concat-part-menu-toggle-1'));
    fireEvent.click(screen.getByTestId('smart-concat-part-menu-remove-1'));
    expect(onApplyAction).toHaveBeenCalledWith('text.concat', {
      concatParts: [
        { kind: 'input', inputId: 'a' },
        { kind: 'input', inputId: 'b' },
      ],
    });

    fireEvent.click(screen.getByTestId('smart-concat-add-literal-comma'));
    expect(onApplyAction).toHaveBeenCalledWith('text.concat', {
      concatParts: [
        { kind: 'input', inputId: 'a' },
        { kind: 'static', value: ' ' },
        { kind: 'input', inputId: 'b' },
        { kind: 'static', value: ', ' },
      ],
    });

    fireEvent.click(screen.getByTestId('smart-concat-add-input-a'));
    expect(onApplyAction).toHaveBeenCalledWith('text.concat', {
      concatParts: [
        { kind: 'input', inputId: 'a' },
        { kind: 'static', value: ' ' },
        { kind: 'input', inputId: 'b' },
        { kind: 'input', inputId: 'a' },
      ],
    });
  });

  it('AE-11: renders explicit coalesce ordered values controls and fallback interactions', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.displayName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'preferredName',
          path: 'preferredName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'legalName',
          path: 'legalName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'coalesce' as const,
        inputIds: ['a', 'b'],
        values: [
          { kind: 'input' as const, inputId: 'a' },
          { kind: 'input' as const, inputId: 'b' },
        ],
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.displayName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Use first available');
    expect(screen.getByTestId('smart-coalesce-values-controls')).toBeInTheDocument();
    expect(screen.getByTestId('smart-coalesce-values-list')).toBeInTheDocument();

    const buildOutput = screen.getByTestId('smart-mapping-recipe');
    const coalesceControls = screen.getByTestId('smart-coalesce-values-controls');
    expect(within(buildOutput).getByTestId('smart-coalesce-values-controls')).toBe(coalesceControls);

    fireEvent.click(screen.getByTestId('smart-coalesce-move-down-0'));
    expect(onApplyAction).toHaveBeenCalledWith('null.coalesce', { coalesceMove: { fromIndex: 0, toIndex: 1 } });

    fireEvent.click(screen.getByTestId('smart-coalesce-remove-value-1'));
    expect(onApplyAction).toHaveBeenCalledWith('null.coalesce', {
      coalesceValues: [
        { kind: 'input', inputId: 'a' },
      ],
    });

    fireEvent.click(screen.getByTestId('smart-coalesce-add-input-b'));
    expect(onApplyAction).toHaveBeenCalledWith('null.coalesce', {
      coalesceValues: [
        { kind: 'input', inputId: 'a' },
        { kind: 'input', inputId: 'b' },
        { kind: 'input', inputId: 'b' },
      ],
    });

    fireEvent.change(screen.getByTestId('smart-coalesce-fallback-input'), { target: { value: 'N/A' } });
    expect(onApplyAction).toHaveBeenCalledWith('null.coalesce', { coalesceFallbackValue: 'N/A' });

    fireEvent.click(screen.getByTestId('smart-coalesce-fallback-clear'));
    expect(onApplyAction).toHaveBeenCalledWith('null.coalesce', { clearCoalesceFallback: true });
  });

  it('AE-19/AE-20: renders value-map scope controls, inline editor, and project selection callbacks', () => {
    const onValueMapProjectTableSelect = vi.fn();
    const onValueMapDirectionSelect = vi.fn();
    const onValueMapNoMatchModeChange = vi.fn();
    const onValueMapFallbackValueChange = vi.fn();
    const onValueMapAdoptLatestRevision = vi.fn();

    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'statusCode',
          path: 'statusCode',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'valueMap' as const,
        inputId: 'input-1',
        scope: 'project' as const,
        project: null,
        mappings: [{ whenValue: 'A', output: { kind: 'static' as const, value: 'Alpha' } }],
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
        noMatchBehavior: { mode: 'fallback_value' as const, fallbackValue: 'UNKNOWN' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.statusLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        valueMapProjectState={valueMapProjectUiStateFixture}
        onValueMapProjectTableSelect={onValueMapProjectTableSelect}
        onValueMapDirectionSelect={onValueMapDirectionSelect}
        onValueMapNoMatchModeChange={onValueMapNoMatchModeChange}
        onValueMapFallbackValueChange={onValueMapFallbackValueChange}
        onValueMapAdoptLatestRevision={onValueMapAdoptLatestRevision}
      />,
    );

    expect(screen.getByTestId('smart-value-map-config')).toBeInTheDocument();
    expect(screen.getByTestId('smart-value-map-scope-inline')).toBeInTheDocument();
    expect(screen.getByTestId('smart-value-map-scope-project')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('smart-value-map-table-select'), { target: { value: 'vt-1' } });
    expect(onValueMapProjectTableSelect).toHaveBeenCalledWith('vt-1');

    fireEvent.click(screen.getByTestId('smart-value-map-direction-a_to_b'));
    expect(onValueMapDirectionSelect).toHaveBeenCalledWith('a_to_b');

    expect(screen.getByTestId('smart-value-map-direction-b_to_a')).toBeDisabled();
    fireEvent.change(screen.getByTestId('smart-value-map-no-match-mode'), { target: { value: 'return_null' } });
    expect(onValueMapNoMatchModeChange).toHaveBeenCalledWith('return_null');

    fireEvent.change(screen.getByTestId('smart-value-map-fallback-input'), { target: { value: 'N/A' } });
    expect(onValueMapFallbackValueChange).toHaveBeenCalledWith('N/A');

    fireEvent.click(screen.getByTestId('smart-value-map-adopt-latest'));
    expect(onValueMapAdoptLatestRevision).toHaveBeenCalled();

    expect(screen.queryByTestId('smart-value-map-metadata')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-input-transforms-removed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-value-map-scope-inline'));
  });

  it('renders explicit value-map lookup selector and applies selected lookup input', () => {
    const onApplyAction = vi.fn();

    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'statusCode',
          path: 'statusCode',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'input-2',
          sourceKind: 'primary' as const,
          label: 'alternateStatusCode',
          path: 'alternateStatusCode',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'valueMap' as const,
        inputId: 'input-1',
        scope: 'project' as const,
        project: {
          ref: {
            scope: 'project' as const,
            valueTableId: 'vt-1',
            tableKey: 'status_codes',
            revision: 2,
            inputSideKey: 'code',
            outputSideKey: 'label',
          },
        },
        mappings: [],
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
        noMatchBehavior: { mode: 'fallback_value' as const, fallbackValue: 'UNKNOWN' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.statusLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        valueMapProjectState={valueMapProjectUiStateFixture}
        onApplyAction={onApplyAction}
      />,
    );

    expect(screen.getByTestId('smart-value-map-lookup-selector')).toBeInTheDocument();
    expect(screen.getByText('Used as lookup value')).toBeInTheDocument();
    expect(screen.getByTestId('smart-value-map-lookup-current')).toHaveTextContent('Current lookup: statusCode');

    const current = screen.getByTestId('smart-value-map-lookup-option-input-1');
    const alternate = screen.getByTestId('smart-value-map-lookup-option-input-2');
    expect(current).toHaveAttribute('aria-checked', 'true');
    expect(alternate).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(alternate);
    expect(onApplyAction).toHaveBeenCalledWith('lookup.valueMap', {
      directInputId: 'input-2',
      valueMapScope: 'project',
      valueMapProjectSelection: {
        ref: {
          scope: 'project',
          valueTableId: 'vt-1',
          tableKey: 'status_codes',
          revision: 2,
          inputSideKey: 'code',
          outputSideKey: 'label',
        },
      },
      valueMapNoMatchMode: 'fallback_value',
      valueMapFallbackValue: 'UNKNOWN',
    });
  });

  it('AE-32: supports inline row editing without conversion CTA', () => {
    const onValueMapInlineMappingAdd = vi.fn();
    const onValueMapInlineMappingUpdate = vi.fn();
    const onValueMapInlineMappingRemove = vi.fn();

    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'statusCode',
          path: 'statusCode',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'valueMap' as const,
        inputId: 'input-1',
        scope: 'inline' as const,
        project: null,
        mappings: [{ whenValue: 'A', output: { kind: 'static' as const, value: 'Alpha' } }],
        fallback: { kind: 'static' as const, value: '' },
        noMatchBehavior: { mode: 'fallback_value' as const, fallbackValue: '' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.statusLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        valueMapProjectState={{
          ...valueMapProjectUiStateFixture,
          scope: 'inline',
          tableId: null,
          direction: null,
          newerRevisionAvailable: false,
        }}
        onValueMapInlineMappingAdd={onValueMapInlineMappingAdd}
        onValueMapInlineMappingUpdate={onValueMapInlineMappingUpdate}
        onValueMapInlineMappingRemove={onValueMapInlineMappingRemove}
      />,
    );

    expect(screen.getByTestId('smart-value-map-inline-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-value-map-convert-to-project')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-value-map-inline-add'));
    expect(onValueMapInlineMappingAdd).toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('smart-value-map-inline-when-0'), { target: { value: 'B' } });
    expect(onValueMapInlineMappingUpdate).toHaveBeenCalledWith(0, { whenValue: 'B' });

    fireEvent.change(screen.getByTestId('smart-value-map-inline-output-0'), { target: { value: 'Beta' } });
    expect(onValueMapInlineMappingUpdate).toHaveBeenCalledWith(0, { outputValue: 'Beta' });

    fireEvent.click(screen.getByTestId('smart-value-map-inline-remove-0'));
    expect(onValueMapInlineMappingRemove).toHaveBeenCalledWith(0);

  });

  it('re-shows value-step and output-step sections immediately when switching off value map method', () => {
    const baseDraft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'statusCode',
          path: 'statusCode',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
    };

    const valueMapDraft = {
      ...baseDraft,
      composition: {
        kind: 'valueMap' as const,
        inputId: 'input-1',
        scope: 'project' as const,
        project: null,
        mappings: [{ whenValue: 'A', output: { kind: 'static' as const, value: 'Alpha' } }],
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
        noMatchBehavior: { mode: 'fallback_value' as const, fallbackValue: 'UNKNOWN' },
      },
    };

    const directDraft = {
      ...baseDraft,
      composition: { kind: 'direct' as const, inputId: 'input-1' },
    };

    const { rerender } = render(
      <SmartBuilderPanel
        targetPath="customer.statusLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft: valueMapDraft }}
        valueMapProjectState={valueMapProjectUiStateFixture}
      />,
    );

    expect(screen.queryByTestId('smart-direct-value-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();

    rerender(
      <SmartBuilderPanel
        targetPath="customer.statusLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft: directDraft }}
      />,
    );

    expect(screen.getByTestId('smart-direct-value-section')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-direct-value-add-step')).toBeInTheDocument();
    expect(screen.getByTestId('smart-action-live-region')).toBeInTheDocument();
  });

  it('keeps inline when-value input focused while typing', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.statusLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'statusCode',
          path: 'statusCode',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'valueMap' as const,
        inputId: 'input-1',
        scope: 'inline' as const,
        project: null,
        mappings: [{ whenValue: 'A', output: { kind: 'static' as const, value: 'Alpha' } }],
        fallback: { kind: 'static' as const, value: '' },
        noMatchBehavior: { mode: 'fallback_value' as const, fallbackValue: '' },
      },
    };

    const { rerender } = render(
      <SmartBuilderPanel
        targetPath="customer.statusLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        valueMapProjectState={{
          ...valueMapProjectUiStateFixture,
          scope: 'inline',
          tableId: null,
          direction: null,
          newerRevisionAvailable: false,
        }}
      />,
    );

    const whenInput = screen.getByTestId('smart-value-map-inline-when-0') as HTMLInputElement;
    whenInput.focus();
    expect(document.activeElement).toBe(whenInput);

    const nextDraft = {
      ...draft,
      composition: {
        ...draft.composition,
        mappings: [{ whenValue: 'AB', output: { kind: 'static' as const, value: 'Alpha' } }],
      },
    };

    rerender(
      <SmartBuilderPanel
        targetPath="customer.statusLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft: nextDraft }}
        valueMapProjectState={{
          ...valueMapProjectUiStateFixture,
          scope: 'inline',
          tableId: null,
          direction: null,
          newerRevisionAvailable: false,
        }}
      />,
    );

    expect(screen.getByTestId('smart-value-map-inline-when-0')).toHaveFocus();
  });

  it('shows mapping method section once at least one input exists', () => {
    const oneInputDraft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft: oneInputDraft }}
      />,
    );

    expect(screen.getByTestId('smart-mapping-recipe')).toBeInTheDocument();
  });

  it('shows mapping-method chooser by default for string multi-input trays', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'lastName',
          path: 'lastName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: null,
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Needs action');
    expect(screen.getByText('Logic')).toBeInTheDocument();
    expect(screen.getByTestId('smart-base-needs-action')).toBeInTheDocument();
    expect(screen.getByTestId('smart-base-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-change-base')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-direct-value-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-unused-input-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-unused-input-combine')).not.toBeInTheDocument();
  });

  it('keeps unused-input notice hidden for numeric needs-action trays', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: null,
    };

    render(
      <SmartBuilderPanel
        targetPath="order.total"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-unused-input-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-unused-input-combine')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-base-needs-action')).toBeInTheDocument();
    expect(screen.getByTestId('smart-base-picker')).toBeInTheDocument();
  });

  it('emphasizes Build Output change affordance when extra tray values are available', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'lastName',
          path: 'lastName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />, 
    );

    expect(screen.getByTestId('smart-unused-input-notice')).toHaveTextContent('available input not used by current output logic');
    expect(screen.getByTestId('smart-unused-input-change-logic')).toHaveTextContent('Change logic');
    expect(screen.queryByText('Choose a mapping method')).not.toBeInTheDocument();
  });

  it('hides output-step section when mapping method needs action', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: null,
    };

    render(
      <SmartBuilderPanel
        targetPath="order.total"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-add-step')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-step-picker')).not.toBeInTheDocument();
  });

  it('shows substring and convert type actions in direct transformation picker', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.emailDomain',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'email',
          path: 'email',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.emailDomain"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-direct-value-add-step'));

    expect(screen.getByTestId('smart-picker-action-text.substring')).toBeInTheDocument();
    expect(screen.getByTestId('smart-picker-action-convert.cast')).toBeInTheDocument();
  });

  it('surfaces input-transform unavailable rows in direct transformation picker when pending draft is invalid', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.emailDomain',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'email',
          path: 'email',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'text.substring',
        values: {},
        validation: {
          isValid: false,
          issues: [{ fieldId: 'start', code: 'missing' as const, message: 'Start index is required.' }],
        },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.emailDomain"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-direct-value-add-step'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'substring' } });

    expect(screen.getByTestId('smart-picker-disabled-text.substring')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-text.substring')).not.toBeInTheDocument();
  });

  it('does not render legacy standalone fallback section for direct mapping', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.emailDomain',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'email',
          path: 'email',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.emailDomain"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-missing-value-section')).not.toBeInTheDocument();
    expect(screen.queryByText('Fallback')).not.toBeInTheDocument();
  });

  it('routes null.default from direct transformation add flow into parameter-edit mode', () => {
    const onBeginActionParameterEdit = vi.fn();
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.emailDomain',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'email',
          path: 'email',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.emailDomain"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onBeginActionParameterEdit={onBeginActionParameterEdit}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-direct-value-add-step'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'default' } });
    fireEvent.click(screen.getByTestId('smart-picker-action-null.default'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('null.default');
    expect(onApplyAction).not.toHaveBeenCalled();
  });

  it('applies pending null.default parameter draft without standalone fallback section', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'name',
          path: 'name',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'null.default',
        values: {
          fallbackMode: 'fixed',
          fallbackFixedString: 'N/A',
        },
        validation: { isValid: true, issues: [] },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.name"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-parameter-apply'));

    expect(onApplyAction).toHaveBeenCalledWith('null.default', undefined);
  });

  it('renders guided null.default fallback editor modes in result-step flow', () => {
    const onUpdateActionParameterDraft = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'payment.currency',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'currency',
          sourceKind: 'primary' as const,
          label: 'payment.currency',
          path: 'payment.currency',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'currency' },
      pendingActionDraft: {
        actionId: 'null.default',
        values: {
          fallbackMode: 'fixed',
          fallbackFixedString: 'USD',
        },
        validation: { isValid: true, issues: [] },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="payment.currency"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onUpdateActionParameterDraft={onUpdateActionParameterDraft}
      />,
    );

    expect(screen.getByTestId('smart-null-default-parameter-fields')).toBeInTheDocument();
    expect(screen.getByTestId('smart-null-default-fixed-string')).toHaveValue('USD');

    fireEvent.click(screen.getByTestId('smart-null-default-mode-input'));
    expect(onUpdateActionParameterDraft).toHaveBeenCalledWith('null.default', 'fallbackMode', 'input');

    fireEvent.change(screen.getByTestId('smart-null-default-fixed-string'), { target: { value: 'CAD' } });
    expect(onUpdateActionParameterDraft).toHaveBeenCalledWith('null.default', 'fallbackFixedString', 'CAD');
  });

  it('shows formatDate in add-value-step picker and not in output-step picker', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.issuedDate',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'issuedOn',
          path: 'issuedOn',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.issuedDate"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-recipe-add-step')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-direct-value-add-step'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'format' } });
    expect(screen.getByText('Add transformation')).toBeInTheDocument();
    expect(screen.getByTestId('smart-picker-action-date.format')).toBeInTheDocument();
  });

  it('opens parameter editor for date.format from value-step picker', () => {
    const onBeginActionParameterEdit = vi.fn();
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.issuedDate',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'issuedOn',
          path: 'issuedOn',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.issuedDate"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onBeginActionParameterEdit={onBeginActionParameterEdit}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-direct-value-add-step'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'format' } });
    fireEvent.click(screen.getByTestId('smart-picker-action-date.format'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('date.format');
    expect(onApplyAction).not.toHaveBeenCalled();
  });

  it('keeps Add Value Step anchored under selected concat input part and applies trim as value-step', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'firstName',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'lastName',
          sourceKind: 'primary' as const,
          label: 'lastName',
          path: 'lastName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'concat' as const,
        inputIds: ['firstName', 'lastName'],
        parts: [
          { kind: 'input' as const, inputId: 'firstName' },
          { kind: 'static' as const, value: ' ' },
          { kind: 'input' as const, inputId: 'lastName' },
        ],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-add-step'));
    expect(screen.getByText('Add final transformation')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-concat-part-menu-toggle-0'));
    fireEvent.click(screen.getByTestId('smart-concat-part-menu-add-step-0'));

    const firstNamePart = screen.getByTestId('smart-concat-part-0');
    expect(within(firstNamePart).getByText('Add transformation')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'trim' } });
    fireEvent.click(screen.getByTestId('smart-picker-action-text.trim'));

    expect(onApplyAction).toHaveBeenCalledWith('text.trim', {
      editingStepScope: 'value-step',
      valueStepTarget: { kind: 'concat-part', partIndex: 0 },
    });
  });

  it('renders parameter editor with field validation and blocked apply when invalid', () => {
    const onApplyAction = vi.fn();
    const onUpdateActionParameterDraft = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.emailDomain',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'email',
          path: 'email',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'text.substring',
        values: {},
        validation: {
          isValid: false,
          issues: [{ fieldId: 'start', code: 'missing' as const, message: 'Start index is required.' }],
        },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.emailDomain"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
        onUpdateActionParameterDraft={onUpdateActionParameterDraft}
      />,
    );

    expect(screen.getByTestId('smart-parameter-editor')).toBeInTheDocument();
    expect(screen.getByTestId('smart-parameter-error-start')).toHaveTextContent('Start index is required.');
    expect(screen.getByTestId('smart-parameter-apply')).toBeDisabled();

    fireEvent.change(screen.getByTestId('smart-parameter-input-start'), { target: { value: '2' } });
    expect(onUpdateActionParameterDraft).toHaveBeenCalledWith('text.substring', 'start', '2');

    fireEvent.click(screen.getByTestId('smart-parameter-apply'));
    expect(onApplyAction).not.toHaveBeenCalled();
  });

  it('allows re-editing applied parameterized step with hydrated values', () => {
    const onBeginActionParameterEdit = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.emailDomain',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'email',
          path: 'email',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'direct' as const,
        inputId: 'a',
        value: {
          kind: 'input' as const,
          inputId: 'a',
          transforms: [{
            functionName: 'substring',
            args: [
              { kind: 'static' as const, value: 1 },
              { kind: 'static' as const, value: 4 },
            ],
          }],
        },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.emailDomain"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onBeginActionParameterEdit={onBeginActionParameterEdit}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-direct-value-step-edit-0'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('text.substring', { start: 1, length: 4 });
  });

  it('hydrates formatDate value step re-edit values for input and output format', () => {
    const onBeginActionParameterEdit = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.issuedDate',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'issuedOn',
          path: 'issuedOn',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'direct' as const,
        inputId: 'a',
        value: {
          kind: 'input' as const,
          inputId: 'a',
          transforms: [{
            functionName: 'formatDate',
            args: [
              { kind: 'static' as const, value: 'YYYY/MM/DD' },
              { kind: 'static' as const, value: 'YYYY-MM-DD' },
            ],
          }],
        },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.issuedDate"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onBeginActionParameterEdit={onBeginActionParameterEdit}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-direct-value-step-edit-0'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('date.format', {
      inputFormat: 'YYYY/MM/DD',
      outputFormat: 'YYYY-MM-DD',
    });
  });

  it('renders date.format as a single suggestable input and still allows custom typed values', () => {
    const onUpdateActionParameterDraft = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.issuedDate',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'issuedOn',
          path: 'issuedOn',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'date.format',
        values: {
          inputFormat: 'ISO8601',
          outputFormat: 'YYYY-MM-DD',
        },
        validation: { isValid: true, issues: [] },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.issuedDate"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onUpdateActionParameterDraft={onUpdateActionParameterDraft}
      />,
    );

    const inputFormatInput = screen.getByTestId('smart-parameter-input-inputFormat');
    fireEvent.focus(inputFormatInput);

    expect(screen.getByTestId('smart-parameter-dropdown-inputFormat')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('smart-parameter-option-inputFormat-YYYY/MM/DD'));
    expect(onUpdateActionParameterDraft).toHaveBeenCalledWith('date.format', 'inputFormat', 'YYYY/MM/DD');

    const outputFormatInput = screen.getByTestId('smart-parameter-input-outputFormat');
    fireEvent.change(outputFormatInput, {
      target: { value: 'DD-MMM-YYYY' },
    });
    expect(onUpdateActionParameterDraft).toHaveBeenCalledWith('date.format', 'outputFormat', 'DD-MMM-YYYY');
  });

  it('closes custom parameter dropdown on Escape', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.issuedDate',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'issuedOn',
          path: 'issuedOn',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
      pendingActionDraft: {
        actionId: 'date.format',
        values: {
          inputFormat: 'ISO8601',
          outputFormat: 'YYYY-MM-DD',
        },
        validation: { isValid: true, issues: [] },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.issuedDate"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    const inputFormatInput = screen.getByTestId('smart-parameter-input-inputFormat');
    fireEvent.focus(inputFormatInput);
    expect(screen.getByTestId('smart-parameter-dropdown-inputFormat')).toBeInTheDocument();

    fireEvent.keyDown(inputFormatInput, { key: 'Escape' });
    expect(screen.queryByTestId('smart-parameter-dropdown-inputFormat')).not.toBeInTheDocument();
  });

  it('renders calculation method label, ordered preview, and formula rows', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'discount',
          sourceKind: 'primary' as const,
          label: 'discount',
          path: 'discount',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [
          { operator: 'add' as const, inputId: 'tax' },
          { operator: 'subtract' as const, inputId: 'discount' },
        ],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Calculation');
    expect(screen.getByTestId('smart-recipe-change-base')).toHaveTextContent('Change logic');
    expect(screen.getByTestId('smart-recipe-base-preview')).toHaveTextContent('subtotal + tax - discount');
    expect(screen.getByTestId('smart-calculation-editor')).toBeInTheDocument();
    expect(screen.getByText('Formula')).toBeInTheDocument();
  });

  it('shows only output-step actions in add-output-step picker (not mapping methods)', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'a',
        operations: [{ operator: 'add' as const, inputId: 'b' }],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="order.total"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-add-step'));

    expect(screen.queryByTestId('smart-picker-action-number.add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-number.subtract')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-condition.if')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-text.upper')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-picker-action-convert.cast')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'round' } });
    expect(screen.getByTestId('smart-picker-action-number.round')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'default' } });
    expect(screen.getByTestId('smart-picker-action-null.default')).toBeInTheDocument();
  });
  it('shows compatibility-first Change logic options with unavailable options in secondary disclosure', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="order.total"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-change-base'));

    expect(screen.queryByTestId('smart-picker-action-base.direct')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-base.constant')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-picker-action-lookup.valueMap')).toHaveTextContent('Value Mapping');
    expect(screen.getByTestId('smart-picker-action-condition.compare')).toHaveTextContent('Conditional');
    expect(screen.getByTestId('smart-picker-action-base.calculation')).toHaveTextContent('Calculate');

    const unavailable = screen.getByTestId('smart-base-picker-unavailable');
    fireEvent.click(within(unavailable).getByText('Unavailable options'));
    expect(screen.getByTestId('smart-picker-disabled-base.direct')).toHaveTextContent('Use one value');
    expect(screen.queryByTestId('smart-picker-disabled-lookup.valueMap')).not.toBeInTheDocument();

    expect(screen.queryByTestId('smart-picker-search')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-number.add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-number.subtract')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-advanced.expression')).not.toBeInTheDocument();
  });

  it('renders Choose output logic above Selected value in direct-value mode', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.fullName',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'a',
          sourceKind: 'primary' as const,
          label: 'firstName',
          path: 'firstName',
          valueType: 'string' as const,
          transforms: [],
        },
        {
          id: 'b',
          sourceKind: 'primary' as const,
          label: 'lastName',
          path: 'lastName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-change-base'));

    const picker = screen.getByTestId('smart-base-picker');
    const selectedValue = screen.getByTestId('smart-direct-value-section');
    const pickerPosition = picker.compareDocumentPosition(selectedValue);

    expect(pickerPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows divide-by-zero warning for literal zero denominator in calculation rows', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'zero',
          sourceKind: 'static' as const,
          label: '0',
          staticValue: 0,
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'divide' as const, operand: { kind: 'static' as const, value: 0 } }],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-calculation-divide-by-zero-warning')).toBeInTheDocument();
  });

  it('renders unused numeric input actions for adding new formula terms', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'fee',
          sourceKind: 'primary' as const,
          label: 'fee',
          path: 'fee',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'add' as const, inputId: 'tax' }],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-unused-input-subtract-fee'));
    expect(onApplyAction).toHaveBeenCalledWith('number.subtract', { calculationInputId: 'fee' });
  });

  it('shows formula above output steps for calculation methods', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'divide' as const, inputId: 'tax' }],
      },
      postSteps: [{ functionName: 'round', args: [{ kind: 'static' as const, value: 2 }] }],
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    const formula = screen.getByTestId('smart-calculation-editor');
    const steps = screen.getByTestId('smart-recipe-steps');
    const pos = formula.compareDocumentPosition(steps);
    expect((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect(screen.getByText('Final transformations')).toBeInTheDocument();
    expect(screen.getByTestId('smart-recipe-add-step')).toHaveTextContent('+ Add transformation');
    expect(screen.getByTestId('smart-recipe-steps-list')).toHaveTextContent('round');
  });

  it('does not render Final transformations section for direct mapping', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.name',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'name',
          sourceKind: 'primary' as const,
          label: 'name',
          path: 'name',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'name' },
      postSteps: [],
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.name"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-add-step')).not.toBeInTheDocument();
    expect(screen.queryByText('Final transformations')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-direct-value-add-step')).toHaveTextContent('+ Add transformation');
  });

  it('renders legacy direct postSteps in selected-value transformations for compatibility', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: { kind: 'direct' as const, inputId: 'subtotal' },
      postSteps: [{ functionName: 'round', args: [{ kind: 'static' as const, value: 2 }] }],
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-direct-value-steps-list')).toHaveTextContent('round');
  });

  it('supports Final transformations step reorder and remove controls', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'order.total',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'add' as const, inputId: 'tax' }],
      },
      postSteps: [
        { functionName: 'round' as const, args: [{ kind: 'static' as const, value: 2 }] },
        { functionName: 'abs' as const },
      ],
    };

    render(
      <SmartBuilderPanel
        targetPath="order.total"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-step-move-down-0'));
    expect(onApplyAction).toHaveBeenCalledWith('base.resultStep.move', {
      outputStepMove: { fromIndex: 0, toIndex: 1 },
    });

    fireEvent.click(screen.getByTestId('smart-recipe-step-move-up-1'));
    expect(onApplyAction).toHaveBeenCalledWith('base.resultStep.move', {
      outputStepMove: { fromIndex: 1, toIndex: 0 },
    });

    fireEvent.click(screen.getByTestId('smart-recipe-step-remove-1'));
    expect(onApplyAction).toHaveBeenCalledWith('base.resultStep.remove', {
      outputStepRemoveIndex: 1,
    });
  });

  it('hydrates round direct-value step edit values and decimals parameter field', () => {
    const onBeginActionParameterEdit = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'direct' as const,
        inputId: 'subtotal',
        value: {
          kind: 'input' as const,
          inputId: 'subtotal',
          transforms: [{ functionName: 'round', args: [{ kind: 'static' as const, value: 2 }] }],
        },
      },
      postSteps: [],
      pendingActionDraft: {
        actionId: 'number.round',
        values: { decimals: 2 },
        validation: { isValid: true, issues: [] },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
        onBeginActionParameterEdit={onBeginActionParameterEdit}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-direct-value-step-edit-0'));
    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('number.round', { decimals: 2 });

    expect(screen.getByTestId('smart-parameter-field-decimals')).toBeInTheDocument();
    expect(screen.getByTestId('smart-parameter-input-decimals')).toHaveValue(2);
  });

  it('AE-13/AE-14/AE-17: renders direct IF/THEN/OTHERWISE conditional editor and removes slot-fill controls', () => {
    const onConditionFocusedSlotChange = vi.fn();
    const onUpdateConditionComposition = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'input-1' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: 'HIGH' },
          }, {
            left: { kind: 'input' as const, inputId: 'input-1' },
            operator: 'neq' as const,
            right: { kind: 'static' as const, value: 'LOW' },
          }],
          thenOutput: { kind: 'static' as const, value: 'MATCH' },
        }],
        elseOutput: { kind: 'static' as const, value: 'OTHERWISE' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.priorityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onConditionFocusedSlotChange={onConditionFocusedSlotChange}
        onUpdateConditionComposition={onUpdateConditionComposition}
      />,
    );

    expect(screen.getByTestId('smart-condition-editor')).toBeInTheDocument();
    expect(screen.getByTestId('smart-condition-match-mode-select')).toBeInTheDocument();
    expect(screen.getByTestId('smart-condition-then')).toBeInTheDocument();
    expect(screen.getByTestId('smart-condition-otherwise')).toBeInTheDocument();
    expect(screen.queryByTestId('condition-slot-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('condition-slot-right')).not.toBeInTheDocument();
    expect(screen.queryByTestId('condition-slot-then')).not.toBeInTheDocument();
    expect(screen.queryByTestId('condition-slot-else')).not.toBeInTheDocument();
    expect(screen.queryByTestId('condition-focus-clear')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-condition-left-0'));
    fireEvent.click(screen.getByTestId('smart-condition-right-0'));
    fireEvent.click(screen.getByTestId('smart-condition-then'));
    fireEvent.click(screen.getByTestId('smart-condition-otherwise'));

    expect(onConditionFocusedSlotChange).toHaveBeenCalledWith('condition:left');
    expect(onConditionFocusedSlotChange).toHaveBeenCalledWith('condition:right');
    expect(onConditionFocusedSlotChange).toHaveBeenCalledWith('condition:then');
    expect(onConditionFocusedSlotChange).toHaveBeenCalledWith('condition:else');

    fireEvent.change(screen.getByTestId('smart-condition-match-mode-select'), { target: { value: 'any' } });
    expect(onUpdateConditionComposition).toHaveBeenCalledWith(expect.objectContaining({ matchMode: 'any' }));

    fireEvent.change(screen.getByTestId('smart-condition-operator-0'), { target: { value: 'isNull' } });
    expect(onUpdateConditionComposition).toHaveBeenCalledWith(expect.objectContaining({
      clauses: [expect.objectContaining({ predicates: expect.arrayContaining([expect.objectContaining({ operator: 'isNull' })]) })],
    }));

    expect(onUpdateConditionComposition).toHaveBeenCalledWith(expect.objectContaining({
      clauses: [expect.objectContaining({ predicates: expect.arrayContaining([expect.objectContaining({ operator: 'eq' })]) })],
    }));
  });

  it('returns focus to previous recipe slot button when contextual slot focus clears', async () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityLabel',
        targetType: 'string',
        isRequired: false,
      }),
      focusedSlotId: 'condition:left',
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'input-1' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: 'HIGH' },
          }],
          thenOutput: { kind: 'static' as const, value: 'MATCH' },
        }],
        elseOutput: { kind: 'static' as const, value: 'OTHERWISE' },
      },
    };

    const { rerender } = render(
      <SmartBuilderPanel
        targetPath="customer.priorityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    const leftButton = screen.getByTestId('smart-condition-left-0');

    rerender(
      <SmartBuilderPanel
        targetPath="customer.priorityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft: { ...draft, focusedSlotId: null } }}
      />,
    );

    await waitFor(() => {
      expect(leftButton).toHaveFocus();
    });
  });

  // Legacy fallback-action focus restoration removed with standalone fallback section.

  it('shows match mode only when there are at least two conditions', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.flag',
        targetType: 'boolean',
        isRequired: false,
      }),
      inputs: [{
        id: 'flag',
        sourceKind: 'primary' as const,
        label: 'flag',
        path: 'flag',
        valueType: 'boolean' as const,
        transforms: [],
      }],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'flag' },
            operator: 'isTruthy' as const,
          }],
          thenOutput: { kind: 'static' as const, value: 'Y' },
        }],
        elseOutput: { kind: 'static' as const, value: 'N' },
      },
    };

    const { rerender } = render(
      <SmartBuilderPanel
        targetPath="target.flag"
        targetType="boolean"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-condition-match-mode-select')).not.toBeInTheDocument();

    const withTwoConditions = {
      ...draft,
      composition: {
        ...draft.composition,
        clauses: [{
          ...draft.composition.clauses[0],
          predicates: [
            ...(draft.composition.clauses[0]?.predicates ?? []),
            {
              left: { kind: 'input' as const, inputId: 'flag' },
              operator: 'isFalsy' as const,
            },
          ],
        }],
      },
    };

    rerender(
      <SmartBuilderPanel
        targetPath="target.flag"
        targetType="boolean"
        hydration={{ kind: 'guided', draft: withTwoConditions }}
      />,
    );

    expect(screen.getByTestId('smart-condition-match-mode-select')).toBeInTheDocument();
  });

  it('filters condition operators by left type and shows compatibility diagnostics for invalid comparisons', () => {
    const onConditionFocusedSlotChange = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'left-number',
          sourceKind: 'primary' as const,
          label: 'requestedQuantity',
          path: 'requestedQuantity',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'right-string',
          sourceKind: 'enrichment' as const,
          label: 'availableQuantityText',
          path: 'availableQuantityText',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'left-number' },
            operator: 'gt' as const,
            right: { kind: 'input' as const, inputId: 'right-string' },
          }],
          thenOutput: { kind: 'static' as const, value: 'MATCH' },
        }],
        elseOutput: { kind: 'static' as const, value: 'OTHERWISE' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.priorityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onConditionFocusedSlotChange={onConditionFocusedSlotChange}
      />,
    );

    const operator = screen.getByTestId('smart-condition-operator-0') as HTMLSelectElement;
    const optionValues = Array.from(operator.options).map((option) => option.value);

    expect(optionValues).toContain('gt');
    expect(optionValues).toContain('lte');
    expect(optionValues).not.toContain('contains');
    expect(screen.getByTestId('smart-condition-compatibility-errors')).toHaveTextContent('requires numeric left and comparison values');

    fireEvent.click(screen.getByTestId('smart-condition-transform-affordance'));
    expect(onConditionFocusedSlotChange).toHaveBeenCalledWith('condition:left');
  });

  it('shows type-aware fixed right-side editors for number, boolean, and string predicates', () => {
    const makeDraft = (leftType: 'number' | 'boolean' | 'string') => ({
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.value',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'left',
          sourceKind: 'primary' as const,
          label: 'leftField',
          path: 'leftField',
          valueType: leftType,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'left' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: '' },
          }],
          thenOutput: { kind: 'static' as const, value: 'Y' },
        }],
        elseOutput: { kind: 'static' as const, value: 'N' },
      },
    });

    const { rerender } = render(
      <SmartBuilderPanel
        targetPath="target.value"
        targetType="string"
        hydration={{ kind: 'guided', draft: makeDraft('number') }}
      />,
    );
    fireEvent.click(screen.getByTestId('smart-condition-right-0'));
    expect(screen.getByTestId('smart-condition-picker-fixed-number-right-0')).toBeInTheDocument();

    rerender(
      <SmartBuilderPanel
        targetPath="target.value"
        targetType="string"
        hydration={{ kind: 'guided', draft: makeDraft('boolean') }}
      />,
    );
    fireEvent.click(screen.getByTestId('smart-condition-right-0'));
    expect(screen.getByTestId('smart-condition-picker-fixed-boolean-right-0')).toBeInTheDocument();

    rerender(
      <SmartBuilderPanel
        targetPath="target.value"
        targetType="string"
        hydration={{ kind: 'guided', draft: makeDraft('string') }}
      />,
    );
    fireEvent.click(screen.getByTestId('smart-condition-right-0'));
    expect(screen.getByTestId('smart-condition-picker-fixed-string-right-0')).toBeInTheDocument();
  });

  it('uses shared inline picker for THEN and OTHERWISE and collapses on done', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.priorityLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'input-1',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'input-1' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: 'HIGH' },
          }],
          thenOutput: { kind: 'static' as const, value: 'MATCH' },
        }],
        elseOutput: { kind: 'static' as const, value: 'OTHERWISE' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.priorityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-condition-then'));
    expect(screen.getByTestId('smart-condition-picker-then')).toBeInTheDocument();
    expect(screen.getByTestId('smart-condition-picker-mode-fixed-then')).toBeInTheDocument();
    expect(screen.getByTestId('smart-condition-picker-mode-input-then')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-condition-picker-mode-value-map-then')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-condition-picker-done-then'));
    expect(screen.queryByTestId('smart-condition-picker-then')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-condition-otherwise'));
    expect(screen.getByTestId('smart-condition-picker-otherwise')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('smart-condition-picker-mode-input-otherwise'));
    expect(screen.getByTestId('smart-condition-picker-input-browse-otherwise')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('smart-condition-picker-done-otherwise'));
    expect(screen.queryByTestId('smart-condition-picker-otherwise')).not.toBeInTheDocument();
  });

  it('renders conditional value selectors without duplicate usage-transform controls', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.value',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'left',
          sourceKind: 'primary' as const,
          label: 'priority',
          path: 'priority',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'left' },
            operator: 'eq' as const,
            right: { kind: 'static' as const, value: 'HIGH' },
          }],
          thenOutput: { kind: 'input' as const, inputId: 'left' },
        }],
        elseOutput: { kind: 'input' as const, inputId: 'left' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="target.value"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.queryByTestId('smart-condition-left-transform-summary-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-condition-right-transform-summary-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-condition-then-transform-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-condition-otherwise-transform-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-condition-left-transform-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-condition-right-transform-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-condition-then-transform')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-condition-otherwise-transform')).not.toBeInTheDocument();

    expect(screen.getByTestId('smart-condition-then')).toBeInTheDocument();
    expect(screen.getByTestId('smart-condition-otherwise')).toBeInTheDocument();
  });

  it('renders compact conditional ready status text', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.availabilityLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'requested',
          sourceKind: 'primary' as const,
          label: 'requestedQuantity',
          path: 'requestedQuantity',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'available',
          sourceKind: 'enrichment' as const,
          label: 'inventory.availableQuantity',
          externalName: 'inventory',
          path: 'availableQuantity',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'status',
          sourceKind: 'enrichment' as const,
          label: 'inventory.availabilityStatus',
          externalName: 'inventory',
          path: 'availabilityStatus',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'requested' },
            operator: 'lte' as const,
            right: { kind: 'input' as const, inputId: 'available' },
          }],
          thenOutput: { kind: 'input' as const, inputId: 'status' },
        }],
        elseOutput: { kind: 'static' as const, value: 'UNAVAILABLE' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.availabilityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-condition-status-ready')).toHaveTextContent('Condition is complete.');
    expect(screen.queryByTestId('smart-condition-sample-diagnostics')).not.toBeInTheDocument();
  });

  it('AE-18: shows compact blocked conditional status text for incomplete condition values', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'customer.availabilityLabel',
        targetType: 'string',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'requested',
          sourceKind: 'primary' as const,
          label: 'requestedQuantity',
          path: 'requestedQuantity',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'available',
          sourceKind: 'enrichment' as const,
          label: 'inventory.availableQuantity',
          externalName: 'inventory',
          path: 'availableQuantity',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{
            left: { kind: 'input' as const, inputId: 'requested' },
            operator: 'lte' as const,
            right: { kind: 'input' as const, inputId: 'available' },
          }],
          thenOutput: { kind: 'static' as const, value: '' },
        }],
        elseOutput: { kind: 'static' as const, value: 'UNAVAILABLE' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.availabilityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-condition-status-blocked')).toHaveTextContent(
      'THEN and OTHERWISE values are required.',
    );
  });

  it('uses boolean-friendly operator wording in conditional editor', () => {
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'target.flag',
        targetType: 'boolean',
        isRequired: false,
      }),
      inputs: [{
        id: 'flag',
        sourceKind: 'primary' as const,
        label: 'flag',
        path: 'flag',
        valueType: 'boolean' as const,
        transforms: [],
      }],
      composition: {
        kind: 'condition' as const,
        matchMode: 'all' as const,
        clauses: [{
          predicates: [{ left: { kind: 'input' as const, inputId: 'flag' }, operator: 'isTruthy' as const }],
          thenOutput: { kind: 'static' as const, value: 'Y' },
        }],
        elseOutput: { kind: 'static' as const, value: 'N' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="target.flag"
        targetType="boolean"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    const operator = screen.getByTestId('smart-condition-operator-0');
    expect(within(operator).getByRole('option', { name: 'Is true' })).toBeInTheDocument();
    expect(within(operator).getByRole('option', { name: 'Is false' })).toBeInTheDocument();
  });

  it('lets users change operator for an existing formula term explicitly', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'add' as const, inputId: 'tax' }],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-calculation-operator-subtract-0'));
    expect(onApplyAction).toHaveBeenCalledWith('number.subtract', { calculationInputId: 'tax' });
  });

  it('emits reorder action for calculation operation rows', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'fee',
          sourceKind: 'primary' as const,
          label: 'fee',
          path: 'fee',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [
          { operator: 'add' as const, inputId: 'tax' },
          { operator: 'subtract' as const, inputId: 'fee' },
        ],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-calculation-move-down-0'));
    expect(onApplyAction).toHaveBeenCalledWith('number.add', {
      calculationMoveOperation: { fromIndex: 0, toIndex: 1 },
    });
  });

  it('emits literal operand updates for calculation rows', () => {
    const onApplyAction = vi.fn();
    const draft = {
      ...createEmptySmartBuilderDraft({
        targetPath: 'gross',
        targetType: 'number',
        isRequired: false,
      }),
      inputs: [
        {
          id: 'subtotal',
          sourceKind: 'primary' as const,
          label: 'subtotal',
          path: 'subtotal',
          valueType: 'number' as const,
          transforms: [],
        },
        {
          id: 'tax',
          sourceKind: 'primary' as const,
          label: 'tax',
          path: 'tax',
          valueType: 'number' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'math' as const,
        startInputId: 'subtotal',
        operations: [{ operator: 'divide' as const, inputId: 'tax' }],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="gross"
        targetType="number"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.change(screen.getByTestId('smart-calculation-literal-0'), { target: { value: '0' } });
    expect(onApplyAction).toHaveBeenCalledWith('number.divide', {
      calculationSetLiteralOperandAtIndex: 0,
      calculationLiteralOperand: 0,
    });
  });
});
