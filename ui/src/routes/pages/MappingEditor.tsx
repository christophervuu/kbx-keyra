import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';


import { Button } from '@/components';
import { useRecentActivity } from '@/features/home/hooks/use-recent-activity';
import { ConfirmDialog } from '@/features/mappings/components';
import {
  ArrayBuilder,
  AutoMapWorkspace,
  BuilderEmptyState,
  ConfigurationModal,
  ConfigurationPanel,
  ConnectedInlinePreviewStrip,
  ExpressionBuilderPanel,
  ObjectSummaryPanel,
  RefreshConfirmBanner,
  ScalarFieldBuilder,
  SourceSchemaPanel,
  TargetWorklist,
  UnsavedChangesOverlay,
  VersionDiffView,
  VersionHistoryDrawer,
  WorkspaceToolbar,
  WorkspaceNoSourceDataCallout,
  type ChildFieldInfo,
  type ExpressionBuilderPanelRef,
} from '@/features/mappings/components';
import { MappingEditorPage } from '@/features/mappings/components';
import { RuleList } from '@/features/mappings/components';
import { usePreviewContext } from '@/features/mappings/context/preview-context';
import { useMappingEditor, useVersionHistory, useTargetStatus, useAutoMapWorkspace } from '@/features/mappings/hooks';
import { useExpressionBuilder } from '@/features/mappings/hooks';
import type { EditorView } from '@/features/mappings/types';
import { useAdapter } from '@/lib/api';
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

