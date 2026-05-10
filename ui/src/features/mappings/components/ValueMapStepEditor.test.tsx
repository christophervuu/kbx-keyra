/**
 * ValueMapStepEditor.test.tsx — FS-039 T-09
 *
 * Component tests for ValueMapStepEditor.
 * Covers all Verification Requirements from T-09.md.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ValueMapStepEditor } from './ValueMapStepEditor';
import type { ValueMapStepEditorProps } from './ValueMapStepEditor';
import {
  createEmptyFS039ValueMapStep,
  createEmptyChain,
} from '../lib/chain-builder-state';
import type { FS039ValueMapStep } from '../lib/chain-builder-state';
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
    makeNode('country', 'country'),
    makeNode('tier', 'tier'),
  ],
  totalFieldCount: 2,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const DEFAULT_PROPS: ValueMapStepEditorProps = {
  step: createEmptyFS039ValueMapStep(),
  stepIndex: 0,
  onChange: vi.fn(),
  parsedSourceSchema: SOURCE_SCHEMA,
};

function renderEditor(overrides: Partial<ValueMapStepEditorProps> = {}) {
  return render(<ValueMapStepEditor {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('ValueMapStepEditor — structure', () => {
  it('renders the root element', () => {
    renderEditor();
    expect(screen.getByTestId('valuemap-step-editor-0')).toBeInTheDocument();
  });

  it('renders the default case section', () => {
    renderEditor();
    expect(screen.getByTestId('valuemap-step-editor-0-default')).toBeInTheDocument();
  });

  it('renders Default label text', () => {
    renderEditor();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('renders the required/cannot be removed note', () => {
    renderEditor();
    expect(screen.getByText(/cannot be removed/)).toBeInTheDocument();
  });

  it('renders Add Mapping button', () => {
    renderEditor();
    expect(screen.getByTestId('valuemap-step-editor-0-add-row')).toBeInTheDocument();
  });

  it('renders initial mapping row from createEmptyFS039ValueMapStep', () => {
    renderEditor();
    // createEmptyFS039ValueMapStep starts with one empty mapping row
    expect(screen.getByTestId('valuemap-row-0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Mapping rows — add / remove
// ---------------------------------------------------------------------------

describe('ValueMapStepEditor — mapping rows', () => {
  it('clicking Add Mapping fires onChange with new row appended', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('valuemap-step-editor-0-add-row'));
    const call = onChange.mock.calls[0][0] as FS039ValueMapStep;
    expect(call.mappings).toHaveLength(2);
    expect(call.mappings[1]!.whenValue).toBe('');
  });

  it('clicking remove on a row fires onChange with that row removed', () => {
    const onChange = vi.fn();
    const step: FS039ValueMapStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'US', outputChain: createEmptyChain() },
        { whenValue: 'UK', outputChain: createEmptyChain() },
      ],
      defaultValue: createEmptyChain(),
    };
    renderEditor({ step, onChange });
    fireEvent.click(screen.getByTestId('valuemap-row-0-remove'));
    const call = onChange.mock.calls[0][0] as FS039ValueMapStep;
    expect(call.mappings).toHaveLength(1);
    expect(call.mappings[0]!.whenValue).toBe('UK');
  });

  it('editing the when input fires onChange with updated whenValue', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.change(screen.getByTestId('valuemap-row-0-when'), { target: { value: 'US' } });
    const call = onChange.mock.calls[0][0] as FS039ValueMapStep;
    expect(call.mappings[0]!.whenValue).toBe('US');
  });

  it('renders when input with aria-label', () => {
    renderEditor();
    expect(screen.getByTestId('valuemap-row-0-when')).toHaveAttribute(
      'aria-label',
      'Mapping row 1 input value',
    );
  });

  it('renders remove button with aria-label', () => {
    renderEditor();
    expect(screen.getByTestId('valuemap-row-0-remove')).toHaveAttribute(
      'aria-label',
      'Remove mapping row 1',
    );
  });

  it('renders multiple rows when step has multiple mappings', () => {
    const step: FS039ValueMapStep = {
      kind: 'valueMap',
      mappings: [
        { whenValue: 'US', outputChain: createEmptyChain() },
        { whenValue: 'UK', outputChain: createEmptyChain() },
        { whenValue: 'CA', outputChain: createEmptyChain() },
      ],
      defaultValue: createEmptyChain(),
    };
    renderEditor({ step });
    expect(screen.getByTestId('valuemap-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('valuemap-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('valuemap-row-2')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Default case — cannot be removed
// ---------------------------------------------------------------------------

describe('ValueMapStepEditor — default case', () => {
  it('default section has no remove button', () => {
    renderEditor();
    const defaultSection = screen.getByTestId('valuemap-step-editor-0-default');
    expect(defaultSection.querySelector('[aria-label*="Remove"]')).toBeNull();
  });

  it('default output editor renders field/value toggle', () => {
    renderEditor();
    expect(screen.getByTestId('valuemap-step-editor-0-default-output-kind-field')).toBeInTheDocument();
    expect(screen.getByTestId('valuemap-step-editor-0-default-output-kind-static')).toBeInTheDocument();
  });

  it('selecting field in default output fires onChange with field source in defaultValue', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('valuemap-step-editor-0-default-output-kind-field'));
    const call = onChange.mock.calls[0][0] as FS039ValueMapStep;
    expect(call.defaultValue.source.kind).toBe('field');
  });

  it('selecting static in default output fires onChange with static source in defaultValue', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('valuemap-step-editor-0-default-output-kind-static'));
    const call = onChange.mock.calls[0][0] as FS039ValueMapStep;
    expect(call.defaultValue.source.kind).toBe('static');
  });

  it('typing in default static input fires onChange with updated defaultValue', () => {
    const onChange = vi.fn();
    const step: FS039ValueMapStep = {
      kind: 'valueMap',
      mappings: [],
      defaultValue: { source: { kind: 'static', value: { type: 'string', value: '' } }, steps: [] },
    };
    renderEditor({ step, onChange });
    fireEvent.change(screen.getByTestId('valuemap-step-editor-0-default-output-static-input'), {
      target: { value: 'Unknown' },
    });
    const call = onChange.mock.calls[0][0] as FS039ValueMapStep;
    expect(call.defaultValue.source.kind).toBe('static');
    if (call.defaultValue.source.kind === 'static') {
      expect((call.defaultValue.source.value as { value: string }).value).toBe('Unknown');
    }
  });
});

// ---------------------------------------------------------------------------
// Output chain for mapping rows
// ---------------------------------------------------------------------------

describe('ValueMapStepEditor — row output chains', () => {
  it('row output editor renders field/value toggle', () => {
    renderEditor();
    expect(screen.getByTestId('valuemap-row-0-output-kind-field')).toBeInTheDocument();
    expect(screen.getByTestId('valuemap-row-0-output-kind-static')).toBeInTheDocument();
  });

  it('selecting field in row output fires onChange with field source in outputChain', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('valuemap-row-0-output-kind-field'));
    const call = onChange.mock.calls[0][0] as FS039ValueMapStep;
    expect(call.mappings[0]!.outputChain.source.kind).toBe('field');
  });

  it('selecting static in row output fires onChange with static source in outputChain', () => {
    const onChange = vi.fn();
    renderEditor({ onChange });
    fireEvent.click(screen.getByTestId('valuemap-row-0-output-kind-static'));
    const call = onChange.mock.calls[0][0] as FS039ValueMapStep;
    expect(call.mappings[0]!.outputChain.source.kind).toBe('static');
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('ValueMapStepEditor — accessibility', () => {
  it('Add Mapping button is keyboard focusable', () => {
    renderEditor();
    expect(screen.getByTestId('valuemap-step-editor-0-add-row').tagName).toBe('BUTTON');
  });

  it('row output kind group has aria-label', () => {
    renderEditor();
    const group = screen.getByTestId('valuemap-row-0-output').querySelector('[role="group"]');
    expect(group).toHaveAttribute('aria-label', 'Row 1 output output type');
  });

  it('default output kind group has aria-label', () => {
    renderEditor();
    const group = screen
      .getByTestId('valuemap-step-editor-0-default-output')
      .querySelector('[role="group"]');
    expect(group).toHaveAttribute('aria-label', 'Default output output type');
  });
});

// ---------------------------------------------------------------------------
// stepIndex prop
// ---------------------------------------------------------------------------

describe('ValueMapStepEditor — stepIndex', () => {
  it('uses stepIndex in data-testid', () => {
    renderEditor({ stepIndex: 3 });
    expect(screen.getByTestId('valuemap-step-editor-3')).toBeInTheDocument();
    expect(screen.getByTestId('valuemap-step-editor-3-default')).toBeInTheDocument();
    expect(screen.getByTestId('valuemap-step-editor-3-add-row')).toBeInTheDocument();
  });
});
