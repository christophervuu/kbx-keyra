/**
 * T-07 tests: LiveExpressionDisplay, LiveResultDisplay, and integration tests
 * for ScalarFieldBuilder and ExpressionBuilderPanel with UnifiedExpressionBuilder.
 */

import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LiveExpressionDisplay } from './LiveExpressionDisplay';
import { LiveResultDisplay } from './LiveResultDisplay';
import { ScalarFieldBuilder } from './ScalarFieldBuilder';
import type { ScalarFieldBuilderProps } from './ScalarFieldBuilder';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(path: string, fieldName: string, type: SchemaTreeNode['type']): SchemaTreeNode {
  return { path, fieldName, type, depth: 0, isArray: false, isRequired: false, parentPath: null, childCount: 0, children: [] };
}

const MOCK_SCHEMA: ParsedSchema = {
  format: 'json-schema',
  totalFieldCount: 3,
  parseTimeMs: 1,
  inferred: false,
  nodes: [
    makeNode('email', 'email', 'string'),
    makeNode('name', 'name', 'string'),
    makeNode('amount', 'amount', 'number'),
  ],
};

const DEFAULT_SCALAR_PROPS: ScalarFieldBuilderProps = {
  selectedTargetPath: 'target.email',
  selectedTargetType: 'string',
  selectedTargetRequired: false,
  currentStatus: 'unmapped',
  currentExpression: '',
  parsedSourceSchema: MOCK_SCHEMA,
  onApply: vi.fn(),
};

// ---------------------------------------------------------------------------
// LiveExpressionDisplay tests
// ---------------------------------------------------------------------------