function WorkspaceNoSourceDataSlot() {
  const { sourceData } = usePreviewContext();
  return sourceData === null ? <WorkspaceNoSourceDataCallout /> : null;
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

interface NodePathResolution {
  readonly node: SchemaTreeNode;
  readonly nearestArrayAncestor: SchemaTreeNode | null;
}

function findNodePathResolution(
  nodes: readonly SchemaTreeNode[],
  path: string,
  nearestArrayAncestor: SchemaTreeNode | null = null,
): NodePathResolution | undefined {
  for (const node of nodes) {
    const nextArrayAncestor = node.type === 'array' ? node : nearestArrayAncestor;
    if (node.path === path) {
      return { node, nearestArrayAncestor };
    }
    const found = findNodePathResolution(node.children, path, nextArrayAncestor);
    if (found) return found;
  }
  return undefined;
}

export function resolveBuilderTargetPath(
  nodes: readonly SchemaTreeNode[],
  path: string,
): string {
  const resolution = findNodePathResolution(nodes, path);
  if (!resolution) return path;
  if (resolution.node.type === 'array') return resolution.node.path;
  return resolution.nearestArrayAncestor?.path ?? resolution.node.path;
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
  const location = useLocation();
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // Inline preview strip state
  // ---------------------------------------------------------------------------

  const editor = useMappingEditor(mappingId);
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

  // Record recent activity when the mapping loads successfully (FS-049 T-03)
  const { recordActivity } = useRecentActivity();
  useEffect(() => {
    if (editor.loadState === 'loaded' && editor.mappingName) {
      recordActivity({ type: 'mapping', id: mappingId, projectId, name: editor.mappingName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on successful load
  }, [editor.loadState]);

  // ---------------------------------------------------------------------------
  // History drawer state
  // ---------------------------------------------------------------------------
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isChangesOverlayOpen, setIsChangesOverlayOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // Auto-Map workspace hook (FS-048 T-10) — canonical review path
  // ---------------------------------------------------------------------------
  const autoMapWorkspace = useAutoMapWorkspace({
    adapter,
    mappingId,
    projectId,
    rules: editor.rules,
    updateDraft: editor.actions.updateDraft,
    setSelectedTargetPath: (path: string) => setSelectedTargetPath(resolveSelectedTargetPath(path)),
    exitWorkspace: () => setView('target'),
    parsedSourceSchema: editor.parsedSourceSchema,
    parsedTargetSchema: editor.parsedTargetSchema,
  });

  // ---------------------------------------------------------------------------
  // View state (must be before handleAutoMapTrigger)
  // ---------------------------------------------------------------------------
  const [view, setView] = useState<EditorView>('target');

  // ---------------------------------------------------------------------------
  // Auto-Map workspace mode state (FS-048 T-02)
  // ---------------------------------------------------------------------------
  /** The section path currently loaded in the Auto-Map workspace (preserved across exits). */
  const [autoMapSectionPath, setAutoMapSectionPath] = useState<string | null>(null);

  /** Enter the Auto-Map workspace for a given section path. */
  const enterAutoMapWorkspace = useCallback((sectionPath: string) => {
    setAutoMapSectionPath(sectionPath);
    setView('automap');
  }, []);

  /** Exit the Auto-Map workspace and return to Target view. Preserves selectedTargetPath and autoMapSectionPath. */
  const exitAutoMapWorkspace = useCallback(() => {
    setView('target');
    // selectedTargetPath is intentionally preserved (spec AE-06)
    // autoMapSectionPath is intentionally preserved for re-entry (spec note)
  }, []);

  // Mutual exclusion: close history drawer when auto-map workspace opens
  const handleOpenHistory = useCallback(() => {
    setIsHistoryOpen(true);
  }, []);

  const handleAutoMapTrigger = useCallback(
    (sectionPath: string) => {
      setIsHistoryOpen(false);
      enterAutoMapWorkspace(sectionPath);
      autoMapWorkspace.triggerAutoMap(sectionPath);
    },
    [enterAutoMapWorkspace, autoMapWorkspace],
  );

  const handleAutoMapAll = useCallback(() => {
    setIsHistoryOpen(false);
    // T-10: header-level "Auto-map" triggers workspace for the root section
    enterAutoMapWorkspace('');
    void autoMapWorkspace.triggerAutoMap('');
  }, [enterAutoMapWorkspace, autoMapWorkspace]);

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

  /** Whether the Refresh All confirmation banner is showing */
  const [showRefreshAllConfirm, setShowRefreshAllConfirm] = useState(false);

  // ---------------------------------------------------------------------------
  // Target View selection state
  // ---------------------------------------------------------------------------
  const [selectedTargetPath, setSelectedTargetPath] = useState<string | null>(null);

  const resolveSelectedTargetPath = useCallback(
    (path: string) => {
      if (!editor.parsedTargetSchema) return path;
      return resolveBuilderTargetPath(editor.parsedTargetSchema.nodes, path);
    },
    [editor.parsedTargetSchema],
  );

  // Consume jump-to-rule route state from TestLabPage (FS-036 T-07)
  useEffect(() => {
    const incomingPath = (location.state as Record<string, unknown> | null)?.selectedTargetPath;
    if (incomingPath && typeof incomingPath === 'string') {
      setSelectedTargetPath(resolveSelectedTargetPath(incomingPath));
      // Clear the state to prevent stale re-application on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, resolveSelectedTargetPath]);

  // ---------------------------------------------------------------------------
  // Rules View selection state
  // ---------------------------------------------------------------------------
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null);
  const [stagedSourcePath, setStagedSourcePath] = useState<string | null>(null);

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
      // 'automap' is entered via enterAutoMapWorkspace only — not via the toggle
      if (nextView === 'automap') return;

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
          setSelectedTargetPath(rule ? resolveSelectedTargetPath(rule.target) : null);
        }
      }

      setView(nextView);
    },
    [view, selectedTargetPath, selectedRuleIndex, editor.rules, resolveSelectedTargetPath],
  );

  // ---------------------------------------------------------------------------
  // Target node selection — auto-draft model.
  // Field-to-field navigation auto-commits the current field's draft (no dialog).
  // ---------------------------------------------------------------------------

  const handleSelectTargetNode = useCallback(
    (path: string) => {
      // Auto-commit the outgoing field's draft before hydrating the new field.
      // The draft is already stored via updateDraft on every keystroke; this
      // call is a semantic commit that makes the intent explicit.
      if (selectedTargetPath !== null) {
        const currentDraft = editor.actions.getDraftExpression(selectedTargetPath);
        if (currentDraft !== null) {
          editor.actions.commitDraft(selectedTargetPath, currentDraft);
        }
      }
      setStagedSourcePath(null);
      setSelectedTargetPath(resolveSelectedTargetPath(path));
    },
    [selectedTargetPath, editor.actions, resolveSelectedTargetPath],
  );

  const effectiveRules = useMemo(
    () => editor.config?.rules ?? editor.rules,
    [editor.config, editor.rules],
  );

  // ---------------------------------------------------------------------------
  // Derived: target status map (for ObjectSummaryPanel child info)
  // ---------------------------------------------------------------------------
  const targetMappingStatus = useMemo<Map<string, MappingNodeStatus> | undefined>(() => {
    if (!editor.parsedTargetSchema) return undefined;
    const statusMap = new Map<string, MappingNodeStatus>();
    const targetPaths = collectTargetSchemaPaths(editor.parsedTargetSchema.nodes);
    for (const path of targetPaths) statusMap.set(path, 'unmapped');

    const ruleIndexesByTarget = new Map<string, number[]>();
    effectiveRules.forEach((rule, index) => {
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
  }, [editor.parsedTargetSchema, effectiveRules, editor.validation]);

  // Leaf-field coverage map — used by ObjectSummaryPanel for accurate x/y ratio
  const { coverageMap: leafCoverageMap } = useTargetStatus(
    effectiveRules,
    editor.validation.result ?? null,
    editor.parsedTargetSchema?.nodes ?? [],
  );

  // ---------------------------------------------------------------------------
  // Sync the "clean" baseline expression when the selected target field changes.
  // We update a ref (not state) so this does not trigger an extra render.
  // The baseline is the expression already applied for this field (or "" if
  // ---------------------------------------------------------------------------
  // "Start with required fields" CTA from BuilderEmptyState
  // ---------------------------------------------------------------------------
  const handleFilterRequired = useCallback(() => {
    // No-op: filter chips now live inside TargetWorklist
  }, []);

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

  const selectedRuleIndexForSmartFix = useMemo(() => {
    if (!selectedTargetPath) return null;
    const idx = editor.rules.findIndex((r) => r.target === selectedTargetPath);
    return idx >= 0 ? idx : null;
  }, [selectedTargetPath, editor.rules]);

  const selectedRuleDiagnosticsForSmartFix = useMemo(() => {
    if (selectedRuleIndexForSmartFix === null) return [];
    return editor.validation.diagnosticsForRule(selectedRuleIndexForSmartFix);
  }, [editor.validation, selectedRuleIndexForSmartFix]);

  // ---------------------------------------------------------------------------
  // Route-level navigation guard (unsaved changes)
  // useBlocker must be called unconditionally (Rules of Hooks)
  // ---------------------------------------------------------------------------
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      editor.hasUnsavedChanges,
  );

  // "Discard & Leave" — clear all drafts then proceed
  const handleBlockerDiscard = useCallback(() => {
    editor.actions.revertAllDrafts();
    blocker.proceed?.();
  }, [editor.actions, blocker]);

  // "Cancel" — stay and preserve drafts
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
      sourceSchemaName={editor.sourceSchemaName}
      onStageField={(path) => {
        if (view === 'rules') {
          expressionBuilderRef.current?.insertSourceField(path);
          return;
        }
        setStagedSourcePath(path);
      }}
      className="h-full"
    />
  ) : undefined;

  // Right column: Target Worklist (target view) or RuleList (rules view)
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
        view={view}
        onViewToggle={handleViewToggle}
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
        rules={effectiveRules}
        validationResult={editor.validation.result ?? null}
        selectedPath={selectedTargetPath}
        groupingMode="schema"
        onSelectNode={handleSelectTargetNode}
        view={view}
        onViewToggle={handleViewToggle}
        targetSchemaName={editor.targetSchemaName}
        className="h-full"
      />
    );

  const autoMapWorkspaceContent = (
    <AutoMapWorkspace
      status={autoMapWorkspace.status}
      error={autoMapWorkspace.error}
      items={autoMapWorkspace.items}
      filteredItems={autoMapWorkspace.filteredItems}
      summary={autoMapWorkspace.summary}
      sectionPath={autoMapSectionPath}
      onRetry={() => {
        if (autoMapSectionPath !== null) {
          autoMapWorkspace.triggerAutoMap(autoMapSectionPath);
        }
      }}
      onRefreshAll={autoMapWorkspace.refreshAll}
      onRefreshUnmapped={autoMapWorkspace.refreshUnmapped}
      onAcceptAllValid={autoMapWorkspace.bulkAcceptAllValid}
      onExitWorkspace={exitAutoMapWorkspace}
      onAccept={autoMapWorkspace.acceptSuggestion}
      onEdit={autoMapWorkspace.editSuggestion}
      onDismiss={autoMapWorkspace.dismissSuggestion}
      onUndoDismiss={autoMapWorkspace.undoDismiss}
      previousSuggestionsAvailable={autoMapWorkspace.previousSuggestionsAvailable}
      onRestorePrevious={autoMapWorkspace.restorePreviousSuggestions}
      generatedAt={autoMapWorkspace.generatedAt}
      className="h-full"
      toolbarSlot={() => (
        <WorkspaceToolbar
          activeFilters={autoMapWorkspace.activeFilters}
          onToggleFilter={autoMapWorkspace.toggleFilter}
          onClearFilters={autoMapWorkspace.clearFilters}
          summary={autoMapWorkspace.summary}
          items={autoMapWorkspace.items}
          onRefreshStale={autoMapWorkspace.refreshStale}
          isRefreshing={autoMapWorkspace.status === 'loading'}
        />
      )}
      confirmationSlot={
        showRefreshAllConfirm ? (
          <RefreshConfirmBanner
            refreshCount={autoMapWorkspace.items.length}
            preservedCount={
              autoMapWorkspace.items.filter(
                (i) => i.status === 'accepted' || i.status === 'edited',
              ).length
            }
            onConfirm={() => {
              setShowRefreshAllConfirm(false);
              autoMapWorkspace.refreshAll();
            }}
            onCancel={() => setShowRefreshAllConfirm(false)}
          />
        ) : null
      }
      noSourceDataSlot={<WorkspaceNoSourceDataSlot />}
    />
  );

  // Center panel: node-type-specific builder (target view) or expression builder (rules view)
  const builderContentInner =
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
        const leafCoverage = leafCoverageMap.get(selectedNode.path) ?? { mapped: 0, total: children.length };
        return (
          <ObjectSummaryPanel
            objectPath={selectedNode.path}
            childFields={children}
            coverage={leafCoverage}
            onAutoMapSection={handleAutoMapTrigger}
            isAutoMapLoading={autoMapWorkspace.status === 'loading'}
            hasPersistedSuggestions={autoMapWorkspace.hasPersistedSuggestions}
            pendingSuggestionCount={autoMapWorkspace.summary.pending}
            onFilterRequired={handleSelectTargetNode}
            onValidateSection={() => {/* no-op placeholder */}}
            onNavigateToChild={handleSelectTargetNode}
            className="h-full"
          />
        );
      })()
    ) : selectedNode.type === 'array' ? (
      <ArrayBuilder
        key={selectedNode.path}
        selectedTargetPath={selectedNode.path}
        selectedTargetRequired={selectedNode.isRequired}
        currentStatus={selectedNodeStatus}
        currentExpression={selectedNodeExpression}
        parsedSourceSchema={editor.parsedSourceSchema}
        parsedTargetSchema={editor.parsedTargetSchema ?? null}
        updateDraft={editor.actions.updateDraft}
        getDraftExpression={editor.actions.getDraftExpression}
        savedRules={editor.rules}
        className="h-full"
      />
    ) : (
      <ScalarFieldBuilder
        key={selectedNode.path}
        mappingId={mappingId}
        selectedTargetPath={selectedNode.path}
        selectedTargetType={toTargetFieldType(selectedNode.type)}
        selectedTargetRequired={selectedNode.isRequired}
        currentStatus={selectedNodeStatus}
        currentExpression={selectedNodeExpression}
        parsedSourceSchema={editor.parsedSourceSchema}
        stagedSourcePath={stagedSourcePath}
        updateDraft={editor.actions.updateDraft}
        revertDraft={editor.actions.revertDraft}
        getDraftExpression={editor.actions.getDraftExpression}
        unsavedChangeCount={editor.unsavedChangeCount}
        onViewUnsavedChanges={() => { setIsChangesOverlayOpen(true); }}
        onClearMapping={(targetPath) => { editor.actions.deleteRuleByTarget(targetPath); }}
        currentRuleIndex={selectedRuleIndexForSmartFix}
        currentRuleDiagnostics={selectedRuleDiagnosticsForSmartFix}
        currentRuleVersion={editor.currentRevision}
        savedRules={editor.rules}
        className="h-full"
      />
    );

  const builderContent = view === 'automap' ? autoMapWorkspaceContent : builderContentInner;

  // Bottom area: connected inline preview strip (renders inside PreviewProvider)
  const bottomContent = (
    <ConnectedInlinePreviewStrip
      config={editor.config}
      sourceSchemaDetail={editor.sourceSchemaDetail}
      targetSchemaDetail={editor.targetSchemaDetail}
      projectId={projectId}
      mappingId={mappingId}
      selectedTargetPath={selectedTargetPath}
      getDraftExpression={editor.actions.getDraftExpression}
      onNavigateToRule={(ruleIndex) => {
        const rule = editor.rules[ruleIndex];
        if (rule) setSelectedTargetPath(resolveSelectedTargetPath(rule.target));
      }}
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
        unsavedChangeCount={editor.unsavedChangeCount}
        onSave={editor.actions.save}
        sourceSchemaName={editor.sourceSchemaName}
        targetSchemaName={editor.targetSchemaName}
        sourceContent={sourceContent}
        targetWorklistContent={targetWorklistContent}
        builderContent={builderContent}
        bottomContent={bottomContent}
        onConfigToggle={() => setIsConfigOpen((prev) => !prev)}
        onHistoryToggle={handleOpenHistory}
        onAutoMap={handleAutoMapAll}
        isAutoMapLoading={autoMapWorkspace.status === 'loading'}
        isAutoMapMode={view === 'automap'}
        autoMapPendingCount={autoMapWorkspace.summary.pending}
        autoMapSectionPath={autoMapWorkspace.sectionPath}
        onReturnToAutoMap={() => {
          if (autoMapWorkspace.sectionPath !== null) {
            enterAutoMapWorkspace(autoMapWorkspace.sectionPath);
          }
        }}
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

      {/* Unsaved changes overlay */}
      {isChangesOverlayOpen && (
        <UnsavedChangesOverlay
          changes={editor.actions.getUnsavedChangeSummary()}
          onRevert={(targetPath) => { editor.actions.revertDraft(targetPath); }}
          onNavigate={(targetPath) => { setSelectedTargetPath(resolveSelectedTargetPath(targetPath)); }}
          onClose={() => { setIsChangesOverlayOpen(false); }}
        />
      )}

      {/* Route-level unsaved-changes guard dialog */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Unsaved changes"
        message={`You have unsaved changes to ${editor.unsavedChangeCount} field(s). Discard and leave?`}
        confirmLabel="Discard & Leave"
        cancelLabel="Cancel"
        onConfirm={handleBlockerDiscard}
        onCancel={handleBlockerCancel}
      />
    </>
  );
}
