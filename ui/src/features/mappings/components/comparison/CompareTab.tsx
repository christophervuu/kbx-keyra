import { useState } from 'react';



import { ComparisonDiffDisplay } from './ComparisonDiffDisplay';
import { ComparisonModeSelector } from './ComparisonModeSelector';
import { ComparisonSidePanel } from './ComparisonSidePanel';
import { useEnvironmentComparison } from '../../hooks/use-environment-comparison';
import { COMPARISON_MODES } from '../../types';

import type { ComparisonMode, ComparisonSnapshot, MappingConfig, SchemaDetail } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompareTabProps {
  mappingId: string;
  config: MappingConfig | null;
  sourceSchemaDetail: SchemaDetail | null;
  targetSchemaDetail: SchemaDetail | null;
  /** Raw JSON string from the shared source data input; null when empty */
  sourceDataRaw: string | null;
  /**
   * Currently selected test case ID, or null when scratchpad is active.
   * Used to link saved snapshots to the correct test case.
   */
  selectedTestCaseId: string | null;
  /**
   * Called when the user saves a comparison and no test case is loaded.
   * Parent should create a new test case and return its ID, or null on failure.
   */
  onSaveNewTestCase: (name: string, sourceData: string) => string | null;
  /**
   * Called to persist a comparison snapshot. Parent owns the snapshot store.
   */
  onSaveSnapshot: (snapshot: Omit<ComparisonSnapshot, 'id'>) => void;
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
// Idle side result factory
// ---------------------------------------------------------------------------

function makeIdleSideResult(label: string) {
  return {
    label,
    status: 'idle' as const,
    metadata: {
      executionContext: 'client' as const,
      configVersion: 0,
      engineVersion: 'client',
    },
    output: null,
    diagnostics: [],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compare tab for the Test Lab page.
 *
 * Composes:
 * - ComparisonModeSelector (top bar, with Run Comparison button)
 * - Two ComparisonSidePanel components (50/50 side-by-side)
 * - ComparisonDiffDisplay (below side panels)
 * - "Save Comparison" button (visible after a run completes)
 *
 * Wires useEnvironmentComparison hook. Source data is shared from the same
 * state as the other Test Lab tabs (Q5 resolution — single source-of-truth).
 *
 * AE-01, AE-03, AE-08, AE-09, AE-11 (FS-037 T-08, T-09)
 */
export function CompareTab({
  mappingId,
  config,
  sourceSchemaDetail,
  targetSchemaDetail,
  sourceDataRaw,
  selectedTestCaseId,
  onSaveNewTestCase,
  onSaveSnapshot,
}: CompareTabProps) {
  const { state, mode, setMode, runComparison, canRun, modeAvailability } =
    useEnvironmentComparison({
      mappingId,
      config,
      sourceSchemaDetail,
      targetSchemaDetail,
      sourceDataRaw,
    });

  // Save flow state
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [newTestCaseName, setNewTestCaseName] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Build modeAvailability record for ComparisonModeSelector
  const allModes: ComparisonMode[] = [
    'current-vs-saved',
    'current-vs-dev',
    'current-vs-preprod',
    'dev-vs-preprod',
    'preprod-vs-prod',
  ];
  const modeAvailabilityRecord = Object.fromEntries(
    allModes.map((m) => [m, modeAvailability(m)]),
  ) as Record<ComparisonMode, { available: boolean; reason?: string }>;

  // Derive side results — use state if available, otherwise idle placeholders
  const modeConfig = COMPARISON_MODES[mode];
  const leftResult = state?.left ?? makeIdleSideResult(modeConfig.left.label);
  const rightResult = state?.right ?? makeIdleSideResult(modeConfig.right.label);

  const isExecuting = state?.overallStatus === 'executing';
  const hasCompletedRun =
    state !== null &&
    (state.overallStatus === 'complete' || state.overallStatus === 'partial-error');

  // Tooltip for disabled run button
  function getRunDisabledReason(): string | undefined {
    if (isExecuting) return 'Comparison is running…';
    if (sourceDataRaw === null) return 'Enter source data to run a comparison';
    if (!modeAvailability(mode).available) return modeAvailability(mode).reason;
    return undefined;
  }

  const disabledReason = !canRun ? getRunDisabledReason() : undefined;

  // ---------------------------------------------------------------------------
  // Save comparison handlers
  // ---------------------------------------------------------------------------

  function buildSnapshotPayload(testCaseId: string): Omit<ComparisonSnapshot, 'id'> {
    return {
      testCaseId,
      mappingId,
      mode,
      leftResult: state!.left,
      rightResult: state!.right,
      diffEntries: state!.diffEntries ?? [],
      capturedAt: new Date().toISOString(),
    };
  }

  function handleSaveComparison() {
    if (!hasCompletedRun) return;
    setSaveSuccess(false);
    setSaveError(null);

    if (selectedTestCaseId !== null) {
      // Link to existing test case
      onSaveSnapshot(buildSnapshotPayload(selectedTestCaseId));
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); }, 2000);
    } else {
      // No test case loaded — show name form
      setIsSavingNew(true);
      setNewTestCaseName('');
    }
  }

  function handleSaveNewConfirm() {
    const trimmed = newTestCaseName.trim();
    if (trimmed === '' || sourceDataRaw === null) return;

    const newId = onSaveNewTestCase(trimmed, sourceDataRaw);
    if (newId === null) {
      setSaveError('Failed to create test case — storage may be full');
      setIsSavingNew(false);
      return;
    }

    onSaveSnapshot(buildSnapshotPayload(newId));
    setIsSavingNew(false);
    setNewTestCaseName('');
    setSaveSuccess(true);
    setTimeout(() => { setSaveSuccess(false); }, 2000);
  }

  function handleSaveNewCancel() {
    setIsSavingNew(false);
    setNewTestCaseName('');
    setSaveError(null);
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      data-testid="compare-tab"
    >
      {/* Top bar: mode selector + run button */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2">
        <ComparisonModeSelector
          selectedMode={mode}
          onModeChange={setMode}
          modeAvailability={modeAvailabilityRecord}
        />

        <span className="flex-1" aria-hidden="true" />

        {/* Save Comparison — visible after a run completes */}
        {hasCompletedRun && !isSavingNew && (
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span
                className="text-xs text-green-400"
                role="status"
                data-testid="save-comparison-success"
              >
                Saved!
              </span>
            )}
            {saveError !== null && (
              <span
                className="text-xs text-red-400"
                role="alert"
                data-testid="save-comparison-error"
              >
                {saveError}
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveComparison}
              data-testid="save-comparison-btn"
              className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-slate-600 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Save Comparison
            </button>
          </div>
        )}

        {/* Inline new test case name form */}
        {isSavingNew && (
          <div className="flex items-center gap-1.5" data-testid="save-new-tc-form">
            <input
              type="text"
              value={newTestCaseName}
              onChange={(e) => { setNewTestCaseName(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveNewConfirm();
                if (e.key === 'Escape') handleSaveNewCancel();
              }}
              placeholder="Test case name…"
              aria-label="New test case name"
              data-testid="save-new-tc-name-input"
              autoFocus
              className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleSaveNewConfirm}
              disabled={newTestCaseName.trim() === '' || sourceDataRaw === null}
              aria-disabled={newTestCaseName.trim() === '' || sourceDataRaw === null}
              data-testid="save-new-tc-confirm-btn"
              className={[
                'rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                newTestCaseName.trim() !== '' && sourceDataRaw !== null
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'cursor-not-allowed bg-slate-800 text-slate-600',
              ].join(' ')}
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleSaveNewCancel}
              aria-label="Cancel save"
              data-testid="save-new-tc-cancel-btn"
              className="rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              ✕
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => { void runComparison(); }}
          disabled={!canRun}
          aria-disabled={!canRun}
          title={disabledReason}
          data-testid="compare-run-btn"
          className={[
            'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            canRun
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'cursor-not-allowed bg-slate-800 text-slate-600',
          ].join(' ')}
        >
          {isExecuting ? <Spinner /> : null}
          Run Comparison
        </button>
      </div>

      {/* Main layout: side panels + diff */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid="compare-layout"
      >
        {/* Side-by-side panels */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left side */}
          <div className="min-w-0 flex-1 overflow-hidden border-r border-slate-800 bg-slate-950">
            <ComparisonSidePanel side="left" result={leftResult} />
          </div>

          {/* Right side */}
          <div className="min-w-0 flex-1 overflow-hidden bg-slate-950">
            <ComparisonSidePanel side="right" result={rightResult} />
          </div>
        </div>

        {/* Diff display — only shown when there's a result */}
        {state !== null && (
          <div className="shrink-0 border-t border-slate-800 bg-slate-900 p-3">
            <ComparisonDiffDisplay
              leftOutput={state.left.output}
              rightOutput={state.right.output}
              leftLabel={state.left.label}
              rightLabel={state.right.label}
              overallStatus={state.overallStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}
