/**
 * ObjectSummaryPanel — right panel content when an object node is selected.
 *
 * Displays:
 *   - Header: object path, "object" type badge, coverage indicator
 *   - Child status list: each direct child with name, type badge, status icon
 *   - Section actions: Auto-map (disabled), Map required first, Validate section
 */

import { AlertTriangle, CheckCircle2, Circle, Sparkles, XCircle } from 'lucide-react';

import type { TargetFieldStatus, TargetFieldType } from './TargetFieldRow';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChildFieldInfo {
  /** Full dot-path of the child field */
  path: string;
  /** Display name */
  fieldName: string;
  /** JSON Schema type */
  fieldType: TargetFieldType;
  /** Current mapping status */
  status: TargetFieldStatus;
  /** Whether the field is required */
  required: boolean;
}

export interface ObjectSummaryPanelProps {
  /** Full dot-path of the selected object node */
  objectPath: string;
  /** Direct children of this object node */
  childFields: ChildFieldInfo[];
  /** Coverage data for this object node (leaf-field counts) */
  coverage: { mapped: number; total: number };
  /** Fired when "Auto-map section" is clicked (currently disabled — placeholder) */
  onAutoMap?: (objectPath: string) => void;
  /** Fired when "Map required fields first" is clicked */
  onFilterRequired: (objectPath: string) => void;
  /** Fired when "Validate section" is clicked */
  onValidateSection: (objectPath: string) => void;
  /** Fired when a child field row is clicked — navigates to that child's builder */
  onNavigateToChild?: (childPath: string) => void;
  /** Optional className */
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
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

const AUTO_MAP_TOOLTIP = 'AI-powered auto-mapping \u2014 available in a future release';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: TargetFieldStatus }) {
  switch (status) {
    case 'mapped':
      return <CheckCircle2 size={13} className="shrink-0 text-green-400" aria-label="Mapped" />;
    case 'warning':
      return <AlertTriangle size={13} className="shrink-0 text-amber-400" aria-label="Warning" />;
    case 'error':
      return <XCircle size={13} className="shrink-0 text-red-400" aria-label="Error" />;
    default:
      return <Circle size={13} className="shrink-0 text-slate-600" aria-label="Unmapped" />;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ObjectSummaryPanel — purely presentational; receives data and emits events.
 */
export function ObjectSummaryPanel({
  objectPath,
  childFields,
  coverage,
  onFilterRequired,
  onValidateSection,
  onNavigateToChild,
  className = '',
}: ObjectSummaryPanelProps) {
  const coveragePercent =
    coverage.total > 0 ? Math.round((coverage.mapped / coverage.total) * 100) : 0;

  return (
    <div
      data-testid="object-summary-panel"
      className={`flex flex-col overflow-y-auto ${className}`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate font-mono text-sm text-slate-100"
            title={objectPath}
            data-testid="object-path"
          >
            {objectPath}
          </span>
          <span className="shrink-0 rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
            object
          </span>
        </div>

        {/* Coverage indicator */}
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs text-slate-400" data-testid="coverage-indicator">
            {coverage.mapped}/{coverage.total} mapped
          </span>
          {/* Coverage bar */}
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${coveragePercent}%` }}
              aria-hidden="true"
            />
          </div>
          <span className="text-xs text-slate-500">{coveragePercent}%</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Child status list                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Fields ({childFields.length})
          </span>
        </div>

        {childFields.length === 0 ? (
          <p
            className="px-4 py-3 text-xs text-slate-500"
            data-testid="child-list-empty"
          >
            No child fields
          </p>
        ) : (
          <ul role="list" data-testid="child-list" className="divide-y divide-slate-800/60">
            {childFields.map((child) => (
              <li key={child.path}>
                <button
                  type="button"
                  data-testid={`child-row-${child.path}`}
                  onClick={() => onNavigateToChild?.(child.path)}
                  className={[
                    'flex w-full items-center gap-2 px-4 py-2 text-left transition-colors',
                    'hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                    child.status === 'error' ? 'bg-red-950/10' : '',
                    child.status === 'warning' ? 'bg-amber-950/10' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <StatusIcon status={child.status} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">
                    {child.fieldName}
                    {child.required && (
                      <span className="ml-0.5 text-red-400" aria-label="Required">
                        *
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASSES[child.fieldType]}`}
                  >
                    {child.fieldType}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section actions                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="shrink-0 border-t border-slate-700 px-4 py-3">
        <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Section Actions
        </span>
        <div className="flex flex-col gap-2">
          {/* Auto-map — disabled placeholder */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            title={AUTO_MAP_TOOLTIP}
            data-testid="automap-btn"
            className="flex cursor-not-allowed items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-600 opacity-50"
          >
            <Sparkles size={12} aria-hidden="true" />
            Auto-map section
          </button>

          {/* Map required fields first */}
          <button
            type="button"
            data-testid="filter-required-btn"
            onClick={() => onFilterRequired(objectPath)}
            className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            Map required fields first
          </button>

          {/* Validate section */}
          <button
            type="button"
            data-testid="validate-section-btn"
            onClick={() => onValidateSection(objectPath)}
            className="flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-blue-500/50 hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            Validate section
          </button>
        </div>
      </div>
    </div>
  );
}
