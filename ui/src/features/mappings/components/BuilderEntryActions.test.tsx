import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BuilderEntryActions } from './BuilderEntryActions';
import type { ParsedSchema } from '@/lib/types/domain';
import type { SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(path: string, type = 'string'): SchemaTreeNode {
  return {
    path,
    fieldName: path.split('.').pop() ?? path,
    type: type as SchemaTreeNode['type'],
    depth: path.split('.').length - 1,
    isArray: false,
    isRequired: true,
    parentPath: null,
    childCount: 0,
    children: [],
  };
}

const MOCK_SCHEMA: ParsedSchema = {
  nodes: [
    makeNode('order.firstName'),
    makeNode('order.lastName'),
    makeNode('order.amount', 'number'),
    makeNode('order.createdAt'),
  ],
  totalFieldCount: 4,
  format: 'json',
  parseTimeMs: 0,
  inferred: false,
};

function renderActions(
  schema: ParsedSchema | null = MOCK_SCHEMA,
  onSourceSelected = vi.fn(),
  onFunctionSelected = vi.fn(),
) {
  render(
    <BuilderEntryActions
      parsedSourceSchema={schema}
      onSourceSelected={onSourceSelected}
      onFunctionSelected={onFunctionSelected}
    />,
  );
  return { onSourceSelected, onFunctionSelected };
}

// ---------------------------------------------------------------------------
// Basic rendering
// ---------------------------------------------------------------------------

describe('BuilderEntryActions — rendering', () => {
  it('renders the container', () => {
    renderActions();
    expect(screen.getByTestId('builder-entry-actions')).toBeInTheDocument();
  });

  it('renders the [+ Add Source] button', () => {
    renderActions();
    expect(screen.getByTestId('builder-add-source-btn')).toBeInTheDocument();
    expect(screen.getByTestId('builder-add-source-btn')).toHaveTextContent('Add Source');
  });

  it('renders the [+ Add Transformation] button', () => {
    renderActions();
    expect(screen.getByTestId('builder-add-transform-btn')).toBeInTheDocument();
    expect(screen.getByTestId('builder-add-transform-btn')).toHaveTextContent('Add Transformation');
  });

  it('both buttons are visible simultaneously', () => {
    renderActions();
    expect(screen.getByTestId('builder-add-source-btn')).toBeVisible();
    expect(screen.getByTestId('builder-add-transform-btn')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('BuilderEntryActions — accessibility', () => {
  it('[+ Add Source] has aria-label', () => {
    renderActions();
    expect(screen.getByTestId('builder-add-source-btn')).toHaveAttribute(
      'aria-label',
      'Add source field',
    );
  });

  it('[+ Add Transformation] has aria-label', () => {
    renderActions();
    expect(screen.getByTestId('builder-add-transform-btn')).toHaveAttribute(
      'aria-label',
      'Add transformation function',
    );
  });

  it('[+ Add Source] has aria-expanded=false when closed', () => {
    renderActions();
    expect(screen.getByTestId('builder-add-source-btn')).toHaveAttribute('aria-expanded', 'false');
  });

  it('[+ Add Transformation] has aria-expanded=false when closed', () => {
    renderActions();
    expect(screen.getByTestId('builder-add-transform-btn')).toHaveAttribute('aria-expanded', 'false');
  });

  it('[+ Add Source] has aria-expanded=true when open', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('builder-add-source-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  it('[+ Add Transformation] has aria-expanded=true when open', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.getByTestId('builder-add-transform-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  it('both buttons are keyboard focusable (not disabled)', () => {
    renderActions();
    expect(screen.getByTestId('builder-add-source-btn')).not.toBeDisabled();
    expect(screen.getByTestId('builder-add-transform-btn')).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Source picker — open / close
// ---------------------------------------------------------------------------

describe('BuilderEntryActions — source picker', () => {
  it('source picker is not visible initially', () => {
    renderActions();
    expect(screen.queryByTestId('source-picker-popover')).not.toBeInTheDocument();
  });

  it('clicking [+ Add Source] opens the source picker popover', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('source-picker-popover')).toBeInTheDocument();
  });

  it('source picker contains a search input', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('source-picker-search')).toBeInTheDocument();
  });

  it('source picker search input has aria-label', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('source-picker-search')).toHaveAttribute(
      'aria-label',
      'Search source fields',
    );
  });

  it('source picker lists schema fields', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('source-option-order.firstName')).toBeInTheDocument();
    expect(screen.getByTestId('source-option-order.lastName')).toBeInTheDocument();
    expect(screen.getByTestId('source-option-order.amount')).toBeInTheDocument();
  });

  it('source picker filters by search query', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    await user.type(screen.getByTestId('source-picker-search'), 'amount');
    expect(screen.getByTestId('source-option-order.amount')).toBeInTheDocument();
    expect(screen.queryByTestId('source-option-order.firstName')).not.toBeInTheDocument();
  });

  it('source picker shows "No source schema loaded." when schema is null', async () => {
    const user = userEvent.setup();
    renderActions(null);
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('source-picker-list')).toHaveTextContent('No source schema loaded.');
  });

  it('clicking Cancel closes the source picker', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('source-picker-popover')).toBeInTheDocument();
    await user.click(screen.getByTestId('source-picker-close'));
    expect(screen.queryByTestId('source-picker-popover')).not.toBeInTheDocument();
  });

  it('clicking [+ Add Source] again toggles the picker closed', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('source-picker-popover')).toBeInTheDocument();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.queryByTestId('source-picker-popover')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Source selection callback
// ---------------------------------------------------------------------------

describe('BuilderEntryActions — source selection', () => {
  it('selecting a source field calls onSourceSelected with the path', async () => {
    const user = userEvent.setup();
    const { onSourceSelected } = renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    await user.click(screen.getByTestId('source-option-order.firstName'));
    expect(onSourceSelected).toHaveBeenCalledOnce();
    expect(onSourceSelected).toHaveBeenCalledWith('order.firstName');
  });

  it('selecting a source field closes the picker', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    await user.click(screen.getByTestId('source-option-order.lastName'));
    expect(screen.queryByTestId('source-picker-popover')).not.toBeInTheDocument();
  });

  it('selecting a different source field calls onSourceSelected with correct path', async () => {
    const user = userEvent.setup();
    const { onSourceSelected } = renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    await user.click(screen.getByTestId('source-option-order.amount'));
    expect(onSourceSelected).toHaveBeenCalledWith('order.amount');
  });

  it('onSourceSelected receives exact string path', async () => {
    const user = userEvent.setup();
    const onSourceSelected = vi.fn();
    render(
      <BuilderEntryActions
        parsedSourceSchema={MOCK_SCHEMA}
        onSourceSelected={onSourceSelected}
        onFunctionSelected={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('builder-add-source-btn'));
    await user.click(screen.getByTestId('source-option-order.createdAt'));
    const [arg] = onSourceSelected.mock.calls[0] as [string];
    expect(typeof arg).toBe('string');
    expect(arg).toBe('order.createdAt');
  });
});

// ---------------------------------------------------------------------------
// Function picker — open / close
// ---------------------------------------------------------------------------

describe('BuilderEntryActions — function picker', () => {
  it('function picker is not visible initially', () => {
    renderActions();
    expect(screen.queryByTestId('function-picker-popover')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transform-function-picker')).not.toBeInTheDocument();
  });

  it('clicking [+ Add Transformation] opens the function picker', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.getByTestId('function-picker-popover')).toBeInTheDocument();
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
  });

  it('function picker contains a search input', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.getByTestId('transform-function-search')).toBeInTheDocument();
  });

  it('clicking Cancel in function picker closes it', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.getByTestId('transform-function-picker')).toBeInTheDocument();
    await user.click(screen.getByTestId('transform-function-picker-close'));
    expect(screen.queryByTestId('function-picker-popover')).not.toBeInTheDocument();
  });

  it('clicking [+ Add Transformation] again toggles the picker closed', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.getByTestId('function-picker-popover')).toBeInTheDocument();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.queryByTestId('function-picker-popover')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Function selection callback
