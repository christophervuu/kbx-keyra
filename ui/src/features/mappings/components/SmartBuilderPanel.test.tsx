import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it('renders target-focused empty state and other-ways copy', () => {
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
    expect(screen.getByTestId('smart-builder-empty-state')).toHaveTextContent('Other ways to fill this field');
    expect(screen.getByTestId('smart-input-tray-empty')).toBeInTheDocument();
    expect(screen.getByTestId('smart-mapping-recipe')).toBeInTheDocument();
    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Direct Mapping');
    expect(screen.getByTestId('smart-recipe-base-empty-direct')).toHaveTextContent('Select an input to continue.');
    expect(screen.getByTestId('smart-add-input-toggle')).toBeInTheDocument();
    expect(screen.queryByText('Smart Builder')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Base$/)).not.toBeInTheDocument();
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

  it('opens add-output-step picker and launches parameter editor for round', () => {
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
        ],
        composition: { kind: 'direct' as const, inputId: 'input-1' },
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
    fireEvent.click(screen.getByTestId('smart-picker-action-number.round'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('number.round');
    expect(onApplyAction).not.toHaveBeenCalled();
  });

  it('emits staged fields for smart tray input-kind quick actions', () => {
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
        onStageField={onStageField}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-add-input-toggle'));
    fireEvent.click(screen.getByTestId('smart-add-static'));
    fireEvent.click(screen.getByTestId('smart-add-constant'));
    fireEvent.click(screen.getByTestId('smart-add-enrichment'));
    fireEvent.click(screen.getByTestId('smart-add-expression'));

    expect(onStageField).toHaveBeenCalledWith(expect.objectContaining({ kind: 'static' }));
    expect(onStageField).toHaveBeenCalledWith(expect.objectContaining({ kind: 'constant' }));
    expect(onStageField).toHaveBeenCalledWith(expect.objectContaining({ kind: 'enrichment' }));
    expect(onStageField).toHaveBeenCalledWith(expect.objectContaining({ kind: 'expression' }));
  });

  it('hides item/parent quick actions outside array scope', () => {
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

  it('enables item/parent quick actions in array scope and emits staged fields', () => {
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

  it('shows deterministic array-builder handoff and calls callback when array actions are enabled', () => {
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

    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Direct Mapping');
    expect(screen.queryByTestId('smart-recipe-base-preview')).not.toBeInTheDocument();
  });

  it('renders mapping recipe section with concat preview and separator controls when concat is active', () => {
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
      composition: { kind: 'concat' as const, inputIds: ['a', 'b'], separator: ' ' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.fullName"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    expect(screen.getByTestId('smart-mapping-recipe')).toBeInTheDocument();
    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Combine text');
    expect(screen.getByTestId('smart-recipe-base-preview')).toHaveTextContent('firstName + [space] + lastName');
    expect(screen.getByTestId('smart-concat-separator-controls')).toBeInTheDocument();
  });

  it('renders value-map scope controls, inline editor, and project selection callbacks', () => {
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
    expect(screen.queryByTestId('smart-recipe-input-transforms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-value-map-scope-inline'));
  });

  it('supports inline row editing without conversion CTA', () => {
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

  it('re-shows transforms and output steps immediately when switching off value map method', () => {
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

    expect(screen.queryByTestId('smart-recipe-input-transforms')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-steps')).not.toBeInTheDocument();

    rerender(
      <SmartBuilderPanel
        targetPath="customer.statusLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft: directDraft }}
      />,
    );

    expect(screen.getByTestId('smart-recipe-input-transforms')).toBeInTheDocument();
    expect(screen.getByTestId('smart-recipe-steps')).toBeInTheDocument();
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
    expect(screen.getByText('Method')).toBeInTheDocument();
    expect(screen.getByTestId('smart-base-needs-action')).toBeInTheDocument();
    expect(screen.getByTestId('smart-base-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-change-base')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-recipe-input-transforms')).not.toBeInTheDocument();
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

  it('does not show substring action in add-output-step picker', () => {
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

    fireEvent.click(screen.getByTestId('smart-recipe-add-step'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'substring' } });

    expect(screen.queryByTestId('smart-picker-action-text.substring')).not.toBeInTheDocument();
  });

  it('does not surface input-transform unavailable rows in output-step picker', () => {
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

    fireEvent.click(screen.getByTestId('smart-recipe-add-step'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'substring' } });

    expect(screen.queryByTestId('smart-picker-disabled-text.substring')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-text.substring')).not.toBeInTheDocument();
  });

  it('opens missing-value fallback editor from mapping method card', () => {
    const onApplyAction = vi.fn();
    const onBeginActionParameterEdit = vi.fn();
    const onConditionFocusedSlotChange = vi.fn();
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
        onApplyAction={onApplyAction}
        onBeginActionParameterEdit={onBeginActionParameterEdit}
        onConditionFocusedSlotChange={onConditionFocusedSlotChange}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-missing-value-add-change'));

    expect(onConditionFocusedSlotChange).toHaveBeenCalledWith('fallback:default');
    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('null.default', {
      fallbackExpression: '""',
    });
    expect(onApplyAction).not.toHaveBeenCalled();
  });
  it('renders fallback section with right-aligned Add fallback and none state for direct mapping', () => {
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

    expect(screen.getByTestId('smart-missing-value-section')).toBeInTheDocument();
    expect(screen.getByText('Fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-missing-value-copy')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-missing-value-none')).toHaveTextContent('None');
    expect(screen.getByTestId('smart-missing-value-add-change')).toHaveTextContent('Add fallback');
  });

  it('renders Change/Remove fallback controls when default fallback exists', () => {
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
          label: 'preferredName',
          path: 'preferredName',
          valueType: 'string' as const,
          transforms: [],
        },
      ],
      composition: {
        kind: 'default' as const,
        inputId: 'a',
        fallback: { kind: 'static' as const, value: 'UNKNOWN' },
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

    expect(screen.getByTestId('smart-missing-value-add-change')).toHaveTextContent('Change fallback');
    expect(screen.getByTestId('smart-missing-value-remove')).toBeInTheDocument();
    expect(screen.getByTestId('smart-missing-value-current')).toHaveTextContent('"UNKNOWN"');

    fireEvent.click(screen.getByTestId('smart-missing-value-remove'));
    expect(onApplyAction).toHaveBeenCalledWith('base.direct');
  });

  it('renders null.default parameter editor inside fallback section', () => {
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
      composition: { kind: 'default' as const, inputId: 'a', fallback: { kind: 'static' as const, value: '' } },
      pendingActionDraft: {
        actionId: 'null.default',
        values: { fallbackExpression: '"N/A"' },
        validation: { isValid: true, issues: [] },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.name"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
      />,
    );

    const fallbackSection = screen.getByTestId('smart-missing-value-section');
    expect(within(fallbackSection).getByTestId('smart-parameter-editor')).toBeInTheDocument();
    expect(screen.getAllByTestId('smart-parameter-editor')).toHaveLength(1);
  });

  it('clears fallback slot focus after applying null.default parameters', () => {
    const onApplyAction = vi.fn();
    const onConditionFocusedSlotChange = vi.fn();
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
      composition: { kind: 'default' as const, inputId: 'a', fallback: { kind: 'static' as const, value: '' } },
      pendingActionDraft: {
        actionId: 'null.default',
        values: { fallbackExpression: '"N/A"' },
        validation: { isValid: true, issues: [] },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.name"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
        onConditionFocusedSlotChange={onConditionFocusedSlotChange}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-parameter-apply'));

    expect(onApplyAction).toHaveBeenCalledWith('null.default', undefined);
    expect(onConditionFocusedSlotChange).toHaveBeenCalledWith(null);
  });

  it('shows formatDate in add-input-transform picker and not in output-step picker', () => {
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

    fireEvent.click(screen.getByTestId('smart-recipe-add-step'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'format' } });
    expect(screen.queryByTestId('smart-picker-action-date.format')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('smart-recipe-add-transform'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'format' } });
    expect(screen.getByTestId('smart-picker-action-date.format')).toBeInTheDocument();
  });

  it('opens parameter editor for date.format from input-transform picker', () => {
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

    fireEvent.click(screen.getByTestId('smart-recipe-add-transform'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'format' } });
    fireEvent.click(screen.getByTestId('smart-picker-action-date.format'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('date.format');
    expect(onApplyAction).not.toHaveBeenCalled();
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
          transforms: [{
            functionName: 'substring',
            args: [
              { kind: 'static' as const, value: 1 },
              { kind: 'static' as const, value: 4 },
            ],
          }],
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
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-input-transform-edit-0'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('text.substring', { start: 1, length: 4 });
  });

  it('hydrates formatDate step re-edit values for input and output format', () => {
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
          transforms: [{
            functionName: 'formatDate',
            args: [
              { kind: 'static' as const, value: 'YYYY/MM/DD' },
              { kind: 'static' as const, value: 'YYYY-MM-DD' },
            ],
          }],
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
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-input-transform-edit-0'));

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
    expect(screen.getByTestId('smart-recipe-change-base')).toHaveTextContent('Change method');
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
      composition: { kind: 'direct' as const, inputId: 'a' },
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
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'round' } });
    expect(screen.getByTestId('smart-picker-action-number.round')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'default' } });
    expect(screen.queryByTestId('smart-picker-action-null.default')).not.toBeInTheDocument();
  });
  it('shows only Direct Mapping, Value Mapping, and Conditional in method picker without search', () => {
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

    expect(screen.getByTestId('smart-picker-action-base.direct')).toHaveTextContent('Direct Mapping');
    expect(screen.getByTestId('smart-picker-action-lookup.valueMap')).toHaveTextContent('Value Mapping');
    expect(screen.getByTestId('smart-picker-action-condition.compare')).toHaveTextContent('Conditional');
    expect(screen.getByTestId('smart-picker-action-base.direct')).toBeDisabled();

    expect(screen.queryByTestId('smart-picker-search')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-base.calculation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-number.add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-number.subtract')).not.toBeInTheDocument();
    expect(screen.queryByTestId('smart-picker-action-advanced.expression')).not.toBeInTheDocument();
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
        operations: [{ operator: 'divide' as const, inputId: 'zero' }],
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
    expect(screen.getByTestId('smart-recipe-steps-list')).toHaveTextContent('round');
  });

  it('hydrates round output-step edit values and decimals parameter field', () => {
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
      composition: { kind: 'direct' as const, inputId: 'subtotal' },
      postSteps: [{ functionName: 'round', args: [{ kind: 'static' as const, value: 2 }] }],
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

    fireEvent.click(screen.getByTestId('smart-recipe-step-edit-0'));
    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('number.round', { decimals: 2 });

    expect(screen.getByTestId('smart-parameter-field-decimals')).toBeInTheDocument();
    expect(screen.getByTestId('smart-parameter-input-decimals')).toHaveValue(2);
  });

  it('renders direct IF/THEN/OTHERWISE conditional editor and removes slot-fill controls', () => {
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
        sourceSampleData={{ requestedQuantity: 3 }}
        enrichmentSampleData={{ inventory: { availableQuantity: 5, availabilityStatus: 'IN_STOCK' } }}
      />,
    );

    expect(screen.getByTestId('smart-condition-status-ready')).toHaveTextContent('Ready. THEN branch will return IN_STOCK.');
    expect(screen.queryByTestId('smart-condition-sample-diagnostics')).not.toBeInTheDocument();
  });

  it('shows compact blocked conditional status text', () => {
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
          thenOutput: { kind: 'static' as const, value: 'AVAILABLE' },
        }],
        elseOutput: { kind: 'static' as const, value: 'UNAVAILABLE' },
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.availabilityLabel"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        sourceSampleData={{ requestedQuantity: null }}
        enrichmentSampleData={{}}
      />,
    );

    expect(screen.getByTestId('smart-condition-status-blocked')).toHaveTextContent(
      'Complete condition values before previewing output.',
    );
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

    fireEvent.click(screen.getByTestId('smart-calculation-operator-subtract-tax'));
    expect(onApplyAction).toHaveBeenCalledWith('number.subtract', { calculationInputId: 'tax' });
  });
});
