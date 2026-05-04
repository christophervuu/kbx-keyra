import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useParams } from 'react-router-dom';

import { useAdapter } from '@/lib/api';

import { Button } from '@/components';
import { ConfirmDialog } from '@/features/mappings/components';
import {
  ArrayMappingBuilder,
  BuilderEmptyState,
  ConfigurationModal,
  ConfigurationPanel,
  ConnectedInlinePreviewStrip,
  ExpressionBuilderPanel,
  ObjectSummaryPanel,
  ScalarFieldBuilder,
  SourceSchemaPanel,
  TargetWorklist,
  VersionDiffView,
  VersionHistoryDrawer,
  type ChildFieldInfo,
  type ExpressionBuilderPanelRef,
  type GroupingMode,
} from '@/features/mappings/components';
import { MappingEditorPage } from '@/features/mappings/components';
import { RuleList } from '@/features/mappings/components';
import { useMappingEditor, useVersionHistory } from '@/features/mappings/hooks';
import { useExpressionBuilder } from '@/features/mappings/hooks';
import type { EditorView, TargetSort } from '@/features/mappings/types';
import type { MappingNodeStatus, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectTargetSchemaPaths(nodes: readonly SchemaTreeNode[]): string[] {
  const paths: string[] = [];
  function walk(current: readonly SchemaTreeNode[]) {
    for (const node of current) {
      paths.push(node.path);
      if (node.children.length > 0) walk(node.children);
    }
  }
  walk(nodes);
  return paths;
}

function findNodeByPath(
  nodes: readonly SchemaTreeNode[],
  path: string,
): SchemaTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findNodeByPath(node.children, path);
    if (found) return found;
  }
  return undefined;
}

