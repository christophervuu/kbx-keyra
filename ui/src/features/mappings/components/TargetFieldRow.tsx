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

function methodBadgeClasses(label?: string): string {
  const normalized = (label ?? '').toLowerCase();
  if (normalized.includes('direct')) return 'bg-emerald-900/50 text-emerald-300 border-emerald-700/60';
  if (normalized.includes('static')) return 'bg-indigo-900/50 text-indigo-300 border-indigo-700/60';
  if (normalized.includes('condition')) return 'bg-amber-900/50 text-amber-300 border-amber-700/60';
  if (normalized.includes('array') || normalized.includes('map')) return 'bg-cyan-900/50 text-cyan-300 border-cyan-700/60';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

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

function StatusDot({ status }: { status: TargetFieldStatus }) {
  const dotClass =
    status === 'mapped'
      ? 'bg-green-500'
      : status === 'warning'
        ? 'bg-amber-400'
        : status === 'error'
          ? 'bg-red-500'
          : status === 'ai'
            ? 'bg-violet-500'
            : status === 'intentionally-unmapped'
              ? 'bg-amber-500'
              : 'bg-slate-600';

  return <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} data-testid="status-dot" aria-hidden="true" />;
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
        'group flex cursor-pointer items-center gap-2 border-b border-slate-900 px-2 py-2 text-sm last:border-b-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
        'hover:bg-slate-900/70',
        isSelected ? 'bg-blue-950/35 ring-1 ring-inset ring-blue-700/60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Status + expand/collapse slot (leading column) */}
      <span className="relative flex w-14 shrink-0 items-center justify-center" data-testid="row-col-status">
        {isExpandable ? (
          <button
            type="button"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            data-testid={`expand-toggle-${fieldPath}`}
            className="absolute left-0.5 shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
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
        ) : null}
        <StatusDot status={status} />
      </span>

      {/* Target */}
      <div className="min-w-0 w-[34%] shrink-0" data-testid="row-col-target">
        <div className="flex min-w-0 items-center gap-1.5" style={indentStyle}>
          <span
            className={`inline-flex min-w-[2rem] shrink-0 justify-center rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASSES[fieldType]}`}
            data-testid="type-badge"
          >
            {TYPE_ABBREV[fieldType]}
          </span>
          <p className="truncate font-mono text-xs text-slate-200" title={fieldPath}>
            {fieldName}
            {required && (
              <span className="ml-0.5 text-red-400" aria-label="Required" data-testid="required-indicator">
                *
              </span>
            )}
          </p>
        </div>
        <p
          className="ml-[2.6rem] truncate text-[11px] text-slate-500"
          data-testid="sample-output-preview"
          title={sampleOutputPreview ?? '—'}
        >
          {sampleOutputPreview ?? '—'}
        </p>
      </div>

      {/* Source summary */}
      <span
        className="min-w-0 w-[24%] shrink-0 truncate text-[11px] text-slate-300"
        data-testid="source-summary"
        title={sourceSummary ?? '—'}
      >
        {sourceSummary ?? '—'}
      </span>

      {/* Mapping type */}
      <span className="flex w-[16%] min-w-[120px] shrink-0 justify-center" data-testid="mapping-type">
        <span
          className={`inline-flex max-w-full items-center truncate rounded border px-1.5 py-0.5 text-[10px] font-medium ${methodBadgeClasses(mappingTypeLabel)}`}
          title={mappingTypeLabel ?? 'Not configured'}
        >
          {mappingTypeLabel ?? 'Not configured'}
        </span>
      </span>

      {/* Notes preview */}
      <span
        className="min-w-0 flex-1 truncate text-[11px] italic text-slate-500"
        data-testid="notes-preview"
        title={notesPreview ?? '—'}
      >
        {notesPreview ?? '—'}
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

      {/* Status icon retained for accessibility/context */}
      <span className="sr-only" data-testid="status-icon-hidden">
        <StatusIcon status={status} />
      </span>
    </div>
  );
});
