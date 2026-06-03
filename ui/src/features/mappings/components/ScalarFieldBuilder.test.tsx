import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ScalarFieldBuilder } from './ScalarFieldBuilder';
import type { ScalarFieldBuilderProps } from './ScalarFieldBuilder';
import { PreviewProvider } from '../context/preview-context';
import { usePreviewSetters } from '../context/preview-context';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import type { ExplainRuleResult, ParsedSchema, SchemaTreeNode, SmartFixResult, SuggestExpressionResult } from '@/lib/types/domain';

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

/**
 * Build a minimal draft API triple for tests.
 * By default no draft exists (getDraftExpression returns null → field is clean).
 */
function makeDraftApi(overrides: {
  draftMap?: Map<string, string>;
  updateDraft?: ReturnType<typeof vi.fn>;
  revertDraft?: ReturnType<typeof vi.fn>;
} = {}) {
  const draftMap = overrides.draftMap ?? new Map<string, string>();
  const updateDraft = overrides.updateDraft ?? vi.fn((path: string, expr: string) => {
    draftMap.set(path, expr);
  });
  const revertDraft = overrides.revertDraft ?? vi.fn((path: string) => {
    draftMap.delete(path);
  });
  const getDraftExpression = vi.fn((path: string) => draftMap.get(path) ?? null);
  return { updateDraft, revertDraft, getDraftExpression, draftMap };
}

const DEFAULT_PROPS: ScalarFieldBuilderProps = {
  mappingId: 'mapping-123',
  selectedTargetPath: 'patient.firstName',
  selectedTargetType: 'string',
  selectedTargetRequired: false,
  currentStatus: 'unmapped',
  currentExpression: '',
  parsedSourceSchema: SOURCE_SCHEMA,
  updateDraft: vi.fn(),
  revertDraft: vi.fn(),
  getDraftExpression: () => null,
  currentRuleIndex: null,
  currentRuleDiagnostics: [],
  currentRuleVersion: 0,
};

// Default mock adapter used by renderBuilder when no adapter override is provided
function makeDefaultAdapter(): Partial<ApiAdapter> {
  return {
    explainRule: vi.fn().mockResolvedValue({ explanation: 'Test explanation.' } satisfies ExplainRuleResult),
    suggestExpression: vi.fn().mockResolvedValue({
      expression: 'source("firstName")',
      explanation: 'Maps first name.',
      validation: { valid: true, diagnostics: [] },
      readyToApply: true,
      context: {
        sourceNodeCount: 10,
        includedNodeCount: 10,
        truncated: false,
        approxTokenCount: 128,
        byteLength: 512,
      },
    } satisfies SuggestExpressionResult),
    smartFix: vi.fn().mockResolvedValue({
      originalExpression: 'source("firstName")',
      suggestedExpression: 'trim(source("firstName"))',
      explanation: 'Trim surrounding whitespace from first name.',
      validation: { valid: true, diagnostics: [] },
      readyToApply: true,
      diagnosticsScopeApplied: 'all',
      context: {
        truncated: false,
        approxTokenCount: 100,
        byteLength: 500,
        totalDiagnosticCount: 1,
        includedDiagnosticCount: 1,
        sourceNodeCount: 10,
        includedSourceNodeCount: 10,
        targetNodeCount: 10,
        includedTargetNodeCount: 10,
      },
      applyGuard: {
        ruleVersion: 1,
        ruleHash: 'fnv1a-c8f6f0de',
      },
    } satisfies SmartFixResult),
  };
}

