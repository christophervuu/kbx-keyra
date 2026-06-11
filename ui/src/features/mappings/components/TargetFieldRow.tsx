import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, Sparkles, XCircle } from 'lucide-react';
import { memo } from 'react';
import type { CSSProperties } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TargetFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'integer';

export type TargetFieldStatus =
  | 'unmapped'
  | 'mapped'
  | 'warning'
  | 'error'
  | 'ai'
  | 'intentionally-unmapped';

export interface TargetFieldRowProps {
  /** Display name of the field */
  fieldName: string;
  /** Full dot-path of the field */
  fieldPath: string;
  /** JSON Schema type of the field */
  fieldType: TargetFieldType;
  /** Whether the field is required in the schema */
  required: boolean;
  /** Current mapping status */
  status: TargetFieldStatus;
  /** Whether this row is currently selected */
  isSelected: boolean;
  /** Indentation depth (0 = root) */
  depth: number;
  /** Whether this node has children that can be expanded */
  isExpandable: boolean;
  /** Whether the node is currently expanded */
  isExpanded: boolean;
  /** Coverage for object/array nodes */
  coverage?: { mapped: number; total: number };
  /** Human-readable source summary (e.g. source path or static marker) */
  sourceSummary?: string;
  /** Display mapping method label */
  mappingTypeLabel?: string;
  /** Short notes preview for this row */
  notesPreview?: string;
  /** Muted sample output preview text */
  sampleOutputPreview?: string;
  /** Fired when the row body is clicked */
  onClick: () => void;
  /** Fired when the expand/collapse chevron is clicked */
  onToggleExpand?: () => void;
}

// ---------------------------------------------------------------------------
// Type badge colors
// ---------------------------------------------------------------------------

const TYPE_BADGE_CLASSES: Record<TargetFieldType, string> = {
  string: 'bg-blue-900/60 text-blue-300',
  number: 'bg-green-900/60 text-green-300',
  integer: 'bg-green-900/60 text-green-300',
  boolean: 'bg-purple-900/60 text-purple-300',
  object: 'bg-slate-700/80 text-slate-300',
  array: 'bg-amber-900/60 text-amber-300',
  null: 'bg-slate-800/60 text-slate-500',
};

