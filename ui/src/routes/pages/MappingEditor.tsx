import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';


import { Button } from '@/components';
import { useRecentActivity } from '@/features/home/hooks/use-recent-activity';
import { ConfirmDialog } from '@/features/mappings/components';
import {
  AiValidationPanel,
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
  IssuesPanel,
  UnsavedChangesOverlay,
  VersionDiffView,
  VersionHistoryDrawer,
  WorkspaceToolbar,
  WorkspaceNoSourceDataCallout,
  type ChildFieldInfo,
  type ExpressionBuilderPanelRef,
  type TargetFieldStatus,
  type ConsolidatedIssueItem,
} from '@/features/mappings/components';
import { MappingEditorPage } from '@/features/mappings/components';
import { RuleList } from '@/features/mappings/components';
import { usePreviewContext } from '@/features/mappings/context/preview-context';
import { useAutoMapWorkspace, useExpressionBuilder, useMappingEditor, useTargetStatus, useVersionHistory } from '@/features/mappings/hooks';
import { getPendingAutoMapSession } from '@/features/mappings/lib';
import { resolveFieldTestValue } from '@/features/mappings/lib/source-field-display';
import type { EditorView } from '@/features/mappings/types';
import { useAdapter } from '@/lib/api';
import { executeMapping } from '@/lib/engine';
import type { SchemaSamplePayloadMetadata, SchemaTreeNode } from '@/lib/types/domain';
import { PATHS } from '@/routes/paths';

const LAST_SELECTED_SAMPLE_STORAGE_PREFIX = 'keyra:mappings:last-selected-sample';

