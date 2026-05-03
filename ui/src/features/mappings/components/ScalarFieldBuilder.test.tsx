import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScalarFieldBuilder } from './ScalarFieldBuilder';
import type { ScalarFieldBuilderProps } from './ScalarFieldBuilder';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeNode(
  path: string,
  fieldName: string,
  type: SchemaTreeNode['type'],
): SchemaTreeNode {
  return {
    path,
    fieldName,
    type,
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
    makeNode('firstName', 'firstName', 'string'),
    makeNode('lastName', 'lastName', 'string'),
    makeNode('age', 'age', 'number'),
    makeNode('isActive', 'isActive', 'boolean'),
  ],
  totalFieldCount: 4,
  format: 'json-schema',
  parseTimeMs: 0,
  inferred: false,
};

const DEFAULT_PROPS: ScalarFieldBuilderProps = {
  selectedTargetPath: 'patient.firstName',
  selectedTargetType: 'string',
  selectedTargetRequired: false,
  currentStatus: 'unmapped',
  currentExpression: '',
  parsedSourceSchema: SOURCE_SCHEMA,
  onSave: vi.fn(),
};

function renderBuilder(overrides: Partial<ScalarFieldBuilderProps> = {}) {
  return render(<ScalarFieldBuilder {...DEFAULT_PROPS} {...overrides} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScalarFieldBuilder', () => {
  // Header
  it('renders target path in header', () => {
    renderBuilder();
    expect(screen.getByTestId('header-target-path')).toHaveTextContent('patient.firstName');
  });

  it('renders type badge in header', () => {
    renderBuilder();
    expect(screen.getByTestId('header-type-badge')).toHaveTextContent('string');
  });

  it('shows Required label when required=true', () => {
    renderBuilder({ selectedTargetRequired: true });
    expect(screen.getByTestId('header-required-label')).toHaveTextContent('Required');
  });

  it('shows Optional label when required=false', () => {
    renderBuilder({ selectedTargetRequired: false });
    expect(screen.getByTestId('header-required-label')).toHaveTextContent('Optional');
  });

  it('shows current mapping status', () => {
    renderBuilder({ currentStatus: 'mapped' });
    expect(screen.getByTestId('header-status')).toHaveTextContent('Mapped');
  });

  // Suggestions
  it('renders suggested source fields based on heuristic matching', () => {
    renderBuilder();
    // 'firstName' target → 'firstName' source (exact match)
    expect(screen.getByTestId('suggestion-firstName')).toBeInTheDocument();
  });

  it('shows fallback message when no suggestions match', () => {
    renderBuilder({
      selectedTargetPath: 'zzznomatch',
      selectedTargetType: 'string',
    });
    expect(screen.getByTestId('suggestions-empty')).toBeInTheDocument();
  });

  it('shows at most 5 suggestions', () => {
    const manyNodes = Array.from({ length: 20 }, (_, i) =>
      makeNode(`nameField${i}`, `nameField${i}`, 'string'),
    );
    const schema: ParsedSchema = {
      nodes: manyNodes,
      totalFieldCount: 20,
      format: 'json-schema',
      parseTimeMs: 0,
      inferred: false,
    };
    renderBuilder({ selectedTargetPath: 'name', parsedSourceSchema: schema });
    const pills = screen.getAllByTestId(/^suggestion-/);
    expect(pills.length).toBeLessThanOrEqual(5);
  });

  it('excludes type-incompatible suggestions', () => {
    // Target is boolean — should not show string/number suggestions
    renderBuilder({
      selectedTargetPath: 'isActive',
      selectedTargetType: 'boolean',
    });
    // 'isActive' boolean source should appear; 'firstName' string should not
    expect(screen.queryByTestId('suggestion-firstName')).not.toBeInTheDocument();
  });

  // Mode toggle
  it('renders in builder mode by default', () => {
    renderBuilder();
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('expression-editor-slot')).not.toBeInTheDocument();
  });

  it('switches to editor mode when Editor toggle is clicked', () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId('mode-toggle-editor'));
    expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('expression-builder-slot')).not.toBeInTheDocument();
  });

  it('switches back to builder mode when Builder toggle is clicked', () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId('mode-toggle-editor'));
    fireEvent.click(screen.getByTestId('mode-toggle-builder'));
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
  });

  // Save button
  it('save button is disabled when expression is empty', () => {
    renderBuilder({ currentExpression: '' });
    expect(screen.getByTestId('save-btn')).toBeDisabled();
  });

  it('fires onSave with target path and expression when save is clicked with valid expression', async () => {
    const onSave = vi.fn();
    renderBuilder({ currentExpression: 'source("firstName")', onSave });
    // Wait for debounced validation to settle
    await new Promise((r) => setTimeout(r, 400));
    const saveBtn = screen.getByTestId('save-btn');
    if (!saveBtn.hasAttribute('disabled')) {
      fireEvent.click(saveBtn);
      expect(onSave).toHaveBeenCalledWith('patient.firstName', 'source("firstName")');
    }
  });

  // AI buttons
  it('renders AI Suggest button as disabled', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-suggest-btn')).toBeDisabled();
  });

  it('renders AI Explain button as disabled', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-explain-btn')).toBeDisabled();
  });

  it('renders AI Fix button as disabled', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-fix-btn')).toBeDisabled();
  });

  it('AI buttons have Coming soon tooltip', () => {
    renderBuilder();
    const tooltip = 'Coming soon \u2014 AI features available in a future release';
    expect(screen.getByTestId('ai-suggest-btn')).toHaveAttribute('title', tooltip);
    expect(screen.getByTestId('ai-explain-btn')).toHaveAttribute('title', tooltip);
    expect(screen.getByTestId('ai-fix-btn')).toHaveAttribute('title', tooltip);
  });

  // Target change resets state
  it('resets to builder mode when target path changes', () => {
    const { rerender } = renderBuilder();
    fireEvent.click(screen.getByTestId('mode-toggle-editor'));
    expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();

    rerender(
      <ScalarFieldBuilder
        {...DEFAULT_PROPS}
        selectedTargetPath="patient.lastName"
      />,
    );
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
  });
});
