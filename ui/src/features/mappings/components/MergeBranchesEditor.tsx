/**
 * MergeBranchesEditor.tsx — FS-043 T-06
 *
 * Branch list manager for Merge Array Branches mode.
 *
 * Features:
 *   - Vertical list of MergeBranchEditor instances (min 2, max 10)
 *   - [+ Add Branch] button (disabled at 10 branches)
 *   - Per-branch remove button (disabled at 2 branches — enforced in MergeBranchEditor)
 *   - Cap message shown when 10 branches are reached
 *   - Generates merge(map(...), map(...), ...) via the expression generator
 */

import { Plus } from 'lucide-react';
import { useCallback } from 'react';

import { MergeBranchEditor } from './MergeBranchEditor';
import { createEmptyMergeBranch } from '../lib/array-builder-state';
import type { MergeBranch, MergeBranchesCollectionState } from '../lib/array-builder-state';
import type { ArrayValidationState } from '../lib/array-validation';
import type { ParsedSchema } from '@/lib/types/domain';
import type { SchemaTreeNode } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BRANCHES = 10;
const MIN_BRANCHES = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MergeBranchesEditorProps {
  readonly collectionState: MergeBranchesCollectionState;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly targetArrayNode: SchemaTreeNode | null;
  readonly validationState?: ArrayValidationState | null;
  readonly nestingDepth?: number;
  readonly onCollectionStateChange: (state: MergeBranchesCollectionState) => void;
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MergeBranchesEditor({
  collectionState,
  parsedSourceSchema,
  targetArrayNode,
  validationState = null,
  nestingDepth = 0,
  onCollectionStateChange,
  className = '',
}: MergeBranchesEditorProps) {
  const { branches } = collectionState;
  const isAtMax = branches.length >= MAX_BRANCHES;
  const isAtMin = branches.length <= MIN_BRANCHES;

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleAddBranch = useCallback(() => {
    if (isAtMax) return;
    onCollectionStateChange({
      ...collectionState,
      branches: [...branches, createEmptyMergeBranch()],
    });
  }, [collectionState, branches, isAtMax, onCollectionStateChange]);

  const handleRemoveBranch = useCallback((index: number) => {
    if (isAtMin) return;
    onCollectionStateChange({
      ...collectionState,
      branches: branches.filter((_, i) => i !== index),
    });
  }, [collectionState, branches, isAtMin, onCollectionStateChange]);

  const handleBranchChange = useCallback((index: number, updated: MergeBranch) => {
    onCollectionStateChange({
      ...collectionState,
      branches: branches.map((b, i) => (i === index ? updated : b)),
    });
  }, [collectionState, branches, onCollectionStateChange]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      data-testid="merge-branches-editor"
      className={['space-y-3', className].filter(Boolean).join(' ')}
    >
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Branches
        </span>
        <span className="text-[10px] text-slate-500">
          {branches.length} / {MAX_BRANCHES}
        </span>
      </div>

      {/* Branch list */}
      <div className="space-y-2">
        {branches.map((branch, index) => (
          <MergeBranchEditor
            key={index}
            branch={branch}
            branchIndex={index}
            totalBranches={branches.length}
            parsedSourceSchema={parsedSourceSchema}
            targetArrayNode={targetArrayNode}
            validationState={validationState}
            nestingDepth={nestingDepth}
            onBranchChange={handleBranchChange}
            onRemove={handleRemoveBranch}
          />
        ))}
      </div>

      {/* Add branch button */}
      <button
        type="button"
        data-testid="add-branch-btn"
        disabled={isAtMax}
        onClick={handleAddBranch}
        aria-label="Add branch"
        className={[
          'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-xs transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          isAtMax
            ? 'cursor-not-allowed border-slate-700 text-slate-600'
            : 'border-slate-600 text-slate-400 hover:border-blue-500/60 hover:text-blue-300',
        ].join(' ')}
      >
        <Plus size={12} aria-hidden="true" />
        Add Branch
      </button>

      {/* Cap message */}
      {isAtMax && (
        <p
          data-testid="branch-cap-message"
          className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-400"
        >
          Maximum {MAX_BRANCHES} branches reached. Use{' '}
          <strong className="font-semibold">Custom Expression</strong> mode for more.
        </p>
      )}

      {/* Merge pattern hint */}
      <p className="text-[10px] text-slate-600">
        Generates:{' '}
        <span className="font-mono">
          merge(map(source("…"), &#123;…&#125;), map(source("…"), &#123;…&#125;), …)
        </span>
      </p>
    </div>
  );
}