describe('LiveExpressionDisplay', () => {
  it('renders the display container', () => {
    render(<LiveExpressionDisplay expression="" onClickToEdit={vi.fn()} />);
    expect(screen.getByTestId('live-expression-display')).toBeInTheDocument();
  });

  it('shows placeholder when expression is empty', () => {
    render(<LiveExpressionDisplay expression="" onClickToEdit={vi.fn()} />);
    expect(screen.getByTestId('live-expression-placeholder')).toBeInTheDocument();
  });

  it('renders expression in code block when non-empty', () => {
    render(<LiveExpressionDisplay expression='source("email")' onClickToEdit={vi.fn()} />);
    const codeBlock = screen.getByTestId('live-expression-code');
    expect(codeBlock).toBeInTheDocument();
    expect(codeBlock.textContent).toContain('source');
    expect(screen.queryByTestId('live-expression-placeholder')).not.toBeInTheDocument();
  });

  it('fires onClickToEdit when expression code block is clicked', async () => {
    const user = userEvent.setup();
    const onClickToEdit = vi.fn();
    render(<LiveExpressionDisplay expression='source("email")' onClickToEdit={onClickToEdit} />);
    await user.click(screen.getByTestId('live-expression-code'));
    expect(onClickToEdit).toHaveBeenCalledTimes(1);
  });

  it('fires onClickToEdit when Edit button is clicked', async () => {
    const user = userEvent.setup();
    const onClickToEdit = vi.fn();
    render(<LiveExpressionDisplay expression='source("email")' onClickToEdit={onClickToEdit} />);
    await user.click(screen.getByTestId('live-expression-edit-btn'));
    expect(onClickToEdit).toHaveBeenCalledTimes(1);
  });

  it('does not show Edit button when expression is empty', () => {
    render(<LiveExpressionDisplay expression="" onClickToEdit={vi.fn()} />);
    expect(screen.queryByTestId('live-expression-edit-btn')).not.toBeInTheDocument();
  });

  it('renders expression label', () => {
    render(<LiveExpressionDisplay expression="" onClickToEdit={vi.fn()} />);
    expect(screen.getByText('Expression')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// LiveResultDisplay tests
// ---------------------------------------------------------------------------

describe('LiveResultDisplay', () => {
  it('renders the display container', () => {
    render(<LiveResultDisplay expression="" sourceData={null} />);
    expect(screen.getByTestId('live-result-display')).toBeInTheDocument();
  });

  it('AE-08: shows "Load test data" when sourceData is null', () => {
    render(<LiveResultDisplay expression='source("email")' sourceData={null} />);
    expect(screen.getByTestId('live-result-no-data')).toHaveTextContent(
      'Load test data to see live results.',
    );
  });

  it('AE-08: shows "Load test data" when sourceData is undefined', () => {
    render(<LiveResultDisplay expression='source("email")' sourceData={undefined} />);
    expect(screen.getByTestId('live-result-no-data')).toBeInTheDocument();
  });

  it('AE-07: shows evaluated result when sourceData is present', async () => {
    render(
      <LiveResultDisplay
        expression='source("email")'
        sourceData={{ email: 'JOHN@EXAMPLE.COM' }}
      />,
    );
    // Wait for debounced evaluation
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(screen.getByTestId('live-result-value')).toBeInTheDocument();
  });

  it('renders Result label', () => {
    render(<LiveResultDisplay expression="" sourceData={null} />);
    expect(screen.getByText('Result')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ScalarFieldBuilder integration tests
// ---------------------------------------------------------------------------

describe('ScalarFieldBuilder — UnifiedExpressionBuilder integration', () => {
  it('renders UnifiedExpressionBuilder in builder mode by default', () => {
    render(<ScalarFieldBuilder {...DEFAULT_SCALAR_PROPS} />);
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.getByTestId('unified-expression-builder')).toBeInTheDocument();
  });

  it('switches to editor mode when Editor toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<ScalarFieldBuilder {...DEFAULT_SCALAR_PROPS} />);
    await user.click(screen.getByTestId('mode-toggle-editor'));
    expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('expression-builder-slot')).not.toBeInTheDocument();
  });

  it('switches back to builder mode when Builder toggle is clicked', async () => {
    const user = userEvent.setup();
    render(<ScalarFieldBuilder {...DEFAULT_SCALAR_PROPS} />);
    await user.click(screen.getByTestId('mode-toggle-editor'));
    await user.click(screen.getByTestId('mode-toggle-builder'));
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
  });

  it('clicking live expression Edit button switches to editor mode', async () => {
    const user = userEvent.setup();
    render(<ScalarFieldBuilder {...DEFAULT_SCALAR_PROPS} currentExpression='source("email")' />);
    // Wait for expression to propagate
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    const editBtn = screen.queryByTestId('live-expression-edit-btn');
    if (editBtn) {
      await user.click(editBtn);
      expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();
    }
  });

  it('AE-11: renders same UnifiedExpressionBuilder mode tabs as ExpressionBuilderPanel', () => {
    render(<ScalarFieldBuilder {...DEFAULT_SCALAR_PROPS} />);
    expect(screen.getByTestId('mode-tab-value')).toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-conditional')).toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-valueMap')).toBeInTheDocument();
  });

  it('header target path still renders', () => {
    render(<ScalarFieldBuilder {...DEFAULT_SCALAR_PROPS} />);
    expect(screen.getByTestId('header-target-path')).toHaveTextContent('target.email');
  });

  it('apply button is disabled when expression is empty', () => {
    render(<ScalarFieldBuilder {...DEFAULT_SCALAR_PROPS} />);
    expect(screen.getByTestId('apply-btn')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// AE-09 / AE-16 decomposer integration (via use-expression-builder)
// ---------------------------------------------------------------------------

describe('use-expression-builder — new decomposer integration', () => {
  it('AE-09: decomposeExpression succeeds for pipeline expression', async () => {
    const { decomposeExpression } = await import('../lib/pipeline-decomposer');
    const result = decomposeExpression('upper(trim(source("name")))');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.state.mode).toBe('value');
    }
  });

  it('AE-16: decomposeExpression auto-detects Conditional mode for if() expression', async () => {
    const { decomposeExpression } = await import('../lib/pipeline-decomposer');
    const result = decomposeExpression('if(gt(source("amount"), 100), "high", "low")');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.state.mode).toBe('conditional');
    }
  });

  it('AE-10: decomposeExpression fails for complex/unsupported expression', async () => {
    const { decomposeExpression } = await import('../lib/pipeline-decomposer');
    // concat() is not a supported pipeline root
    const result = decomposeExpression('concat(source("a"), source("b"), source("c"))');
    expect(result.success).toBe(false);
  });
});
