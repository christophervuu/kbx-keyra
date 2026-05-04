import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UnifiedExpressionBuilder } from './UnifiedExpressionBuilder';
import { TransformPipeline } from './TransformPipeline';
import { TransformFunctionPicker } from './TransformFunctionPicker';
import type { TransformStep } from '../lib/expression-builder-state';
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
    {
      path: 'email',
      fieldName: 'email',
      type: 'string',
      depth: 0,
      isArray: false,
      isRequired: true,
      parentPath: null,
      childCount: 0,
      children: [],
    },
    {
      path: 'code',
      fieldName: 'code',
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

function renderBuilder(overrides: Partial<React.ComponentProps<typeof UnifiedExpressionBuilder>> = {}) {
  const onExpressionChange = vi.fn();
  const onApply = vi.fn();
  const defaults: React.ComponentProps<typeof UnifiedExpressionBuilder> = {
    expression: '',
    onExpressionChange,
    onApply,
    selectedTargetPath: 'target.field',
    parsedSourceSchema: MOCK_SCHEMA,
  };
  render(<UnifiedExpressionBuilder {...defaults} {...overrides} />);
  return { onExpressionChange, onApply };
}

async function selectSource(user: ReturnType<typeof userEvent.setup>, fieldPath: string) {
  await user.click(screen.getByTestId('source-search-input'));
  await user.click(screen.getByTestId(`suggestion-${fieldPath}`));
}

async function openFunctionPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('transform-add-btn'));
}

// ---------------------------------------------------------------------------
// TransformFunctionPicker unit tests
// ---------------------------------------------------------------------------