const TYPE_ABBREV: Record<TargetFieldType, string> = {
  string: 'str',
  number: 'num',
  integer: 'int',
  boolean: 'boo',
  object: 'obj',
  array: 'arr',
  null: 'nul',
};

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: TargetFieldStatus }) {
  switch (status) {
    case 'mapped':
      return (
        <CheckCircle2
          size={14}
          className="shrink-0 text-green-400"
          aria-label="Mapped"
          data-testid="status-icon-mapped"
        />
      );
    case 'warning':
      return (
        <AlertTriangle
          size={14}
          className="shrink-0 text-amber-400"
          aria-label="Warning"
          data-testid="status-icon-warning"
        />
      );
    case 'error':
      return (
        <XCircle
          size={14}
          className="shrink-0 text-red-400"
          aria-label="Error"
          data-testid="status-icon-error"
        />
      );
    case 'unmapped':
    default:
      return (
        <Circle
          size={14}
          className="shrink-0 text-slate-600"
          aria-label="Unmapped"
          data-testid="status-icon-unmapped"
        />
      );
    case 'ai':
      return (
        <Sparkles
          size={14}
          className="shrink-0 text-violet-400"
          aria-label="AI suggestion"
          data-testid="status-icon-ai"
        />
      );
    case 'intentionally-unmapped':
      return (
        <Circle
          size={14}
          className="shrink-0 text-amber-500"
          aria-label="Intentionally unmapped"
          data-testid="status-icon-intentionally-unmapped"
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const INDENT_PX = 16;

/**
 * TargetFieldRow — atomic visual unit of the Target Worklist.
 *
 * Renders a single target schema field with: indentation, expand chevron,
 * field name, required indicator, type badge, status icon, expression
 * summary, and optional coverage text.
 *
 * Wrapped in React.memo — it will be rendered once per target field so
 * unnecessary re-renders from sibling changes must be avoided.
 */
export const TargetFieldRow = memo(function TargetFieldRow({
  fieldName,
  fieldPath,
  fieldType,
  required,
  status,
  isSelected,
  depth,
  isExpandable,
  isExpanded,
  coverage,
  sourceSummary,
  mappingTypeLabel,
  notesPreview,
  sampleOutputPreview,
  onClick,
  onToggleExpand,
}: TargetFieldRowProps) {
  const indentStyle = { paddingLeft: depth * INDENT_PX } as CSSProperties;
  const coverageRatio = coverage && coverage.total > 0
    ? Math.min(1, Math.max(0, coverage.mapped / coverage.total))
    : 0;

  return (
    <div
      role="row"
      aria-selected={isSelected}
      data-testid={`target-field-row-${fieldPath}`}
      tabIndex={0}
      className={[
        'group flex cursor-pointer items-center gap-1.5 border-b border-slate-800/60 px-2 py-1.5 text-sm last:border-b-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
        'hover:bg-slate-800/40',
        isSelected ? 'bg-slate-800/70 ring-1 ring-inset ring-blue-600/50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={indentStyle}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Expand/collapse chevron — only for expandable nodes */}
      {isExpandable ? (
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          data-testid={`expand-toggle-${fieldPath}`}
          className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
        >
          {isExpanded ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
        </button>
      ) : (
        /* Spacer to keep alignment when no chevron */
        <span className="w-[18px] shrink-0" aria-hidden="true" />
      )}

      {/* Target */}
      <span
        className="min-w-0 shrink-0 max-w-[180px] truncate font-mono text-xs text-slate-200"
        title={fieldPath}
      >
        {fieldName}
        {required && (
          <span className="ml-0.5 text-red-400" aria-label="Required" data-testid="required-indicator">
            *
          </span>
        )}
      </span>

      {/* Source summary */}
      <span
        className="hidden min-w-0 flex-1 truncate text-[11px] text-slate-400 xl:block"
        data-testid="source-summary"
        title={sourceSummary ?? '—'}
      >
        {sourceSummary ?? '—'}
      </span>

      {/* Mapping type */}
      <span
        className="hidden w-24 shrink-0 truncate text-[11px] text-slate-400 lg:block"
        data-testid="mapping-type"
        title={mappingTypeLabel ?? 'Not configured'}
      >
        {mappingTypeLabel ?? 'Not configured'}
      </span>

      {/* Notes preview */}
      <span
        className="hidden min-w-0 w-28 shrink-0 truncate text-[11px] text-slate-500 2xl:block"
        data-testid="notes-preview"
        title={notesPreview ?? '—'}
      >
        {notesPreview ?? '—'}
      </span>

      {/* Muted sample output */}
      <span
        className="hidden min-w-0 w-28 shrink-0 truncate text-[11px] italic text-slate-500 xl:block"
        data-testid="sample-output-preview"
        title={sampleOutputPreview ?? 'No sample output'}
      >
        {sampleOutputPreview ?? 'No sample output'}
      </span>

      {/* Coverage bar for object/array rows */}
      {coverage && (
        <div className="flex min-w-[92px] max-w-[120px] flex-col gap-1" data-testid="coverage-progress">
          <div className="h-1.5 w-full overflow-hidden rounded bg-slate-800" aria-hidden="true">
            <div
              className="h-full bg-emerald-500/80"
              style={{ width: `${coverageRatio * 100}%` }}
              data-testid="coverage-progress-fill"
            />
          </div>
          <span className="text-right text-[10px] text-slate-400" data-testid="coverage-text">
            {coverage.mapped}/{coverage.total}
          </span>
        </div>
      )}

      {/* Type badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASSES[fieldType]}`}
        data-testid="type-badge"
      >
        {TYPE_ABBREV[fieldType]}
      </span>

      {/* Status icon */}
      <StatusIcon status={status} />
    </div>
  );
});
