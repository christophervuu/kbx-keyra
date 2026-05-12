// ---------------------------------------------------------------------------
// Mappings feature — shared types
// ---------------------------------------------------------------------------

import type { AutoMapReviewSummary, ComparisonMode, Diagnostic, Environment, ISODateString } from '@/lib/types';

// ---------------------------------------------------------------------------
// Draft rules (FS-039)
// ---------------------------------------------------------------------------

/**
 * The change type for a single field in the unsaved changes summary.
 *
 * - 'modified' — field has a saved rule that has been changed in the draft
 * - 'added'    — field has a draft rule but no saved rule
 * - 'removed'  — field has a saved rule but the draft expression is empty (delete on save)
 */
export type UnsavedChangeType = 'modified' | 'added' | 'removed';

/**
 * A single entry in the unsaved changes summary.
 * Used by the "View unsaved changes" overlay (T-10).
 */
export interface UnsavedChangeSummary {
  /** The target field path. */
  readonly targetPath: string;
  /** The change type. */
  readonly changeType: UnsavedChangeType;
  /** The saved expression (null if this is a new addition). */
  readonly savedExpression: string | null;
  /** The draft expression (empty string means "delete on save"). */
  readonly draftExpression: string;
}

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
 *
 * - 'target'  — Target Worklist (default)
 * - 'rules'   — Rule List (flat rule table)
 * - 'automap' — Auto-Map Review Workspace (entered via trigger only, not via toggle)
 */
export type EditorView = 'target' | 'rules' | 'automap';

// ---------------------------------------------------------------------------
// Auto-Map workspace persistence types (FS-048 T-01)
// ---------------------------------------------------------------------------

/**
 * Lifecycle state for persisted Auto-Map workspace suggestions.
 */
export type SuggestionLifecycleStatus = 'suggested' | 'accepted' | 'edited' | 'dismissed' | 'stale';

/**
 * Persisted shape for a single suggestion in Auto-Map workspace storage.
 */
export interface PersistedSuggestionItem {
  readonly targetPath: string;
  readonly suggestedExpression: string;
  readonly explanation: string;
  readonly confidence: number | 'high' | 'medium' | 'low';
  readonly validation?: {
    readonly valid: boolean;
    readonly diagnostics: readonly Diagnostic[];
  };
  readonly status: SuggestionLifecycleStatus;
  readonly isNew: boolean;
  readonly existingExpressionAtGeneration: string | null;
}

/**
 * Persisted shape for all suggestions in a target section.
 */
export interface PersistedSectionSuggestions {
  readonly sectionPath: string;
  readonly generatedAt: ISODateString;
  readonly items: readonly PersistedSuggestionItem[];
  readonly generationContext: {
    readonly sourceContextHash?: string;
  };
}

/**
 * Lightweight listing shape for persisted Auto-Map sections.
 */
export interface PersistedSectionInfo {
  readonly sectionPath: string;
  readonly suggestionCount: number;
  readonly generatedAt: ISODateString;
}

/**
 * Workspace summary extends FS-046 review summary with stale count and generation metadata.
 */
export interface AutoMapWorkspaceSummary extends AutoMapReviewSummary {
  readonly stale: number;
  readonly generatedAt: ISODateString | null;
  readonly lastRefreshedAt: ISODateString | null;
}

/**
 * A single suggestion item as presented in the Auto-Map workspace.
 * Extends the persisted shape with runtime-only display helpers.
 * Defined here (not in the hook) to avoid circular imports with lib utilities.
 */
export interface SuggestionWorkspaceItem {
  readonly targetPath: string;
  readonly suggestedExpression: string;
  readonly explanation: string;
  readonly confidence: number | 'high' | 'medium' | 'low';
  readonly validation?: {
    readonly valid: boolean;
    readonly diagnostics: readonly { severity: string; code: string; message: string }[];
  };
  readonly status: SuggestionLifecycleStatus;
  readonly isNew: boolean;
  readonly existingExpressionAtGeneration: string | null;
}

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
