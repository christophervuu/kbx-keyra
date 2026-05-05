import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ClipboardPaste, Filter, List, Plus, Search, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { BulkActionBar } from './BulkActionBar';
import { ConfirmDialog } from './ConfirmDialog';
import { RuleForm } from './RuleForm';
import { RuleRow } from './RuleRow';
import { ValidationSummaryBar } from './ValidationSummaryBar';
import type { ValidationSummary } from '../hooks/use-engine-validation';

import { Button } from '@/components';
import type { EditorView } from '@/features/mappings/types';
import type { Diagnostic } from '@/lib/engine';
import type { MappingRule } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleListProps {
  /** The rules array to display */
  rules: readonly MappingRule[];
  /** Whether source and target schemas are loaded */
  schemasLoaded: boolean;
  /** Summary counts from useEngineValidation */
  summary: ValidationSummary;
  /** Coverage percentage */
  coveragePercent: number;
  /** Whether validation is currently in progress */
  isValidating: boolean;
  /** Get diagnostics for a specific rule index */
  diagnosticsForRule: (ruleIndex: number) => readonly Diagnostic[];
  /** Callback when a new rule is added */
  onAddRule?: (rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => void;
  /** Callback when a rule is updated */
  onEditRule?: (index: number, rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => void;
  /** Callback when a rule is deleted */
  onDeleteRule?: (index: number) => void;
  /** Callback when rules are reordered */
  onReorderRule?: (fromIndex: number, toIndex: number) => void;
  /** Callback when multiple rules are deleted (bulk) */
  onBulkDelete?: (indices: number[]) => void;
  /** Callback when multiple rules are duplicated (bulk) */
  onBulkDuplicate?: (indices: number[]) => void;
  /** Callback when rules are pasted from clipboard */
  onPasteRules?: (rules: Array<Pick<MappingRule, 'target' | 'type' | 'expression' | 'description'>>) => void;
  /** Current editor view (target/rules) for toolbar toggle */
  view?: EditorView;
  /** View toggle handler from MappingEditor */
  onViewToggle?: (view: EditorView) => void;
  /**
   * Index of the currently active/selected rule for the expression builder.
   * Highlighted with a left border. Null when no rule is active.
   */
  selectedRuleIndex?: number | null;
  /**
   * Callback fired when a rule row is clicked to activate it in the expression builder.
   * Called with null to deselect (clicking the already-active row).
   */
  onRuleSelect?: (index: number | null) => void;
}

// ---------------------------------------------------------------------------
// Clipboard format validation
// ---------------------------------------------------------------------------

function isValidRuleData(
  data: unknown,
): data is Array<Pick<MappingRule, 'target' | 'type' | 'expression' | 'description'>> {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).target === 'string' &&
      typeof (item as Record<string, unknown>).expression === 'string',
  );
}

// ---------------------------------------------------------------------------
// Sortable item IDs
// ---------------------------------------------------------------------------

function makeRuleId(index: number): string {
  return `rule-${index}`;
}

function parseRuleIndex(id: string): number {
  return parseInt(id.replace('rule-', ''), 10);
}

// ---------------------------------------------------------------------------
// SortableRuleRow
// ---------------------------------------------------------------------------

interface SortableRuleRowProps {
  id: string;
  index: number;
  rule: MappingRule;
  diagnostics: readonly Diagnostic[];
  schemasLoaded: boolean;
  selected: boolean;
  isActive?: boolean;
  isFocused?: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelectionChange?: (index: number, selected: boolean) => void;
  onActivate?: (index: number) => void;
  onEdit?: (index: number) => void;
  onDelete?: (index: number) => void;
  onCopy?: (index: number) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
}

