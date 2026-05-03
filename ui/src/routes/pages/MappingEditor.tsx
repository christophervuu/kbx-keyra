import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  ArrayMappingBuilder,
  BottomArea,
  BuilderEmptyState,
  ConfigurationPanel,
  ExpressionBuilderPanel,
  GlobalToolbar,
  ObjectSummaryPanel,
  ScalarFieldBuilder,
  SourceSchemaPanel,
  TargetWorklist,
  VersionDiffView,
  VersionHistoryDrawer,
} from '@/features/mappings/components';
import type {
  ChildFieldInfo,
  ExpressionBuilderPanelRef,
  GroupingMode,
} from '@/features/mappings/components';
import { MappingEditorPage } from '@/features/mappings/components';
import { RuleList } from '@/features/mappings/components';
import { PreviewPanel } from '@/features/mappings/components/preview';
import { useMappingEditor, useVersionHistory } from '@/features/mappings/hooks';
import { useExpressionBuilder } from '@/features/mappings/hooks';
import type { EditorView, TargetFilter, TargetSort } from '@/features/mappings/types';
import type { MappingNodeStatus, SchemaTreeNode } from '@/lib/types/domain';
import { Button } from '@/components';

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
  const history = useVersionHistory(mappingId, editor.config);

  // ---------------------------------------------------------------------------
  // History drawer state
  // ---------------------------------------------------------------------------
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

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
  // Toolbar state (search, filters, sort, view, breadcrumb)
  // ---------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<TargetFilter[]>([]);
  const [sort, setSort] = useState<TargetSort>('schema');
  const [view, setView] = useState<EditorView>('target');
  const [breadcrumbMode, setBreadcrumbMode] = useState(false);
  const [currentSubtreePath, setCurrentSubtreePath] = useState<string | null>(null);

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
  // Target node selection
  // ---------------------------------------------------------------------------
  const handleSelectTargetNode = useCallback(
    (path: string, _nodeType: SchemaTreeNode['type']) => {
      setSelectedTargetPath(path);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // "Start with required fields" CTA from BuilderEmptyState
  // ---------------------------------------------------------------------------
  const handleFilterRequired = useCallback(() => {
    setActiveFilters((prev) =>
      prev.includes('required') ? prev : [...prev, 'required'],
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Save expression from right-panel builders
  // ---------------------------------------------------------------------------
  const handleSaveExpression = useCallback(
    (targetPath: string, expression: string) => {
      const existingIdx = editor.rules.findIndex((r) => r.target === targetPath);
      if (existingIdx >= 0) {
        editor.actions.updateRule(existingIdx, { ...editor.rules[existingIdx], expression });
      } else {
        editor.actions.addRule({ target: targetPath, expression });
      }
    },
    [editor.rules, editor.actions],
  );

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

  // Toolbar
  const toolbarContent = (
    <GlobalToolbar
      searchQuery={searchQuery}
      activeFilters={activeFilters}
      sort={sort}
      view={view}
      breadcrumbMode={breadcrumbMode}
      onSearchChange={setSearchQuery}
      onFilterChange={setActiveFilters}
      onSortChange={setSort}
      onViewToggle={handleViewToggle}
      onBreadcrumbModeToggle={() => {
        setBreadcrumbMode((prev) => !prev);
        if (breadcrumbMode) setCurrentSubtreePath(null);
      }}
    />
  );

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
        searchQuery={searchQuery}
        onSelectNode={handleSelectTargetNode}
        breadcrumbMode={breadcrumbMode}
        currentSubtreePath={currentSubtreePath}
        onSubtreeNavigate={setCurrentSubtreePath}
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
          fieldType: (() => {
            const t = child.type;
            if (
              t === 'string' || t === 'number' || t === 'boolean' ||
              t === 'object' || t === 'array' || t === 'null' || t === 'integer'
            ) return t;
            return 'string' as const;
          })(),
          status: (targetMappingStatus?.get(child.path) as 'unmapped' | 'mapped' | 'warning' | 'error') ?? 'unmapped',
          required: child.isRequired,
        }));
        const mapped = children.filter((c) => c.status !== 'unmapped').length;
        return (
          <ObjectSummaryPanel
            objectPath={selectedNode.path}
            children={children}
            coverage={{ mapped, total: children.length }}
            onMapRequiredFirst={(path) => setSelectedTargetPath(path)}
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
        onSave={handleSaveExpression}
        onSelectParentArray={(path) => setSelectedTargetPath(path)}
        className="h-full"
      />
    ) : (
      <ScalarFieldBuilder
        selectedTargetPath={selectedNode.path}
        selectedTargetType={(() => {
          const t = selectedNode.type;
          if (
            t === 'string' || t === 'number' || t === 'boolean' ||
            t === 'object' || t === 'array' || t === 'null' || t === 'integer'
          ) return t;
          return 'string' as const;
        })()}
        selectedTargetRequired={selectedNode.isRequired}
        currentStatus={selectedNodeStatus}
        currentExpression={selectedNodeExpression}
        parsedSourceSchema={editor.parsedSourceSchema}
        onSave={handleSaveExpression}
        className="h-full"
      />
    );

  // Bottom area: tabbed preview/diagnostics/trace/test-cases
  const bottomContent = (
    <BottomArea
      previewContent={
        <PreviewPanel
          config={editor.config}
          sourceSchemaDetail={editor.sourceSchemaDetail}
          targetSchemaDetail={editor.targetSchemaDetail}
        />
      }
    />
  );

  return (
    <>
      <MappingEditorPage
        projectId={projectId}
        mappingId={mappingId}
        mappingName={editor.mappingName}
        version={editor.version}
        saveStatus={editor.saveStatus}
        sourceSchemaName={editor.sourceSchemaName}
        targetSchemaName={editor.targetSchemaName}
        toolbarContent={toolbarContent}
        sourceContent={sourceContent}
        targetWorklistContent={targetWorklistContent}
        builderContent={builderContent}
        bottomContent={bottomContent}
        onHistoryToggle={() => setIsHistoryOpen((prev) => !prev)}
      />

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

      <ConfigurationPanel
        configOptions={editor.configOptions}
        onUpdateConfig={editor.actions.updateConfig}
        parsedTargetSchema={editor.parsedTargetSchema}
      />
    </>
  );
}
