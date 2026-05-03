import { useRef, useState } from 'react';
import { X } from 'lucide-react';

import type { ParsedSchema, SchemaTreeNode } from '@/lib/types/domain';
import { ConfirmDialog } from './ConfirmDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NullSubtreesSectionProps {
  /** Current list of null-out subtree paths. */
  nullSubtrees: readonly string[];
  /** Called with the full updated array when entries are added or removed. */
  onUpdate: (subtrees: string[]) => void;
  /** Parsed target schema used to derive autocomplete suggestions. */
  parsedTargetSchema: ParsedSchema | null;
}

// ---------------------------------------------------------------------------
// Schema path helpers
// ---------------------------------------------------------------------------

/**
 * Recursively walks a SchemaTreeNode tree and collects paths of all
 * object-type nodes (nodes that have children). Returns dot-notation paths.
 */
export function collectObjectPaths(nodes: SchemaTreeNode[]): string[] {
  const paths: string[] = [];

  function walk(node: SchemaTreeNode) {
    if (node.type === 'object' && node.children.length > 0) {
      paths.push(node.path);
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  for (const node of nodes) {
    walk(node);
  }

  return paths;
}

/**
 * Counts the total number of leaf (non-object) descendant nodes under a given
 * path in the schema tree. Returns null when the schema is unavailable or the
 * path is not found.
 */
export function countChildFields(
  nodes: SchemaTreeNode[],
  path: string,
): number | null {
  // Find the node matching the path
  function findNode(list: SchemaTreeNode[]): SchemaTreeNode | null {
    for (const n of list) {
      if (n.path === path) return n;
      const found = findNode(n.children);
      if (found) return found;
    }
    return null;
  }

  const target = findNode(nodes);
  if (!target) return null;

  // Count all descendants (childCount on the node itself is direct children;
  // we want total leaf descendants)
  function countLeaves(node: SchemaTreeNode): number {
    if (node.children.length === 0) return 1;
    return node.children.reduce((sum, c) => sum + countLeaves(c), 0);
  }

  return countLeaves(target);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * "Null-out Subtrees" section content for ConfigurationPanel.
 *
 * Renders a list of configured subtree paths with remove buttons, plus an
 * add-path input with autocomplete from the target schema's object-type nodes.
 */
export function NullSubtreesSection({
  nullSubtrees,
  onUpdate,
  parsedTargetSchema,
}: NullSubtreesSectionProps) {
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive autocomplete candidates from schema
  const allObjectPaths: string[] = parsedTargetSchema
    ? collectObjectPaths(parsedTargetSchema.nodes)
    : [];

  const filteredSuggestions =
    inputValue.trim().length > 0
      ? allObjectPaths.filter(
          (p) =>
            p.toLowerCase().includes(inputValue.toLowerCase()) &&
            !nullSubtrees.includes(p),
        )
      : allObjectPaths.filter((p) => !nullSubtrees.includes(p));

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleInputChange(value: string) {
    setInputValue(value);
    setInputError(null);
    setShowSuggestions(true);
  }

  function handleAdd(path: string) {
    const trimmed = path.trim();
    if (!trimmed) return;

    if (nullSubtrees.includes(trimmed)) {
      setInputError('Path already in list');
      return;
    }

    onUpdate([...nullSubtrees, trimmed]);
    setInputValue('');
    setInputError(null);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function handleSelectSuggestion(path: string) {
    handleAdd(path);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd(inputValue);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  function handleRemoveRequest(path: string) {
    setPendingRemove(path);
  }

  function handleRemoveConfirm() {
    if (pendingRemove !== null) {
      onUpdate(nullSubtrees.filter((p) => p !== pendingRemove));
      setPendingRemove(null);
    }
  }

  function handleRemoveCancel() {
    setPendingRemove(null);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div data-testid="null-subtrees-section">
      {/* Add input */}
      <div className="relative mb-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Delay hiding so click on suggestion registers first
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            placeholder="Add subtree path…"
            aria-label="Subtree path"
            aria-describedby={inputError ? 'null-subtrees-input-error' : undefined}
            aria-invalid={inputError !== null}
            className={[
              'flex-1 rounded border bg-slate-900 px-2 py-1 text-xs text-slate-200',
              'placeholder:text-slate-600 focus:outline-none focus:ring-1',
              inputError
                ? 'border-red-500 focus:ring-red-500'
                : 'border-slate-700 focus:ring-blue-500',
            ].join(' ')}
            data-testid="null-subtrees-input"
          />
          <button
            type="button"
            onClick={() => handleAdd(inputValue)}
            disabled={!inputValue.trim()}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="null-subtrees-add-button"
          >
            Add
          </button>
        </div>

        {/* Inline error */}
        {inputError && (
          <p
            id="null-subtrees-input-error"
            className="mt-1 text-xs text-red-400"
            data-testid="null-subtrees-input-error"
            role="alert"
          >
            {inputError}
          </p>
        )}

        {/* Autocomplete dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label="Subtree path suggestions"
            className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded border border-slate-700 bg-slate-900 shadow-lg"
            data-testid="null-subtrees-suggestions"
          >
            {filteredSuggestions.map((path) => (
              <li
                key={path}
                role="option"
                aria-selected={false}
                className="cursor-pointer px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                onMouseDown={(e) => {
                  // Prevent input blur before click registers
                  e.preventDefault();
                  handleSelectSuggestion(path);
                }}
                data-testid={`null-subtrees-suggestion-${path}`}
              >
                {path}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Current entries list */}
      {nullSubtrees.length === 0 ? (
        <p
          className="text-xs text-slate-600 italic"
          data-testid="null-subtrees-empty"
        >
          No subtrees configured
        </p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="null-subtrees-list">
          {nullSubtrees.map((path) => {
            const childCount = parsedTargetSchema
              ? countChildFields(parsedTargetSchema.nodes, path)
              : null;

            return (
              <li
                key={path}
                className="flex items-center justify-between rounded bg-slate-900 px-2 py-1.5"
                data-testid={`null-subtrees-entry-${path}`}
              >
                <span className="flex flex-col">
                  <span className="text-xs font-mono text-slate-200">{path}</span>
                  <span className="text-xs text-slate-500">
                    {childCount !== null
                      ? `${childCount} child field${childCount !== 1 ? 's' : ''}`
                      : '—'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveRequest(path)}
                  aria-label={`Remove subtree null-out for '${path}'`}
                  className="ml-2 shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-700 hover:text-slate-200"
                  data-testid={`null-subtrees-remove-${path}`}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Confirm removal dialog */}
      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove subtree null-out"
        message={`Remove subtree null-out for '${pendingRemove ?? ''}'?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={handleRemoveConfirm}
        onCancel={handleRemoveCancel}
      />
    </div>
  );
}