// ---------------------------------------------------------------------------

describe('BuilderEntryActions — function selection', () => {
  it('selecting a function calls onFunctionSelected with the name', async () => {
    const user = userEvent.setup();
    const { onFunctionSelected } = renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    // String category is expanded by default in TransformFunctionPicker
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(onFunctionSelected).toHaveBeenCalledOnce();
    expect(onFunctionSelected).toHaveBeenCalledWith('upper');
  });

  it('selecting a function closes the picker', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    await user.click(screen.getByTestId('transform-fn-upper'));
    expect(screen.queryByTestId('function-picker-popover')).not.toBeInTheDocument();
  });

  it('selecting concat calls onFunctionSelected with "concat"', async () => {
    const user = userEvent.setup();
    const { onFunctionSelected } = renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    await user.click(screen.getByTestId('transform-fn-concat'));
    expect(onFunctionSelected).toHaveBeenCalledWith('concat');
  });

  it('onFunctionSelected receives exact string function name', async () => {
    const user = userEvent.setup();
    const onFunctionSelected = vi.fn();
    render(
      <BuilderEntryActions
        parsedSourceSchema={MOCK_SCHEMA}
        onSourceSelected={vi.fn()}
        onFunctionSelected={onFunctionSelected}
      />,
    );
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    await user.click(screen.getByTestId('transform-fn-lower'));
    const [arg] = onFunctionSelected.mock.calls[0] as [string];
    expect(typeof arg).toBe('string');
    expect(arg).toBe('lower');
  });
});

// ---------------------------------------------------------------------------
// Mutual exclusion — only one picker open at a time
// ---------------------------------------------------------------------------

describe('BuilderEntryActions — mutual exclusion', () => {
  it('opening source picker closes function picker', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.getByTestId('function-picker-popover')).toBeInTheDocument();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.queryByTestId('function-picker-popover')).not.toBeInTheDocument();
    expect(screen.getByTestId('source-picker-popover')).toBeInTheDocument();
  });

  it('opening function picker closes source picker', async () => {
    const user = userEvent.setup();
    renderActions();
    await user.click(screen.getByTestId('builder-add-source-btn'));
    expect(screen.getByTestId('source-picker-popover')).toBeInTheDocument();
    await user.click(screen.getByTestId('builder-add-transform-btn'));
    expect(screen.queryByTestId('source-picker-popover')).not.toBeInTheDocument();
    expect(screen.getByTestId('function-picker-popover')).toBeInTheDocument();
  });
});
