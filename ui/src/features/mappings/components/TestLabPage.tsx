import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ArrowLeft, CheckCircle2, ArrowUpRight, RotateCcw } from 'lucide-react';

import { useRecentActivity } from '@/features/home/hooks/use-recent-activity';

import {
  DiagnosticsDisplay,
  DiffDisplay,
  ExecutionSummaryBar,
  OutputDisplay,
  ResultPanel,
  SourceDataInput,
  SuiteSummary,
  TestCaseListPanel,
  TraceDisplay,
} from './preview';
import type { BatchState, SuiteSummaryRow } from './preview';
import { CompareTab } from './comparison';
import { PreviewProvider } from '../context/preview-context';
import { usePreviewExecution } from '../hooks/use-preview-execution';
import { useMappingEditor } from '../hooks/use-mapping-editor';
import { useTestLabLayout } from '../hooks/use-test-lab-layout';
import { useTestCases } from '../hooks/use-test-cases';
import { useTestRunResults } from '../hooks/use-test-run-results';
import { useBatchExecution } from '../hooks/use-batch-execution';
import { useLinkedDebugSelection } from '../hooks/use-linked-debug-selection';
import { useComparisonSnapshots } from '../hooks/use-comparison-snapshots';
import { computeDiff } from '@/lib/utils/json-diff';
import { formatDiffSummary } from '../lib/execution-result-utils';
import { explainDiagnostic } from '../lib/failure-explainer';

import type { DiffResult } from '@/lib/types/diff';
import type { TestCase, TestRunResult } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestLabPageProps {
  projectId: string;
  mappingId: string;
}

// Narrow fallback tab layout
type TabId = 'output' | 'diagnostics' | 'trace' | 'diff' | 'compare';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'output', label: 'Output' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'trace', label: 'Trace' },
  { id: 'diff', label: 'Diff' },
  { id: 'compare', label: 'Compare' },
];

// ---------------------------------------------------------------------------
// Divider drag hook
// ---------------------------------------------------------------------------

type DragAxis = 'col' | 'row';

interface UseDividerDragOptions {
  axis: DragAxis;
  containerRef: React.RefObject<HTMLElement | null>;
  clampMin: number;
  clampMax: number;
  onRatioChange: (ratio: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function useDividerDrag({
  axis,
  containerRef,
  clampMin,
  clampMax,
  onRatioChange,
}: UseDividerDragOptions) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const container = containerRef.current;
      if (!container) return;

      const cursor = axis === 'col' ? 'col-resize' : 'row-resize';
      document.body.style.cursor = cursor;
      document.body.style.userSelect = 'none';

      function handleMouseMove(ev: MouseEvent) {
        const r = container!.getBoundingClientRect();
        let ratio: number;
        if (axis === 'col') {
          ratio = (ev.clientX - r.left) / r.width;
        } else {
          ratio = (ev.clientY - r.top) / r.height;
        }
        onRatioChange(clamp(ratio, clampMin, clampMax));
      }

      function handleMouseUp() {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      }

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [axis, containerRef, clampMin, clampMax, onRatioChange],
  );

  return { isDragging, handleMouseDown };
}

// ---------------------------------------------------------------------------
// Divider element
// ---------------------------------------------------------------------------

interface DividerProps {
  axis: DragAxis;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  testId?: string;
}

function Divider({ axis, isDragging, onMouseDown, testId }: DividerProps) {
  const isCol = axis === 'col';
  return (
    <div
      role="separator"
      aria-orientation={isCol ? 'vertical' : 'horizontal'}
      onMouseDown={onMouseDown}
      data-testid={testId}
      className={[
        'shrink-0 transition-colors',
        isCol ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
        isDragging ? 'bg-blue-500' : 'bg-slate-700 hover:bg-slate-500',
      ].join(' ')}
    />
  );
}

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
// Empty / loading states
// ---------------------------------------------------------------------------

function PanelEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <p className="max-w-xs text-center text-xs text-slate-500">{message}</p>
    </div>
  );
}

function PanelLoadingState() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="flex flex-col items-center gap-2">
        <Spinner />
        <p className="text-xs text-slate-500">Executing mapping…</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner component — must be inside PreviewProvider
