// ---------------------------------------------------------------------------
// Mappings feature — shared types
// ---------------------------------------------------------------------------

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
