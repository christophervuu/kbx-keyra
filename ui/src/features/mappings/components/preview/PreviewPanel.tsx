import { useState } from 'react';

import type { MappingConfig, SchemaDetail } from '@/lib/types/domain';
import { usePreviewExecution } from '../../hooks/use-preview-execution';
import { DiagnosticsDisplay } from './DiagnosticsDisplay';
import { DiffDisplay } from './DiffDisplay';
import { OutputDisplay } from './OutputDisplay';
import { SourceDataInput } from './SourceDataInput';
import { TestCaseManager } from './TestCaseManager';
import { TraceDisplay } from './TraceDisplay';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewPanelProps {
  /** Current mapping config with live rules. Null while loading. */
  config: MappingConfig | null;
  /** Source schema detail for engine execution. Null while loading. */
  sourceSchemaDetail: SchemaDetail | null;
  /** Target schema detail for engine execution. Null while loading. */
  targetSchemaDetail: SchemaDetail | null;
  /**
   * Mapping ID used to scope test case persistence.
   * Defaults to 'unknown' when not yet available (disables meaningful persistence).
   */
  mappingId?: string;
}

type TabId = 'output' | 'diagnostics' | 'trace' | 'diff';

interface Tab {
  id: TabId;
  label: string;
}

const TABS: readonly Tab[] = [
  { id: 'output', label: 'Output' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'trace', label: 'Trace' },
  { id: 'diff', label: 'Diff' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Executing…"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent"
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Preview & Testing Panel (Panel 5 of the Mapping Editor).
 *
 * Shell that provides:
 * - Toolbar: Run button, auto-run toggle, trace toggle
 * - Tab bar: Output | Diagnostics | Trace | Diff
 * - Stats bar: execution duration + rule count (when a result is available)
 * - Empty state when no execution has been run
 * - Loading indicator while executing
 *
 * Tab content areas are placeholder text in this task (T-06).
 * T-07 adds the source data input; T-08–T-11 fill each tab's content.
 */
export function PreviewPanel({
  config,
  sourceSchemaDetail,
  targetSchemaDetail,
  mappingId = 'unknown',
}: PreviewPanelProps) {
  // sourceDataRaw is driven by SourceDataInput via onRawChange callback.
  // null means empty or invalid JSON — Run is disabled, context.sourceData is null.
  const [sourceDataRaw, setSourceDataRaw] = useState<string | null>(null);

  // Load key: incrementing this forces SourceDataInput and DiffDisplay to
  // remount with new initial values when a test case is loaded.
  const [loadKey, setLoadKey] = useState(0);
  const [loadedSourceData, setLoadedSourceData] = useState('');
  const [loadedExpectedOutput, setLoadedExpectedOutput] = useState<string | undefined>(undefined);

  // Expected output lifted from DiffDisplay for test case saving.
  const [currentExpectedOutput, setCurrentExpectedOutput] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('output');

  function handleLoadTestCase(tc: import('@/lib/types/domain').TestCase) {
    setLoadedSourceData(tc.sourceData);
    setLoadedExpectedOutput(tc.expectedOutput);
    setLoadKey((k) => k + 1);
    // Switch to output tab so the user sees results after running
    setActiveTab('output');
  }

  const { state, run, autoRun, setAutoRun, traceEnabled, setTraceEnabled } =
    usePreviewExecution({
      config,
      sourceSchemaDetail,
      targetSchemaDetail,
      sourceDataRaw,
    });

  const isExecuting = state.status === 'executing';
  const hasResult = state.status === 'success';
  const canRun =
    !isExecuting &&
    config !== null &&
    sourceSchemaDetail !== null &&
    targetSchemaDetail !== null &&
    sourceDataRaw !== null;

  // Count diagnostics for badge
  const diagnosticCount =
    hasResult && state.status === 'success' ? (state.result.diagnostics?.length ?? 0) : 0;

  // Stats from last successful result
  const stats = hasResult && state.status === 'success' ? state.result.stats : null;

  return (
    <div
      className="flex h-full flex-col overflow-hidden text-sm text-zinc-300"
      data-testid="preview-panel"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Toolbar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-zinc-700 px-3 py-1.5"
        data-testid="preview-toolbar"
      >
        {/* Run button */}
        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          aria-disabled={!canRun}
          data-testid="run-button"
          className={[
            'flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            canRun
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'cursor-not-allowed bg-zinc-700 text-zinc-500',
          ].join(' ')}
          title={
            config === null || sourceSchemaDetail === null || targetSchemaDetail === null
              ? 'Schemas must be loaded before preview'
              : sourceDataRaw === null
                ? 'Enter valid source data to run'
                : undefined
          }
        >
          {isExecuting ? <Spinner /> : null}
          Run
        </button>

        {/* Auto-run toggle */}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={autoRun}
            onChange={(e) => { setAutoRun(e.target.checked); }}
            data-testid="auto-run-toggle"
            className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
          />
          Auto-run
        </label>

        {/* Trace toggle */}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={traceEnabled}
            onChange={(e) => { setTraceEnabled(e.target.checked); }}
            data-testid="trace-toggle"
            className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
          />
          Trace
        </label>

        {/* Execution status indicator */}
        {isExecuting && (
          <span className="ml-auto text-xs text-zinc-400" aria-live="polite">
            Running…
          </span>
        )}
        {state.status === 'error' && (
          <span className="ml-auto text-xs text-red-400" role="alert">
            Execution failed
          </span>
        )}
        {state.status === 'timeout' && (
          <span className="ml-auto text-xs text-amber-400" role="alert">
            Timed out
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Test Case Manager                                                    */}
      {/* ------------------------------------------------------------------ */}
      <TestCaseManager
        mappingId={mappingId}
        sourceDataRaw={sourceDataRaw}
        expectedOutputRaw={currentExpectedOutput}
        onLoad={handleLoadTestCase}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Source Data Input                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-zinc-700 px-2 py-2">
        <SourceDataInput
          key={loadKey}
          onRawChange={setSourceDataRaw}
          initialValue={loadedSourceData}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab bar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div
        role="tablist"
        aria-label="Preview results"
        className="flex shrink-0 border-b border-zinc-700"
        data-testid="preview-tabs"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`preview-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`preview-tabpanel-${tab.id}`}
            onClick={() => { setActiveTab(tab.id); }}
            data-testid={`tab-${tab.id}`}
            className={[
              'relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-400'
                : 'text-zinc-400 hover:text-zinc-300',
            ].join(' ')}
          >
            {tab.label}
            {/* Diagnostics badge */}
            {tab.id === 'diagnostics' && diagnosticCount > 0 && (
              <span
                className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-zinc-900"
                aria-label={`${diagnosticCount} diagnostic${diagnosticCount === 1 ? '' : 's'}`}
                data-testid="diagnostics-badge"
              >
                {diagnosticCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Content area                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="min-h-0 flex-1 overflow-auto">
        {/* Empty state — no execution run yet */}
        {state.status === 'idle' && (
          <div
            className="flex h-full items-center justify-center p-4"
            data-testid="preview-empty-state"
          >
            <p className="max-w-xs text-center text-xs text-zinc-500">
              Enter source data and click <strong className="text-zinc-400">Run</strong> to preview
              execution results.
            </p>
          </div>
        )}

        {/* Executing state */}
        {isExecuting && (
          <div
            className="flex h-full items-center justify-center p-4"
            data-testid="preview-loading-state"
          >
            <div className="flex flex-col items-center gap-2">
              <Spinner />
              <p className="text-xs text-zinc-500">Executing mapping…</p>
            </div>
          </div>
        )}

        {/* Tab panels — shown when execution has completed */}
        {(hasResult || state.status === 'error' || state.status === 'timeout') && (
          <>
            <div
              role="tabpanel"
              id="preview-tabpanel-output"
              aria-labelledby="preview-tab-output"
              hidden={activeTab !== 'output'}
              data-testid="tabpanel-output"
            >
              <OutputDisplay state={state} />
            </div>

            <div
              role="tabpanel"
              id="preview-tabpanel-diagnostics"
              aria-labelledby="preview-tab-diagnostics"
              hidden={activeTab !== 'diagnostics'}
              data-testid="tabpanel-diagnostics"
            >
              <DiagnosticsDisplay state={state} />
            </div>

            <div
              role="tabpanel"
              id="preview-tabpanel-trace"
              aria-labelledby="preview-tab-trace"
              hidden={activeTab !== 'trace'}
              data-testid="tabpanel-trace"
            >
              <TraceDisplay
                trace={state.status === 'success' ? (state.result.trace ?? []) : undefined}
                traceEnabled={traceEnabled}
              />
            </div>

            <div
              role="tabpanel"
              id="preview-tabpanel-diff"
              aria-labelledby="preview-tab-diff"
              hidden={activeTab !== 'diff'}
              data-testid="tabpanel-diff"
            >
              <DiffDisplay
                key={loadKey}
                state={state}
                initialExpectedOutput={loadedExpectedOutput}
                onExpectedRawChange={setCurrentExpectedOutput}
              />
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stats bar                                                            */}
      {/* ------------------------------------------------------------------ */}
      {stats !== null && stats !== undefined && (
        <div
          className="flex shrink-0 items-center gap-3 border-t border-zinc-700 px-3 py-1 text-xs text-zinc-500"
          data-testid="preview-stats-bar"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{stats.durationMs}ms</span>
          <span aria-hidden="true">•</span>
          <span>{stats.rulesEvaluated} rule{stats.rulesEvaluated === 1 ? '' : 's'} evaluated</span>
        </div>
      )}
    </div>
  );
}