// ---------------------------------------------------------------------------

function TestLabInner({ projectId, mappingId }: TestLabPageProps) {
  const editor = useMappingEditor(mappingId);
  const navigate = useNavigate();

  // Record recent activity when the mapping loads successfully (FS-049 T-03)
  const { recordActivity } = useRecentActivity();
  useEffect(() => {
    if (editor.loadState === 'loaded' && editor.mappingName) {
      recordActivity({ type: 'mapping', id: mappingId, projectId, name: editor.mappingName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on successful load
  }, [editor.loadState]);

  const [sourceDataRaw, setSourceDataRaw] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [loadedSourceData, setLoadedSourceData] = useState('');
  const [loadedExpectedOutput, setLoadedExpectedOutput] = useState<string | undefined>(undefined);
  const [currentExpectedOutput, setCurrentExpectedOutput] = useState<string | null>(null);

  // Selected test case: null = scratchpad
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string | null>(null);

  // Batch state for UI
  const [batchSummary, setBatchSummary] = useState<{ passed: number; failed: number } | null>(null);
  // Suite summary rows shown after batch completes
  const [suiteSummaryRows, setSuiteSummaryRows] = useState<readonly SuiteSummaryRow[]>([]);

  // Narrow fallback tab state — only used at narrow breakpoint
  const [activeTab, setActiveTab] = useState<TabId>('output');

  // Diff result computed after each successful execution when expected output exists
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);

  const { state, run, autoRun, setAutoRun, traceEnabled, setTraceEnabled } = usePreviewExecution({
    config: editor.config,
    sourceSchemaDetail: editor.sourceSchemaDetail,
    targetSchemaDetail: editor.targetSchemaDetail,
    sourceDataRaw,
  });

  // Linked cross-panel debug selection (FS-036)
  const debugSelection = useLinkedDebugSelection(state.status);

  const { layout, togglePanel, setMainSplit, setColumnSplit, setRowSplit, resetLayout } = useTestLabLayout({
    traceEnabled,
  });

  // Auto-tab-switch and diff computation: fires on executing → success transition
  const prevStatusRef = useRef<string>('idle');
  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = state.status;

    if (prevStatus === 'executing' && state.status === 'success') {
      // Compute diff if expected output is available
      if (loadedExpectedOutput !== undefined && loadedExpectedOutput.trim() !== '') {
        try {
          const parsedExpected = JSON.parse(loadedExpectedOutput);
          const result = computeDiff(state.result.output, parsedExpected);
          setDiffResult(result);
          // Auto-switch to diff tab
          setActiveTab('diff');
        } catch {
          // Unparseable expected output — treat as no diff
          setDiffResult(null);
        }
      } else {
        setDiffResult(null);
      }
    }
  });

  // Test case CRUD
  const { testCases, saveTestCase, renameTestCase, duplicateTestCase, deleteTestCase } =
    useTestCases(mappingId);

  // Comparison snapshots
  const { saveSnapshot, deleteSnapshot, deleteSnapshotsForTestCase, snapshotsForTestCase } =
    useComparisonSnapshots(mappingId);

  // Build snapshotsByTestCase map for TestCaseListPanel
  const snapshotsByTestCase = Object.fromEntries(
    testCases.map((tc) => [tc.id, snapshotsForTestCase(tc.id)]),
  );

  // Run results
  const { results: runResults, recordResult, clearResult } = useTestRunResults(mappingId);

  // Batch execution
  const handleCaseComplete = useCallback(
    (testCaseId: string, result: TestRunResult) => {
      recordResult(testCaseId, result);
    },
    [recordResult],
  );

  const { isRunning, progress, runAll, rerunFailed, cancel } = useBatchExecution({
    config: editor.config,
    sourceSchema: editor.sourceSchemaDetail,
    targetSchema: editor.targetSchemaDetail,
    onCaseComplete: handleCaseComplete,
  });

  const batchState: BatchState = {
    isRunning,
    progress: isRunning ? progress : null,
    summary: !isRunning ? batchSummary : null,
  };

  const isExecuting = state.status === 'executing';
  const hasResult = state.status === 'success';
  const hasAnyResult = hasResult || state.status === 'error' || state.status === 'timeout';

  const canRun =
    !isExecuting &&
    !isRunning &&
    editor.config !== null &&
    editor.sourceSchemaDetail !== null &&
    editor.targetSchemaDetail !== null &&
    sourceDataRaw !== null;

  const diagnosticCount = hasResult ? (state.result.diagnostics?.length ?? 0) : 0;

  // ---------------------------------------------------------------------------
  // Selection handlers
  // ---------------------------------------------------------------------------

  function handleSelectTestCase(tc: TestCase) {
    setSelectedTestCaseId(tc.id);
    setLoadedSourceData(tc.sourceData);
    setLoadedExpectedOutput(tc.expectedOutput);
    setCurrentExpectedOutput(tc.expectedOutput ?? null);
    setLoadKey((k) => k + 1);
    setActiveTab('output');
  }

  function handleSelectScratchpad() {
    setSelectedTestCaseId(null);
    setLoadedSourceData('');
    setLoadedExpectedOutput(undefined);
    setCurrentExpectedOutput(null);
    setDiffResult(null);
    setLoadKey((k) => k + 1);
    setActiveTab('output');
  }

  function handleSelectSuiteTest(testCaseId: string) {
    const tc = testCases.find((t) => t.id === testCaseId);
    if (tc) handleSelectTestCase(tc);
  }

  // ---------------------------------------------------------------------------
  // Add New / Save As handlers
  // ---------------------------------------------------------------------------

  function handleAddNew() {
    const name = `Test Case ${testCases.length + 1}`;
    const result = saveTestCase({ name, sourceData: '' });
    if (result.success && result.id !== undefined) {
      setSelectedTestCaseId(result.id);
      setLoadedSourceData('');
      setLoadedExpectedOutput(undefined);
      setCurrentExpectedOutput(null);
      setDiffResult(null);
      setLoadKey((k) => k + 1);
      setActiveTab('output');
    }
  }

  function handleSaveCurrentInput(name: string) {
    const result = saveTestCase({
      name,
      sourceData: sourceDataRaw ?? '',
      ...(currentExpectedOutput !== null ? { expectedOutput: currentExpectedOutput } : {}),
    });
    if (result.success) {
      handleSelectScratchpad();
    }
  }

  // ---------------------------------------------------------------------------
  // Batch handlers
  // ---------------------------------------------------------------------------

  // Called by CompareTab when saving a comparison with no test case loaded
  function handleSaveNewTestCaseForComparison(name: string, sourceData: string): string | null {
    const result = saveTestCase({ name, sourceData });
    if (!result.success || result.id === undefined) return null;
    return result.id;
  }

  async function handleRunAll() {
    setBatchSummary(null);
    setSuiteSummaryRows([]);
    const batchResults = await runAll(testCases);
    const mergedResults = { ...runResults, ...batchResults };

    const passed = testCases.filter((tc) => mergedResults[tc.id]?.status === 'pass').length;
    const failed = testCases.filter((tc) => mergedResults[tc.id]?.status === 'fail').length;
    setBatchSummary({ passed, failed });

    const rows: SuiteSummaryRow[] = testCases
      .filter((tc) => mergedResults[tc.id] !== undefined)
      .map((tc) => ({
        testCaseId: tc.id,
        testCaseName: tc.name,
        result: mergedResults[tc.id],
      }));
    setSuiteSummaryRows(rows);
  }

  async function handleRerunFailed() {
    setBatchSummary(null);
    const batchResults = await rerunFailed(testCases, runResults);
    const mergedResults = { ...runResults, ...batchResults };

    const passed = testCases.filter((tc) => mergedResults[tc.id]?.status === 'pass').length;
    const failed = testCases.filter((tc) => mergedResults[tc.id]?.status === 'fail').length;
    setBatchSummary({ passed, failed });

    const rows: SuiteSummaryRow[] = testCases
      .filter((tc) => mergedResults[tc.id] !== undefined)
      .map((tc) => ({
        testCaseId: tc.id,
        testCaseName: tc.name,
        result: mergedResults[tc.id],
      }));
    setSuiteSummaryRows(rows);
  }

  const editorUrl = `/projects/${projectId}/mappings/${mappingId}`;

  // ---------------------------------------------------------------------------
  // Drag divider refs
  // ---------------------------------------------------------------------------

  // The body container holds both left panel + divider + right panel
  const bodyRef = useRef<HTMLDivElement>(null);
  // The wide grid container
  const gridRef = useRef<HTMLDivElement>(null);

  const mainDrag = useDividerDrag({
    axis: 'col',
    containerRef: bodyRef,
    clampMin: 0.2,
    clampMax: 0.5,
    onRatioChange: setMainSplit,
  });

  const colDrag = useDividerDrag({
    axis: 'col',
    containerRef: gridRef,
    clampMin: 0.2,
    clampMax: 0.8,
    onRatioChange: setColumnSplit,
  });

  const rowDrag = useDividerDrag({
    axis: 'row',
    containerRef: gridRef,
    clampMin: 0.2,
    clampMax: 0.8,
    onRatioChange: setRowSplit,
  });

  // ---------------------------------------------------------------------------
  // Per-panel content helpers
  // ---------------------------------------------------------------------------

  function outputContent() {
    if (isExecuting) return <PanelLoadingState />;
    if (!hasAnyResult)
      return (
        <PanelEmptyState message="Enter source data and click Run to see the mapping output." />
      );
    return (
      <OutputDisplay
        state={state}
        highlightPath={debugSelection.selection?.targetPath ?? null}
        onPathClick={(path) =>
          debugSelection.select({ targetPath: path, ruleIndex: undefined, source: 'output' })
        }
      />
    );
  }

  function diffContent() {
    if (isExecuting) return <PanelLoadingState />;
    if (!hasAnyResult)
      return <PanelEmptyState message="Run a test and set expected output to see the diff." />;
    return (
      <DiffDisplay
        key={loadKey}
        state={state}
        initialExpectedOutput={loadedExpectedOutput}
        onExpectedRawChange={setCurrentExpectedOutput}
        onSelect={debugSelection.select}
        selectedTargetPath={debugSelection.selection?.targetPath ?? null}
      />
    );
  }

  function diagnosticsContent() {
    if (isExecuting) return <PanelLoadingState />;
    if (!hasAnyResult)
      return <PanelEmptyState message="No diagnostics from the last execution." />;
    return (
      <DiagnosticsDisplay
        state={state}
        onSelect={debugSelection.select}
        selectedTargetPath={debugSelection.selection?.targetPath ?? null}
        selectedRuleIndex={debugSelection.selection?.ruleIndex ?? null}
        explainDiagnostic={explainDiagnostic}
        traceEntries={state.status === 'success' ? (state.result.trace ?? undefined) : undefined}
      />
    );
  }

  function traceContent() {
    if (!traceEnabled)
      return (
        <PanelEmptyState message="Enable Trace in the top bar to see execution trace." />
      );
    if (isExecuting) return <PanelLoadingState />;
    if (!hasAnyResult)
      return (
        <PanelEmptyState message="Run a test with Trace enabled to see trace entries." />
      );
    return (
      <TraceDisplay
        trace={state.status === 'success' ? (state.result.trace ?? []) : undefined}
        traceEnabled={traceEnabled}
        onSelect={debugSelection.select}
        selectedRuleIndex={debugSelection.selection?.ruleIndex ?? null}
        selectedTargetPath={debugSelection.selection?.targetPath ?? null}
        selectionSource={debugSelection.selection?.source ?? null}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Right panel — breakpoint-conditional rendering
  // ---------------------------------------------------------------------------

  function renderNarrowRightPanel() {
    return (
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-950"
        data-testid="right-panel"
        data-layout="narrow"
      >
        {/* Suite summary — shown after batch execution */}
        {suiteSummaryRows.length > 0 && (
          <SuiteSummary
            rows={suiteSummaryRows}
            onSelectTest={handleSelectSuiteTest}
          />
        )}

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
              {tab.id === 'diff' && diffResult !== null && (
                diffResult.isEqual ? (
                  <CheckCircle2
                    size={10}
                    className="text-green-400"
                    aria-label="Output matches expected"
                    data-testid="diff-tab-match-icon"
                  />
                ) : (
                  <span
                    className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                    aria-label={`${diffResult.summary.total} diff mismatch${diffResult.summary.total === 1 ? '' : 'es'}`}
                    data-testid="diff-tab-badge"
                  >
                    {diffResult.summary.total}
                  </span>
                )
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            role="tabpanel"
            id="atp-tabpanel-output"
            aria-labelledby="atp-tab-output"
            hidden={activeTab !== 'output'}
            data-testid="tabpanel-output"
          >
            {outputContent()}
          </div>
          <div
            role="tabpanel"
            id="atp-tabpanel-diagnostics"
            aria-labelledby="atp-tab-diagnostics"
            hidden={activeTab !== 'diagnostics'}
            data-testid="tabpanel-diagnostics"
          >
            {diagnosticsContent()}
          </div>
          <div
            role="tabpanel"
            id="atp-tabpanel-trace"
            aria-labelledby="atp-tab-trace"
            hidden={activeTab !== 'trace'}
            data-testid="tabpanel-trace"
          >
            {traceContent()}
          </div>
          <div
            role="tabpanel"
            id="atp-tabpanel-diff"
            aria-labelledby="atp-tab-diff"
            hidden={activeTab !== 'diff'}
            data-testid="tabpanel-diff"
          >
            {diffContent()}
          </div>
          <div
            role="tabpanel"
            id="atp-tabpanel-compare"
            aria-labelledby="atp-tab-compare"
            hidden={activeTab !== 'compare'}
            data-testid="tabpanel-compare"
          >
            {activeTab === 'compare' && (
              <CompareTab
                mappingId={mappingId}
                config={editor.config}
                sourceSchemaDetail={editor.sourceSchemaDetail}
                targetSchemaDetail={editor.targetSchemaDetail}
                sourceDataRaw={sourceDataRaw}
                selectedTestCaseId={selectedTestCaseId}
                onSaveNewTestCase={handleSaveNewTestCaseForComparison}
                onSaveSnapshot={saveSnapshot}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderMediumRightPanel() {
    return (
      <div
        className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-950"
        data-testid="right-panel"
        data-layout="medium"
      >
        {/* Output — always expanded at medium, not collapsible */}
        <ResultPanel
          title="Output"
          collapsed={layout.collapsed.output}
          onToggleCollapse={() => togglePanel('output')}
          collapsible={false}
          isEmpty={!hasAnyResult && !isExecuting}
          emptyState={
            <PanelEmptyState message="Enter source data and click Run to see the mapping output." />
          }
          className="min-h-0 flex-1"
          testId="panel-output"
        >
          {outputContent()}
        </ResultPanel>

        <ResultPanel
          title="Diff"
          collapsed={layout.collapsed.diff}
          onToggleCollapse={() => togglePanel('diff')}
          isEmpty={!hasAnyResult && !isExecuting}
          emptyState={
            <PanelEmptyState message="Run a test and set expected output to see the diff." />
          }
          className="min-h-0 flex-1"
          testId="panel-diff"
        >
          {diffContent()}
        </ResultPanel>

        <ResultPanel
          title="Diagnostics"
          badge={
            diagnosticCount > 0 ? { count: diagnosticCount, variant: 'warning' } : undefined
          }
          collapsed={layout.collapsed.diagnostics}
          onToggleCollapse={() => togglePanel('diagnostics')}
          isEmpty={!hasAnyResult && !isExecuting}
          emptyState={<PanelEmptyState message="No diagnostics from the last execution." />}
          className="min-h-0 flex-1"
          testId="panel-diagnostics"
        >
          {diagnosticsContent()}
        </ResultPanel>

        <ResultPanel
          title="Trace"
          collapsed={layout.collapsed.trace}
          onToggleCollapse={() => togglePanel('trace')}
          isEmpty={!traceEnabled || (!hasAnyResult && !isExecuting)}
          emptyState={
            !traceEnabled ? (
              <PanelEmptyState message="Enable Trace in the top bar to see execution trace." />
            ) : (
              <PanelEmptyState message="Run a test with Trace enabled to see trace entries." />
            )
          }
          className="min-h-0 flex-1"
          testId="panel-trace"
        >
          {traceContent()}
        </ResultPanel>
      </div>
    );
  }

  function renderWideRightPanel() {
    const colFr = layout.columnSplit;
    const rowFr = layout.rowSplit;

    return (
      <div
        ref={gridRef}
        className="min-w-0 flex-1 overflow-hidden"
        style={{
          display: 'grid',
          // 3 columns: left panels | divider | right panels
          gridTemplateColumns: `${colFr}fr 4px ${1 - colFr}fr`,
          // 3 rows: top panels | divider | bottom panels
          gridTemplateRows: `${rowFr}fr 4px ${1 - rowFr}fr`,
        }}
        data-testid="right-panel"
        data-layout="wide"
      >
        {/* Row 1, Col 1: Output (top-left) */}
        <ResultPanel
          title="Output"
          collapsed={layout.collapsed.output}
          onToggleCollapse={() => togglePanel('output')}
          isEmpty={!hasAnyResult && !isExecuting}
          emptyState={
            <PanelEmptyState message="Enter source data and click Run to see the mapping output." />
          }
          className="overflow-hidden"
          style={{ gridColumn: '1 / 2', gridRow: '1 / 2' }}
          testId="panel-output"
        >
          {outputContent()}
        </ResultPanel>

        {/* Row 1, Col 2: Vertical divider (spans both rows via grid-row) */}
        <div
          style={{ gridColumn: '2 / 3', gridRow: '1 / 4' }}
          className="z-20 flex items-stretch"
          data-testid="divider-col"
        >
          <Divider
            axis="col"
            isDragging={colDrag.isDragging}
            onMouseDown={colDrag.handleMouseDown}
            testId="divider-col-handle"
          />
        </div>

        {/* Row 1, Col 3: Diff (top-right) */}
        <ResultPanel
          title="Diff"
          collapsed={layout.collapsed.diff}
          onToggleCollapse={() => togglePanel('diff')}
          isEmpty={!hasAnyResult && !isExecuting}
          emptyState={
            <PanelEmptyState message="Run a test and set expected output to see the diff." />
          }
          className="overflow-hidden"
          style={{ gridColumn: '3 / 4', gridRow: '1 / 2' }}
          testId="panel-diff"
        >
          {diffContent()}
        </ResultPanel>

        {/* Row 2, Col 1: Horizontal divider (spans both columns) */}
        <div
          style={{ gridColumn: '1 / 4', gridRow: '2 / 3' }}
          className="relative z-30 flex items-center"
          data-testid="divider-row"
        >
          <div
            className="flex h-3 w-full cursor-row-resize items-center"
            onMouseDown={rowDrag.handleMouseDown}
            data-testid="divider-row-hitarea"
          >
            <Divider
              axis="row"
              isDragging={rowDrag.isDragging}
              onMouseDown={rowDrag.handleMouseDown}
              testId="divider-row-handle"
            />
          </div>
        </div>

        {/* Row 3, Col 1: Diagnostics (bottom-left) */}
        <ResultPanel
          title="Diagnostics"
          badge={
            diagnosticCount > 0 ? { count: diagnosticCount, variant: 'warning' } : undefined
          }
          collapsed={layout.collapsed.diagnostics}
          onToggleCollapse={() => togglePanel('diagnostics')}
          isEmpty={!hasAnyResult && !isExecuting}
          emptyState={<PanelEmptyState message="No diagnostics from the last execution." />}
          className="overflow-hidden"
          style={{ gridColumn: '1 / 2', gridRow: '3 / 4' }}
          testId="panel-diagnostics"
        >
          {diagnosticsContent()}
        </ResultPanel>

        {/* Row 3, Col 3: Trace (bottom-right) */}
        <ResultPanel
          title="Trace"
          collapsed={layout.collapsed.trace}
          onToggleCollapse={() => togglePanel('trace')}
          isEmpty={!traceEnabled || (!hasAnyResult && !isExecuting)}
          emptyState={
            !traceEnabled ? (
              <PanelEmptyState message="Enable Trace in the top bar to see execution trace." />
            ) : (
              <PanelEmptyState message="Run a test with Trace enabled to see trace entries." />
            )
          }
          className="overflow-hidden"
          style={{ gridColumn: '3 / 4', gridRow: '3 / 4' }}
          testId="panel-trace"
        >
          {traceContent()}
        </ResultPanel>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-slate-950 text-sm text-slate-300"
      data-testid="test-lab-page"
    >
      {/* Top bar */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2"
        data-testid="test-lab-topbar"
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

        {/* Jump to rule — visible when a debug selection with targetPath is active */}
        {debugSelection.selection?.targetPath && (
          <>
            <button
              type="button"
              data-testid="jump-to-rule-button"
              onClick={() => {
                navigate(editorUrl, {
                  state: { selectedTargetPath: debugSelection.selection!.targetPath },
                });
              }}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-400 ring-1 ring-blue-500/40 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ArrowUpRight size={12} aria-hidden="true" />
              Jump to rule
            </button>
            <span className="h-4 w-px bg-slate-700" aria-hidden="true" />
          </>
        )}

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

        <button
          type="button"
          onClick={resetLayout}
          data-testid="reset-layout-button"
          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <RotateCcw size={12} aria-hidden="true" />
          Reset Layout
        </button>
      </div>

      {/* Execution summary bar — sticky, all breakpoints */}
      <ExecutionSummaryBar
        state={state}
        diffResult={diffResult}
        diffSummaryLabel={diffResult !== null && !diffResult.isEqual ? formatDiffSummary(diffResult.summary) : undefined}
        mappingVersion={editor.version}
      />

      {/* Two-panel body */}
      <div
        ref={bodyRef}
        className="flex min-h-0 flex-1"
        data-testid="body-container"
      >
        {/* Left panel — width driven by mainSplit ratio */}
        <div
          className="flex shrink-0 flex-col overflow-hidden bg-slate-950"
          style={{ width: `${layout.mainSplit * 100}%` }}
          data-testid="left-panel"
        >
          {/* Test case list panel — upper portion */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-slate-800"
            data-testid="test-case-list-area"
          >
            <TestCaseListPanel
              testCases={testCases}
              selectedId={selectedTestCaseId}
              runResults={runResults}
              onSelect={handleSelectTestCase}
              onSelectScratchpad={handleSelectScratchpad}
              onRename={renameTestCase}
              onDuplicate={(id) => { void duplicateTestCase(id); }}
              onDelete={(id) => {
                deleteTestCase(id);
                clearResult(id);
                deleteSnapshotsForTestCase(id);
                if (selectedTestCaseId === id) handleSelectScratchpad();
              }}
              onAddNew={handleAddNew}
              onSaveCurrentInput={handleSaveCurrentInput}
              sourceDataRaw={sourceDataRaw}
              onRunAll={() => { void handleRunAll(); }}
              onRerunFailed={() => { void handleRerunFailed(); }}
              onCancel={cancel}
              batchState={batchState}
              snapshotsByTestCase={snapshotsByTestCase}
              onDeleteSnapshot={deleteSnapshot}
            />
          </div>

          {/* Source data input — lower portion */}
          <div
            className="flex min-h-0 flex-1 overflow-hidden py-2"
            data-testid="source-input-area"
          >
            <SourceDataInput
              key={loadKey}
              onRawChange={setSourceDataRaw}
              initialValue={loadedSourceData}
            />
          </div>
        </div>

        {/* Main split divider — visible at wide and medium */}
        {layout.breakpoint !== 'narrow' && (
          <Divider
            axis="col"
            isDragging={mainDrag.isDragging}
            onMouseDown={mainDrag.handleMouseDown}
            testId="divider-main"
          />
        )}

        {/* Right panel — breakpoint-conditional */}
        {layout.breakpoint === 'narrow' && renderNarrowRightPanel()}
        {layout.breakpoint === 'medium' && renderMediumRightPanel()}
        {layout.breakpoint === 'wide' && renderWideRightPanel()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * TestLabPage — full-page test case management and execution.
 *
 * Wraps its content in an isolated `<PreviewProvider>` (separate from the
 * editor's provider — these are different routes, never co-mounted).
 * Loads mapping config and schemas independently via `useMappingEditor`.
 */
export function TestLabPage({ projectId, mappingId }: TestLabPageProps) {
  return (
    <PreviewProvider>
      <TestLabInner projectId={projectId} mappingId={mappingId} />
    </PreviewProvider>
  );
}
