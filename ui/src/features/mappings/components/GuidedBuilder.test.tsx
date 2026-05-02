import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GuidedBuilder, buildStaticExpression, buildSourceExpression } from './GuidedBuilder';
import type { GuidedBuilderRef } from './GuidedBuilder';
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
      path: 'customer.name',
      fieldName: 'name',
      type: 'string',
      depth: 0,
      isArray: false,
      isRequired: true,
      parentPath: null,
      childCount: 0,
      children: [],
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

function renderBuilder(
  overrides: Partial<React.ComponentProps<typeof GuidedBuilder>> = {},
  ref?: React.Ref<GuidedBuilderRef>,
) {
  const defaults: React.ComponentProps<typeof GuidedBuilder> = {
    expression: '',
    onExpressionChange: vi.fn(),
    parsedSourceSchema: MOCK_SCHEMA,
  };
  return render(<GuidedBuilder ref={ref} {...defaults} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe('buildSourceExpression', () => {
  it('builds a source() call from a path', () => {
    expect(buildSourceExpression('customer.name')).toBe('source("customer.name")');
  });
});

describe('buildStaticExpression', () => {
  it('builds static("...") for string type', () => {
    expect(buildStaticExpression('hello', 'string')).toBe('static("hello")');
  });

  it('escapes double quotes in string values', () => {
    expect(buildStaticExpression('say "hi"', 'string')).toBe('static("say \\"hi\\"")');
  });

  it('builds static(N) for number type', () => {
    expect(buildStaticExpression('42', 'number')).toBe('static(42)');
  });

  it('defaults to static(0) for empty number value', () => {
    expect(buildStaticExpression('', 'number')).toBe('static(0)');
  });

  it('builds static(true) for boolean type with true value', () => {
    expect(buildStaticExpression('true', 'boolean')).toBe('static(true)');
  });

  it('builds static(false) for boolean type with false value', () => {
    expect(buildStaticExpression('false', 'boolean')).toBe('static(false)');
  });

  it('builds static(null) for null type', () => {
    expect(buildStaticExpression('', 'null')).toBe('static(null)');
  });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe('GuidedBuilder', () => {
  it('renders the guided-builder container', () => {
    renderBuilder();
    expect(screen.getByTestId('guided-builder')).toBeInTheDocument();
  });

  it('renders step 1 by default', () => {
    renderBuilder();
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
  });

  it('renders the step indicator with correct active step', () => {
    renderBuilder();
    expect(screen.getByRole('navigation', { name: 'Builder steps' })).toBeInTheDocument();
    // Step 1 should be current
    expect(screen.getByRole('button', { name: /Source.*current step/i })).toBeInTheDocument();
  });

  it('Direct Copy button is disabled when no field is selected', () => {
    renderBuilder();
    const btn = screen.getByRole('button', {
      name: /Direct copy — use selected field without transform/i,
    });
    expect(btn).toBeDisabled();
  });

  it('Direct Copy button is enabled after one field is selected', async () => {
    const user = userEvent.setup();
    renderBuilder();
    // Open suggestions and click customer.name
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    await user.click(screen.getByText('customer.name'));
    const btn = screen.getByRole('button', {
      name: /Direct copy — use selected field without transform/i,
    });
    expect(btn).toBeEnabled();
  });

  it('Direct Copy shortcut calls onExpressionChange with source("path") — AE-02', async () => {
    const onExpressionChange = vi.fn();
    const user = userEvent.setup();
    renderBuilder({ onExpressionChange });
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    await user.click(screen.getByText('customer.name'));
    fireEvent.click(
      screen.getByRole('button', { name: /Direct copy — use selected field without transform/i }),
    );
    expect(onExpressionChange).toHaveBeenCalledWith('source("customer.name")');
  });

  it('Choose Transform advances to step 2', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    await user.click(screen.getByText('customer.name'));
    fireEvent.click(screen.getByRole('button', { name: /Choose Transform/i }));
    expect(screen.getByTestId('step-2')).toBeInTheDocument();
  });

  it('Selecting a function in step 2 advances to step 3 placeholder', async () => {
    const user = userEvent.setup();
    renderBuilder();
    // Add a field first
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    await user.click(screen.getByText('orderId'));
    fireEvent.click(screen.getByRole('button', { name: /Choose Transform/i }));
    // Step 2: click a function
    fireEvent.click(screen.getByRole('button', { name: /upper.*Converts a string to uppercase/i }));
    expect(screen.getByTestId('step-3')).toBeInTheDocument();
    expect(screen.getByText(/upper\(\)/)).toBeInTheDocument();
  });

  it('Back button returns from step 2 to step 1', async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole('combobox', { name: 'Search source fields' }));
    await user.click(screen.getByText('customer.name'));
    fireEvent.click(screen.getByRole('button', { name: /Choose Transform/i }));
    expect(screen.getByTestId('step-2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /← Back/i }));
    expect(screen.getByTestId('step-1')).toBeInTheDocument();
  });

  it('Back button is disabled on step 1', () => {
    renderBuilder();
    expect(screen.getByRole('button', { name: /← Back/i })).toBeDisabled();
  });
});

describe('GuidedBuilder — static value mode', () => {
  it('switching to static mode shows static value input', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: /Use a static value instead/i }));
    expect(screen.getByRole('combobox', { name: 'Static value type' })).toBeInTheDocument();
  });

  it('static value commit calls onExpressionChange with static("value") — AE-13', () => {
    const onExpressionChange = vi.fn();
    renderBuilder({ onExpressionChange });
    // Toggle static mode
    fireEvent.click(screen.getByRole('button', { name: /Use a static value instead/i }));
    // Enter a value
    fireEvent.change(screen.getByRole('textbox', { name: 'Static string value' }), {
      target: { value: 'hello world' },
    });
    // Click Use Static Value
    fireEvent.click(screen.getByRole('button', { name: /Use Static Value/i }));
    expect(onExpressionChange).toHaveBeenCalledWith('static("hello world")');
  });

  it('Use Static Value is disabled when string value is empty', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('button', { name: /Use a static value instead/i }));
    expect(screen.getByRole('button', { name: /Use Static Value/i })).toBeDisabled();
  });
});

describe('GuidedBuilder — ref API', () => {
  it('insertSourceField adds a field to the selection', async () => {
    const ref = createRef<GuidedBuilderRef>();
    renderBuilder({}, ref);
    // Inject a field via ref
    ref.current!.insertSourceField('customer.name');
    // Pill should appear
    expect(await screen.findByTestId('field-pill')).toHaveTextContent('customer.name');
  });

  it('insertSourceField does not add duplicate fields', () => {
    const ref = createRef<GuidedBuilderRef>();
    renderBuilder({}, ref);
    ref.current!.insertSourceField('orderId');
    ref.current!.insertSourceField('orderId');
    const pills = screen.getAllByTestId('field-pill');
    expect(pills).toHaveLength(1);
  });
});
