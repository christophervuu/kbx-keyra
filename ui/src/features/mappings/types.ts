// ---------------------------------------------------------------------------
// Mappings feature — shared types
// ---------------------------------------------------------------------------

import type { ComparisonMode, Environment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Linked debug selection (FS-036)
// ---------------------------------------------------------------------------

/**
 * Identifies which panel in the Test Lab initiated a linked selection.
 */
export type DebugSelectionSource = 'diagnostics' | 'trace' | 'output' | 'diff';

/**
 * Represents a single linked selection across the Test Lab panels.
 *
 * `targetPath` is the primary linking dimension shared by Diagnostic,
 * TraceEntry, DiffEntry, and the output JSON tree.
 *
 * `ruleIndex` is the secondary dimension available when the selection
 * originates from a panel that carries rule index information (diagnostics,
 * trace). It is `undefined` when the source panel (e.g. diff) does not
 * provide a rule index.
 */
export interface DebugSelection {
  /** The target path linking across panels (dot-separated, e.g. "Order.Status"). */
  readonly targetPath: string;
  /** The rule index, if available from the source panel. */
  readonly ruleIndex: number | undefined;
  /** Which panel initiated the selection. */
  readonly source: DebugSelectionSource;
}

/**
 * Plain-language explanation for a common diagnostic failure pattern.
 * Produced by the failure-explainer module (FS-036 T-08).
 */
export interface FailureExplanation {
  /** Short plain-language description of the failure. */
  readonly summary: string;
  /** Optional actionable suggestion for fixing the issue. */
  readonly suggestion?: string;
}

/**
 * Filter modes for the Target Worklist.
 * Multiple filters can be active simultaneously.
 */
export type TargetFilter = 'unmapped' | 'warnings' | 'required' | 'arrays';

/**
 * Sort/grouping modes for the Target Worklist.
 */
export type TargetSort = 'schema' | 'unmapped-first' | 'required-first';

/**
 * View mode for the center column of the Mapping Editor.
 */
export type EditorView = 'target' | 'rules';

/**
 * Severity level for a preview diagnostic entry.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A single diagnostic entry returned from a preview execution run.
 */
export interface PreviewDiagnostic {
  /** Severity level of the diagnostic. */
  severity: DiagnosticSeverity;
  /** Short error/warning code (e.g. "E001"). */
  code: string;
  /** Human-readable message describing the issue. */
  message: string;
  /** Display name of the affected rule. */
  ruleName: string;
  /** Zero-based index of the affected rule (for navigation). */
  ruleIndex: number;
}

export interface ComparisonModeSideConfig {
  readonly label: string;
  readonly context: 'client' | 'server';
  readonly environment?: Environment;
}

export interface ComparisonModeConfig {
  readonly left: ComparisonModeSideConfig;
  readonly right: ComparisonModeSideConfig;
}

/**
 * Canonical comparison mode definitions:
 * - Current = working config (includes unsaved changes)
 * - Saved = latest persisted mapping version
 * - DEV/QA/PROD = currently deployed snapshot in that environment
 */
export const COMPARISON_MODES: Readonly<Record<ComparisonMode, ComparisonModeConfig>> = {
  'current-vs-saved': {
    left: { label: 'Current', context: 'client' },
    right: { label: 'Saved', context: 'client' },
  },
  'current-vs-dev': {
    left: { label: 'Current', context: 'client' },
    right: { label: 'DEV', context: 'server', environment: 'DEV' },
  },
  'current-vs-qa': {
    left: { label: 'Current', context: 'client' },
    right: { label: 'QA', context: 'server', environment: 'QA' },
  },
  'dev-vs-qa': {
    left: { label: 'DEV', context: 'server', environment: 'DEV' },
    right: { label: 'QA', context: 'server', environment: 'QA' },
  },
  'qa-vs-prod': {
    left: { label: 'QA', context: 'server', environment: 'QA' },
    right: { label: 'PROD', context: 'server', environment: 'PROD' },
  },
};
