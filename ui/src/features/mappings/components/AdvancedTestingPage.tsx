import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ArrowLeft } from 'lucide-react';

import {
  DiagnosticsDisplay,
  DiffDisplay,
  OutputDisplay,
  SourceDataInput,
  TestCaseManager,
  TraceDisplay,
} from './preview';
import { PreviewProvider } from '../context/preview-context';
import { usePreviewExecution } from '../hooks/use-preview-execution';
import { useMappingEditor } from '../hooks/use-mapping-editor';

import type { TestCase } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdvancedTestingPageProps {
  projectId: string;
  mappingId: string;
}

type TabId = 'output' | 'diagnostics' | 'trace' | 'diff';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'output', label: 'Output' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'trace', label: 'Trace' },
  { id: 'diff', label: 'Diff' },
];

// ---------------------------------------------------------------------------
// Spinner
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
// Inner component — must be inside PreviewProvider
// ---------------------------------------------------------------------------

function AdvancedTestingInner({ projectId, mappingId }: AdvancedTestingPageProps) {
  const editor = useMappingEditor(mappingId);

  const [sourceDataRaw, setSourceDataRaw] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [loadedSourceData, setLoadedSourceData] = useState('');
  const [loadedExpectedOutput, setLoadedExpectedOutput] = useState<string | undefined>(undefined);
  const [currentExpectedOutput, setCurrentExpectedOutput] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('output');

  const { state, run, autoRun, setAutoRun, traceEnabled, setTraceEnabled } = usePreviewExecution({
    config: editor.config,
    sourceSchemaDetail: editor.sourceSchemaDetail,
    targetSchemaDetail: editor.targetSchemaDetail,
    sourceDataRaw,
  });

  const isExecuting = state.status === 'executing';
  const hasResult = state.status === 'success';
  const canRun =
    !isExecuting &&
    editor.config !== null &&
    editor.sourceSchemaDetail !== null &&
    editor.targetSchemaDetail !== null &&
    sourceDataRaw !== null;

  const diagnosticCount = hasResult ? (state.result.diagnostics?.length ?? 0) : 0;

  function handleLoadTestCase(tc: TestCase) {
    setLoadedSourceData(tc.sourceData);
    setLoadedExpectedOutput(tc.expectedOutput);
    setLoadKey((k) => k + 1);
    setActiveTab('output');
  }

  const editorUrl = `/projects/${projectId}/mappings/${mappingId}`;

  return (
    <div
      className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-slate-950 text-sm text-slate-300"
      data-testid="advanced-testing-page"
    >
      {/* Top bar */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2"
        data-testid="advanced-testing-topbar"
      >
        <Link
          to={editorUrl}
          data-testid="back-to-editor-link"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Back to Editor
        </Link>

        <span className="h-4 w-px bg-slate-700" aria-hidden="true" />

        <span className="text-xs font-medium text-slate-200" data-testid="mapping-name">
          {editor.mappingName}
        </span>
        <span className="text-xs text-slate-500" data-testid="mapping-version">
          v{editor.version}
        </span>

        <span className="flex-1" aria-hidden="true" />

        {/* Trace toggle */}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={traceEnabled}
            onChange={(e) => setTraceEnabled(e.target.checked)}
            data-testid="trace-toggle"
            className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
          />
          Trace
        </label>

        {/* Auto-run toggle */}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={autoRun}
            onChange={(e) => setAutoRun(e.target.checked)}
            data-testid="auto-run-toggle"
            className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
          />
          Auto-run
        </label>

        {/* Run button */}
        <button
          type="button"
          onClick={run}
          disabled={!canRun}
          aria-disabled={!canRun}
          data-testid="run-button"
          className={[
            'flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            canRun
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'cursor-not-allowed bg-slate-800 text-slate-600',
          ].join(' ')}
        >
          {isExecuting ? <Spinner /> : null}
          Run
        </button>
      </div>

      {/* Two-panel body */}
      <div className="flex min-h-0 flex-1 gap-px bg-slate-800">
        {/* Left panel — ~35% */}
        <div
          className="flex w-[35%] shrink-0 flex-col overflow-hidden bg-slate-950"
          data-testid="left-panel"
        >
          <div
            className="min-h-0 flex-1 overflow-auto border-b border-slate-800 px-2 py-2"
            data-testid="source-input-area"
          >
            <SourceDataInput
              key={loadKey}
              onRawChange={setSourceDataRaw}
              initialValue={loadedSourceData}
            />
          </div>

          <div className="shrink-0 overflow-auto" data-testid="test-case-manager-area">
            <TestCaseManager
              mappingId={mappingId}
              sourceDataRaw={sourceDataRaw}
              expectedOutputRaw={currentExpectedOutput}
              onLoad={handleLoadTestCase}
            />
          </div>
        </div>

        {/* Right panel — ~65% */}
        <div
          className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-950"
          data-testid="right-panel"
        >
          {/* Tab bar */}
          <div
            role="tablist"
            aria-label="Test results"
            className="flex shrink-0 border-b border-slate-800"
            data-testid="results-tabs"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`atp-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`atp-tabpanel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                data-testid={`tab-${tab.id}`}
                className={[
                  'relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-500 text-blue-400'
                    : 'text-slate-400 hover:text-slate-300',
                ].join(' ')}
              >
                {tab.label}
                {tab.id === 'diagnostics' && diagnosticCount > 0 && (
                  <span
                    className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-900"
                    aria-label={`${diagnosticCount} diagnostic${diagnosticCount === 1 ? '' : 's'}`}
                    data-testid="diagnostics-badge"
                  >
                    {diagnosticCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="min-h-0 flex-1 overflow-auto">
            {state.status === 'idle' && (
              <div
                className="flex h-full items-center justify-center p-4"
                data-testid="results-empty-state"
              >
                <p className="max-w-xs text-center text-xs text-slate-500">
                  Enter source data and click{' '}
                  <strong className="text-slate-400">Run</strong> to see results.
                </p>
              </div>
            )}

            {isExecuting && (
              <div
                className="flex h-full items-center justify-center p-4"
                data-testid="results-loading-state"
              >
                <div className="flex flex-col items-center gap-2">
                  <Spinner />
                  <p className="text-xs text-slate-500">Executing mapping…</p>
                </div>
              </div>
            )}

            {(hasResult || state.status === 'error' || state.status === 'timeout') && (
              <>
                <div
                  role="tabpanel"
                  id="atp-tabpanel-output"
                  aria-labelledby="atp-tab-output"
                  hidden={activeTab !== 'output'}
                  data-testid="tabpanel-output"
                >
                  <OutputDisplay state={state} />
                </div>

                <div
                  role="tabpanel"
                  id="atp-tabpanel-diagnostics"
                  aria-labelledby="atp-tab-diagnostics"
                  hidden={activeTab !== 'diagnostics'}
                  data-testid="tabpanel-diagnostics"
                >
                  <DiagnosticsDisplay state={state} />
                </div>

                <div
                  role="tabpanel"
                  id="atp-tabpanel-trace"
                  aria-labelledby="atp-tab-trace"
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
                  id="atp-tabpanel-diff"
                  aria-labelledby="atp-tab-diff"
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
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * AdvancedTestingPage — full-page test case management and execution.
 *
 * Wraps its content in an isolated `<PreviewProvider>` (separate from the
 * editor's provider — these are different routes, never co-mounted).
 * Loads mapping config and schemas independently via `useMappingEditor`.
 */
export function AdvancedTestingPage({ projectId, mappingId }: AdvancedTestingPageProps) {
  return (
    <PreviewProvider>
      <AdvancedTestingInner projectId={projectId} mappingId={mappingId} />
    </PreviewProvider>
  );
}
