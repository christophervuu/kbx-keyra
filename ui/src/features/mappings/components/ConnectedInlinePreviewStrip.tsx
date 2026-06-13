import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { InlinePreviewStrip } from './InlinePreviewStrip';
import { usePreviewExecution } from '../hooks/use-preview-execution';
import { useTestCases } from '../hooks/use-test-cases';
import type { PreviewDiagnostic } from '../types';

import type { MappingConfig, SchemaDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTORUN_STORAGE_KEY = 'keyra:preview-autorun';

function readAutoRunFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(AUTORUN_STORAGE_KEY);
    if (raw === null) return true; // default on
    return JSON.parse(raw) === true;
  } catch {
    return true; // fallback on corrupt value
  }
}

function writeAutoRunToStorage(value: boolean): void {
  try {
    localStorage.setItem(AUTORUN_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectedInlinePreviewStripProps {
  /** Current mapping config with live rules. Null while loading. */
  config: MappingConfig | null;
  /** Source schema detail for engine execution. Null while loading. */
  sourceSchemaDetail: SchemaDetail | null;
  /** Target schema detail for engine execution. Null while loading. */
  targetSchemaDetail: SchemaDetail | null;
  /** Project ID — used to build the testing page URL */
  projectId: string;
  /** Mapping ID — used to build the testing page URL */
  mappingId: string;
  /**
   * The currently selected target field path.
   * Used to watch the draft expression for auto-preview triggering.
   */
  selectedTargetPath: string | null;
  /**
   * Returns the current draft expression for a target field, or null if no draft exists.
   * Used to watch for expression changes and trigger debounced auto-preview.
   */
  getDraftExpression: (targetPath: string) => string | null;
  /**
   * Callback to navigate to a specific rule in the target worklist.
   * Provided by the composition layer (MappingEditor.tsx).
   * When a diagnostic entry is clicked, this fires with the rule's index.
   */
  onNavigateToRule?: (ruleIndex: number) => void;
  /** Optional externally managed source payload raw text (e.g. selected schema sample). */
  externalSourceDataRaw?: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ConnectedInlinePreviewStrip — wires `usePreviewExecution` (which requires
 * `<PreviewProvider>`) to `InlinePreviewStrip`.
 *
 * Must be rendered inside `<PreviewProvider>` (i.e. inside `MappingEditorPage`).
 * `MappingEditor.tsx` passes only the props that are available above the
 * provider boundary; all execution state is owned here.
 *
 * Owns:
 * - `sourceData` — controlled textarea value
 * - `isCollapsed` — strip collapsed state
 * - `autoRun` — persisted to localStorage key `keyra:preview-autorun`
 *
 * Derives from execution result:
 * - `diagnostics` — mapped from engine Diagnostic[] to PreviewDiagnostic[]
 * - `durationMs` — from ExecutionResult.stats.durationMs
 * - `ruleCount` — from ExecutionResult.stats.rulesEvaluated (or config.rules.length)
 */
export function ConnectedInlinePreviewStrip({
  config,
  sourceSchemaDetail,
  targetSchemaDetail,
  projectId,
  mappingId,
  selectedTargetPath,
  getDraftExpression,
  onNavigateToRule,
  externalSourceDataRaw = null,
}: ConnectedInlinePreviewStripProps) {
  const [sourceData, setSourceData] = useState(() => externalSourceDataRaw ?? '');
  const externalSourcesData = '{}';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [autoRun, setAutoRun] = useState<boolean>(readAutoRunFromStorage);

  const handleAutoRunChange = useCallback((value: boolean) => {
    setAutoRun(value);
    writeAutoRunToStorage(value);
  }, []);

  const handleClearSource = useCallback(() => {
    setSourceData('');
  }, []);

  const { testCases, loadTestCase, saveTestCase } = useTestCases(mappingId);

  const handleLoadTestCase = useCallback(
    (id: string) => {
      const tc = loadTestCase(id);
      if (tc) setSourceData(tc.sourceData);
    },
    [loadTestCase],
  );

  const handleSaveTestCase = useCallback(
    (input: { name: string; sourceData: string; expectedOutput?: unknown }) => {
      return saveTestCase({
        name: input.name,
        sourceData: input.sourceData,
        // useTestCases.saveTestCase expects expectedOutput as string | undefined
        ...(input.expectedOutput !== undefined
          ? { expectedOutput: JSON.stringify(input.expectedOutput) }
          : {}),
      });
    },
    [saveTestCase],
  );

  const { state, run } = usePreviewExecution({
    config,
    sourceSchemaDetail,
    targetSchemaDetail,
    sourceDataRaw: sourceData.trim() ? sourceData : null,
    externalSourcesRaw: externalSourcesData,
    requiredEnrichmentAliases: (config?.enrichmentSources ?? [])
      .filter((entry) => entry.required !== false)
      .map((entry) => entry.alias),
  });

  // ---------------------------------------------------------------------------
  // Auto-preview: watch the draft expression for the selected field.
  // When it stabilizes (300ms debounce), trigger a full mapping preview
  // if autoRun is on and sourceData is non-empty.
  // Replaces the old lastApplyTimestamp / onRuleApplied mechanism.
  // ---------------------------------------------------------------------------
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDraftExpressionRef = useRef<string | null>(null);

  useEffect(() => {
    const currentDraft = selectedTargetPath ? getDraftExpression(selectedTargetPath) : null;

    // Only trigger when the draft expression actually changes
    if (currentDraft === prevDraftExpressionRef.current) return;
    prevDraftExpressionRef.current = currentDraft;

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);

    if (!autoRun) return;
    if (!sourceData.trim()) return;
    if (!currentDraft?.trim()) return;

    previewDebounceRef.current = setTimeout(() => {
      run();
    }, 300);

    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [selectedTargetPath, getDraftExpression, autoRun, sourceData, run]);

  const output =
    state.status === 'success'
      ? state.result.output
      : state.status === 'error'
        ? { error: state.error }
        : state.status === 'timeout'
          ? { error: 'Execution timed out. Try reducing input size or simplifying expressions.' }
          : null;

  const status =
    state.status === 'success'
      ? {
          errors: state.result.diagnostics.filter((d) => d.severity === 'error').length,
          warnings: state.result.diagnostics.filter((d) => d.severity === 'warning').length,
        }
      : state.status === 'error' || state.status === 'timeout'
        ? { errors: 1, warnings: 0 }
      : null;

  // Derive ruleCount: prefer stats.rulesEvaluated from execution result, fall back to config
  const ruleCount =
    state.status === 'success' && state.result.stats != null
      ? state.result.stats.rulesEvaluated
      : (config?.rules.length ?? 0);

  // Derive durationMs from execution stats
  const durationMs =
    state.status === 'success' && state.result.stats != null
      ? state.result.stats.durationMs
      : null;

  // Map engine Diagnostic[] → PreviewDiagnostic[] (memoized)
  const diagnostics = useMemo<PreviewDiagnostic[]>(() => {
    if (state.status !== 'success') return [];
    return state.result.diagnostics
      .filter((d) => d.ruleIndex !== undefined)
      .map((d, i) => ({
        severity: d.severity,
        code: d.code,
        message: d.message,
        ruleIndex: d.ruleIndex ?? i,
        ruleName: d.targetPath ?? `Rule ${(d.ruleIndex ?? i) + 1}`,
      }));
  }, [state]);

  return (
    <InlinePreviewStrip
      sourceData={sourceData}
      onSourceDataChange={setSourceData}
      onRun={run}
      output={output}
      isRunning={state.status === 'executing'}
      status={status}
      testingPageUrl={`/projects/${projectId}/mappings/${mappingId}/test-lab`}
      isCollapsed={isCollapsed}
      onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
      testCases={testCases}
      onLoadTestCase={handleLoadTestCase}
      autoRun={autoRun}
      onAutoRunChange={handleAutoRunChange}
      onClearSource={handleClearSource}
      diagnostics={diagnostics}
      ruleCount={ruleCount}
      durationMs={durationMs}
      onNavigateToRule={onNavigateToRule}
      onSaveTestCase={handleSaveTestCase}
    />
  );
}
