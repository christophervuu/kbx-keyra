import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SmartBuilderPanel } from './SmartBuilderPanel';
import { createEmptySmartBuilderDraft } from '../lib/smart-builder-state';

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
    expect(screen.getByTestId('smart-add-input-toggle')).toBeInTheDocument();
    expect(screen.queryByText('Smart Builder')).not.toBeInTheDocument();
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

  it('opens add-step picker and applies an input transform action', () => {
    const onApplyAction = vi.fn();
    const draft = createEmptySmartBuilderDraft({
      targetPath: 'customer.emailUpper',
      targetType: 'string',
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
            label: 'email',
            path: 'email',
            valueType: 'string' as const,
            transforms: [],
          },
        ],
      },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.emailUpper"
        targetType="string"
        hydration={hydrated}
        onApplyAction={onApplyAction}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-add-step'));
    fireEvent.click(screen.getByTestId('smart-picker-action-text.upper'));

    expect(onApplyAction).toHaveBeenCalledWith('text.upper');
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

  it('shows combine-text shortcut only for string multi-input trays', () => {
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

    expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent('Direct mapping');
    expect(screen.getByTestId('smart-unused-input-notice')).toBeInTheDocument();
    expect(screen.getByTestId('smart-unused-input-combine')).toBeInTheDocument();
  });

  it('does not show combine-text shortcut for numeric multi-input trays', () => {
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

    expect(screen.getByTestId('smart-unused-input-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('smart-unused-input-combine')).not.toBeInTheDocument();
  });

  it('shows substring action in add-step picker so function is available', () => {
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

    expect(screen.getByTestId('smart-picker-action-text.substring')).toBeInTheDocument();
  });

  it('reveals unavailable action in search with deterministic reason text', () => {
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

    const disabledRow = screen.getByTestId('smart-picker-disabled-text.substring');
    expect(disabledRow).toBeInTheDocument();
    fireEvent.click(within(disabledRow).getByRole('button'));
    expect(disabledRow).toHaveTextContent('Start index is required.');
    expect(screen.queryByTestId('smart-picker-action-text.substring')).not.toBeInTheDocument();
  });

  it('opens parameter editor for parameterized actions instead of one-click apply', () => {
    const onApplyAction = vi.fn();
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
      composition: { kind: 'direct' as const, inputId: 'a' },
    };

    render(
      <SmartBuilderPanel
        targetPath="customer.emailDomain"
        targetType="string"
        hydration={{ kind: 'guided', draft }}
        onApplyAction={onApplyAction}
        onBeginActionParameterEdit={onBeginActionParameterEdit}
      />,
    );

    fireEvent.click(screen.getByTestId('smart-recipe-add-step'));
    fireEvent.change(screen.getByTestId('smart-picker-search'), { target: { value: 'substring' } });
    fireEvent.click(screen.getByTestId('smart-picker-action-text.substring'));

    expect(onBeginActionParameterEdit).toHaveBeenCalledWith('text.substring');
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

    fireEvent.click(screen.getByTestId('smart-recipe-step-edit-0'));

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

    fireEvent.click(screen.getByTestId('smart-recipe-step-edit-0'));

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

  it('keeps all math base actions visible after composition apply', () => {
    const cases = [
      {
        operator: 'add' as const,
        expectedLabel: 'Add numbers',
        expectedPreview: 'subtotal + tax',
      },
      {
        operator: 'subtract' as const,
        expectedLabel: 'Subtract numbers',
        expectedPreview: 'subtotal - tax',
      },
      {
        operator: 'multiply' as const,
        expectedLabel: 'Multiply numbers',
        expectedPreview: 'subtotal × tax',
      },
      {
        operator: 'divide' as const,
        expectedLabel: 'Divide numbers',
        expectedPreview: 'subtotal ÷ tax',
      },
    ];

    for (const testCase of cases) {
      const draft = {
        ...createEmptySmartBuilderDraft({
          targetPath: 'gross',
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
          operator: testCase.operator,
          inputIds: ['a', 'b'],
        },
      };

      const { unmount } = render(
        <SmartBuilderPanel
          targetPath="gross"
          targetType="number"
          hydration={{ kind: 'guided', draft }}
        />,
      );

      expect(screen.getByTestId('smart-recipe-base-label')).toHaveTextContent(testCase.expectedLabel);
      expect(screen.getByTestId('smart-recipe-base-preview')).toHaveTextContent(testCase.expectedPreview);
      unmount();
    }
  });

  it('does not show tray/base actions in add-step picker, including math and condition', () => {
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
  });

  it('shows math actions in base picker so base composition is explicit', () => {
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
    expect(screen.getByTestId('smart-picker-action-number.add')).toBeInTheDocument();
    expect(screen.getByTestId('smart-picker-action-number.subtract')).toBeInTheDocument();
    expect(screen.getByTestId('smart-picker-action-number.multiply')).toBeInTheDocument();
    expect(screen.getByTestId('smart-picker-action-number.divide')).toBeInTheDocument();
  });
});
