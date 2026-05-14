/**
 * SourceFieldOptionRow — FS-052 T-01
 *
 * Shared option row renderer for all source-field dropdown/listbox pickers
 * in the Mapping Editor.
 *
 * Layout (4 zones, left to right):
 *   [TYPE BADGE]  [FIELD PATH]  [TEST DATA]  [SCOPE]
 *
 * - TYPE BADGE: compact colored pill using the per-type color scheme
 *   consistent with SourceSchemaPanel / TargetFieldRow / ScalarFieldBuilder.
 * - FIELD PATH: monospace path text, truncates on overflow.
 * - TEST DATA: smaller muted text showing the resolved value from loaded
 *   test data. Omitted entirely when `testValue` is undefined/null.
 * - SCOPE: right-aligned uppercase label (e.g. "item", "parent").
 *   Omitted entirely when `scope` is undefined.
 *
 * Also exports `SourceFieldChipBadge` — the type badge sub-component
 * used inside selected chip/pill elements in SourceFieldPicker and
 * SourceChipPicker.
 */

import { getTypeBadge } from '../lib/source-field-display';

// ---------------------------------------------------------------------------
// SourceFieldOptionRow
// ---------------------------------------------------------------------------

export interface SourceFieldOptionRowProps {
  /** Dot-path of the source field (e.g. "address.city") */
  readonly path: string;
  /** Schema type string (e.g. "string", "number", "array") */
  readonly type: string;
  /**
   * Resolved test data value for this field, already formatted as a
   * display string by `resolveFieldTestValue`. Omit or pass undefined
   * when no test data is loaded.
   */
  readonly testValue?: string;
  /**
   * Scope label shown right-aligned (e.g. "item", "parent", "root").
   * Omit when not applicable.
   */
  readonly scope?: string;
  /** Optional extra className applied to the root element */
  readonly className?: string;
}

/**
 * Renders a single source-field option row with the standardized
 * 4-zone layout: [badge] [path] [test data] [scope].
 *
 * Intended to be used as the content of `role="option"` elements
 * inside custom listbox dropdowns.
 */
export function SourceFieldOptionRow({
  path,
  type,
  testValue,
  scope,
  className,
}: SourceFieldOptionRowProps) {
  const badge = getTypeBadge(type);

  return (
    <span
      className={[
        'flex items-center gap-2 min-w-0',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Zone 1: Type badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
        aria-label={`type: ${type}`}
      >
        {badge.code}
      </span>

      {/* Zone 2: Field path */}
      <span className="text-sm font-mono text-slate-200 truncate min-w-0">
        {path}
      </span>

      {/* Zone 3: Test data (only when present) */}
      {testValue !== undefined && testValue !== null && (
        <span
          className="text-xs text-slate-500 truncate max-w-[140px] shrink-0"
          aria-label={`test value: ${testValue}`}
        >
          {testValue}
        </span>
      )}

      {/* Zone 4: Scope (only when present, right-aligned) */}
      {scope !== undefined && (
        <span className="ml-auto text-[10px] font-medium text-slate-500 uppercase shrink-0">
          {scope}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SourceFieldChipBadge
// ---------------------------------------------------------------------------

export interface SourceFieldChipBadgeProps {
  /** Schema type string (e.g. "string", "number") */
  readonly type: string;
}

/**
 * Compact type badge for use inside selected chip/pill elements.
 *
 * Renders the same badge style as the type badge zone in
 * `SourceFieldOptionRow`, so chips visually match their dropdown options.
 */
export function SourceFieldChipBadge({ type }: SourceFieldChipBadgeProps) {
  const badge = getTypeBadge(type);
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
      aria-label={`type: ${type}`}
    >
      {badge.code}
    </span>
  );
}
