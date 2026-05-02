import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  GripVertical,
  MinusCircle,
  Pencil,
  Trash2,
  XCircle,
} from 'lucide-react';
import { forwardRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';

import { DiagnosticDetail } from './DiagnosticDetail';
import { inferRuleType } from '../lib';
import type { RuleTypeLabel } from '../lib';

import type { Diagnostic } from '@/lib/engine';
import type { MappingRule } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Synthetic listeners type from @dnd-kit (avoid importing internal types) */
export type DragListeners = Record<string, (...args: unknown[]) => void> | undefined;

export interface RuleRowProps {
  /** 0-based index in the rules array */
  index: number;
  /** The rule to display */
  rule: MappingRule;
  /** Diagnostics for this specific rule */
  diagnostics: readonly Diagnostic[];
  /** Whether schemas are loaded (false = show gray neutral icon) */
  schemasLoaded: boolean;
  /** Whether this row is the currently active/selected rule for the expression builder */
  isActive?: boolean;
  /** Callback fired when the row body is clicked to activate/deactivate this rule */
  onActivate?: () => void;
  /** Whether the checkbox is selected */
  selected: boolean;
  /** Whether this row has keyboard focus (for aria-activedescendant pattern) */
  isFocused?: boolean;
  /** Callback when checkbox selection changes */
  onSelectionChange?: (index: number, selected: boolean) => void;
  /** Callback when the edit action is triggered */
  onEdit?: (index: number) => void;
  /** Callback when the delete action is triggered */
  onDelete?: (index: number) => void;
  /** Callback when the copy action is triggered */
  onCopy?: (index: number) => void;
  /** Callback to move this rule up (index - 1) */
  onMoveUp?: (index: number) => void;
  /** Callback to move this rule down (index + 1) */
  onMoveDown?: (index: number) => void;
  /** Whether this is the first rule (disables Move Up) */
  isFirst?: boolean;
  /** Whether this is the last rule (disables Move Down) */
  isLast?: boolean;
  /** DnD listeners for the drag handle (from useSortable) */
  dragListeners?: DragListeners;
  /** DnD attributes for the drag handle (from useSortable) */
  dragAttributes?: HTMLAttributes<HTMLElement>;
  /** Style for sortable transform/transition */
  sortableStyle?: CSSProperties;
  /** Whether this item is currently being dragged */
  isDragging?: boolean;
}

// ---------------------------------------------------------------------------
// Expression truncation
// ---------------------------------------------------------------------------

const EXPRESSION_MAX_LENGTH = 60;

function truncateExpression(expression: string): string {
  if (expression.length <= EXPRESSION_MAX_LENGTH) {
    return expression;
  }
  return expression.slice(0, EXPRESSION_MAX_LENGTH) + '\u2026';
}

// ---------------------------------------------------------------------------
// Type badge colors
// ---------------------------------------------------------------------------

const typeBadgeColors: Record<RuleTypeLabel, string> = {
  'Direct Copy': 'bg-blue-900/60 text-blue-300',
  'Static Value': 'bg-purple-900/60 text-purple-300',
  Conditional: 'bg-amber-900/60 text-amber-300',
  Lookup: 'bg-cyan-900/60 text-cyan-300',
  Array: 'bg-green-900/60 text-green-300',
  Transform: 'bg-slate-800 text-slate-300',
  'Not configured': 'bg-slate-800/50 text-slate-500',
};

// ---------------------------------------------------------------------------
// Validation icon
// ---------------------------------------------------------------------------

type ValidationStatus = 'valid' | 'warning' | 'error' | 'not-validated';

function getValidationStatus(diagnostics: readonly Diagnostic[], schemasLoaded: boolean): ValidationStatus {
  if (!schemasLoaded) {
    return 'not-validated';
  }
  if (diagnostics.length === 0) {
    return 'valid';
  }
  const hasError = diagnostics.some((d) => d.severity === 'error');
  if (hasError) {
    return 'error';
  }
  return 'warning';
}

function ValidationIcon({ status }: { status: ValidationStatus }) {
  switch (status) {
    case 'valid':
      return <CheckCircle2 size={14} className="text-green-400" aria-label="Valid" />;
    case 'warning':
      return <AlertTriangle size={14} className="text-amber-400" aria-label="Warning" />;
    case 'error':
      return <XCircle size={14} className="text-red-400" aria-label="Error" />;
    case 'not-validated':
      return <MinusCircle size={14} className="text-slate-600" aria-label="Not validated" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Individual rule row component displaying target path, expression,
 * type badge, validation icon, and expandable diagnostic detail.
 * Includes edit, delete, drag handle, and move up/down actions.
 * Supports aria-activedescendant pattern via `isFocused` prop.
 */
export const RuleRow = forwardRef<HTMLDivElement, RuleRowProps>(function RuleRow(
  {
    index,
    rule,
    diagnostics,
    schemasLoaded,
    selected,
    isFocused = false,
    isActive = false,
    onActivate,
    onSelectionChange,
    onEdit,
    onDelete,
    onCopy,
    onMoveUp,
    onMoveDown,
    isFirst = false,
    isLast = false,
    dragListeners,
    dragAttributes,
    sortableStyle,
    isDragging = false,
  },
  ref,
) {
  const [expanded, setExpanded] = useState(false);
  const ruleType = inferRuleType(rule.expression);
  const validationStatus = getValidationStatus(diagnostics, schemasLoaded);
  const diagnosticDetailId = `diagnostic-detail-${index}`;

  return (
    <div
      ref={ref}
      id={`rule-row-id-${index}`}
      data-testid={`rule-row-${index}`}
      role="listitem"
      className={[
        'border-b border-slate-800 last:border-b-0',
        isDragging ? 'opacity-50 shadow-lg' : '',
        isFocused ? 'ring-2 ring-inset ring-blue-500' : '',
        isActive ? 'border-l-2 border-l-emerald-500 bg-emerald-950/20' : '',
      ].join(' ')}
      style={sortableStyle}
      onClick={onActivate}
      data-active={isActive || undefined}
    >
      <div className="group flex items-center gap-2 px-3 py-2 hover:bg-slate-800/50">
        {/* Checkbox — stop propagation so row activation isn't triggered by checkbox click */}
        <span onClick={(e) => e.stopPropagation()} className="contents">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectionChange?.(index, e.target.checked)}
          className="h-3.5 w-3.5 shrink-0 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
          aria-label={`Select rule ${index + 1}`}
        />
        </span>

        {/* Drag handle */}
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none rounded p-0.5 text-slate-600 hover:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 active:cursor-grabbing"
          aria-label="Drag to reorder"
          data-testid={`drag-handle-${index}`}
          {...(dragListeners ?? {})}
          {...(dragAttributes ?? {})}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>

        {/* Row number */}
        <span className="w-6 shrink-0 text-right text-xs text-slate-600">{index + 1}</span>

        {/* Target path */}
        <span
          className="min-w-0 shrink-0 basis-44 truncate font-mono text-xs text-slate-200"
          title={rule.target}
        >
          {rule.target}
        </span>

        {/* Expression */}
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-slate-400"
          title={rule.expression || undefined}
        >
          {truncateExpression(rule.expression) || <em className="text-slate-600">empty</em>}
        </span>

        {/* Type badge */}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${typeBadgeColors[ruleType]}`}
          data-testid={`rule-type-badge-${index}`}
        >
          {ruleType}
        </span>

        {/* Move Up button */}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 group-hover:opacity-100 disabled:text-slate-700 disabled:hover:bg-transparent"
          onClick={() => onMoveUp?.(index)}
          disabled={isFirst}
          aria-label={`Move rule ${index + 1} up`}
          data-testid={`rule-move-up-${index}`}
        >
          <ChevronUp size={13} aria-hidden="true" />
        </button>

        {/* Move Down button */}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 group-hover:opacity-100 disabled:text-slate-700 disabled:hover:bg-transparent"
          onClick={() => onMoveDown?.(index)}
          disabled={isLast}
          aria-label={`Move rule ${index + 1} down`}
          data-testid={`rule-move-down-${index}`}
        >
          <ChevronDown size={13} aria-hidden="true" />
        </button>

        {/* Edit button */}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 group-hover:opacity-100"
          onClick={() => onEdit?.(index)}
          aria-label={`Edit rule ${index + 1}`}
          data-testid={`rule-edit-${index}`}
        >
          <Pencil size={13} aria-hidden="true" />
        </button>

        {/* Copy button */}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:bg-slate-700 hover:text-slate-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 group-hover:opacity-100"
          onClick={() => onCopy?.(index)}
          aria-label={`Copy rule ${index + 1}`}
          data-testid={`rule-copy-${index}`}
        >
          <ClipboardCopy size={13} aria-hidden="true" />
        </button>

        {/* Delete button */}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-slate-500 opacity-0 transition-opacity hover:bg-red-950 hover:text-red-400 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 group-hover:opacity-100"
          onClick={() => onDelete?.(index)}
          aria-label={`Delete rule ${index + 1}`}
          data-testid={`rule-delete-${index}`}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>

        {/* Validation icon (clickable to expand diagnostics) */}
        <button
          type="button"
          className="shrink-0 rounded p-0.5 hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          onClick={() => {
            if (diagnostics.length > 0) {
              setExpanded((prev) => !prev);
            }
          }}
          aria-expanded={expanded}
          aria-controls={diagnostics.length > 0 ? diagnosticDetailId : undefined}
          aria-label={`Validation status for rule ${index + 1}: ${validationStatus}`}
          data-testid={`validation-icon-${index}`}
        >
          <ValidationIcon status={validationStatus} />
        </button>
      </div>

      {/* Diagnostic detail expansion */}
      {expanded && <DiagnosticDetail id={diagnosticDetailId} diagnostics={diagnostics} />}
    </div>
  );
});
