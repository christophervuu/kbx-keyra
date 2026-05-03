import { useCallback, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import { ConfigurationPanel, ExpressionBuilderPanel } from '@/features/mappings/components';
import type { ExpressionBuilderPanelRef } from '@/features/mappings/components';
import { MappingEditorPage } from '@/features/mappings/components';
import { RuleList } from '@/features/mappings/components';
import { PreviewPanel } from '@/features/mappings/components/preview';
import { useMappingEditor } from '@/features/mappings/hooks';
import { useExpressionBuilder } from '@/features/mappings/hooks';
import { SchemaTreeView } from '@/features/schemas';
import type { SchemaTreeNode } from '@/lib/types/domain';
import { Button } from '@/components';

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div
      className="flex h-[calc(100vh-7rem)] flex-col items-center justify-center gap-4"
      data-testid="editor-loading"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      <p className="text-sm text-slate-400">Loading mapping editor…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex h-[calc(100vh-7rem)] flex-col items-center justify-center gap-4"
      data-testid="editor-load-error"
    >
      <p className="text-sm text-red-400">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} data-testid="retry-button">
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route Page
// ---------------------------------------------------------------------------

export default function MappingEditor() {
  const { projectId = '', mappingId = '' } = useParams<{
    projectId: string;
    mappingId: string;
  }>();

  const editor = useMappingEditor(mappingId);

  // ---------------------------------------------------------------------------
  // Selected rule state — shared between RuleList (highlight) and ExpressionBuilder
  // ---------------------------------------------------------------------------
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null);

  // Expression builder for the selected rule
  const builderResult = useExpressionBuilder({
    selectedRuleIndex,
    rules: editor.rules,
    updateRule: editor.actions.updateRule,
    parsedSourceSchema: editor.parsedSourceSchema,
  });

  // Ref for imperative insertSourceField from Panel 1
  const expressionBuilderRef = useRef<ExpressionBuilderPanelRef>(null);

  // When a source schema node is clicked in Panel 1, insert into the expression builder
  const handleSelectSourceNode = useCallback((node: SchemaTreeNode) => {
    expressionBuilderRef.current?.insertSourceField(node.path);
  }, []);

  // Loading state
  if (editor.loadState === 'loading') {
    return <LoadingSkeleton />;
  }

  // Error state
  if (editor.loadState === 'error') {
    return (
      <LoadError
        message={editor.loadError ?? 'Failed to load mapping'}
        onRetry={editor.actions.retry}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Panel slot content
  // ---------------------------------------------------------------------------

  const ruleListContent = (
    <RuleList
      rules={editor.rules}
      schemasLoaded={editor.schemasLoaded}
      summary={editor.validation.summary}
      coveragePercent={editor.validation.coveragePercent}
      isValidating={editor.validation.isValidating}
      diagnosticsForRule={editor.validation.diagnosticsForRule}
      selectedRuleIndex={selectedRuleIndex}
      onRuleSelect={setSelectedRuleIndex}
      onAddRule={editor.actions.addRule}
      onEditRule={editor.actions.updateRule}
      onDeleteRule={editor.actions.deleteRule}
      onReorderRule={editor.actions.reorderRules}
      onBulkDelete={editor.actions.bulkDelete}
      onBulkDuplicate={editor.actions.bulkDuplicate}
      onPasteRules={editor.actions.pasteRules}
    />
  );

  const panelOneContent = editor.parsedSourceSchema ? (
    <SchemaTreeView
      schema={editor.parsedSourceSchema}
      onSelectNode={handleSelectSourceNode}
    />
  ) : undefined;

  const expressionBuilderContent = (
    <div
      className="h-full"
      onKeyDown={(e) => {
        // Ctrl+Enter / Cmd+Enter: flush commit immediately
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          builderResult.flushCommit();
        }
      }}
      data-testid="expression-builder-container"
    >
      <ExpressionBuilderPanel
        ref={expressionBuilderRef}
        builderState={builderResult}
        parsedSourceSchema={editor.parsedSourceSchema}
        sampleSourceData={null}
      />
    </div>
  );

  const previewContent = (
    <PreviewPanel
      config={editor.config}
      sourceSchemaDetail={editor.sourceSchemaDetail}
      targetSchemaDetail={editor.targetSchemaDetail}
    />
  );

  const configPanelContent = (
    <ConfigurationPanel
      configOptions={editor.configOptions}
      onUpdateConfig={editor.actions.updateConfig}
      parsedTargetSchema={editor.parsedTargetSchema}
    />
  );

  return (
    <MappingEditorPage
      projectId={projectId}
      mappingId={mappingId}
      mappingName={editor.mappingName}
      version={editor.version}
      saveStatus={editor.saveStatus}
      sourceSchemaName={editor.sourceSchemaName}
      targetSchemaName={editor.targetSchemaName}
      ruleListContent={ruleListContent}
      panelOneContent={panelOneContent}
      expressionBuilderContent={expressionBuilderContent}
      previewContent={previewContent}
      configPanelContent={configPanelContent}
    />
  );
}