function toTargetFieldType(type: SchemaTreeNode['type']): ChildFieldInfo['fieldType'] {
  switch (type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'object':
    case 'array':
    case 'null':
      return type;
    default:
      return 'string';
  }
}

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

  // ---------------------------------------------------------------------------
  // Inline preview strip state
  // ---------------------------------------------------------------------------
  const [lastApplyTimestamp, setLastApplyTimestamp] = useState<number | null>(null);

  const editor = useMappingEditor(mappingId, () => {
    setLastApplyTimestamp(Date.now());
  });
  const history = useVersionHistory(mappingId, editor.config);

  // ---------------------------------------------------------------------------
  // Project name (lightweight fetch — display only)
  // ---------------------------------------------------------------------------
  const adapter = useAdapter();
  const [projectName, setProjectName] = useState<string>('Project');
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    adapter.getProject(projectId).then((detail) => {
      if (!cancelled) setProjectName(detail.name);
    }).catch(() => { /* silently fall back to 'Project' */ });
    return () => { cancelled = true; };
  }, [adapter, projectId]);

  // ---------------------------------------------------------------------------
  // History drawer state
  // ---------------------------------------------------------------------------
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Restore handler
  // ---------------------------------------------------------------------------
  const handleRestore = useCallback(
    (version: number) => {
      const restoreConfig = history.getRestoreConfig(version);
      if (restoreConfig) {
        editor.actions.restore(restoreConfig);
        setIsHistoryOpen(false);
        setTimeout(() => history.refresh(), 500);
      }
    },
    [history, editor.actions],
  );

  // ---------------------------------------------------------------------------
  // Toolbar state (sort, view)
  // ---------------------------------------------------------------------------
  const [sort, setSort] = useState<TargetSort>('schema');
  const [view, setView] = useState<EditorView>('target');

  // ---------------------------------------------------------------------------
  // Target View selection state
  // ---------------------------------------------------------------------------
  const [selectedTargetPath, setSelectedTargetPath] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Rules View selection state
  // ---------------------------------------------------------------------------
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null);

  // Expression builder for Rules View (existing pattern)
  const builderResult = useExpressionBuilder({
    selectedRuleIndex,
    rules: editor.rules,
    updateRule: editor.actions.updateRule,
    parsedSourceSchema: editor.parsedSourceSchema,
  });
  const expressionBuilderRef = useRef<ExpressionBuilderPanelRef>(null);

  // ---------------------------------------------------------------------------
  // View toggle with selection persistence
  // ---------------------------------------------------------------------------
  const handleViewToggle = useCallback(
    (nextView: EditorView) => {
      if (nextView === view) return;

      if (nextView === 'rules') {
        // Target → Rules: find rule matching selected target path
        if (selectedTargetPath !== null) {
          const idx = editor.rules.findIndex((r) => r.target === selectedTargetPath);
          setSelectedRuleIndex(idx >= 0 ? idx : null);
        }
      } else {
        // Rules → Target: resolve selected rule's target path
        if (selectedRuleIndex !== null) {
          const rule = editor.rules[selectedRuleIndex];
          setSelectedTargetPath(rule?.target ?? null);
        }
      }

      setView(nextView);
    },
    [view, selectedTargetPath, selectedRuleIndex, editor.rules],
  );

  // ---------------------------------------------------------------------------
  // Target node selection — with unapplied-changes guard
  // ---------------------------------------------------------------------------

  // Pending navigation: the path the user clicked while an unapplied expression exists
  const [pendingTargetPath, setPendingTargetPath] = useState<string | null>(null);
  // Whether the unapplied-changes dialog is open
  const [unappliedDialogOpen, setUnappliedDialogOpen] = useState(false);
  // The current unapplied expression (set by ScalarFieldBuilder via callback)
  const [unappliedExpression, setUnappliedExpression] = useState<string>('');

  const handleSelectTargetNode = useCallback(
    (path: string) => {
      if (unappliedExpression.trim() && selectedTargetPath !== null && path !== selectedTargetPath) {
        // There is an unapplied expression — show the guard dialog
        setPendingTargetPath(path);
        setUnappliedDialogOpen(true);
      } else {
        setSelectedTargetPath(path);
        setUnappliedExpression('');
      }
    },
    [unappliedExpression, selectedTargetPath],
  );

  // "Apply & Continue" — apply current expression then navigate to the clicked field
  const handleUnappliedApplyAndContinue = useCallback(() => {
    if (selectedTargetPath && unappliedExpression.trim()) {
      editor.actions.applyRule(selectedTargetPath, unappliedExpression);
    }
    setUnappliedDialogOpen(false);
    setUnappliedExpression('');
    if (pendingTargetPath !== null) {
      setSelectedTargetPath(pendingTargetPath);
      setPendingTargetPath(null);
    }
  }, [selectedTargetPath, unappliedExpression, pendingTargetPath, editor.actions]);

  // "Discard" — discard unapplied expression and navigate to the clicked field
  const handleUnappliedDiscard = useCallback(() => {
    setUnappliedDialogOpen(false);
    setUnappliedExpression('');
    if (pendingTargetPath !== null) {
      setSelectedTargetPath(pendingTargetPath);
      setPendingTargetPath(null);
    }
  }, [pendingTargetPath]);

  // "Cancel" — stay on current field
  const handleUnappliedCancel = useCallback(() => {
    setUnappliedDialogOpen(false);
    setPendingTargetPath(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Derived: grouping mode from sort
  // ---------------------------------------------------------------------------
  const groupingMode = useMemo((): GroupingMode => {
    if (sort === 'required-first') return 'required-first';
    if (sort === 'unmapped-first') return 'unmapped-first';
    return 'schema';
  }, [sort]);

  // ---------------------------------------------------------------------------
  // Derived: target status map (for ObjectSummaryPanel child info)
  // ---------------------------------------------------------------------------
  const targetMappingStatus = useMemo<Map<string, MappingNodeStatus> | undefined>(() => {
    if (!editor.parsedTargetSchema) return undefined;
    const statusMap = new Map<string, MappingNodeStatus>();
    const targetPaths = collectTargetSchemaPaths(editor.parsedTargetSchema.nodes);
    for (const path of targetPaths) statusMap.set(path, 'unmapped');

    const ruleIndexesByTarget = new Map<string, number[]>();
    editor.rules.forEach((rule, index) => {
      const bucket = ruleIndexesByTarget.get(rule.target) ?? [];
      bucket.push(index);
      ruleIndexesByTarget.set(rule.target, bucket);
    });

    for (const [path, indexes] of ruleIndexesByTarget.entries()) {
      if (!statusMap.has(path)) continue;
      let hasDiagnostics = false;
      for (const ruleIndex of indexes) {
        const diagnostics = editor.validation.diagnosticsForRule(ruleIndex);
        if (
          diagnostics.some(
            (d) => d.severity === 'warning' || d.severity === 'error',
          )
        ) {
          hasDiagnostics = true;
          break;
        }
      }
      statusMap.set(path, hasDiagnostics ? 'warning' : 'mapped');
    }
    return statusMap;
  }, [editor.parsedTargetSchema, editor.rules, editor.validation]);

  // ---------------------------------------------------------------------------
  // "Start with required fields" CTA from BuilderEmptyState
  // ---------------------------------------------------------------------------
  const handleFilterRequired = useCallback(() => {
    // No-op: filter chips now live inside TargetWorklist
  }, []);

  // ---------------------------------------------------------------------------
  // Apply expression from ScalarFieldBuilder — upserts rule, advances focus
  // ---------------------------------------------------------------------------

  // Compute next unmapped path after a given path (document order, single pass)
  const getNextUnmappedPath = useCallback(
    (afterPath: string): string | null => {
      if (!editor.parsedTargetSchema || !targetMappingStatus) return null;
      const allPaths = collectTargetSchemaPaths(editor.parsedTargetSchema.nodes);
      const currentIdx = allPaths.indexOf(afterPath);
      if (currentIdx < 0) return null;
      for (let i = currentIdx + 1; i < allPaths.length; i++) {
        if (targetMappingStatus.get(allPaths[i]) === 'unmapped') return allPaths[i];
      }
      return null;
    },
    [editor.parsedTargetSchema, targetMappingStatus],
  );

  const handleApplyExpression = useCallback(
    (targetPath: string, expression: string) => {
      editor.actions.applyRule(targetPath, expression);
      setUnappliedExpression('');
      // Advance focus to next unmapped field (normal Apply flow)
      const next = getNextUnmappedPath(targetPath);
      if (next !== null) {
        setSelectedTargetPath(next);
      }
    },
    [editor.actions, getNextUnmappedPath],
  );

  // ---------------------------------------------------------------------------
  // Derived: selected node info (for right panel)
  // ---------------------------------------------------------------------------
  const selectedNode = useMemo(() => {
    if (!selectedTargetPath || !editor.parsedTargetSchema) return null;
    return findNodeByPath(editor.parsedTargetSchema.nodes, selectedTargetPath) ?? null;
  }, [selectedTargetPath, editor.parsedTargetSchema]);

  const selectedNodeStatus = useMemo((): 'unmapped' | 'mapped' | 'warning' | 'error' => {
    if (!selectedTargetPath || !targetMappingStatus) return 'unmapped';
    return (targetMappingStatus.get(selectedTargetPath) as 'unmapped' | 'mapped' | 'warning' | 'error') ?? 'unmapped';
  }, [selectedTargetPath, targetMappingStatus]);

  const selectedNodeExpression = useMemo(() => {
    if (!selectedTargetPath) return '';
    return editor.rules.find((r) => r.target === selectedTargetPath)?.expression ?? '';
  }, [selectedTargetPath, editor.rules]);

  // ---------------------------------------------------------------------------
  // Route-level navigation guard (unsaved changes)
  // useBlocker must be called unconditionally (Rules of Hooks)
  // ---------------------------------------------------------------------------
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      !editor.actions.canNavigateAway().allowed,
  );

  // "Save & Leave" — save then let the blocked navigation proceed
  const handleBlockerSaveAndLeave = useCallback(() => {
    editor.actions.save();
    blocker.proceed?.();
  }, [editor.actions, blocker]);

  // "Discard & Leave" — discard and proceed
  const handleBlockerDiscard = useCallback(() => {
    blocker.proceed?.();
  }, [blocker]);

  // "Cancel" — stay
  const handleBlockerCancel = useCallback(() => {
    blocker.reset?.();
  }, [blocker]);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (editor.loadState === 'loading') return <LoadingSkeleton />;
  if (editor.loadState === 'error') {
    return (
      <LoadError
        message={editor.loadError ?? 'Failed to load mapping'}
        onRetry={editor.actions.retry}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Slot content
  // ---------------------------------------------------------------------------

  // Source panel (left column)
  const sourceContent = editor.parsedSourceSchema ? (
    <SourceSchemaPanel
      parsedSourceSchema={editor.parsedSourceSchema}
      onStageField={(path) => {
        expressionBuilderRef.current?.insertSourceField(path);
      }}
      className="h-full"
    />
  ) : undefined;

  // Center column: Target Worklist (target view) or RuleList (rules view)
  const targetWorklistContent =
    view === 'rules' ? (
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
    ) : (
      <TargetWorklist
        nodes={editor.parsedTargetSchema?.nodes ?? []}
        rules={editor.rules}
        validationResult={editor.validation.result ?? null}
        selectedPath={selectedTargetPath}
        groupingMode={groupingMode}
        onSelectNode={handleSelectTargetNode}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewToggle={handleViewToggle}
        className="h-full"
      />
    );

  // Right panel: node-type-specific builder (target view) or expression builder (rules view)
  const builderContent =
    view === 'rules' ? (
      <div
        className="h-full"
        onKeyDown={(e) => {
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
    ) : selectedNode === null ? (
      <BuilderEmptyState onFilterRequired={handleFilterRequired} />
    ) : selectedNode.type === 'object' ? (
      (() => {
        const children: ChildFieldInfo[] = selectedNode.children.map((child) => ({
          path: child.path,
          fieldName: child.fieldName,
          fieldType: toTargetFieldType(child.type),
          status: (targetMappingStatus?.get(child.path) as 'unmapped' | 'mapped' | 'warning' | 'error') ?? 'unmapped',
          required: child.isRequired,
        }));
        const mapped = children.filter((c) => c.status !== 'unmapped').length;
        return (
          <ObjectSummaryPanel
            objectPath={selectedNode.path}
            childFields={children}
            coverage={{ mapped, total: children.length }}
            onFilterRequired={(path: string) => setSelectedTargetPath(path)}
            onValidateSection={() => {/* no-op placeholder */}}
            className="h-full"
          />
        );
      })()
    ) : selectedNode.type === 'array' ? (
      <ArrayMappingBuilder
        targetArrayPath={selectedNode.path}
        parsedSourceSchema={editor.parsedSourceSchema}
        parsedTargetSchema={editor.parsedTargetSchema}
        isNestedArray={selectedNode.parentPath !== null && (() => {
          const parent = findNodeByPath(
            editor.parsedTargetSchema?.nodes ?? [],
            selectedNode.parentPath,
          );
          return parent?.type === 'array';
        })()}
        parentArrayPath={selectedNode.parentPath ?? undefined}
        onSave={handleApplyExpression}
        onSelectParentArray={(path) => setSelectedTargetPath(path)}
        className="h-full"
      />
    ) : (
      <ScalarFieldBuilder
        selectedTargetPath={selectedNode.path}
        selectedTargetType={toTargetFieldType(selectedNode.type)}
        selectedTargetRequired={selectedNode.isRequired}
        currentStatus={selectedNodeStatus}
        currentExpression={selectedNodeExpression}
        parsedSourceSchema={editor.parsedSourceSchema}
        onApply={handleApplyExpression}
        onExpressionChange={setUnappliedExpression}
        className="h-full"
      />
    );

  // Bottom area: connected inline preview strip (renders inside PreviewProvider)
  const bottomContent = (
    <ConnectedInlinePreviewStrip
      config={editor.config}
      sourceSchemaDetail={editor.sourceSchemaDetail}
      targetSchemaDetail={editor.targetSchemaDetail}
      projectId={projectId}
      mappingId={mappingId}
      lastApplyTimestamp={lastApplyTimestamp}
    />
  );

  return (
    <>
      <MappingEditorPage
        projectId={projectId}
        mappingId={mappingId}
        projectName={projectName}
        mappingName={editor.mappingName}
        version={editor.version}
        saveStatus={editor.saveStatus}
        deployStatus={null}
        unsavedCount={editor.unsavedRuleCount}
        onSave={editor.actions.save}
        sourceSchemaName={editor.sourceSchemaName}
        targetSchemaName={editor.targetSchemaName}
        sourceContent={sourceContent}
        targetWorklistContent={targetWorklistContent}
        builderContent={builderContent}
        bottomContent={bottomContent}
        onConfigToggle={() => setIsConfigOpen((prev) => !prev)}
        onHistoryToggle={() => setIsHistoryOpen((prev) => !prev)}
      />

      <ConfigurationModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      >
        <ConfigurationPanel
          configOptions={editor.configOptions}
          onUpdateConfig={editor.actions.updateConfig}
          parsedTargetSchema={editor.parsedTargetSchema}
        />
      </ConfigurationModal>

      <VersionHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        versions={history.versions}
        isLoading={history.isLoading}
        isEmpty={history.isEmpty}
        selectedVersion={history.selectedVersion}
        onSelectVersion={history.selectVersion}
        currentVersion={editor.version}
      >
        {history.selectedDiff && history.selectedVersion !== null && (
          <VersionDiffView
            diff={history.selectedDiff}
            selectedVersion={history.selectedVersion}
            currentVersion={editor.version}
            hasUnsavedChanges={editor.hasUnsavedChanges}
            onRestore={handleRestore}
            onBack={() => history.selectVersion(null)}
          />
        )}
      </VersionHistoryDrawer>

      {/* Unapplied-changes guard dialog (switching target selection) */}
      {unappliedDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="presentation"
          data-testid="unapplied-dialog-overlay"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleUnappliedCancel}
            aria-hidden="true"
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="unapplied-dialog-title"
            aria-describedby="unapplied-dialog-message"
            className="relative z-10 w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
            data-testid="unapplied-dialog"
          >
            <h2 id="unapplied-dialog-title" className="text-sm font-semibold text-slate-100">
              Unapplied expression
            </h2>
            <p id="unapplied-dialog-message" className="mt-2 text-sm text-slate-400">
              You have an expression that hasn&apos;t been applied. What would you like to do?
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleUnappliedCancel}
                className="rounded px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                data-testid="unapplied-dialog-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnappliedDiscard}
                className="rounded border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                data-testid="unapplied-dialog-discard"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleUnappliedApplyAndContinue}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
                data-testid="unapplied-dialog-apply-continue"
              >
                Apply &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Route-level unsaved-changes guard dialog */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Unsaved changes"
        message="You have unsaved changes. Save before leaving or your changes will be lost."
        confirmLabel="Save & Leave"
        cancelLabel="Discard"
        onConfirm={handleBlockerSaveAndLeave}
        onCancel={handleBlockerDiscard}
      />
    </>
  );
}