function SortableRuleRow({
  id,
  index,
  rule,
  diagnostics,
  schemasLoaded,
  selected,
  isActive,
  isFocused,
  isFirst,
  isLast,
  onSelectionChange,
  onActivate,
  onEdit,
  onDelete,
  onCopy,
  onMoveUp,
  onMoveDown,
}: SortableRuleRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        transition: transition ?? undefined,
      }
    : undefined;

  return (
    <RuleRow
      ref={setNodeRef}
      index={index}
      rule={rule}
      diagnostics={diagnostics}
      schemasLoaded={schemasLoaded}
      selected={selected}
      isActive={isActive}
      isFocused={isFocused}
      isFirst={isFirst}
      isLast={isLast}
      onSelectionChange={onSelectionChange}
      onActivate={onActivate ? () => onActivate(index) : undefined}
      onEdit={onEdit}
      onDelete={onDelete}
      onCopy={onCopy}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      dragListeners={listeners}
      dragAttributes={attributes}
      sortableStyle={style}
      isDragging={isDragging}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Rule List component (Panel 3) that renders the rules array from a MappingConfig
 * as a scrollable, drag-reorderable list with per-rule validation status.
 *
 * Features:
 * - CRUD: Add, Edit, Delete rules
 * - DnD: Drag handle to reorder rules
 * - Keyboard: Move Up / Move Down buttons
 * - Multi-select: Checkboxes, Select All, Bulk action bar
 * - Copy/Paste: Per-rule copy, bulk copy, clipboard paste
 */
export function RuleList({
  rules,
  schemasLoaded,
  summary,
  coveragePercent,
  isValidating,
  diagnosticsForRule,
  onAddRule,
  onEditRule,
  onDeleteRule,
  onReorderRule,
  onBulkDelete,
  onBulkDuplicate,
  onPasteRules,
  view = 'rules',
  onViewToggle,
  selectedRuleIndex = null,
  onRuleSelect,
}: RuleListProps) {
  // Local UI state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  // Keyboard navigation: index of the currently "focused" row (-1 = none)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const focusTargetRef = useRef<number | null>(null);

  // Debounce searchQuery → debouncedQuery at 200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filtered rule indices
  const filteredIndices = useMemo(() => {
    if (!debouncedQuery.trim()) return rules.map((_, i) => i);
    const q = debouncedQuery.toLowerCase();
    return rules.reduce<number[]>((acc, rule, i) => {
      if (
        rule.target.toLowerCase().includes(q) ||
        rule.expression.toLowerCase().includes(q) ||
        (rule.type && rule.type.toLowerCase().includes(q))
      ) acc.push(i);
      return acc;
    }, []);
  }, [rules, debouncedQuery]);

  const isSearchActive = debouncedQuery.trim().length > 0;
  const searchQueryTrimmed = searchQuery.trim().toLowerCase();

  // DnD sensors — disabled when search is active
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: isSearchActive ? Infinity : 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortableIds = useMemo(
    () => filteredIndices.map((i) => makeRuleId(i)),
    [filteredIndices],
  );

  // Selection helpers
  const selectionCount = selection.size;
  const selectableIndices = useMemo(() => {
    if (!searchQueryTrimmed) return rules.map((_, i) => i);
    return rules.reduce<number[]>((acc, rule, i) => {
      if (
        rule.target.toLowerCase().includes(searchQueryTrimmed) ||
        rule.expression.toLowerCase().includes(searchQueryTrimmed) ||
        (rule.type && rule.type.toLowerCase().includes(searchQueryTrimmed))
      ) {
        acc.push(i);
      }
      return acc;
    }, []);
  }, [rules, searchQueryTrimmed]);
  const allSelected = selectableIndices.length > 0 && selectableIndices.every((i) => selection.has(i));
  const someSelected = selectionCount > 0 && !allSelected;

  function handleSelectionChange(index: number, selected: boolean) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
  }

  function handleSelectAll() {
    if (allSelected) {
      // Deselect all selectable
      setSelection((prev) => {
        const next = new Set(prev);
        selectableIndices.forEach((i) => next.delete(i));
        return next;
      });
    } else {
      // Select all selectable
      setSelection((prev) => {
        const next = new Set(prev);
        selectableIndices.forEach((i) => next.add(i));
        return next;
      });
    }
  }

  function clearSelection() {
    setSelection(new Set());
  }

  // Keyboard navigation handler for the rule list container
  function handleListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (filteredIndices.length === 0) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, filteredIndices.length - 1));
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      }
      case 'Home': {
        e.preventDefault();
        setFocusedIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setFocusedIndex(filteredIndices.length - 1);
        break;
      }
      case 'Escape': {
        if (editingIndex !== null) {
          e.preventDefault();
          setEditingIndex(null);
        }
        break;
      }
      default:
        break;
    }
  }

  // CRUD handlers
  function handleAddClick() {
    setShowAddForm(true);
    setEditingIndex(null);
  }

  function handleAddSave(rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) {
    onAddRule?.(rule);
    setShowAddForm(false);
  }

  function handleAddCancel() {
    setShowAddForm(false);
  }

  function handleEditClick(index: number) {
    setEditingIndex(index);
    setShowAddForm(false);
  }

  function handleEditSave(rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) {
    if (editingIndex !== null) {
      onEditRule?.(editingIndex, rule);
      setEditingIndex(null);
    }
  }

  function handleEditCancel() {
    setEditingIndex(null);
  }

  function handleDeleteClick(index: number) {
    setDeleteIndex(index);
  }

  function handleDeleteConfirm() {
    if (deleteIndex !== null) {
      onDeleteRule?.(deleteIndex);
      setDeleteIndex(null);
      if (editingIndex === deleteIndex) {
        setEditingIndex(null);
      }
      // Remove from selection if selected
      setSelection((prev) => {
        const next = new Set(prev);
        next.delete(deleteIndex);
        return next;
      });
    }
  }

  function handleDeleteCancel() {
    setDeleteIndex(null);
  }

  // Bulk action handlers
  function handleBulkDeleteClick() {
    setBulkDeleteConfirm(true);
  }

  function handleBulkDeleteConfirm() {
    const indices = Array.from(selection).sort((a, b) => b - a); // Sort descending for removal
    onBulkDelete?.(indices);
    clearSelection();
    setBulkDeleteConfirm(false);
  }

  function handleBulkDeleteCancel() {
    setBulkDeleteConfirm(false);
  }

  function handleBulkDuplicate() {
    const indices = Array.from(selection).sort((a, b) => a - b);
    onBulkDuplicate?.(indices);
    clearSelection();
  }

  async function handleBulkCopy() {
    const selectedRules = Array.from(selection)
      .sort((a, b) => a - b)
      .map((i) => rules[i]);
    const json = JSON.stringify(selectedRules, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setAnnouncement(`${selectedRules.length} rule${selectedRules.length === 1 ? '' : 's'} copied to clipboard`);
    } catch {
      setClipboardError('Clipboard access denied');
    }
  }

  // Per-row copy handler
  const handleCopyRule = useCallback(
    async (index: number) => {
      const rule = rules[index];
      const json = JSON.stringify([rule], null, 2);
      try {
        await navigator.clipboard.writeText(json);
        setAnnouncement('Rule copied to clipboard');
      } catch {
        setClipboardError('Clipboard access denied');
      }
    },
    [rules],
  );

  // Paste handler
  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text) as unknown;
      if (!isValidRuleData(parsed)) {
        setClipboardError('Invalid rule data in clipboard');
        return;
      }
      onPasteRules?.(parsed);
      setAnnouncement(`${parsed.length} rule${parsed.length === 1 ? '' : 's'} pasted`);
      setClipboardError(null);
    } catch {
      setClipboardError('Invalid rule data in clipboard');
    }
  }

  // DnD handlers
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = parseRuleIndex(active.id as string);
        const newIndex = parseRuleIndex(over.id as string);
        onReorderRule?.(oldIndex, newIndex);
        setAnnouncement(`Rule moved to position ${newIndex + 1}`);
      }
    },
    [onReorderRule],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index > 0) {
        onReorderRule?.(index, index - 1);
        focusTargetRef.current = index - 1;
        setAnnouncement(`Rule moved to position ${index}`);
      }
    },
    [onReorderRule],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index < rules.length - 1) {
        onReorderRule?.(index, index + 1);
        focusTargetRef.current = index + 1;
        setAnnouncement(`Rule moved to position ${index + 2}`);
      }
    },
    [onReorderRule, rules.length],
  );

  // DnD accessibility announcements
  const dndAnnouncements = useMemo(
    () => ({
      onDragStart({ active }: { active: { id: string | number } }) {
        const idx = parseRuleIndex(active.id as string);
        return `Picked up rule at position ${idx + 1}`;
      },
      onDragOver({ over }: { active: { id: string | number }; over: { id: string | number } | null }) {
        if (over) {
          const overIdx = parseRuleIndex(over.id as string);
          return `Rule is over position ${overIdx + 1}`;
        }
        return '';
      },
      onDragEnd({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) {
        if (over && active.id !== over.id) {
          const overIdx = parseRuleIndex(over.id as string);
          return `Rule dropped at position ${overIdx + 1}`;
        }
        return 'Rule returned to original position';
      },
      onDragCancel() {
        return 'Drag cancelled. Rule returned to original position';
      },
    }),
    [],
  );

  // Empty state
  if (rules.length === 0 && !showAddForm) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-4 p-6"
        data-testid="rule-list-empty"
      >
        <p className="text-center text-sm text-slate-400">
          No rules yet. Add your first rule to start mapping.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={handleAddClick}>
            <Plus size={14} aria-hidden="true" />
            Add Rule
          </Button>
          <Button variant="ghost" size="sm" disabled title="Coming soon">
            <Sparkles size={14} aria-hidden="true" />
            Auto-Map with AI
          </Button>
        </div>
        <span className="text-xs text-slate-500">0 rules | 0% coverage</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="rule-list">
      {/* ARIA live region for announcements */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="reorder-announcement"
      >
        {announcement}
      </div>

      {/* Clipboard error toast */}
      {clipboardError && (
        <div
          className="flex items-center justify-between border-b border-red-900/50 bg-red-950/30 px-3 py-2"
          role="alert"
          data-testid="clipboard-error"
        >
          <span className="text-xs text-red-300">{clipboardError}</span>
          <button
            type="button"
            className="text-xs text-red-400 hover:text-red-300"
            onClick={() => setClipboardError(null)}
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search input row */}
      {!showAddForm && editingIndex === null && rules.length > 0 && (
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5">
          <div className="relative flex flex-1 items-center">
            <Search size={13} className="absolute left-2 text-slate-500" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rules..."
              className="w-full rounded border border-slate-700 bg-slate-900 py-1 pl-7 pr-7 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              aria-label="Search rules"
              data-testid="rule-search"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-slate-500 hover:text-slate-300"
                aria-label="Clear search"
                data-testid="rule-search-clear"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>
          {isSearchActive && (
            <span className="shrink-0 text-xs text-slate-400" data-testid="rule-search-count">
              {filteredIndices.length} of {rules.length} rules
            </span>
          )}
        </div>
      )}

      {/* Toolbar row: Add Rule, Paste, Select All, Target/Rules toggle */}
      {!showAddForm && editingIndex === null && (
        <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5">
          <Button variant="ghost" size="sm" onClick={handleAddClick} data-testid="add-rule-button">
            <Plus size={14} aria-hidden="true" />
            Add Rule
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handlePaste}
            data-testid="paste-rules-button"
            aria-label="Paste rules from clipboard"
          >
            <ClipboardPaste size={14} aria-hidden="true" />
            Paste
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Select All checkbox */}
          {rules.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={handleSelectAll}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                aria-label="Select all rules"
                data-testid="select-all-checkbox"
              />
              Select All
            </label>
          )}

          <div
            role="group"
            aria-label="Editor view"
            className="flex rounded border border-slate-700 bg-slate-800"
          >
            <button
              type="button"
              data-testid="toolbar-view-target"
              aria-pressed={view === 'target'}
              onClick={() => view !== 'target' && onViewToggle?.('target')}
              className={[
                'flex items-center gap-1 rounded-l px-2 py-0.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                view === 'target'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
              ].join(' ')}
            >
              <Filter size={11} aria-hidden="true" />
              Target
            </button>
            <button
              type="button"
              data-testid="toolbar-view-rules"
              aria-pressed={view === 'rules'}
              onClick={() => view !== 'rules' && onViewToggle?.('rules')}
              className={[
                'flex items-center gap-1 rounded-r px-2 py-0.5 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                view === 'rules'
                  ? 'bg-slate-700 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200',
              ].join(' ')}
            >
              <List size={11} aria-hidden="true" />
              Rules
            </button>
          </div>
        </div>
      )}

      {/* Validation summary bar */}
      <ValidationSummaryBar
        summary={summary}
        coveragePercent={coveragePercent}
        isValidating={isValidating}
        schemasLoaded={schemasLoaded}
      />

      {/* Bulk action bar (appears when selection is non-empty) */}
      <BulkActionBar
        selectedCount={selectionCount}
        onDeleteSelected={handleBulkDeleteClick}
        onDuplicateSelected={handleBulkDuplicate}
        onCopySelected={handleBulkCopy}
      />

      {/* Add Rule form */}
      {showAddForm && (
        <RuleForm
          mode="add"
          onSave={handleAddSave}
          onCancel={handleAddCancel}
        />
      )}

      {/* Scrollable rule rows with DnD context */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{ announcements: dndAnnouncements }}
      >
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            role="list"
            aria-label="Mapping rules"
            aria-activedescendant={focusedIndex >= 0 ? `rule-row-id-${focusedIndex}` : undefined}
            onKeyDown={handleListKeyDown}
            tabIndex={filteredIndices.length > 0 ? 0 : undefined}
            data-testid="rule-list-container"
          >
            {isSearchActive && filteredIndices.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-2 p-6 text-center"
                data-testid="rule-search-no-results"
              >
                <p className="text-sm text-slate-400">No rules match your search.</p>
                <button
                  type="button"
                  className="text-xs text-blue-400 hover:text-blue-300"
                  onClick={() => setSearchQuery('')}
                >
                  Clear filter
                </button>
              </div>
            ) : (
              filteredIndices.map((index) => {
                const rule = rules[index];
                if (editingIndex === index) {
                  return (
                    <RuleForm
                      key={`edit-${index}`}
                      mode="edit"
                      initialValues={{
                        target: rule.target,
                        expression: rule.expression,
                        description: rule.description,
                      }}
                      onSave={handleEditSave}
                      onCancel={handleEditCancel}
                    />
                  );
                }

                return (
                  <SortableRuleRow
                    key={makeRuleId(index)}
                    id={makeRuleId(index)}
                    index={index}
                    rule={rule}
                    diagnostics={diagnosticsForRule(index)}
                    schemasLoaded={schemasLoaded}
                    selected={selection.has(index)}
                    isActive={selectedRuleIndex === index}
                    isFocused={focusedIndex === index}
                    isFirst={index === 0}
                    isLast={index === rules.length - 1}
                    onSelectionChange={handleSelectionChange}
                    onActivate={onRuleSelect ? (i) => onRuleSelect(selectedRuleIndex === i ? null : i) : undefined}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                    onCopy={handleCopyRule}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                  />
                );
              })
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Single-rule delete confirmation dialog */}
      <ConfirmDialog
        open={deleteIndex !== null}
        title="Delete Rule"
        message={
          deleteIndex !== null
            ? `Delete rule targeting '${rules[deleteIndex]?.target ?? ''}'?`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Bulk delete confirmation dialog */}
      <ConfirmDialog
        open={bulkDeleteConfirm}
        title="Delete Selected Rules"
        message={`Delete ${selectionCount} selected rule${selectionCount === 1 ? '' : 's'}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleBulkDeleteConfirm}
        onCancel={handleBulkDeleteCancel}
      />
    </div>
  );
}

// Re-export arrayMove for use by parent components managing the rules array
export { arrayMove };
