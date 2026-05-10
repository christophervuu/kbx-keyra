import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React, { useEffect } from 'react';

import { ScalarFieldBuilder } from './ScalarFieldBuilder';
import type { ScalarFieldBuilderProps } from './ScalarFieldBuilder';
import { PreviewProvider } from '../context/preview-context';
import { usePreviewSetters } from '../context/preview-context';

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
  selectedTargetPath: 'patient.firstName',
  selectedTargetType: 'string',
  selectedTargetRequired: false,
  currentStatus: 'unmapped',
  currentExpression: '',
  parsedSourceSchema: SOURCE_SCHEMA,
  ...makeDraftApi(),
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

  it('AI buttons have descriptive per-action tooltips (FS-040 T-04)', () => {
    renderBuilder();
    expect(screen.getByTestId('ai-suggest-btn')).toHaveAttribute(
      'title',
      'AI-powered expression suggestions \u2014 available in a future release',
    );
    expect(screen.getByTestId('ai-explain-btn')).toHaveAttribute(
      'title',
      'AI-powered explanation \u2014 available in a future release',
    );
    expect(screen.getByTestId('ai-fix-btn')).toHaveAttribute(
      'title',
      'AI-powered fix suggestions \u2014 available in a future release',
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

  it('keeps builder mode for concat expression created via Source Card function call', () => {
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
      // Previous field → editor mode (decomposition failed)
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
  });

  // ---------------------------------------------------------------------------
  // FS-040 T-04: Reset draft button
  // ---------------------------------------------------------------------------

  describe('FS-040 T-04: Reset draft button', () => {
    it('Reset draft button is hidden when expression is empty', () => {
      renderBuilder({ currentExpression: '' });
      expect(screen.queryByTestId('reset-draft-btn')).not.toBeInTheDocument();
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
        currentExpression: '{"id": "x"}', // forces editor mode
        updateDraft,
        revertDraft,
        getDraftExpression,
      });
      // Type a trivial expression in editor
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("email")' } });
      // Now reset — trivial expression, no confirmation
      fireEvent.click(screen.getByTestId('reset-draft-btn'));
      expect(screen.queryByTestId('reset-draft-confirm-prompt')).not.toBeInTheDocument();
    });

    it('clicking Reset draft on a non-trivial expression shows confirmation prompt', () => {
      renderBuilder({
        currentExpression: '{"id": "x"}', // forces editor mode
      });
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'upper(source("email"))' } });
      fireEvent.click(screen.getByTestId('reset-draft-btn'));
      expect(screen.getByTestId('reset-draft-confirm-prompt')).toBeInTheDocument();
    });

    it('confirming reset clears the expression', () => {
      renderBuilder({
        currentExpression: '{"id": "x"}', // forces editor mode
      });
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'upper(source("email"))' } });
      fireEvent.click(screen.getByTestId('reset-draft-btn'));
      fireEvent.click(screen.getByTestId('reset-draft-confirm'));
      expect(screen.queryByTestId('reset-draft-confirm-prompt')).not.toBeInTheDocument();
    });

    it('canceling reset preserves the expression and hides prompt', () => {
      renderBuilder({
        currentExpression: '{"id": "x"}', // forces editor mode
      });
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
      return render(
        <PreviewProvider>
          <WithSourceData sourceData={sourceData}>
            <ScalarFieldBuilder {...props} />
          </WithSourceData>
        </PreviewProvider>,
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
      expect(screen.getByTestId('feedback-result-no-data')).toHaveTextContent(
        'Load test data to see live results.',
      );
    });

    it('feedback result area is present in the builder (AE-05)', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByTestId('feedback-result')).toBeInTheDocument();
    });

    it('does not show no-data message when sourceData is provided (AE-05)', async () => {
      renderBuilderWithContext({}, { firstName: 'Alice' });
      // The no-data placeholder should not be visible when sourceData is set
      await waitFor(() => {
        expect(screen.queryByTestId('feedback-result-no-data')).not.toBeInTheDocument();
      });
    });

    it('renders validation structure badge', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByTestId('validation-structure-badge')).toBeInTheDocument();
    });

    it('renders validation output type badge', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByTestId('validation-output-type-badge')).toBeInTheDocument();
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

    it('structure badge shows neutral state in editor mode', () => {
      renderBuilderWithContext({}, null);
      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const badge = screen.getByTestId('validation-structure-badge');
      expect(badge.getAttribute('aria-label')).toContain('not applicable');
    });
  });

  // FS-040 T-05: UnsavedDiffPanel integration
  describe('FS-040 T-05: UnsavedDiffPanel integration', () => {
    const SAVED_RULES = [
      { target: 'patient.firstName', expression: 'source("firstName")', type: 'direct' as const, description: '' },
    ];

    it('renders the unsaved diff panel trigger', () => {
      renderBuilder({ savedRules: SAVED_RULES });
      expect(screen.getByTestId('unsaved-diff-panel')).toBeInTheDocument();
      expect(screen.getByTestId('unsaved-diff-trigger')).toBeInTheDocument();
    });

    it('diff panel is collapsed by default', () => {
      renderBuilder({ savedRules: SAVED_RULES });
      expect(screen.getByTestId('unsaved-diff-trigger')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByTestId('unsaved-diff-content')).not.toBeInTheDocument();
    });

    it('clicking trigger expands the diff panel', () => {
      renderBuilder({ savedRules: SAVED_RULES, currentExpression: 'source("firstName")' });
      fireEvent.click(screen.getByTestId('unsaved-diff-trigger'));
      expect(screen.getByTestId('unsaved-diff-content')).toBeInTheDocument();
    });

    it('shows unsaved badge when expression differs from saved', () => {
      renderBuilder({
        savedRules: SAVED_RULES,
        currentExpression: 'upper(source("firstName"))',
      });
      expect(screen.getByTestId('unsaved-diff-badge')).toBeInTheDocument();
    });

    it('does not show unsaved badge when expression matches saved', () => {
      renderBuilder({
        savedRules: SAVED_RULES,
        currentExpression: 'source("firstName")',
      });
      expect(screen.queryByTestId('unsaved-diff-badge')).not.toBeInTheDocument();
    });

    it('shows "Revert to saved" button when expanded and expression is modified', () => {
      renderBuilder({
        savedRules: SAVED_RULES,
        currentExpression: 'upper(source("firstName"))',
      });
      fireEvent.click(screen.getByTestId('unsaved-diff-trigger'));
      expect(screen.getByTestId('revert-to-saved-btn')).toBeInTheDocument();
    });

    it('clicking "Revert to saved" calls revertDraft', () => {
      const { revertDraft } = makeDraftApi();
      renderBuilder({
        savedRules: SAVED_RULES,
        currentExpression: 'upper(source("firstName"))',
        revertDraft,
      });
      fireEvent.click(screen.getByTestId('unsaved-diff-trigger'));
      fireEvent.click(screen.getByTestId('revert-to-saved-btn'));
      expect(revertDraft).toHaveBeenCalledWith('patient.firstName');
    });

    it('diff panel collapses after revert', () => {
      renderBuilder({
        savedRules: SAVED_RULES,
        currentExpression: 'upper(source("firstName"))',
      });
      fireEvent.click(screen.getByTestId('unsaved-diff-trigger'));
      expect(screen.getByTestId('unsaved-diff-content')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('revert-to-saved-btn'));
      expect(screen.queryByTestId('unsaved-diff-content')).not.toBeInTheDocument();
    });
  });
});
