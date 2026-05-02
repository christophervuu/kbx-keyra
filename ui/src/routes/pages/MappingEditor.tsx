import { useParams } from 'react-router-dom';

import { MappingEditorPage } from '@/features/mappings/components';
import { RuleList } from '@/features/mappings/components';
import { useMappingEditor } from '@/features/mappings/hooks';
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

  // Build the RuleList content
  const ruleListContent = (
    <RuleList
      rules={editor.rules}
      schemasLoaded={editor.schemasLoaded}
      summary={editor.validation.summary}
      coveragePercent={editor.validation.coveragePercent}
      isValidating={editor.validation.isValidating}
      diagnosticsForRule={editor.validation.diagnosticsForRule}
      onAddRule={editor.actions.addRule}
      onEditRule={editor.actions.updateRule}
      onDeleteRule={editor.actions.deleteRule}
      onReorderRule={editor.actions.reorderRules}
      onBulkDelete={editor.actions.bulkDelete}
      onBulkDuplicate={editor.actions.bulkDuplicate}
      onPasteRules={editor.actions.pasteRules}
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
    />
  );
}