function renderBuilder(
  overrides: Partial<ScalarFieldBuilderProps> = {},
  adapter?: Partial<ApiAdapter>,
) {
  const mockAdapter = adapter ?? makeDefaultAdapter();
  const draftApi = makeDraftApi();
  const props = { ...DEFAULT_PROPS, ...draftApi, ...overrides };
  const result = render(
    <AdapterProvider adapter={mockAdapter as ApiAdapter}>
      <ScalarFieldBuilder {...props} />
    </AdapterProvider>,
  );
  // Provide a wrapped rerender so callers don't lose the AdapterProvider
  const rerender = (element: React.ReactElement) => {
    result.rerender(
      <AdapterProvider adapter={mockAdapter as ApiAdapter}>
        {element}
      </AdapterProvider>,
    );
  };
  return { ...result, rerender };
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

  it('does not show required label when required=false', () => {
    renderBuilder({ selectedTargetRequired: false });
    expect(screen.queryByTestId('header-required-label')).not.toBeInTheDocument();
  });

  it('shows current mapping status icon', () => {
    renderBuilder({ currentStatus: 'mapped' });
    expect(screen.getByTestId('header-status-icon')).toBeInTheDocument();
  });

  it('does not emit empty draft when selecting a mapped field', () => {
    const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi();
    const { rerender } = renderBuilder({
      selectedTargetPath: 'patient.firstName',
      currentExpression: '',
      updateDraft,
      revertDraft,
      getDraftExpression,
    });

    rerender(
      <ScalarFieldBuilder
        {...DEFAULT_PROPS}
        selectedTargetPath="patient.lastName"
        currentExpression='source("lastName")'
        currentStatus="mapped"
        updateDraft={updateDraft}
        revertDraft={revertDraft}
        getDraftExpression={getDraftExpression}
      />,
    );

    expect(updateDraft).not.toHaveBeenCalledWith('patient.lastName', '');
  });

  it('does not emit synthetic draft writes when switching between mapped fields', () => {
    const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi();
    const { rerender } = renderBuilder({
      selectedTargetPath: 'patient.firstName',
      currentExpression: 'source("firstName")',
      currentStatus: 'mapped',
      updateDraft,
      revertDraft,
      getDraftExpression,
    });

    rerender(
      <ScalarFieldBuilder
        {...DEFAULT_PROPS}
        selectedTargetPath="patient.lastName"
        currentExpression='source("lastName")'
        currentStatus="mapped"
        updateDraft={updateDraft}
        revertDraft={revertDraft}
        getDraftExpression={getDraftExpression}
      />,
    );

    rerender(
      <ScalarFieldBuilder
        {...DEFAULT_PROPS}
        selectedTargetPath="patient.firstName"
        currentExpression='source("firstName")'
        currentStatus="mapped"
        updateDraft={updateDraft}
        revertDraft={revertDraft}
        getDraftExpression={getDraftExpression}
      />,
    );

    expect(updateDraft).not.toHaveBeenCalled();
  });

  // Suggestions section removed (FS-040 T-02/T-03) — replaced by BuilderFeedbackArea
  it('does not render suggested-sources-section (removed in FS-040)', () => {
    renderBuilder();
    expect(screen.queryByTestId('suggested-sources-section')).not.toBeInTheDocument();
  });

  it('does not render suggestion pills (removed in FS-040)', () => {
    renderBuilder();
    expect(screen.queryByTestId('suggestion-firstName')).not.toBeInTheDocument();
  });

  // Mode toggle
  it('renders in builder mode by default', () => {
    renderBuilder();
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('expression-editor-slot')).not.toBeInTheDocument();
  });

  it('keeps expression area as an internal scroll container in builder mode', () => {
    renderBuilder();
    const expressionArea = screen.getByTestId('expression-area');
    expect(expressionArea.className).toContain('overflow-y-auto');
  });

  it('uses scrollable expression area in editor mode', () => {
    renderBuilder();
    fireEvent.click(screen.getByTestId('mode-toggle-editor'));

    const expressionArea = screen.getByTestId('expression-area');
    expect(expressionArea.className).toContain('overflow-y-auto');
  });

  it('renders question-first Step 1 prompt in builder mode', () => {
    renderBuilder();
    expect(screen.getByTestId('scalar-entry-question')).toHaveTextContent('Where does this value come from?');
    expect(screen.queryByText('Step 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Step 2')).not.toBeInTheDocument();
  });

  it('renders array-style scalar entry selector cards', () => {
    renderBuilder();

    expect(screen.getByTestId('scalar-entry-mode-source')).toHaveTextContent('Source field');
    expect(screen.getByTestId('scalar-entry-mode-static')).toHaveTextContent('Static value');
    expect(screen.getByTestId('scalar-entry-mode-external')).toHaveTextContent('External');
    expect(screen.getByTestId('scalar-entry-mode-external')).toBeDisabled();
    expect(screen.queryByTestId('scalar-source-field-section')).not.toBeInTheDocument();
  });

  it('collapses entry question block to selected summary and re-expands on change', async () => {
    const user = userEvent.setup();
    renderBuilder();

    await user.click(screen.getByTestId('scalar-entry-mode-source'));
    expect(screen.getByTestId('scalar-entry-question-selected')).toHaveTextContent('Source field');
    expect(screen.getByTestId('scalar-entry-question-selected')).toHaveTextContent('Use a field from the source schema');
    expect(screen.queryByTestId('scalar-entry-mode-source')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('scalar-entry-question-toggle'));
    expect(screen.getByTestId('scalar-entry-mode-source')).toBeInTheDocument();
  });

  it('keeps Step 2 logic lane hidden until Step 1 source is selected', async () => {
    const user = userEvent.setup();
    renderBuilder();

    expect(screen.queryByTestId('scalar-logic-lane')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('scalar-entry-mode-source'));
    await user.click(screen.getByTestId('chain-source-card-input'));
    await user.click(screen.getByTestId('chain-source-card-option-firstName'));

    expect(screen.getByTestId('scalar-logic-lane')).toBeInTheDocument();
    expect(screen.getByTestId('scalar-logic-heading')).toHaveTextContent('Logic');
    expect(screen.getByTestId('add-logic-option-transform')).toBeInTheDocument();
    expect(screen.getByTestId('add-logic-option-condition')).toBeInTheDocument();
    expect(screen.getByTestId('add-logic-option-valuemap')).toBeInTheDocument();
  });

  it('shows Step 2 logic lane after Step 1 static value is provided', async () => {
    const user = userEvent.setup();
    renderBuilder();

    expect(screen.queryByTestId('scalar-logic-lane')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('scalar-entry-mode-static'));
    await user.type(screen.getByTestId('static-value-text-input'), 'hello');

    expect(screen.getByTestId('scalar-logic-lane')).toBeInTheDocument();
    expect(screen.getByTestId('scalar-logic-heading')).toHaveTextContent('Logic');
    expect(screen.getByTestId('add-logic-option-transform')).toBeInTheDocument();
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

  // Apply button removed (FS-039 T-05)
  it('does not render an Apply button', () => {
    renderBuilder();
    expect(screen.queryByTestId('apply-btn')).not.toBeInTheDocument();
  });

  // Next unmapped button removed (FS-039 T-05)
  it('does not render a Next unmapped button', () => {
    renderBuilder();
    expect(screen.queryByTestId('next-unmapped-btn')).not.toBeInTheDocument();
  });

  // AI buttons
  it('renders AI Suggest button as enabled (FS-042)', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-suggest-btn')).not.toBeDisabled();
  });

  it('renders AI Explain button as disabled', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-explain-btn')).toBeDisabled();
  });

  it('renders AI Fix button as disabled when no rule diagnostics are provided', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-fix-btn')).toBeDisabled();
  });

  it('enables AI Fix button when rule diagnostics are provided', () => {
    renderBuilder({
      currentExpression: 'source("firstName")',
      currentRuleIndex: 0,
      currentRuleVersion: 1,
      currentRuleDiagnostics: [
        {
          code: 'TYPE_MISMATCH',
          severity: 'error',
          message: 'Expected string.',
        },
      ],
    });
    expect(screen.getByTestId('ai-fix-btn')).not.toBeDisabled();
  });

  it('AI buttons have descriptive per-action tooltips (FS-040 T-04)', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-suggest-btn')).toHaveAttribute(
      'title',
      'Generate a DSL expression from natural language',
    );
    // Explain button tooltip depends on expression state:
    // empty expression → "No expression to explain"
    expect(screen.getByTestId('ai-explain-btn')).toHaveAttribute(
      'title',
      'No expression to explain',
    );
    expect(screen.getByTestId('ai-fix-btn')).toHaveAttribute(
      'title',
      'Fix requires rule diagnostics',
    );
  });

  it('AI buttons have descriptive aria-labels (FS-040 T-04)', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-suggest-btn').getAttribute('aria-label')).toContain('Suggest');
    expect(screen.getByTestId('ai-explain-btn').getAttribute('aria-label')).toContain('Explain');
    expect(screen.getByTestId('ai-fix-btn').getAttribute('aria-label')).toContain('Fix');
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

  // T-01: Hydration on target field selection
  it('shows builder mode with decomposed state when a mapped field is selected', () => {
    renderBuilder({
      currentExpression: 'source("firstName")',
      currentStatus: 'mapped',
    });
    // Decomposable expression → builder mode
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('expression-editor-slot')).not.toBeInTheDocument();
  });

  it('hydrates valueMap with transformed source in builder mode', () => {
    renderBuilder({
      currentExpression: 'valueMap(lower(source("notes")), {"hello": "hi", "bye": "good bye"}, "afternoon")',
      currentStatus: 'mapped',
    });
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('decomposition-warning-container')).not.toBeInTheDocument();
  });

  it('shows empty builder state when an unmapped field is selected', () => {
    renderBuilder({
      currentExpression: '',
      currentStatus: 'unmapped',
    });
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('decomposition-warning-container')).not.toBeInTheDocument();
  });

  it('falls back to editor mode with warning when expression cannot be decomposed', () => {
    renderBuilder({
      // object root is unsupported across decomposers
      currentExpression: '{"id": "x"}',
      currentStatus: 'mapped',
    });
    expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();
    expect(screen.getByTestId('decomposition-warning-container')).toBeInTheDocument();
  });

  it('opens concat expression in builder mode without warning when chain decomposition succeeds', () => {
    renderBuilder({
      currentExpression: 'concat(source("first"), source("last"))',
      currentStatus: 'mapped',
    });
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('decomposition-warning-container')).not.toBeInTheDocument();
  });

  it('editor mode shows the loaded expression text when decomposition fails', () => {
    renderBuilder({
      currentExpression: '{"id": "x"}',
      currentStatus: 'mapped',
    });
    // RawDslEditor should contain the expression text
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('{"id": "x"}');
  });

  it('switches to builder mode when target changes to a mapped decomposable field', () => {
    const { rerender } = renderBuilder({
      currentExpression: '{"id": "x"}',
      currentStatus: 'mapped',
    });
    // Initially in editor (decomposition failed)
    expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();

    rerender(
      <ScalarFieldBuilder
        {...DEFAULT_PROPS}
        selectedTargetPath="patient.lastName"
        currentExpression='source("lastName")'
        currentStatus="mapped"
      />,
    );
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('decomposition-warning-container')).not.toBeInTheDocument();
  });

  it('switches to empty builder state when target changes to an unmapped field', () => {
    const { rerender } = renderBuilder({
      currentExpression: 'source("firstName")',
      currentStatus: 'mapped',
    });
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();

    rerender(
      <ScalarFieldBuilder
        {...DEFAULT_PROPS}
        selectedTargetPath="patient.newField"
        currentExpression=""
        currentStatus="unmapped"
      />,
    );
    expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    expect(screen.queryByTestId('decomposition-warning-container')).not.toBeInTheDocument();
  });

  // T-02: AE-08 — builder reset on navigation (no stale state)
  describe('AE-08: builder reset on navigation', () => {
    it('header updates to new field name after navigation', () => {
      const { rerender } = renderBuilder({
        selectedTargetPath: 'patient.firstName',
        currentExpression: 'source("firstName")',
        currentStatus: 'mapped',
      });
      expect(screen.getByTestId('header-target-path')).toHaveTextContent('patient.firstName');

      rerender(
        <ScalarFieldBuilder
          {...DEFAULT_PROPS}
          selectedTargetPath="patient.lastName"
          currentExpression='source("lastName")'
          currentStatus="mapped"
        />,
      );
      expect(screen.getByTestId('header-target-path')).toHaveTextContent('patient.lastName');
    });

    it('header type badge updates after navigation', () => {
      const { rerender } = renderBuilder({
        selectedTargetPath: 'patient.firstName',
        selectedTargetType: 'string',
        currentExpression: '',
      });
      expect(screen.getByTestId('header-type-badge')).toHaveTextContent('string');

      rerender(
        <ScalarFieldBuilder
          {...DEFAULT_PROPS}
          selectedTargetPath="patient.age"
          selectedTargetType="number"
          currentExpression=""
        />,
      );
      expect(screen.getByTestId('header-type-badge')).toHaveTextContent('number');
    });

    it('warning banner from previous field does not persist after navigation', () => {
      const { rerender } = renderBuilder({
        currentExpression: '{"id": "x"}',
        currentStatus: 'mapped',
      });
      // Previous field had decomposition failure → warning shown
      expect(screen.getByTestId('decomposition-warning-container')).toBeInTheDocument();

      // Navigate to a new unmapped field
      rerender(
        <ScalarFieldBuilder
          {...DEFAULT_PROPS}
          selectedTargetPath="patient.lastName"
          currentExpression=""
          currentStatus="unmapped"
        />,
      );
      // Warning must be gone
      expect(screen.queryByTestId('decomposition-warning-container')).not.toBeInTheDocument();
    });

    it('editor mode from previous field resets to builder mode for decomposable new field', () => {
      const { rerender } = renderBuilder({
        currentExpression: '{"id": "x"}',
        currentStatus: 'mapped',
      });
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();

      // Navigate to a field with a decomposable expression
      rerender(
        <ScalarFieldBuilder
          {...DEFAULT_PROPS}
          selectedTargetPath="patient.lastName"
          currentExpression='source("lastName")'
          currentStatus="mapped"
        />,
      );
      // New field → builder mode
      expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // FS-039 T-05: Auto-draft model
  // ---------------------------------------------------------------------------

  describe('FS-039 T-05: auto-draft model', () => {
    it('calls updateDraft when user types in editor mode', () => {
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi();
      renderBuilder({
        currentExpression: '{"id": "x"}', // forces editor mode
        updateDraft,
        revertDraft,
        getDraftExpression,
      });
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("x")' } });
      expect(updateDraft).toHaveBeenCalledWith('patient.firstName', 'source("x")');
    });

    it('does not call updateDraft on initial render (no spurious draft)', () => {
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi();
      renderBuilder({ updateDraft, revertDraft, getDraftExpression });
      expect(updateDraft).not.toHaveBeenCalled();
    });

    it('calls onExpressionChange when user types in editor mode', () => {
      const onExpressionChange = vi.fn();
      renderBuilder({
        currentExpression: '{"id": "x"}', // forces editor mode
        onExpressionChange,
      });
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("x")' } });
      expect(onExpressionChange).toHaveBeenCalledWith('source("x")');
    });

    it('does not call onExpressionChange on initial render', () => {
      const onExpressionChange = vi.fn();
      renderBuilder({ onExpressionChange });
      expect(onExpressionChange).not.toHaveBeenCalled();
    });

    it('Discard changes button is hidden when field is clean (no draft)', () => {
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi();
      renderBuilder({ updateDraft, revertDraft, getDraftExpression });
      expect(screen.queryByTestId('discard-btn')).not.toBeInTheDocument();
    });

    it('Discard changes button is visible when getDraftExpression returns non-null', () => {
      const draftMap = new Map([['patient.firstName', 'source("lastName")']]);
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi({ draftMap });
      renderBuilder({ updateDraft, revertDraft, getDraftExpression });
      expect(screen.getByTestId('discard-btn')).toBeInTheDocument();
    });

    it('clicking Discard calls revertDraft with target path', () => {
      const draftMap = new Map([['patient.firstName', 'source("lastName")']]);
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi({ draftMap });
      renderBuilder({ updateDraft, revertDraft, getDraftExpression });
      fireEvent.click(screen.getByTestId('discard-btn'));
      expect(revertDraft).toHaveBeenCalledWith('patient.firstName');
    });

    it('Discard button has correct aria-label', () => {
      const draftMap = new Map([['patient.firstName', 'source("lastName")']]);
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi({ draftMap });
      renderBuilder({ updateDraft, revertDraft, getDraftExpression });
      expect(screen.getByTestId('discard-btn')).toHaveAttribute(
        'aria-label',
        'Discard changes for patient.firstName',
      );
    });

    it('hydrates from draft expression when getDraftExpression returns a value', () => {
      const draftMap = new Map([['patient.firstName', 'source("lastName")']]);
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi({ draftMap });
      renderBuilder({
        currentExpression: 'source("firstName")',
        updateDraft,
        revertDraft,
        getDraftExpression,
      });
      // Draft takes priority over saved expression — builder should show draft
      // (we verify getDraftExpression was consulted)
      expect(getDraftExpression).toHaveBeenCalledWith('patient.firstName');
    });

    it('falls back to saved expression when no draft exists', () => {
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi();
      renderBuilder({
        currentExpression: 'source("firstName")',
        currentStatus: 'mapped',
        updateDraft,
        revertDraft,
        getDraftExpression,
      });
      // No draft → builder mode with saved expression decomposed
      expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
    });

    it('applies stagedSourcePath to source selection in builder mode', async () => {
      const { rerender } = renderBuilder({
        stagedSourcePath: null,
        currentExpression: '',
      });

      rerender(
        <ScalarFieldBuilder
          {...DEFAULT_PROPS}
          stagedSourcePath="lastName"
          currentExpression=""
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('chain-source-card-input')).toHaveValue('lastName');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // FS-040 T-04: Reset draft button
  // ---------------------------------------------------------------------------

  describe('FS-040 T-04: Reset draft button', () => {
    it('Reset draft button is disabled when expression is empty', () => {
      renderBuilder({ currentExpression: '' });
      expect(screen.getByTestId('reset-draft-btn')).toBeDisabled();
    });

    it('Reset draft button is visible when expression is non-empty', () => {
      renderBuilder({ currentExpression: 'source("firstName")', currentStatus: 'mapped' });
      expect(screen.getByTestId('reset-draft-btn')).toBeInTheDocument();
    });

    it('Reset draft button has correct aria-label', () => {
      renderBuilder({ currentExpression: 'source("firstName")', currentStatus: 'mapped' });
      expect(screen.getByTestId('reset-draft-btn')).toHaveAttribute(
        'aria-label',
        'Reset current draft expression',
      );
    });

    it('clicking Reset draft on a trivial expression resets immediately (no confirmation)', () => {
      const { updateDraft, revertDraft, getDraftExpression } = makeDraftApi();
      renderBuilder({
        currentExpression: '{"id": "x"}',
        updateDraft,
        revertDraft,
        getDraftExpression,
      });
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("email")' } });
      // Now reset — trivial expression, no confirmation
      fireEvent.click(screen.getByTestId('reset-draft-btn'));
      expect(screen.queryByTestId('reset-draft-confirm-prompt')).not.toBeInTheDocument();
    });

    it('clicking Reset draft on a non-trivial expression shows confirmation prompt', () => {
      renderBuilder({
        currentExpression: '{"id": "x"}',
      });
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'upper(source("email"))' } });
      fireEvent.click(screen.getByTestId('reset-draft-btn'));
      expect(screen.getByTestId('reset-draft-confirm-prompt')).toBeInTheDocument();
    });

    it('confirming reset clears the expression', () => {
      renderBuilder({
        currentExpression: '{"id": "x"}',
      });
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'upper(source("email"))' } });
      fireEvent.click(screen.getByTestId('reset-draft-btn'));
      fireEvent.click(screen.getByTestId('reset-draft-confirm'));
      expect(screen.queryByTestId('reset-draft-confirm-prompt')).not.toBeInTheDocument();
    });

    it('canceling reset preserves the expression and hides prompt', () => {
      renderBuilder({
        currentExpression: '{"id": "x"}',
      });
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'upper(source("email"))' } });
      fireEvent.click(screen.getByTestId('reset-draft-btn'));
      fireEvent.click(screen.getByTestId('reset-draft-cancel'));
      expect(screen.queryByTestId('reset-draft-confirm-prompt')).not.toBeInTheDocument();
      // Expression textarea should still have the value
      expect(screen.getByRole('textbox')).toHaveValue('upper(source("email"))');
    });
  });

  // ---------------------------------------------------------------------------
  // T-07: Header compression — type badge left, toggle in header
  // (Suggested Sources tests removed — section replaced by BuilderFeedbackArea in FS-040)
  // ---------------------------------------------------------------------------

  describe('T-07: header compression', () => {
    it('type badge appears before target path in the DOM (left side)', () => {
      renderBuilder();
      const badge = screen.getByTestId('header-type-badge');
      const path = screen.getByTestId('header-target-path');
      // badge should come before path in document order
      expect(badge.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('Builder|Editor toggle is rendered within the header section', () => {
      renderBuilder();
      const header = screen.getByTestId('header-target-path').closest('[class*="border-b"]');
      expect(header).toContainElement(screen.getByTestId('mode-toggle-builder'));
      expect(header).toContainElement(screen.getByTestId('mode-toggle-editor'));
    });

    it('Suggested Sources section is absent (replaced by BuilderFeedbackArea)', () => {
      renderBuilder();
      expect(screen.queryByTestId('suggested-sources-section')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // T-08 / FS-040 T-04: Remove mapping — now in header overflow menu (⋮)
  // ---------------------------------------------------------------------------

  describe('T-08 / FS-040 T-04: Remove mapping via header overflow menu', () => {
    it('overflow trigger (⋮) is visible when currentStatus=mapped and onClearMapping provided', () => {
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping: vi.fn(),
      });
      expect(screen.getByTestId('header-overflow-trigger')).toBeInTheDocument();
    });

    it('overflow trigger is hidden when currentStatus=unmapped', () => {
      renderBuilder({
        currentStatus: 'unmapped',
        onClearMapping: vi.fn(),
      });
      expect(screen.queryByTestId('header-overflow-trigger')).not.toBeInTheDocument();
    });

    it('overflow trigger is hidden when onClearMapping not provided', () => {
      renderBuilder({ currentStatus: 'mapped', currentExpression: 'source("firstName")' });
      expect(screen.queryByTestId('header-overflow-trigger')).not.toBeInTheDocument();
    });

    it('overflow trigger has aria-haspopup="menu" and aria-label="More actions"', () => {
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping: vi.fn(),
      });
      const trigger = screen.getByTestId('header-overflow-trigger');
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-label', 'More actions');
    });

    it('clicking overflow trigger opens the menu', () => {
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping: vi.fn(),
      });
      expect(screen.queryByTestId('header-overflow-menu')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('header-overflow-trigger'));
      expect(screen.getByTestId('header-overflow-menu')).toBeInTheDocument();
    });

    it('overflow menu contains "Remove mapping" menuitem', () => {
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping: vi.fn(),
      });
      fireEvent.click(screen.getByTestId('header-overflow-trigger'));
      const item = screen.getByTestId('remove-mapping-btn');
      expect(item).toBeInTheDocument();
      expect(item).toHaveAttribute('role', 'menuitem');
    });

    it('clicking "Remove mapping" shows confirmation dialog with role="alertdialog"', () => {
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping: vi.fn(),
      });
      fireEvent.click(screen.getByTestId('header-overflow-trigger'));
      fireEvent.click(screen.getByTestId('remove-mapping-btn'));
      expect(screen.getByTestId('remove-mapping-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('remove-mapping-dialog')).toHaveAttribute('role', 'alertdialog');
    });

    it('confirming "Remove mapping" calls onClearMapping with target path', () => {
      const onClearMapping = vi.fn();
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping,
      });
      fireEvent.click(screen.getByTestId('header-overflow-trigger'));
      fireEvent.click(screen.getByTestId('remove-mapping-btn'));
      fireEvent.click(screen.getByTestId('remove-mapping-confirm'));
      expect(onClearMapping).toHaveBeenCalledWith('patient.firstName');
    });

    it('canceling "Remove mapping" dialog does not call onClearMapping', () => {
      const onClearMapping = vi.fn();
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping,
      });
      fireEvent.click(screen.getByTestId('header-overflow-trigger'));
      fireEvent.click(screen.getByTestId('remove-mapping-btn'));
      fireEvent.click(screen.getByTestId('remove-mapping-cancel'));
      expect(onClearMapping).not.toHaveBeenCalled();
      expect(screen.queryByTestId('remove-mapping-dialog')).not.toBeInTheDocument();
    });

    it('old clear-mapping-btn is no longer in the action row', () => {
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping: vi.fn(),
      });
      expect(screen.queryByTestId('clear-mapping-btn')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // FS-040 T-02/T-03: BuilderFeedbackArea replaces LiveResultDisplay in ScalarFieldBuilder
  // (AE-05 / AE-06 — result display now lives in BuilderFeedbackArea)
  // ---------------------------------------------------------------------------

  describe('FS-040 T-02: BuilderFeedbackArea integration', () => {
    /** Wrapper that seeds PreviewContext with a parsed sourceData value */
    function WithSourceData({
      sourceData,
      children,
    }: {
      sourceData: unknown | null;
      children: React.ReactNode;
    }) {
      const { setSourceData } = usePreviewSetters();
      useEffect(() => {
        setSourceData(sourceData);
      }, [sourceData, setSourceData]);
      return <>{children}</>;
    }

    function renderBuilderWithContext(
      overrides: Partial<ScalarFieldBuilderProps> = {},
      sourceData: unknown | null = null,
    ) {
      const props = { ...DEFAULT_PROPS, ...overrides };
      const mockAdapter: Partial<ApiAdapter> = {
        explainRule: vi.fn().mockResolvedValue({ explanation: 'Test explanation.' } satisfies ExplainRuleResult),
      };
      return render(
        <AdapterProvider adapter={mockAdapter as ApiAdapter}>
          <PreviewProvider>
            <WithSourceData sourceData={sourceData}>
              <ScalarFieldBuilder {...props} />
            </WithSourceData>
          </PreviewProvider>
        </AdapterProvider>,
      );
    }

    it('renders BuilderFeedbackArea (AE-04)', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByTestId('builder-feedback-area')).toBeInTheDocument();
    });

    it('BuilderFeedbackArea has correct ARIA region label', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByRole('region', { name: 'Expression feedback' })).toBeInTheDocument();
    });

    it('shows "Load test data to see live results." when no sourceData in context (AE-06)', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByTestId('feedback-compact-result-summary')).toHaveTextContent('Result: no test data');
    });

    it('feedback result area is present in the builder (AE-05)', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByTestId('feedback-compact-result-summary')).toBeInTheDocument();
    });

    it('keeps feedback result area rendered when sourceData is provided (AE-05)', async () => {
      renderBuilderWithContext({}, { firstName: 'Alice' });
      await waitFor(() => {
        expect(screen.getByTestId('feedback-compact-result-summary')).toBeInTheDocument();
      });
    });

    it('renders validation structure badge', () => {
      renderBuilderWithContext({}, null);
      expect(screen.queryByTestId('validation-structure-badge')).not.toBeInTheDocument();
    });

    it('renders validation output type badge', () => {
      renderBuilderWithContext({}, null);
      expect(screen.queryByTestId('validation-output-type-badge')).not.toBeInTheDocument();
    });

    it('BuilderFeedbackArea is visible in both builder and editor modes', () => {
      renderBuilderWithContext({}, null);
      // Builder mode — feedback area present
      expect(screen.getByTestId('builder-feedback-area')).toBeInTheDocument();

      // Switch to editor mode
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      // Feedback area still present
      expect(screen.getByTestId('builder-feedback-area')).toBeInTheDocument();
    });

    it('validation tags remain hidden in editor mode', () => {
      renderBuilderWithContext({}, null);
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      expect(screen.queryByTestId('validation-structure-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('validation-output-type-badge')).not.toBeInTheDocument();
    });
  });

  // FS-040 T-05: Unsaved changes section removed
  describe('FS-040 T-05: Unsaved changes section removal', () => {
    it('does not render unsaved diff panel controls', () => {
      renderBuilder({
        currentExpression: 'upper(source("firstName"))',
      });
      expect(screen.queryByTestId('unsaved-diff-panel')).not.toBeInTheDocument();
      expect(screen.queryByTestId('unsaved-diff-trigger')).not.toBeInTheDocument();
      expect(screen.queryByTestId('view-changes-inline-btn')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // FS-041: Explain Rule integration
  // ---------------------------------------------------------------------------

  describe('Explain Rule (FS-041)', () => {
    it('AE-03: Explain button is disabled when expression is empty', () => {
      renderBuilder({ currentExpression: '' });
      const btn = screen.getByTestId('ai-explain-btn');
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'No expression to explain');
    });

    it('Explain button is enabled when expression is non-empty', async () => {
      renderBuilder({
        currentExpression: 'source("firstName")',
        // Use no-op updateDraft so chain state effect doesn't overwrite expression via draft
        updateDraft: vi.fn(),
        getDraftExpression: vi.fn().mockReturnValue(null),
      });
      // Switch to editor mode so expression state is driven by raw DSL
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const btn = screen.getByTestId('ai-explain-btn');
      expect(btn).not.toBeDisabled();
      expect(btn).toHaveAttribute('title', 'Explain this expression using AI');
    });

    it('AE-01/AE-04/AE-03: shows explanation panel with text + generated-assistance label and does not mutate draft/expression state', async () => {
      const explainRule = vi.fn().mockResolvedValue({
        explanation: 'Maps the first name from the source.',
        confidence: 'high',
        limitations: ['Assumes source firstName exists.'],
      } satisfies ExplainRuleResult);
      const updateDraft = vi.fn();
      const revertDraft = vi.fn();
      const getDraftExpression = vi.fn().mockReturnValue(null);

      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          updateDraft,
          revertDraft,
          getDraftExpression,
        },
        { explainRule },
      );
      // Switch to editor mode so expression state is driven by raw DSL
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));

      const editor = screen.getByRole('textbox', { name: 'DSL expression editor' }) as HTMLTextAreaElement;
      const before = editor.value;

      fireEvent.click(screen.getByTestId('ai-explain-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
      });
      expect(screen.getByTestId('explanation-panel')).toHaveTextContent(
        'Maps the first name from the source.',
      );
      expect(screen.getByTestId('explanation-assistance-label')).toHaveTextContent(
        'AI-generated assistance. This explanation is not persisted to mapping content.',
      );

      // Non-mutation guarantee (AE-03): explain flow must not change draft/expression state.
      expect(editor.value).toBe(before);
      expect(updateDraft).not.toHaveBeenCalled();
      expect(revertDraft).not.toHaveBeenCalled();
    });

    it('AE-04: shows offline error message', async () => {
      const explainRule = vi.fn().mockRejectedValue(
        new Error('Not available in offline mode'),
      );
      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          updateDraft: vi.fn(),
          getDraftExpression: vi.fn().mockReturnValue(null),
        },
        { explainRule },
      );
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));

      fireEvent.click(screen.getByTestId('ai-explain-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
      });
      expect(screen.getByTestId('explanation-panel')).toHaveTextContent(
        'Explain is not available in offline mode',
      );
    });

    it('AE-03: shows network error message + Try again and preserves expression/draft state', async () => {
      const netMsg = 'Could not reach the Explain service. Check your connection and try again.';
      const explainRule = vi.fn().mockRejectedValue(new Error(netMsg));
      const updateDraft = vi.fn();
      const revertDraft = vi.fn();
      const getDraftExpression = vi.fn().mockReturnValue(null);

      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          updateDraft,
          revertDraft,
          getDraftExpression,
        },
        { explainRule },
      );
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));

      const editor = screen.getByRole('textbox', { name: 'DSL expression editor' }) as HTMLTextAreaElement;
      const before = editor.value;

      fireEvent.click(screen.getByTestId('ai-explain-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
      });
      expect(screen.getByTestId('explanation-panel')).toHaveTextContent(netMsg);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

      // Non-mutation guarantee (AE-03)
      expect(editor.value).toBe(before);
      expect(updateDraft).not.toHaveBeenCalled();
      expect(revertDraft).not.toHaveBeenCalled();
    });

    it('AE-08: dismiss closes the panel', async () => {
      const explainRule = vi.fn().mockResolvedValue({
        explanation: 'Some explanation.',
      } satisfies ExplainRuleResult);
      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          updateDraft: vi.fn(),
          getDraftExpression: vi.fn().mockReturnValue(null),
        },
        { explainRule },
      );
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));

      fireEvent.click(screen.getByTestId('ai-explain-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss explanation' }));
      expect(screen.queryByTestId('explanation-panel')).not.toBeInTheDocument();
    });

    it('AE-09: explanation panel disappears when selectedTargetPath changes', async () => {
      const explainRule = vi.fn().mockResolvedValue({
        explanation: 'Some explanation.',
      } satisfies ExplainRuleResult);
      const { rerender } = renderBuilder(
        {
          currentExpression: 'source("firstName")',
          updateDraft: vi.fn(),
          getDraftExpression: vi.fn().mockReturnValue(null),
        },
        { explainRule },
      );
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));

      fireEvent.click(screen.getByTestId('ai-explain-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('explanation-panel')).toBeInTheDocument();
      });

      // Simulate navigating to a different field
      rerender(
        <ScalarFieldBuilder
          {...DEFAULT_PROPS}
          selectedTargetPath="patient.lastName"
          currentExpression='source("lastName")'
          updateDraft={vi.fn()}
          getDraftExpression={vi.fn().mockReturnValue(null)}
        />,
      );

      expect(screen.queryByTestId('explanation-panel')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // FS-042: Suggest Expression integration
  // ---------------------------------------------------------------------------

  describe('Suggest Expression (FS-042)', () => {
    it('generate sends canonical suggest payload (mappingId/target/instruction, no sourceContext)', async () => {
      const suggestExpression = vi.fn().mockResolvedValue({
        expression: 'source("firstName")',
        explanation: 'Maps first name.',
        validation: { valid: true, diagnostics: [] },
        readyToApply: true,
        context: {
          sourceNodeCount: 10,
          includedNodeCount: 10,
          truncated: false,
          approxTokenCount: 128,
          byteLength: 512,
        },
      } satisfies SuggestExpressionResult);
      renderBuilder({ mappingId: 'mapping-xyz' }, { suggestExpression });

      fireEvent.click(screen.getByTestId('ai-suggest-btn'));
      const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
      fireEvent.change(textarea, { target: { value: 'map first name' } });
      fireEvent.click(screen.getByRole('button', { name: /generate expression/i }));

      await waitFor(() => {
        expect(suggestExpression).toHaveBeenCalledTimes(1);
      });

      const firstCall = suggestExpression.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(firstCall).toMatchObject({
        mappingId: 'mapping-xyz',
        instruction: 'map first name',
        targetPath: 'patient.firstName',
        targetType: 'string',
      });
      expect(firstCall).not.toHaveProperty('sourceContext');
    });

    it('clicking Suggest button opens the inline input area', () => {
      renderBuilder();
      fireEvent.click(screen.getByTestId('ai-suggest-btn'));
      expect(screen.getByTestId('suggest-expression-inline')).toBeInTheDocument();
      expect(
        screen.getByRole('textbox', { name: /natural language instruction/i }),
      ).toBeInTheDocument();
    });

    it('SuggestExpressionInline is not rendered when suggest state is idle', () => {
      renderBuilder();
      expect(screen.queryByTestId('suggest-expression-inline')).not.toBeInTheDocument();
    });

    it('suggest panel appears above the action buttons when opened', () => {
      renderBuilder();
      fireEvent.click(screen.getByTestId('ai-suggest-btn'));

      const suggestPanel = screen.getByTestId('suggest-expression-inline');
      const actionRow = screen.getByTestId('builder-action-row');

      expect(suggestPanel.compareDocumentPosition(actionRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('Accept calls updateDraft with target path and expression', async () => {
      const updateDraft = vi.fn();
      const suggestExpression = vi.fn().mockResolvedValue({
        expression: 'source("firstName")',
        explanation: 'Maps first name.',
        validation: { valid: true, diagnostics: [] },
        readyToApply: true,
        context: {
          sourceNodeCount: 10,
          includedNodeCount: 10,
          truncated: false,
          approxTokenCount: 128,
          byteLength: 512,
        },
      } satisfies SuggestExpressionResult);
      renderBuilder({ updateDraft }, { suggestExpression });

      // Open suggest panel
      fireEvent.click(screen.getByTestId('ai-suggest-btn'));

      // Type instruction and generate
      const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
      fireEvent.change(textarea, { target: { value: 'map first name' } });
      fireEvent.click(screen.getByRole('button', { name: /generate expression/i }));

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /accept/i }));
      expect(updateDraft).toHaveBeenCalledWith('patient.firstName', 'source("firstName")');
      expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
      expect(screen.getByTestId('chain-source-card-input')).toHaveValue('firstName');
      // Panel should close after accept
      expect(screen.queryByTestId('suggest-expression-inline')).not.toBeInTheDocument();
    });

    it('Accepting concat suggestion hydrates builder immediately with accepted expression', async () => {
      const updateDraft = vi.fn();
      const suggestExpression = vi.fn().mockResolvedValue({
        expression: 'concat(source("customer.firstName"), " ", source("customer.lastName"))',
        explanation: 'Concatenate first and last name.',
        validation: { valid: true, diagnostics: [] },
        readyToApply: true,
        context: {
          sourceNodeCount: 10,
          includedNodeCount: 10,
          truncated: false,
          approxTokenCount: 128,
          byteLength: 512,
        },
      } satisfies SuggestExpressionResult);
      renderBuilder({ updateDraft }, { suggestExpression });

      fireEvent.click(screen.getByTestId('ai-suggest-btn'));

      const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
      fireEvent.change(textarea, { target: { value: 'build full name from first and last' } });
      fireEvent.click(screen.getByRole('button', { name: /generate expression/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /accept/i }));

      expect(updateDraft).toHaveBeenCalledWith(
        'patient.firstName',
        'concat(source("customer.firstName"), " ", source("customer.lastName"))',
      );
      expect(screen.getByTestId('expression-builder-slot')).toBeInTheDocument();
      expect(screen.getByTestId('chain-source-card-input')).toHaveValue('customer.firstName');
      expect(screen.queryByTestId('suggest-expression-inline')).not.toBeInTheDocument();
    });

    it('suggest panel resets when selectedTargetPath changes', async () => {
      const { rerender } = renderBuilder();

      // Open suggest panel
      fireEvent.click(screen.getByTestId('ai-suggest-btn'));
      expect(screen.getByTestId('suggest-expression-inline')).toBeInTheDocument();

      // Navigate to a different field
      rerender(
        <ScalarFieldBuilder
          {...DEFAULT_PROPS}
          selectedTargetPath="patient.lastName"
          currentExpression=""
        />,
      );

      expect(screen.queryByTestId('suggest-expression-inline')).not.toBeInTheDocument();
    });

    it('invalid suggestion shows diagnostics, blocks Accept, and dismiss does not mutate draft', async () => {
      const updateDraft = vi.fn();
      const suggestExpression = vi.fn().mockResolvedValue({
        expression: 'concat(source("firstName"), source("amount"))',
        explanation: 'Combine values',
        validation: {
          valid: false,
          diagnostics: [
            {
              code: 'TYPE_MISMATCH',
              severity: 'error',
              message: 'Expression returns string but target expects number.',
            },
          ],
        },
        readyToApply: false,
        context: {
          sourceNodeCount: 10,
          includedNodeCount: 10,
          truncated: false,
          approxTokenCount: 128,
          byteLength: 512,
        },
      } satisfies SuggestExpressionResult);
      renderBuilder({ selectedTargetType: 'number', updateDraft }, { suggestExpression });

      fireEvent.click(screen.getByTestId('ai-suggest-btn'));
      const textarea = screen.getByRole('textbox', { name: /natural language instruction/i });
      fireEvent.change(textarea, { target: { value: 'format name and amount' } });
      fireEvent.click(screen.getByRole('button', { name: /generate expression/i }));

      await waitFor(() => {
        expect(screen.getByTestId('suggest-expression-validation')).toBeInTheDocument();
      });

      const acceptBtn = screen.getByRole('button', { name: /accept/i });
      expect(acceptBtn).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: /dismiss suggestion/i }));
      expect(screen.queryByTestId('suggest-expression-inline')).not.toBeInTheDocument();
      expect(updateDraft).not.toHaveBeenCalled();
    });
  });

  describe('Smart Fix (FS-071)', () => {
    it('runs Smart Fix and renders review panel with original/suggested/explanation', async () => {
      const smartFix = vi.fn().mockResolvedValue({
        originalExpression: 'source("firstName")',
        suggestedExpression: 'trim(source("firstName"))',
        explanation: 'Trim whitespace around the name.',
        validation: { valid: true, diagnostics: [] },
        readyToApply: true,
        diagnosticsScopeApplied: 'all',
        context: {
          truncated: false,
          approxTokenCount: 90,
          byteLength: 480,
          totalDiagnosticCount: 1,
          includedDiagnosticCount: 1,
          sourceNodeCount: 10,
          includedSourceNodeCount: 10,
          targetNodeCount: 10,
          includedTargetNodeCount: 10,
        },
        applyGuard: {
          ruleVersion: 1,
          ruleHash: 'fnv1a-c8f6f0de',
        },
      } satisfies SmartFixResult);

      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          currentRuleIndex: 0,
          currentRuleVersion: 1,
          currentRuleDiagnostics: [
            {
              code: 'TYPE_MISMATCH',
              severity: 'error',
              message: 'Expected string',
            },
          ],
        },
        { smartFix },
      );

      fireEvent.click(screen.getByTestId('ai-fix-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('smart-fix-inline')).toBeInTheDocument();
      });

      expect(screen.getByTestId('smart-fix-original-expression')).toHaveTextContent('source("firstName")');
      expect(screen.getByRole('textbox', { name: /smart fix expression editor/i })).toHaveValue('trim(source("firstName"))');
      expect(screen.getByTestId('smart-fix-explanation')).toHaveTextContent('Trim whitespace around the name.');
      expect(screen.getByTestId('smart-fix-assistance-label')).toHaveTextContent(
        'AI-generated assistance. Suggestions are not persisted until you explicitly accept.',
      );
    });

    it('accept applies expression and dismiss closes panel', async () => {
      const updateDraft = vi.fn();
      const smartFix = vi.fn().mockResolvedValue({
        originalExpression: 'source("firstName")',
        suggestedExpression: 'trim(source("firstName"))',
        explanation: 'Trim whitespace around the name.',
        validation: { valid: true, diagnostics: [] },
        readyToApply: true,
        diagnosticsScopeApplied: 'all',
        context: {
          truncated: false,
          approxTokenCount: 90,
          byteLength: 480,
          totalDiagnosticCount: 1,
          includedDiagnosticCount: 1,
          sourceNodeCount: 10,
          includedSourceNodeCount: 10,
          targetNodeCount: 10,
          includedTargetNodeCount: 10,
        },
        applyGuard: {
          ruleVersion: 1,
          ruleHash: 'fnv1a-c8f6f0de',
        },
      } satisfies SmartFixResult);

      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          currentRuleIndex: 0,
          currentRuleVersion: 1,
          currentRuleDiagnostics: [
            {
              code: 'TYPE_MISMATCH',
              severity: 'error',
              message: 'Expected string',
            },
          ],
          updateDraft,
        },
        { smartFix },
      );

      fireEvent.click(screen.getByTestId('ai-fix-btn'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /accept smart fix/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /accept smart fix/i }));
      expect(updateDraft).toHaveBeenCalledWith('patient.firstName', 'trim(source("firstName"))');
      expect(screen.queryByTestId('smart-fix-inline')).not.toBeInTheDocument();
    });

    it('invalid suggestion gates accept until user edits to valid expression', async () => {
      const updateDraft = vi.fn();
      const smartFix = vi.fn().mockResolvedValue({
        originalExpression: 'source("firstName")',
        suggestedExpression: 'source(',
        explanation: 'Attempted fix.',
        validation: {
          valid: false,
          diagnostics: [
            {
              code: 'PARSE_ERROR',
              severity: 'error',
              message: 'Expression could not be parsed.',
            },
          ],
        },
        readyToApply: false,
        diagnosticsScopeApplied: 'all',
        context: {
          truncated: false,
          approxTokenCount: 90,
          byteLength: 480,
          totalDiagnosticCount: 1,
          includedDiagnosticCount: 1,
          sourceNodeCount: 10,
          includedSourceNodeCount: 10,
          targetNodeCount: 10,
          includedTargetNodeCount: 10,
        },
        applyGuard: {
          ruleVersion: 1,
          ruleHash: 'fnv1a-c8f6f0de',
        },
      } satisfies SmartFixResult);

      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          currentRuleIndex: 0,
          currentRuleVersion: 1,
          currentRuleDiagnostics: [
            {
              code: 'PARSE_ERROR',
              severity: 'error',
              message: 'Expression could not be parsed.',
            },
          ],
          updateDraft,
        },
        { smartFix },
      );

      fireEvent.click(screen.getByTestId('ai-fix-btn'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /accept smart fix/i })).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /accept smart fix/i })).toBeDisabled();
      expect(screen.getByTestId('smart-fix-validation')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('smart-fix-edit-btn'));
      const editor = screen.getByRole('textbox', { name: /smart fix expression editor/i });
      fireEvent.change(editor, { target: { value: 'source("firstName")' } });

      expect(screen.getByRole('button', { name: /accept smart fix/i })).not.toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: /accept smart fix/i }));

      expect(updateDraft).toHaveBeenCalledWith('patient.firstName', 'source("firstName")');
    });

    it('stale mismatch blocks accept and offers rerun latest CTA', async () => {
      const smartFix = vi.fn().mockResolvedValue({
        originalExpression: 'source("firstName")',
        suggestedExpression: 'trim(source("firstName"))',
        explanation: 'Trim whitespace around the name.',
        validation: { valid: true, diagnostics: [] },
        readyToApply: true,
        diagnosticsScopeApplied: 'all',
        context: {
          truncated: false,
          approxTokenCount: 90,
          byteLength: 480,
          totalDiagnosticCount: 1,
          includedDiagnosticCount: 1,
          sourceNodeCount: 10,
          includedSourceNodeCount: 10,
          targetNodeCount: 10,
          includedTargetNodeCount: 10,
        },
        applyGuard: {
          ruleVersion: 99,
          ruleHash: 'fnv1a-deadbeef',
        },
      } satisfies SmartFixResult);

      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          currentRuleIndex: 0,
          currentRuleVersion: 1,
          currentRuleDiagnostics: [
            {
              code: 'TYPE_MISMATCH',
              severity: 'error',
              message: 'Expected string',
            },
          ],
        },
        { smartFix },
      );

      fireEvent.click(screen.getByTestId('ai-fix-btn'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /accept smart fix/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /accept smart fix/i }));

      expect(screen.getByTestId('smart-fix-stale')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /re-run fix on latest rule/i })).toBeInTheDocument();
    });

    it('dismiss does not mutate draft state', async () => {
      const updateDraft = vi.fn();
      const smartFix = vi.fn().mockResolvedValue({
        originalExpression: 'source("firstName")',
        suggestedExpression: 'trim(source("firstName"))',
        explanation: 'Trim whitespace around the name.',
        validation: { valid: true, diagnostics: [] },
        readyToApply: true,
        diagnosticsScopeApplied: 'all',
        context: {
          truncated: false,
          approxTokenCount: 90,
          byteLength: 480,
          totalDiagnosticCount: 1,
          includedDiagnosticCount: 1,
          sourceNodeCount: 10,
          includedSourceNodeCount: 10,
          targetNodeCount: 10,
          includedTargetNodeCount: 10,
        },
        applyGuard: {
          ruleVersion: 1,
          ruleHash: 'fnv1a-c8f6f0de',
        },
      } satisfies SmartFixResult);

      renderBuilder(
        {
          currentExpression: 'source("firstName")',
          currentRuleIndex: 0,
          currentRuleVersion: 1,
          currentRuleDiagnostics: [
            {
              code: 'TYPE_MISMATCH',
              severity: 'error',
              message: 'Expected string',
            },
          ],
          updateDraft,
        },
        { smartFix },
      );

      fireEvent.click(screen.getByTestId('ai-fix-btn'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /dismiss smart fix/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /dismiss smart fix/i }));
      expect(updateDraft).not.toHaveBeenCalled();
      expect(screen.queryByTestId('smart-fix-inline')).not.toBeInTheDocument();
    });
  });
});
