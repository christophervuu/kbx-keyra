/**
 * MergeBranchEditor.tsx — FS-043 T-06
 *
 * Single branch editor for Merge Array Branches mode.
 *
 * Renders:
 *   - Collapsed summary: "Branch N: orders[] → unconfigured" or "Branch N: orders[] → ready"
 *   - Expanded: source array picker (same pattern as MapCollectionEditor)
 *     + item template placeholder (T-07 will replace with real editor)
 *
 * Each branch owns its own MergeBranch state with sourceArrayPath and itemTemplate.
 */

import { ChevronDown, ChevronRight, Database, Minus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ItemTemplateEditor } from './ItemTemplateEditor';
import type { ItemFieldMapping } from '../lib/array-builder-state';
import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import type { MergeBranch } from '../lib/array-builder-state';
import type { ArrayValidationState } from '../lib/array-validation';
import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergeBranchEditorProps {
  readonly branch: MergeBranch;
  readonly branchIndex: number;
  readonly totalBranches: number;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly targetArrayNode: SchemaTreeNode | null;
  readonly validationState?: ArrayValidationState | null;
  readonly nestingDepth?: number;
  readonly onBranchChange: (index: number, branch: MergeBranch) => void;
  readonly onRemove: (index: number) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getArrayPaths(schema: ParsedSchema | null): string[] {
  if (!schema) return [];
  return flattenSchemaPaths(schema)
    .filter((entry) => entry.type === 'array')
    .map((entry) => entry.path);
}

function branchSummary(branch: MergeBranch): string {
  if (!branch.sourceArrayPath) return 'No source selected';
  const name = branch.sourceArrayPath.split('.').pop() ?? branch.sourceArrayPath;
  return `${name}[]`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MergeBranchEditor({
  branch,
  branchIndex,
  totalBranches,
  parsedSourceSchema,
  targetArrayNode,
  validationState = null,
  nestingDepth = 0,
  onBranchChange,
  onRemove,
  className = '',
}: MergeBranchEditorProps) {
  const [isExpanded, setIsExpanded] = useState(!branch.sourceArrayPath);

  const arrayPaths = useMemo(() => getArrayPaths(parsedSourceSchema), [parsedSourceSchema]);
  const isRemoveDisabled = totalBranches <= 2;
  const summary = branchSummary(branch);
  const isConfigured = branch.sourceArrayPath.trim().length > 0;

  function handleSelect(path: string) {
    onBranchChange(branchIndex, { ...branch, sourceArrayPath: path });
    setIsExpanded(false);
  }

  function handleFieldMappingChange(fieldPath: string, mapping: ItemFieldMapping) {
    const existingFields = branch.itemTemplate.fields;
    const idx = existingFields.findIndex((field) => field.targetFieldPath === fieldPath);
    const updatedFields =
      idx >= 0
        ? existingFields.map((field, i) => (i === idx ? mapping : field))
        : [...existingFields, mapping];

    onBranchChange(branchIndex, {
      ...branch,
      itemTemplate: {
        ...branch.itemTemplate,
        fields: updatedFields,
      },
    });
  }

  return (
    <div
      data-testid={`merge-branch-editor-${branchIndex}`}
      className={[
        'rounded-lg border bg-slate-800/40 transition-colors',
        isExpanded ? 'border-slate-600' : 'border-slate-700',
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* Branch header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Expand/collapse toggle */}
        <button
          type="button"
          data-testid={`branch-toggle-${branchIndex}`}
          aria-expanded={isExpanded}
          aria-controls={`branch-body-${branchIndex}`}
          onClick={() => { setIsExpanded((prev) => !prev); }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
        >
          {isExpanded ? (
            <ChevronDown size={12} aria-hidden="true" className="shrink-0 text-slate-400" />
          ) : (
            <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-slate-400" />
          )}

          {/* Branch label */}
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Branch {branchIndex + 1}
          </span>

          {/* Summary */}
          {!isExpanded && (
            <span
              data-testid={`branch-summary-${branchIndex}`}
              className={[
                'min-w-0 flex-1 truncate font-mono text-[11px]',
                isConfigured ? 'text-blue-300' : 'text-slate-500',
              ].join(' ')}
            >
              {summary}
            </span>
          )}

          {/* Configured badge */}
          {!isExpanded && isConfigured && (
            <span className="shrink-0 rounded bg-blue-900/50 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
              ready
            </span>
          )}
        </button>

        {/* Remove button */}
        <button
          type="button"
          disabled={isRemoveDisabled}
          aria-label={`Remove branch ${branchIndex + 1}`}
          data-testid={`branch-remove-${branchIndex}`}
          onClick={() => { onRemove(branchIndex); }}
          className="shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-red-900/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
        >
          <Minus size={12} aria-hidden="true" />
        </button>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div
          id={`branch-body-${branchIndex}`}
          className="space-y-3 border-t border-slate-700 px-3 pb-3 pt-3"
        >
          {/* Source array picker */}
          <div className="space-y-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Source array
            </span>

            {/* Current selection summary */}
            {isConfigured && (
              <div className="flex items-center gap-2 rounded border border-blue-700/50 bg-blue-950/30 px-2.5 py-1.5">
                <Database size={11} aria-hidden="true" className="shrink-0 text-blue-400" />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs text-blue-200"
                  title={branch.sourceArrayPath}
                >
                  {branch.sourceArrayPath}
                </span>
                <button
                  type="button"
                  onClick={() => { handleSelect(''); setIsExpanded(true); }}
                  className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
                >
                  Change
                </button>
              </div>
            )}

            {/* Picker list */}
            <div
              role="listbox"
              aria-label={`Source array for branch ${branchIndex + 1}`}
              data-testid={`branch-source-listbox-${branchIndex}`}
              className="max-h-40 overflow-y-auto rounded border border-slate-700 bg-slate-800/60 p-1"
            >
              {arrayPaths.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-slate-500">
                  {parsedSourceSchema
                    ? 'No array fields found in source schema.'
                    : 'Load a source schema to see available arrays.'}
                </p>
              ) : (
                arrayPaths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    role="option"
                    aria-selected={path === branch.sourceArrayPath}
                    data-testid={`branch-source-option-${branchIndex}-${path}`}
                    onClick={() => { handleSelect(path); }}
                    className={[
                      'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
                      path === branch.sourceArrayPath
                        ? 'bg-blue-950/50 text-blue-300 ring-1 ring-inset ring-blue-700/60'
                        : 'text-slate-300 hover:bg-slate-700/60 hover:text-slate-100',
                    ].join(' ')}
                  >
                    <Database
                      size={11}
                      aria-hidden="true"
                      className={path === branch.sourceArrayPath ? 'text-blue-400' : 'text-slate-500'}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
                    {path === branch.sourceArrayPath && (
                      <span className="shrink-0 text-[10px] font-medium text-blue-400">Selected</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Branch item template */}
          <div className="space-y-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Branch item mapping
            </span>
            <ItemTemplateEditor
              itemTemplate={branch.itemTemplate}
              targetArrayNode={targetArrayNode}
              parsedSourceSchema={parsedSourceSchema}
              sourceArrayPath={branch.sourceArrayPath}
              nestingDepth={nestingDepth}
              validationState={validationState}
              onFieldMappingChange={handleFieldMappingChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
