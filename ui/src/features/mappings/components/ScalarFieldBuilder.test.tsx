import { render, screen, fireEvent } from '@testing-library/react';
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

const DEFAULT_PROPS: ScalarFieldBuilderProps = {
  selectedTargetPath: 'patient.firstName',
  selectedTargetType: 'string',
  selectedTargetRequired: false,
  currentStatus: 'unmapped',
  currentExpression: '',
  parsedSourceSchema: SOURCE_SCHEMA,
  onApply: vi.fn(),
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

  it('hides Suggested Sources section when no suggestions match (T-07)', () => {
    renderBuilder({
      selectedTargetPath: 'zzznomatch',
      selectedTargetType: 'string',
    });
    expect(screen.queryByTestId('suggested-sources-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('suggestions-empty')).not.toBeInTheDocument();
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

  // Apply button
  it('apply button is disabled when expression is empty', () => {
    renderBuilder({ currentExpression: '' });
    expect(screen.getByTestId('apply-btn')).toBeDisabled();
  });

  it('apply button shows label "Apply"', () => {
    renderBuilder();
    expect(screen.getByTestId('apply-btn')).toHaveTextContent('Apply');
  });

  it('fires onApply with target path and expression when apply is clicked with valid expression', async () => {
    const onApply = vi.fn();
    renderBuilder({ currentExpression: 'source("firstName")', onApply });
    fireEvent.click(screen.getByTestId('mode-toggle-editor'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

    // Wait for debounced validation to settle
    await new Promise((r) => setTimeout(r, 400));
    const applyBtn = screen.getByTestId('apply-btn');
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledWith('patient.firstName', 'source("lastName")');
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
      // concat() at root is not a recognized builder expression
      currentExpression: 'concat(source("first"), source("last"))',
      currentStatus: 'mapped',
    });
    expect(screen.getByTestId('expression-editor-slot')).toBeInTheDocument();
    expect(screen.getByTestId('decomposition-warning-container')).toBeInTheDocument();
  });

  it('editor mode shows the loaded expression text when decomposition fails', () => {
    renderBuilder({
      currentExpression: 'concat(source("first"), source("last"))',
      currentStatus: 'mapped',
    });
    // RawDslEditor should contain the expression text
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('concat(source("first"), source("last"))');
  });

  it('switches to builder mode when target changes to a mapped decomposable field', () => {
    const { rerender } = renderBuilder({
      currentExpression: 'concat(source("a"), source("b"))',
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
        currentExpression: 'concat(source("a"), source("b"))',
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
        currentExpression: 'concat(source("a"), source("b"))',
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

  // T-02: AE-09 — navigation guard fires when unapplied changes exist
  describe('AE-09: onExpressionChange fires for parent navigation guard', () => {
    it('calls onExpressionChange when user types in editor mode', () => {
      const onExpressionChange = vi.fn();
      renderBuilder({
        currentExpression: 'concat(source("a"), source("b"))', // forces editor mode
        onExpressionChange,
      });
      // In editor mode, typing fires onExpressionChange
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("x")' } });
      expect(onExpressionChange).toHaveBeenCalledWith('source("x")');
    });

    it('does not call onExpressionChange on initial render (no spurious guard trigger)', () => {
      const onExpressionChange = vi.fn();
      renderBuilder({ onExpressionChange });
      // No change events on mount
      expect(onExpressionChange).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // T-04: AE-10 — Apply stays on field, Applied state, Next unmapped button
  // ---------------------------------------------------------------------------

  describe('AE-10: Apply does not auto-advance', () => {
    it('Apply button is disabled when expression is unchanged from current mapping', () => {
      renderBuilder({ currentExpression: 'source("firstName")' });
      const applyBtn = screen.getByTestId('apply-btn');
      expect(applyBtn).toBeDisabled();
    });

    it('Apply button shows "Applied" state after clicking', async () => {
      const onApply = vi.fn();
      renderBuilder({ currentExpression: 'source("firstName")', onApply });

      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

      const applyBtn = screen.getByTestId('apply-btn');
      fireEvent.click(applyBtn);
      // After apply, button should show "Applied" text
      expect(screen.getByTestId('apply-btn')).toHaveTextContent('Applied');
    });

    it('Apply button re-enables after expression changes post-apply', async () => {
      const onApply = vi.fn();
      renderBuilder({ currentExpression: 'source("firstName")', onApply });

      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

      fireEvent.click(screen.getByTestId('apply-btn'));
      expect(screen.getByTestId('apply-btn')).toHaveTextContent('Applied');

      // Simulate expression change by typing a different expression
      fireEvent.change(textarea, { target: { value: 'source("age")' } });

      // Apply button should no longer show "Applied"
      expect(screen.getByTestId('apply-btn')).not.toHaveTextContent('Applied');
    });

    it('onApply is called with correct args when Apply is clicked', () => {
      const onApply = vi.fn();
      renderBuilder({ currentExpression: 'source("firstName")', onApply });

      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("age")' } });

      fireEvent.click(screen.getByTestId('apply-btn'));
      expect(onApply).toHaveBeenCalledWith('patient.firstName', 'source("age")');
    });
  });

  describe('AE-11: Next unmapped button', () => {
    it('Next unmapped button is visible when hasUnmappedFields=true and onAdvanceToNext provided', () => {
      renderBuilder({
        hasUnmappedFields: true,
        onAdvanceToNext: vi.fn(),
      });
      expect(screen.getByTestId('next-unmapped-btn')).toBeInTheDocument();
    });

    it('Next unmapped button is hidden when hasUnmappedFields=false', () => {
      renderBuilder({
        hasUnmappedFields: false,
        onAdvanceToNext: vi.fn(),
      });
      expect(screen.queryByTestId('next-unmapped-btn')).not.toBeInTheDocument();
    });

    it('Next unmapped button is hidden when onAdvanceToNext not provided', () => {
      renderBuilder({ hasUnmappedFields: true });
      expect(screen.queryByTestId('next-unmapped-btn')).not.toBeInTheDocument();
    });

    it('clicking Next unmapped button calls onAdvanceToNext', () => {
      const onAdvanceToNext = vi.fn();
      renderBuilder({ hasUnmappedFields: true, onAdvanceToNext });
      fireEvent.click(screen.getByTestId('next-unmapped-btn'));
      expect(onAdvanceToNext).toHaveBeenCalledOnce();
    });

    it('Next unmapped button has correct aria-label', () => {
      renderBuilder({ hasUnmappedFields: true, onAdvanceToNext: vi.fn() });
      expect(screen.getByTestId('next-unmapped-btn')).toHaveAttribute(
        'aria-label',
        'Navigate to next unmapped target field',
      );
    });
  });

  describe('AE-12: Ctrl+] keyboard shortcut', () => {
    it('Ctrl+] fires onAdvanceToNext', () => {
      const onAdvanceToNext = vi.fn();
      renderBuilder({ hasUnmappedFields: true, onAdvanceToNext });
      fireEvent.keyDown(document, { key: ']', ctrlKey: true });
      expect(onAdvanceToNext).toHaveBeenCalledOnce();
    });

    it('Cmd+] fires onAdvanceToNext (macOS)', () => {
      const onAdvanceToNext = vi.fn();
      renderBuilder({ hasUnmappedFields: true, onAdvanceToNext });
      fireEvent.keyDown(document, { key: ']', metaKey: true });
      expect(onAdvanceToNext).toHaveBeenCalledOnce();
    });

    it('Ctrl+] does not fire when onAdvanceToNext is not provided', () => {
      // Should not throw
      renderBuilder({ hasUnmappedFields: true });
      expect(() => {
        fireEvent.keyDown(document, { key: ']', ctrlKey: true });
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // T-07: Header compression — type badge left, toggle in header, suggestions hidden when empty
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

    it('Suggested Sources section is shown when suggestions exist', () => {
      renderBuilder(); // 'patient.firstName' → 'firstName' exact match
      expect(screen.getByTestId('suggested-sources-section')).toBeInTheDocument();
    });

    it('Suggested Sources section is hidden when no suggestions exist', () => {
      renderBuilder({ selectedTargetPath: 'zzznomatch', selectedTargetType: 'string' });
      expect(screen.queryByTestId('suggested-sources-section')).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // T-08: Clear mapping button
  // ---------------------------------------------------------------------------

  describe('T-08: clear mapping button', () => {
    it('Clear mapping button is visible when currentStatus=mapped and onClearMapping provided', () => {
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping: vi.fn(),
      });
      expect(screen.getByTestId('clear-mapping-btn')).toBeInTheDocument();
    });

    it('Clear mapping button is hidden when currentStatus=unmapped', () => {
      renderBuilder({
        currentStatus: 'unmapped',
        onClearMapping: vi.fn(),
      });
      expect(screen.queryByTestId('clear-mapping-btn')).not.toBeInTheDocument();
    });

    it('Clear mapping button is hidden when onClearMapping not provided', () => {
      renderBuilder({ currentStatus: 'mapped', currentExpression: 'source("firstName")' });
      expect(screen.queryByTestId('clear-mapping-btn')).not.toBeInTheDocument();
    });

    it('clicking Clear mapping calls onClearMapping with target path', () => {
      const onClearMapping = vi.fn();
      renderBuilder({
        currentStatus: 'mapped',
        currentExpression: 'source("firstName")',
        onClearMapping,
      });
      fireEvent.click(screen.getByTestId('clear-mapping-btn'));
      expect(onClearMapping).toHaveBeenCalledWith('patient.firstName');
    });
  });

  // ---------------------------------------------------------------------------
  // T-09: Apply single-click commit
  // ---------------------------------------------------------------------------

  describe('T-09: Apply single-click commit', () => {
    it('Apply button is disabled after clicking once (no double-click required)', () => {
      const onApply = vi.fn();
      renderBuilder({ currentExpression: 'source("firstName")', onApply });

      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

      const btn = screen.getByTestId('apply-btn');
      fireEvent.click(btn);
      expect(btn).toBeDisabled();
    });

    it('Apply button shows "Applied" text immediately after single click', () => {
      const onApply = vi.fn();
      renderBuilder({ currentExpression: 'source("firstName")', onApply });

      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

      fireEvent.click(screen.getByTestId('apply-btn'));
      expect(screen.getByTestId('apply-btn')).toHaveTextContent('Applied');
    });

    it('onApply is called exactly once per click', () => {
      const onApply = vi.fn();
      renderBuilder({ currentExpression: 'source("firstName")', onApply });

      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

      fireEvent.click(screen.getByTestId('apply-btn'));
      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('keeps "Applied" state after parent re-render with same expression', () => {
      const onApply = vi.fn();
      const { rerender } = renderBuilder({
        currentExpression: 'source("firstName")',
        onApply,
      });

      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

      fireEvent.click(screen.getByTestId('apply-btn'));
      expect(screen.getByTestId('apply-btn')).toHaveTextContent('Applied');

      rerender(
        <ScalarFieldBuilder
          {...DEFAULT_PROPS}
          currentExpression={'source("lastName")'}
          onApply={onApply}
        />,
      );

      expect(screen.getByTestId('apply-btn')).toHaveTextContent('Applied');
    });

    it('keeps "Applied" state on same-value editor change event', () => {
      const onApply = vi.fn();
      renderBuilder({ currentExpression: 'source("firstName")', onApply });

      fireEvent.click(screen.getByTestId('mode-toggle-editor'));
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

      fireEvent.click(screen.getByTestId('apply-btn'));
      expect(screen.getByTestId('apply-btn')).toHaveTextContent('Applied');

      fireEvent.change(textarea, { target: { value: 'source("lastName")' } });

      expect(screen.getByTestId('apply-btn')).toHaveTextContent('Applied');
    });
  });

  // ---------------------------------------------------------------------------
  // T-04: LiveResultDisplay wired from PreviewContext (AE-05 / AE-06)
  // ---------------------------------------------------------------------------

  describe('T-04: LiveResultDisplay sourceData from PreviewContext', () => {
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

    it('shows "Load test data to see live results." when no sourceData in context (AE-06)', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByTestId('live-result-no-data')).toHaveTextContent(
        'Load test data to see live results.',
      );
    });

    it('LiveResultDisplay is present in the builder (AE-05)', () => {
      renderBuilderWithContext({}, null);
      expect(screen.getByTestId('live-result-display')).toBeInTheDocument();
    });

    it('does not show no-data message when sourceData is provided (AE-05)', () => {
      renderBuilderWithContext({}, { firstName: 'Alice' });
      // The no-data placeholder should not be visible when sourceData is set
      expect(screen.queryByTestId('live-result-no-data')).not.toBeInTheDocument();
    });
  });
});
