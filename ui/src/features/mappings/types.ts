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