function readLastSelectedSampleId(mappingId: string): string | null {
  try {
    const raw = localStorage.getItem(`${LAST_SELECTED_SAMPLE_STORAGE_PREFIX}:${mappingId}`);
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeLastSelectedSampleId(mappingId: string, sampleId: string | null): void {
  try {
    const key = `${LAST_SELECTED_SAMPLE_STORAGE_PREFIX}:${mappingId}`;
    if (sampleId === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, sampleId);
  } catch {
    // ignore storage failures
  }
}

export function resolveInitialSelectedSampleId(params: {
  readonly samples: readonly SchemaSamplePayloadMetadata[];
  readonly lastSelectedSampleId: string | null;
  readonly mappingDefaultSampleId: string | null;
}): string | null {
  const { samples, lastSelectedSampleId, mappingDefaultSampleId } = params;
  const available = new Set(samples.map((sample) => sample.sampleId));

  if (lastSelectedSampleId && available.has(lastSelectedSampleId)) {
    return lastSelectedSampleId;
  }

  if (mappingDefaultSampleId && available.has(mappingDefaultSampleId)) {
    return mappingDefaultSampleId;
  }

  const schemaDefault = samples.find((sample) => sample.usedForInference) ?? null;
  return schemaDefault?.sampleId ?? null;
}

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

function resolveValueAtPath(sourceData: unknown, fieldPath: string): unknown {
  if (sourceData === null || sourceData === undefined) return undefined;
  const normalized = fieldPath.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalized.split('.').filter((segment) => segment.length > 0);

  let current: unknown = sourceData;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
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
  const [isSamplePickerOpen, setIsSamplePickerOpen] = useState(false);
  const [isAddSampleOpen, setIsAddSampleOpen] = useState(false);
  const [sampleNameInput, setSampleNameInput] = useState('');
  const [sampleContentInput, setSampleContentInput] = useState('');
  const [sampleActionError, setSampleActionError] = useState<string | null>(null);
  const [isSampleActionLoading, setIsSampleActionLoading] = useState(false);
  const [isIssuesOpen, setIsIssuesOpen] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null | undefined>(undefined);
  const [samplePayloadCache, setSamplePayloadCache] = useState<Record<string, { raw: string; parsed: unknown | null }>>({});
  const [localSamplePayloadsBySchema, setLocalSamplePayloadsBySchema] = useState<Record<string, readonly SchemaSamplePayloadMetadata[]>>({});
  const [projectName, setProjectName] = useState<string>('Project');

  const sourceSchemaMetadata = editor.sourceSchemaDetail?.metadata ?? null;
  const sourceSchemaId = sourceSchemaMetadata?.schemaId ?? null;
  const sourceSchemaDataFormat = sourceSchemaMetadata?.dataFormat ?? 'json';

  const sourceSamples = useMemo(() => {
    const base = sourceSchemaMetadata?.samplePayloads ?? [];
    const localForSchema = sourceSchemaId ? (localSamplePayloadsBySchema[sourceSchemaId] ?? []) : [];
    if (localForSchema.length === 0) {
      return base;
    }

    const known = new Set(base.map((sample) => sample.sampleId));
    const extras = localForSchema.filter((sample) => !known.has(sample.sampleId));
    return [...base, ...extras];
  }, [localSamplePayloadsBySchema, sourceSchemaId, sourceSchemaMetadata?.samplePayloads]);

  const mappingDefaultSampleId = editor.configOptions.editorPreferences?.defaultSelectedSampleId ?? null;
  const resolvedSelectedSampleId = useMemo(() => {
    const resolvedFromPrecedence = resolveInitialSelectedSampleId({
      samples: sourceSamples,
      lastSelectedSampleId: readLastSelectedSampleId(mappingId),
      mappingDefaultSampleId,
    });

    if (selectedSampleId === undefined) {
      return resolvedFromPrecedence;
    }
    if (selectedSampleId === null) {
      return null;
    }

    if (sourceSamples.some((sample) => sample.sampleId === selectedSampleId)) {
      return selectedSampleId;
    }

    return resolvedFromPrecedence;
  }, [mappingDefaultSampleId, mappingId, selectedSampleId, sourceSamples]);

  const selectedSample = useMemo(
    () => sourceSamples.find((sample) => sample.sampleId === resolvedSelectedSampleId) ?? null,
    [resolvedSelectedSampleId, sourceSamples],
  );
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    adapter.getProject(projectId).then((detail) => {
      if (!cancelled) setProjectName(detail.name);
    }).catch(() => { /* silently fall back to 'Project' */ });
    return () => { cancelled = true; };
  }, [adapter, projectId]);

  const selectedSamplePayload = useMemo(() => {
    if (!resolvedSelectedSampleId) return null;
    return samplePayloadCache[resolvedSelectedSampleId] ?? null;
  }, [resolvedSelectedSampleId, samplePayloadCache]);
  const selectedSampleRaw = selectedSamplePayload?.raw ?? null;
  const selectedSampleParsed = selectedSamplePayload?.parsed ?? null;

  const loadSamplePayload = useCallback(async (sample: SchemaSamplePayloadMetadata) => {
    const canLoad = typeof adapter.getSchemaSamplePayload === 'function';
    if (canLoad) {
      const response = await adapter.getSchemaSamplePayload(sample.schemaId, sample.sampleId);
      return {
        raw: response.raw,
        parsed: response.parsed,
      };
    }

    if (sample.source === 'initial_upload' && editor.sourceSchemaDetail) {
      const raw = typeof editor.sourceSchemaDetail.content === 'string'
        ? editor.sourceSchemaDetail.content
        : JSON.stringify(editor.sourceSchemaDetail.content);
      const parsed = typeof editor.sourceSchemaDetail.content === 'string'
        ? null
        : editor.sourceSchemaDetail.content;
      return { raw, parsed };
    }

    throw new Error('Sample payload retrieval is not available in this mode.');
  }, [adapter, editor.sourceSchemaDetail]);

  useEffect(() => {
    if (!resolvedSelectedSampleId) {
      return;
    }

    if (samplePayloadCache[resolvedSelectedSampleId]) {
      return;
    }

    const selected = sourceSamples.find((sample) => sample.sampleId === resolvedSelectedSampleId) ?? null;
    if (selected === null) {
      return;
    }

    let active = true;
    void loadSamplePayload(selected)
      .then((payload) => {
        if (!active) return;
        setSamplePayloadCache((prev) => {
          if (prev[selected.sampleId]) return prev;
          return { ...prev, [selected.sampleId]: payload };
        });
      })
      .catch((err) => {
        if (!active) return;
        setSampleActionError(err instanceof Error ? err.message : 'Failed to load selected sample payload.');
      });

    return () => {
      active = false;
    };
  }, [loadSamplePayload, resolvedSelectedSampleId, samplePayloadCache, sourceSamples]);

  const updateMappingDefaultSample = useCallback((sampleId: string | null) => {
    const currentPrefs = editor.configOptions.editorPreferences ?? {};

    if (sampleId === null) {
      const { defaultSelectedSampleId, ...rest } = currentPrefs;
      void defaultSelectedSampleId;
      editor.actions.updateConfig({
        editorPreferences: rest,
      });
      return;
    }

    editor.actions.updateConfig({
      editorPreferences: {
        ...currentPrefs,
        defaultSelectedSampleId: sampleId,
      },
    });
  }, [editor.actions, editor.configOptions.editorPreferences]);

  const selectSample = useCallback(async (
    sampleId: string | null,
    options?: {
      readonly persistLastSelected?: boolean;
      readonly persistMappingDefault?: boolean;
      readonly payloadHint?: { raw: string; parsed: unknown | null };
    },
  ) => {
    setSampleActionError(null);

    if (sampleId === null) {
      setSelectedSampleId(null);
      if (options?.persistLastSelected) {
        writeLastSelectedSampleId(mappingId, null);
      }
      if (options?.persistMappingDefault) {
        updateMappingDefaultSample(null);
      }
      return;
    }

    const sample = sourceSamples.find((entry) => entry.sampleId === sampleId) ?? null;
    if (!sample) {
      return;
    }

    if (options?.persistLastSelected) {
      writeLastSelectedSampleId(mappingId, sample.sampleId);
    }
    if (options?.persistMappingDefault) {
      updateMappingDefaultSample(sample.sampleId);
    }

    if (options?.payloadHint) {
      setSamplePayloadCache((prev) => ({ ...prev, [sample.sampleId]: options.payloadHint! }));
      setSelectedSampleId(sample.sampleId);
      return;
    }

    try {
      const payload = await loadSamplePayload(sample);
      setSamplePayloadCache((prev) => ({ ...prev, [sample.sampleId]: payload }));
      setSelectedSampleId(sample.sampleId);
    } catch (err) {
      setSampleActionError(err instanceof Error ? err.message : 'Failed to load selected sample payload.');
    }
  }, [loadSamplePayload, mappingId, sourceSamples, updateMappingDefaultSample]);

  const handleAddSample = useCallback(async () => {
    if (!sourceSchemaId) {
      setSampleActionError('Source schema is not available for adding samples.');
      return;
    }

    if (typeof adapter.addSchemaSample !== 'function') {
      setSampleActionError('Adding schema samples is not available in this mode.');
      return;
    }

    const trimmedContent = sampleContentInput.trim();
    if (!trimmedContent) {
      setSampleActionError('Sample payload content is required.');
      return;
    }

    let parsedForSubmit: unknown;
    let parsedForContext: unknown | null;
    if (sourceSchemaDataFormat === 'xml') {
      parsedForSubmit = trimmedContent;
      parsedForContext = null;
    } else {
      try {
        parsedForSubmit = JSON.parse(trimmedContent);
        parsedForContext = parsedForSubmit;
      } catch {
        setSampleActionError('Sample payload must be valid JSON.');
        return;
      }
    }

    setIsSampleActionLoading(true);
    setSampleActionError(null);

    try {
      const result = await adapter.addSchemaSample(sourceSchemaId, {
        sampleName: sampleNameInput.trim() || undefined,
        sampleContent: parsedForSubmit,
        applySuggestedUpdates: false,
      });

      setLocalSamplePayloadsBySchema((prev) => {
        if (!sourceSchemaId) {
          return prev;
        }

        const existing = prev[sourceSchemaId] ?? [];
        if (existing.some((sample) => sample.sampleId === result.sample.sampleId)) {
          return prev;
        }

        return {
          ...prev,
          [sourceSchemaId]: [...existing, result.sample],
        };
      });
      setIsAddSampleOpen(false);
      setSampleNameInput('');
      setSampleContentInput('');

      const payloadHint = {
        raw: trimmedContent,
        parsed: parsedForContext,
      };
      await selectSample(result.sample.sampleId, {
        persistLastSelected: true,
        persistMappingDefault: true,
        payloadHint,
      });
    } catch (err) {
      setSampleActionError(err instanceof Error ? err.message : 'Failed to add sample payload.');
    } finally {
      setIsSampleActionLoading(false);
    }
  }, [adapter, sampleContentInput, sampleNameInput, selectSample, sourceSchemaDataFormat, sourceSchemaId]);

  const sampleOutputByTargetPath = useMemo(() => {
    if (
      selectedSampleParsed === null
      || editor.config === null
      || editor.sourceSchemaDetail === null
      || editor.targetSchemaDetail === null
      || editor.parsedTargetSchema === null
    ) {
      return undefined;
    }

    try {
      const execution = executeMapping(
        editor.config,
        selectedSampleParsed,
        editor.sourceSchemaDetail.content,
        editor.targetSchemaDetail.content,
      );

      const next: Record<string, string | null> = {};
      for (const node of editor.parsedTargetSchema.nodes) {
        next[node.path] = resolveFieldTestValue(execution.output, node.path) ?? null;
      }
      return next;
    } catch {
      return undefined;
    }
  }, [
    editor.config,
    editor.parsedTargetSchema,
    editor.sourceSchemaDetail,
    editor.targetSchemaDetail,
    selectedSampleParsed,
  ]);

  const sampleArrayItemCountByTargetPath = useMemo(() => {
    if (selectedSampleParsed === null || editor.parsedTargetSchema === null) {
      return undefined;
    }

    const next: Record<string, number | null> = {};
    for (const node of editor.parsedTargetSchema.nodes) {
      if (node.type !== 'array') continue;
      const value = resolveValueAtPath(selectedSampleParsed, node.path);
      next[node.path] = Array.isArray(value) ? value.length : null;
    }
    return next;
  }, [editor.parsedTargetSchema, selectedSampleParsed]);

  const sampleSelectorSlot = (
    <div className="relative" data-testid="sample-picker-slot">
      <button
        type="button"
        onClick={() => setIsSamplePickerOpen((prev) => !prev)}
        data-testid="sample-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={isSamplePickerOpen}
        className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      >
        Sample: {selectedSample?.name ?? 'None'}
      </button>

      {isSamplePickerOpen && (
        <div
          role="dialog"
          aria-label="Select source sample payload"
          data-testid="sample-picker-popover"
          className="absolute right-0 z-50 mt-1 w-80 rounded border border-slate-700 bg-slate-900 p-2 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-200">Source samples</p>
            <button
              type="button"
              onClick={() => setIsSamplePickerOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Close
            </button>
          </div>

          <div className="max-h-56 space-y-1 overflow-auto" data-testid="sample-picker-list">
            <button
              type="button"
              onClick={() => {
                void selectSample(null, {
                  persistLastSelected: true,
                  persistMappingDefault: true,
                });
                setIsSamplePickerOpen(false);
              }}
              data-testid="sample-picker-option-none"
              className="w-full rounded border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
            >
              No sample
            </button>

            {sourceSamples.map((sample) => (
              <button
                key={sample.sampleId}
                type="button"
                onClick={() => {
                  void selectSample(sample.sampleId, {
                    persistLastSelected: true,
                    persistMappingDefault: true,
                  });
                  setIsSamplePickerOpen(false);
                }}
                data-testid={`sample-picker-option-${sample.sampleId}`}
                className={[
                  'w-full rounded border px-2 py-1.5 text-left text-xs transition-colors',
                  resolvedSelectedSampleId === sample.sampleId
                    ? 'border-blue-600 bg-blue-900/30 text-blue-200'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800',
                ].join(' ')}
              >
                <p className="truncate font-medium">{sample.name}</p>
                <p className="text-[10px] text-slate-500">{sample.dataFormat.toUpperCase()}</p>
              </button>
            ))}

            {sourceSamples.length === 0 && (
              <p className="rounded border border-slate-700 bg-slate-800/40 px-2 py-2 text-xs text-slate-500" data-testid="sample-picker-empty">
                No samples available for this source schema.
              </p>
            )}
          </div>

          <div className="mt-2 border-t border-slate-800 pt-2">
            <button
              type="button"
              data-testid="sample-picker-add-sample"
              onClick={() => {
                setSampleActionError(null);
                setIsAddSampleOpen(true);
              }}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 transition-colors hover:bg-slate-700"
            >
              Add sample payload
            </button>
          </div>

          {sampleActionError && (
            <p className="mt-2 text-xs text-red-300" role="alert" data-testid="sample-picker-error">
              {sampleActionError}
            </p>
          )}
        </div>
      )}

      {isAddSampleOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" data-testid="sample-add-dialog">
          <div role="dialog" aria-modal="true" aria-label="Add sample payload" className="w-full max-w-lg rounded border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-100">Add sample payload</h2>
            <p className="mt-1 text-xs text-slate-500">Expected format: {sourceSchemaDataFormat.toUpperCase()}</p>

            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={sampleNameInput}
                onChange={(e) => setSampleNameInput(e.target.value)}
                placeholder="Sample name (optional)"
                data-testid="sample-add-name"
                className="h-8 w-full rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <textarea
                value={sampleContentInput}
                onChange={(e) => setSampleContentInput(e.target.value)}
                rows={8}
                placeholder={sourceSchemaDataFormat === 'xml' ? '<root />' : '{ "example": true }'}
                data-testid="sample-add-content"
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {sampleActionError && (
              <p className="mt-2 text-xs text-red-300" role="alert" data-testid="sample-add-error">
                {sampleActionError}
              </p>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddSampleOpen(false)}
                disabled={isSampleActionLoading}
                data-testid="sample-add-cancel"
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleAddSample(); }}
                disabled={isSampleActionLoading || sampleContentInput.trim().length === 0}
                data-testid="sample-add-submit"
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isSampleActionLoading ? 'Saving…' : 'Save sample'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

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

  const navigationAutoMapCreateNotice = useMemo(() => {
    const navState = location.state as Record<string, unknown> | null;
    return navState && typeof navState.autoMapCreateNotice === 'string'
      ? navState.autoMapCreateNotice
      : null;
  }, [location.state]);
  const [dismissedAutoMapCreateNotice, setDismissedAutoMapCreateNotice] = useState<string | null>(null);
  const autoMapCreateNotice =
    navigationAutoMapCreateNotice !== null && navigationAutoMapCreateNotice !== dismissedAutoMapCreateNotice
      ? navigationAutoMapCreateNotice
      : null;

  const pendingAutoMapSession = useMemo(() => getPendingAutoMapSession(mappingId), [mappingId]);
  const initialPendingSectionPath =
    pendingAutoMapSession.pendingCount > 0
      ? (pendingAutoMapSession.primarySectionPath ?? '')
      : null;

  // ---------------------------------------------------------------------------
  // View state (must be before handleAutoMapTrigger)
  // ---------------------------------------------------------------------------
  const [view, setView] = useState<EditorView>(() => (initialPendingSectionPath !== null ? 'automap' : 'target'));

  // ---------------------------------------------------------------------------
  // Auto-Map workspace mode state (FS-048 T-02)
  // ---------------------------------------------------------------------------
  /** The section path currently loaded in the Auto-Map workspace (preserved across exits). */
  const [autoMapSectionPath, setAutoMapSectionPath] = useState<string | null>(initialPendingSectionPath);
  const [visibleAutoMapScope, setVisibleAutoMapScope] = useState<{ visibleTargetPaths: string[]; count: number }>({
    visibleTargetPaths: [],
    count: 0,
  });

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

  const hydratedPendingSessionForMappingIdRef = useRef<string | null>(null);

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
    (sectionPath: string, visibleTargetPaths?: readonly string[]) => {
      setIsHistoryOpen(false);
      enterAutoMapWorkspace(sectionPath);
      autoMapWorkspace.triggerAutoMap(sectionPath, visibleTargetPaths);
    },
    [enterAutoMapWorkspace, autoMapWorkspace],
  );

  const handleAutoMapAll = useCallback(() => {
    setIsHistoryOpen(false);
    // T-10: header-level "Auto-map" triggers workspace for the root section
    enterAutoMapWorkspace('');
    void autoMapWorkspace.triggerAutoMap('', visibleAutoMapScope.visibleTargetPaths);
  }, [enterAutoMapWorkspace, autoMapWorkspace, visibleAutoMapScope.visibleTargetPaths]);

  // Create-time and re-entry-safe auto-map pending session hydration.
  useEffect(() => {
    if (initialPendingSectionPath === null) {
      return;
    }

    if (hydratedPendingSessionForMappingIdRef.current === mappingId) {
      return;
    }

    hydratedPendingSessionForMappingIdRef.current = mappingId;
    autoMapWorkspace.triggerAutoMap(initialPendingSectionPath);
  }, [mappingId, initialPendingSectionPath, autoMapWorkspace]);

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
  const targetMappingStatus = useMemo<Map<string, TargetFieldStatus> | undefined>(() => {
    if (!editor.parsedTargetSchema) return undefined;
    const statusMap = new Map<string, TargetFieldStatus>();
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
      let hasErrorDiagnostics = false;
      let hasWarningDiagnostics = false;
      for (const ruleIndex of indexes) {
        const diagnostics = editor.validation.diagnosticsForRule(ruleIndex);
        if (diagnostics.some((d) => d.severity === 'error')) {
          hasErrorDiagnostics = true;
          break;
        }
        if (diagnostics.some((d) => d.severity === 'warning')) {
          hasWarningDiagnostics = true;
        }
      }

      if (hasErrorDiagnostics) {
        statusMap.set(path, 'error');
      } else if (hasWarningDiagnostics) {
        statusMap.set(path, 'warning');
      } else {
        statusMap.set(path, 'mapped');
      }
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

  const selectedNodeStatus = useMemo((): TargetFieldStatus => {
    if (!selectedTargetPath || !targetMappingStatus) return 'unmapped';
    return targetMappingStatus.get(selectedTargetPath) ?? 'unmapped';
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

  const autoMapSuggestionStatusByPath = useMemo(() => {
    const statusMap: Record<string, 'suggested' | 'accepted' | 'edited' | 'dismissed' | 'stale'> = {};
    for (const item of autoMapWorkspace.items) {
      statusMap[item.targetPath] = item.status;
    }
    return statusMap;
  }, [autoMapWorkspace.items]);

  const consolidatedIssues = useMemo<readonly ConsolidatedIssueItem[]>(() => {
    if (!editor.validation.result) return [];
    return editor.validation.result.diagnostics
      .filter((diag) => diag.severity === 'error' || diag.severity === 'warning')
      .filter((diag) => typeof diag.targetPath === 'string' && diag.targetPath.length > 0)
      .map((diag, index) => ({
        id: `${diag.code}:${diag.targetPath}:${index}`,
        targetPath: diag.targetPath!,
        severity: diag.severity,
        message: diag.message,
      }));
  }, [editor.validation.result]);

  const issueCount = consolidatedIssues.length;

  const testLabPath = useMemo(
    () => PATHS.MAPPING_TEST.replace(':projectId', projectId).replace(':mappingId', mappingId),
    [mappingId, projectId],
  );
  const deploymentPath = useMemo(
    () => PATHS.MAPPING_DEPLOYMENT.replace(':projectId', projectId).replace(':mappingId', mappingId),
    [mappingId, projectId],
  );

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
      <div className="flex h-full min-h-0 flex-col" data-testid="rules-view-panel">
        <AiValidationPanel
          status={editor.aiValidation.status}
          report={editor.aiValidation.report}
          error={editor.aiValidation.error}
          rules={editor.rules}
          onRun={() => {
            editor.actions.runAiValidation();
          }}
          onRetry={() => {
            editor.actions.retryAiValidation();
          }}
          onReset={() => {
            editor.actions.resetAiValidation();
          }}
          onNavigateToRule={(ruleIndex) => {
            setSelectedRuleIndex(ruleIndex);
          }}
        />

        <div className="min-h-0 flex-1">
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
        </div>
      </div>
    ) : (
      <TargetWorklist
        nodes={editor.parsedTargetSchema?.nodes ?? []}
        rules={effectiveRules}
        validationResult={editor.validation.result ?? null}
        selectedPath={selectedTargetPath}
        groupingMode="schema"
        onSelectNode={handleSelectTargetNode}
        onClearSelection={() => setSelectedTargetPath(null)}
        onVisibleScopeChange={setVisibleAutoMapScope}
        autoMapSuggestionStatusByPath={autoMapSuggestionStatusByPath}
        view={view}
        onViewToggle={handleViewToggle}
        targetSchemaName={editor.targetSchemaName}
        sampleOutputByTargetPath={sampleOutputByTargetPath}
        sampleArrayItemCountByTargetPath={sampleArrayItemCountByTargetPath}
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
      batchAcceptResult={autoMapWorkspace.lastBatchAcceptResult}
      onClearBatchAcceptResult={autoMapWorkspace.clearBatchAcceptResult}
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
      key={`preview-sample-${resolvedSelectedSampleId ?? 'none'}`}
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
      externalSourceDataRaw={selectedSampleRaw}
    />
  );

  const issueOverlay = isIssuesOpen
    ? (
      <div
        className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60"
        data-testid="issues-panel-overlay"
      >
        <IssuesPanel
          issues={consolidatedIssues}
          onClose={() => setIsIssuesOpen(false)}
          onOpenRow={(targetPath) => {
            setIsIssuesOpen(false);
            handleSelectTargetNode(targetPath);
          }}
        />
      </div>
    )
    : null;

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
        onViewIssues={() => setIsIssuesOpen(true)}
        issueCount={issueCount}
        onOpenTestLab={() => navigate(testLabPath)}
        onOpenDeploymentPage={() => navigate(deploymentPath)}
        onExportMapping={() => {}}
        onImportMapping={() => {}}
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
        autoMapScopeCount={visibleAutoMapScope.count}
        showDeployControls={false}
        sampleSelectorSlot={sampleSelectorSlot}
      />

      {issueOverlay}

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

      {autoMapCreateNotice && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-md rounded-md border border-amber-700/60 bg-slate-900/95 px-4 py-3 text-sm text-amber-200 shadow-lg"
          role="status"
          data-testid="automap-create-notice"
        >
          <div className="flex items-start justify-between gap-3">
            <p>{autoMapCreateNotice}</p>
            <button
              type="button"
              onClick={() => setDismissedAutoMapCreateNotice(navigationAutoMapCreateNotice)}
              className="text-xs text-amber-300 hover:text-amber-100"
              aria-label="Dismiss auto-map notice"
            >
              Dismiss
            </button>
          </div>
        </div>
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