describe('TransformFunctionPicker', () => {
  it('renders the picker with search input', () => {
    render(<TransformFunctionPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
    expect(screen.getByTestId('transform-function-search')).toBeInTheDocument();
  });

  it('renders String category by default (expanded)', () => {
    render(<TransformFunctionPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('transform-fn-upper')).toBeInTheDocument();
    expect(screen.getByTestId('transform-fn-lower')).toBeInTheDocument();
    expect(screen.getByTestId('transform-fn-trim')).toBeInTheDocument();
  });

  it('does not render SourceAccess functions (source, static, item)', () => {
    render(<TransformFunctionPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId('transform-fn-source')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transform-fn-static')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transform-fn-item')).not.toBeInTheDocument();
  });

  it('search filters functions by name', async () => {
    const user = userEvent.setup();
    render(<TransformFunctionPicker onSelect={vi.fn()} onClose={vi.fn()} />);
    await user.type(screen.getByTestId('transform-function-search'), 'upper');
    expect(screen.getByTestId('transform-fn-upper')).toBeInTheDocument();
    expect(screen.queryByTestId('transform-fn-lower')).not.toBeInTheDocument();
  });

  it('calling onSelect with function name when a function is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TransformFunctionPicker onSelect={onSelect} onClose={vi.fn()} />);
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(onSelect).toHaveBeenCalledWith('upper');
  });

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TransformFunctionPicker onSelect={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByTestId('transform-function-picker-close'));
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TransformPipeline unit tests
// ---------------------------------------------------------------------------

describe('TransformPipeline', () => {
  it('renders empty state when no transforms', () => {
    render(
      <TransformPipeline
        transforms={[]}
        onTransformsChange={vi.fn()}
        sourceDescription='source("email")'
      />,
    );
    expect(screen.getByTestId('transform-pipeline-empty')).toBeInTheDocument();
  });

  it('renders [+ Add Transformation] button', () => {
    render(
      <TransformPipeline
        transforms={[]}
        onTransformsChange={vi.fn()}
        sourceDescription='source("email")'
      />,
    );
    expect(screen.getByTestId('transform-add-btn')).toBeInTheDocument();
  });

  it('clicking [+ Add Transformation] opens function picker', async () => {
    const user = userEvent.setup();
    render(
      <TransformPipeline
        transforms={[]}
        onTransformsChange={vi.fn()}
        sourceDescription='source("email")'
      />,
    );
    await user.click(screen.getByTestId('transform-add-btn'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('selecting a function from picker adds a step', async () => {
    const user = userEvent.setup();
    const onTransformsChange = vi.fn();
    render(
      <TransformPipeline
        transforms={[]}
        onTransformsChange={onTransformsChange}
        sourceDescription='source("email")'
      />,
    );
    await user.click(screen.getByTestId('transform-add-btn'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(onTransformsChange).toHaveBeenCalledWith([
      expect.objectContaining({ functionName: 'upper' }),
    ]);
  });

  it('renders step cards for existing transforms', () => {
    const transforms: TransformStep[] = [
      { functionName: 'trim', parameters: [] },
      { functionName: 'lower', parameters: [] },
    ];
    render(
      <TransformPipeline
        transforms={transforms}
        onTransformsChange={vi.fn()}
        sourceDescription='source("email")'
      />,
    );
    expect(screen.getByTestId('transform-step-0')).toBeInTheDocument();
    expect(screen.getByTestId('transform-step-1')).toBeInTheDocument();
  });

  it('remove button calls onTransformsChange without that step', async () => {
    const user = userEvent.setup();
    const onTransformsChange = vi.fn();
    const transforms: TransformStep[] = [
      { functionName: 'trim', parameters: [] },
      { functionName: 'lower', parameters: [] },
    ];
    render(
      <TransformPipeline
        transforms={transforms}
        onTransformsChange={onTransformsChange}
        sourceDescription='source("email")'
      />,
    );
    await user.click(screen.getByTestId('transform-step-remove-0'));
    expect(onTransformsChange).toHaveBeenCalledWith([
      expect.objectContaining({ functionName: 'lower' }),
    ]);
  });

  it('move down button reorders steps (AE-12)', async () => {
    const user = userEvent.setup();
    const onTransformsChange = vi.fn();
    const transforms: TransformStep[] = [
      { functionName: 'trim', parameters: [] },
      { functionName: 'lower', parameters: [] },
    ];
    render(
      <TransformPipeline
        transforms={transforms}
        onTransformsChange={onTransformsChange}
        sourceDescription='source("email")'
      />,
    );
    await user.click(screen.getByTestId('transform-step-move-down-0'));
    expect(onTransformsChange).toHaveBeenCalledWith([
      expect.objectContaining({ functionName: 'lower' }),
      expect.objectContaining({ functionName: 'trim' }),
    ]);
  });

  it('move up button reorders steps', async () => {
    const user = userEvent.setup();
    const onTransformsChange = vi.fn();
    const transforms: TransformStep[] = [
      { functionName: 'trim', parameters: [] },
      { functionName: 'lower', parameters: [] },
    ];
    render(
      <TransformPipeline
        transforms={transforms}
        onTransformsChange={onTransformsChange}
        sourceDescription='source("email")'
      />,
    );
    await user.click(screen.getByTestId('transform-step-move-up-1'));
    expect(onTransformsChange).toHaveBeenCalledWith([
      expect.objectContaining({ functionName: 'lower' }),
      expect.objectContaining({ functionName: 'trim' }),
    ]);
  });

  it('step shows auto-wired input description', () => {
    const transforms: TransformStep[] = [{ functionName: 'upper', parameters: [] }];
    render(
      <TransformPipeline
        transforms={transforms}
        onTransformsChange={vi.fn()}
        sourceDescription='source("email")'
      />,
    );
    expect(screen.getByTestId('transform-step-autowired-0')).toHaveTextContent('source("email")');
  });

  it('second step shows "output of step 1" as input description', () => {
    const transforms: TransformStep[] = [
      { functionName: 'trim', parameters: [] },
      { functionName: 'upper', parameters: [] },
    ];
    render(
      <TransformPipeline
        transforms={transforms}
        onTransformsChange={vi.fn()}
        sourceDescription='source("email")'
      />,
    );
    expect(screen.getByTestId('transform-step-autowired-1')).toHaveTextContent('output of step 1');
  });

  it('substring step renders start and end parameter inputs', () => {
    const transforms: TransformStep[] = [
      {
        functionName: 'substring',
        parameters: [
          { name: 'start', value: 0, type: 'number' },
          { name: 'end', value: 3, type: 'number' },
        ],
      },
    ];
    render(
      <TransformPipeline
        transforms={transforms}
        onTransformsChange={vi.fn()}
        sourceDescription='source("code")'
      />,
    );
    expect(screen.getByTestId('transform-step-param-start')).toBeInTheDocument();
    expect(screen.getByTestId('transform-step-param-end')).toBeInTheDocument();
  });

  it('concat step shows [+ Add argument] for variadic params', async () => {
    const user = userEvent.setup();
    const onTransformsChange = vi.fn();
    render(
      <TransformPipeline
        transforms={[]}
        onTransformsChange={onTransformsChange}
        sourceDescription='source("email")'
      />,
    );
    await user.click(screen.getByTestId('transform-add-btn'));
    await user.click(screen.getByTestId('transform-fn-concat'));
    // Now render with the concat step
    const concatStep: TransformStep = { functionName: 'concat', parameters: [] };
    const { rerender } = render(
      <TransformPipeline
        transforms={[concatStep]}
        onTransformsChange={vi.fn()}
        sourceDescription='source("email")'
      />,
    );
    expect(screen.getByTestId('transform-step-add-variadic-0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Integration: UnifiedExpressionBuilder + pipeline (AE-02, AE-03, AE-12)
// ---------------------------------------------------------------------------

describe('UnifiedExpressionBuilder — transform pipeline integration', () => {
  it('transform pipeline section renders in value mode', () => {
    renderBuilder();
    expect(screen.getByTestId('transform-pipeline')).toBeInTheDocument();
  });

  it('AE-02: trim then lower on source("email") produces lower(trim(source("email")))', async () => {
    const user = userEvent.setup();
    const { onExpressionChange } = renderBuilder();

    // Select source
    await selectSource(user, 'email');

    // Add trim
    await openFunctionPicker(user);
    await user.click(screen.getByTestId('transform-fn-trim'));

    // Add lower
    await openFunctionPicker(user);
    await user.click(screen.getByTestId('transform-fn-lower'));

    // Check last expression emitted
    const calls = onExpressionChange.mock.calls;
    const lastExpr = calls[calls.length - 1][0] as string;
    expect(lastExpr).toBe('lower(trim(source("email")))');
  });

  it('AE-03: substring with start=0, end=3 on source("code") produces substring(source("code"), 0, 3)', async () => {
    const user = userEvent.setup();
    const { onExpressionChange } = renderBuilder();

    await selectSource(user, 'code');

    await openFunctionPicker(user);
    await user.click(screen.getByTestId('transform-fn-substring'));

    // Set start=0 (already default), set end=3
    const endInput = screen.getByTestId('transform-step-param-end');
    await user.clear(endInput);
    await user.type(endInput, '3');

    const calls = onExpressionChange.mock.calls;
    const lastExpr = calls[calls.length - 1][0] as string;
    expect(lastExpr).toBe('substring(source("code"), 0, 3)');
  });

  it('AE-12: reordering steps updates expression', async () => {
    const user = userEvent.setup();
    const { onExpressionChange } = renderBuilder();

    await selectSource(user, 'email');

    // Add trim then lower
    await openFunctionPicker(user);
    await user.click(screen.getByTestId('transform-fn-trim'));
    await openFunctionPicker(user);
    await user.click(screen.getByTestId('transform-fn-lower'));

    // Move lower (step 1) up → should become trim(lower(source("email")))
    await user.click(screen.getByTestId('transform-step-move-up-1'));

    const calls = onExpressionChange.mock.calls;
    const lastExpr = calls[calls.length - 1][0] as string;
    expect(lastExpr).toBe('trim(lower(source("email")))');
  });

  it('removing a step updates expression', async () => {
    const user = userEvent.setup();
    const { onExpressionChange } = renderBuilder();

    await selectSource(user, 'email');
    await openFunctionPicker(user);
    await user.click(screen.getByTestId('transform-fn-trim'));
    await openFunctionPicker(user);
    await user.click(screen.getByTestId('transform-fn-lower'));

    // Remove trim (step 0)
    await user.click(screen.getByTestId('transform-step-remove-0'));

    const calls = onExpressionChange.mock.calls;
    const lastExpr = calls[calls.length - 1][0] as string;
    expect(lastExpr).toBe('lower(source("email"))');
  });

  it('Direct Copy button hidden once a transform is added', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await selectSource(user, 'email');
    expect(screen.getByTestId('direct-copy-btn')).toBeInTheDocument();

    await openFunctionPicker(user);
    await user.click(screen.getByTestId('transform-fn-trim'));

    expect(screen.queryByTestId('direct-copy-btn')).not.toBeInTheDocument();
  });
});
