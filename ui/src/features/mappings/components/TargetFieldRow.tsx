import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, XCircle } from 'lucide-react';
import { memo } from 'react';
import type { CSSProperties } from 'react';

import { truncateExpression } from '../lib/truncate-expression';

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

export type TargetFieldStatus = 'unmapped' | 'mapped' | 'warning' | 'error';

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
  /** Optional truncated DSL expression summary */
  expressionSummary?: string;
  /** Whether this row is currently selected */
  isSelected: boolean;
  /** Indentation depth (0 = root) */
  depth: number;
  /** Whether this node has children that can be expanded */
  isExpandable: boolean;
  /** Whether the node is currently expanded */
  isExpanded: boolean;
  /** Coverage text for object/array nodes, e.g. "3/5 mapped" */
  coverageText?: string;
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
  expressionSummary,
  isSelected,
  depth,
  isExpandable,
  isExpanded,
  coverageText,
  onClick,
  onToggleExpand,
}: TargetFieldRowProps) {
  const indentStyle = { paddingLeft: depth * INDENT_PX } as CSSProperties;
  const displaySummary = expressionSummary ? truncateExpression(expressionSummary) : undefined;
  const isTruncated =
    expressionSummary !== undefined && displaySummary !== expressionSummary;

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

      {/* Field name + required indicator */}
      <span className="min-w-0 shrink-0 max-w-[140px] truncate font-mono text-xs text-slate-200" title={fieldPath}>
        {fieldName}
        {required && (
          <span
            className="ml-0.5 text-red-400"
            aria-label="Required"
            data-testid="required-indicator"
          >
            *
          </span>
        )}
      </span>

      {/* Coverage text for object/array nodes */}
      {coverageText && (
        <span
          className="shrink-0 text-[10px] text-slate-500"
          data-testid="coverage-text"
        >
          {coverageText}
        </span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Expression summary */}
      {displaySummary && (
        <span
          className="min-w-0 max-w-[160px] truncate font-mono text-[10px] text-slate-500"
          title={isTruncated ? expressionSummary : undefined}
          data-testid="expression-summary"
        >
          {displaySummary}
        </span>
      )}

      {/* Type badge */}
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASSES[fieldType]}`}
        data-testid="type-badge"
      >
        {fieldType}
      </span>

      {/* Status icon */}
      <StatusIcon status={status} />
    </div>
  );
});
