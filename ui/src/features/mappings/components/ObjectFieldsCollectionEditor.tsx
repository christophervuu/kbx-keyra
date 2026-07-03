import { Check, Minus, MoveDown, MoveUp } from 'lucide-react';
import { useMemo } from 'react';

import { flattenSchemaPaths } from '../lib/autocomplete-utils';
import {
  createEmptyFilterPredicate,
  type FilterOperator,
  type FilterPredicateState,
} from '../lib/array-builder-state';
import type { ObjectFieldsCollectionState } from '../lib/array-builder-state';

import type { ParsedSchema } from '@/lib/types/domain';

export interface ObjectFieldsCollectionEditorProps {
  readonly collectionState: ObjectFieldsCollectionState;
  readonly parsedSourceSchema: ParsedSchema | null;
  readonly onCollectionStateChange: (state: ObjectFieldsCollectionState) => void;
  readonly className?: string;
}

function isDirectChildPath(parentPath: string, candidatePath: string): boolean {
  if (!parentPath || !candidatePath.startsWith(`${parentPath}.`)) return false;
  const remainder = candidatePath.slice(parentPath.length + 1);
  return remainder.length > 0 && !remainder.includes('.');
}

function toChildKey(parentPath: string, candidatePath: string): string {
  return candidatePath.slice(parentPath.length + 1);
}

const UNARY_OPERATORS = new Set<FilterOperator>(['isNull', 'isNotNull']);

function toStructuredPredicate(
  predicate: FilterPredicateState,
): Extract<FilterPredicateState, { kind: 'structured' }> {
  if (predicate.kind === 'structured') return predicate;
  return createEmptyFilterPredicate() as Extract<FilterPredicateState, { kind: 'structured' }>;
}

export function ObjectFieldsCollectionEditor({
  collectionState,
  parsedSourceSchema,
  onCollectionStateChange,
  className = '',
}: ObjectFieldsCollectionEditorProps) {
  const objectPaths = useMemo(() => {
    if (!parsedSourceSchema) return [] as string[];
    return flattenSchemaPaths(parsedSourceSchema)
      .filter((entry) => entry.type === 'object')
      .map((entry) => entry.path)
      .filter((path) => path.trim().length > 0);
  }, [parsedSourceSchema]);

  const directChildKeys = useMemo(() => {
    const parentPath = collectionState.parent.objectPath.trim();
    if (!parentPath || !parsedSourceSchema) return [] as string[];

    return flattenSchemaPaths(parsedSourceSchema)
      .map((entry) => entry.path)
      .filter((path) => isDirectChildPath(parentPath, path))
      .map((path) => toChildKey(parentPath, path));
  }, [collectionState.parent.objectPath, parsedSourceSchema]);

  const selectedSet = useMemo(
    () => new Set(collectionState.orderedChildKeys),
    [collectionState.orderedChildKeys],
  );

  function handleParentPathChange(path: string) {
    onCollectionStateChange({
      ...collectionState,
      parent: {
        input: { kind: 'primary' },
        objectPath: path,
      },
      orderedChildKeys: [],
    });
  }

  function handleToggleKey(key: string) {
    const alreadySelected = selectedSet.has(key);
    const nextKeys = alreadySelected
      ? collectionState.orderedChildKeys.filter((k) => k !== key)
      : [...collectionState.orderedChildKeys, key];

    onCollectionStateChange({
      ...collectionState,
      orderedChildKeys: nextKeys,
    });
  }

  function handleSelectAll() {
    onCollectionStateChange({
      ...collectionState,
      orderedChildKeys: directChildKeys,
    });
  }

  function handleClearAll() {
    onCollectionStateChange({
      ...collectionState,
      orderedChildKeys: [],
    });
  }

  function moveSelectedKey(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= collectionState.orderedChildKeys.length) return;

    const next = [...collectionState.orderedChildKeys];
    const [item] = next.splice(fromIndex, 1);
    if (!item) return;
    next.splice(toIndex, 0, item);

    onCollectionStateChange({
      ...collectionState,
      orderedChildKeys: next,
    });
  }

  function handleInclusionEnabled(enabled: boolean) {
    onCollectionStateChange({
      ...collectionState,
      inclusionPredicate: enabled ? (collectionState.inclusionPredicate ?? createEmptyFilterPredicate()) : undefined,
    });
  }

  function handleInclusionPredicateChange(predicate: FilterPredicateState) {
    onCollectionStateChange({
      ...collectionState,
      inclusionPredicate: predicate,
    });
  }

  const inclusionEnabled = collectionState.inclusionPredicate !== undefined;
  const structuredInclusionPredicate = toStructuredPredicate(
    collectionState.inclusionPredicate ?? createEmptyFilterPredicate(),
  );
  const isUnaryInclusion = UNARY_OPERATORS.has(structuredInclusionPredicate.operator);

  return (
    <div
      data-testid="object-fields-collection-editor"
      className={['space-y-4', className].filter(Boolean).join(' ')}
    >
      <div className="space-y-1">
        <label htmlFor="object-fields-parent" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Parent object
        </label>
        <select
          id="object-fields-parent"
          data-testid="object-fields-parent-select"
          value={collectionState.parent.objectPath}
          onChange={(e) => { handleParentPathChange(e.target.value); }}
          className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          <option value="">Select an object field…</option>
          {objectPaths.map((path) => (
            <option key={path} value={path}>{path}</option>
          ))}
        </select>
      </div>

      {collectionState.parent.objectPath.trim().length === 0 ? (
        <p data-testid="object-fields-parent-guidance" className="text-xs text-slate-500">
          Select a parent object to choose its direct child properties.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Child properties
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="object-fields-select-all"
                onClick={handleSelectAll}
                disabled={directChildKeys.length === 0}
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                data-testid="object-fields-clear-all"
                onClick={handleClearAll}
                disabled={collectionState.orderedChildKeys.length === 0}
                className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>

          {directChildKeys.length === 0 ? (
            <p data-testid="object-fields-no-direct-children" className="text-xs text-slate-500">
              No schema-defined direct children found for this parent object.
            </p>
          ) : (
            <ul
              data-testid="object-fields-child-list"
              className="max-h-56 space-y-1 overflow-y-auto rounded border border-slate-700 bg-slate-800/40 p-1"
            >
              {directChildKeys.map((key) => {
                const selected = selectedSet.has(key);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      data-testid={`object-fields-child-${key}`}
                      aria-pressed={selected}
                      onClick={() => { handleToggleKey(key); }}
                      className={[
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
                        selected
                          ? 'bg-blue-950/40 text-blue-200'
                          : 'text-slate-300 hover:bg-slate-700/60 hover:text-slate-100',
                      ].join(' ')}
                    >
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-600 bg-slate-900/70">
                        {selected ? <Check size={11} aria-hidden="true" className="text-blue-400" /> : null}
                      </span>
                      <span className="font-mono">{key}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Selected order
            </div>

            {collectionState.orderedChildKeys.length === 0 ? (
              <p data-testid="object-fields-selected-empty" className="text-xs text-slate-500">
                Select one or more child properties to define output order.
              </p>
            ) : (
              <ul className="space-y-1" data-testid="object-fields-selected-order-list">
                {collectionState.orderedChildKeys.map((key, index) => (
                  <li
                    key={key}
                    data-testid={`object-fields-selected-${key}`}
                    className="flex items-center gap-2 rounded border border-slate-700 bg-slate-800/40 px-2 py-1.5 text-xs"
                  >
                    <span className="w-5 shrink-0 text-center text-[10px] text-slate-500">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-slate-200">{key}</span>
                    <button
                      type="button"
                      aria-label={`Move ${key} up`}
                      data-testid={`object-fields-move-up-${key}`}
                      disabled={index === 0}
                      onClick={() => { moveSelectedKey(index, index - 1); }}
                      className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <MoveUp size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${key} down`}
                      data-testid={`object-fields-move-down-${key}`}
                      disabled={index === collectionState.orderedChildKeys.length - 1}
                      onClick={() => { moveSelectedKey(index, index + 1); }}
                      className="rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <MoveDown size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${key}`}
                      data-testid={`object-fields-remove-${key}`}
                      onClick={() => { handleToggleKey(key); }}
                      className="rounded p-0.5 text-slate-500 transition-colors hover:bg-red-900/40 hover:text-red-400"
                    >
                      <Minus size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 rounded border border-slate-700 bg-slate-800/40 p-3" data-testid="object-fields-inclusion-section">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Inclusion
            </div>
            <p
              className="text-xs text-slate-500"
              data-testid="object-fields-default-inclusion-text"
            >
              Always includes only selected keys where the resolved value is not null or absent.
            </p>

            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                data-testid="object-fields-enable-inclusion-predicate"
                checked={inclusionEnabled}
                onChange={(e) => { handleInclusionEnabled(e.target.checked); }}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-blue-500"
              />
              Add extra inclusion condition
            </label>

            {inclusionEnabled && (
              <div className="space-y-2" data-testid="object-fields-inclusion-predicate-editor">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Field path (item)
                    </label>
                    <input
                      type="text"
                      data-testid="object-fields-inclusion-left-field"
                      value={
                        structuredInclusionPredicate.left.kind === 'itemField'
                          ? structuredInclusionPredicate.left.fieldPath
                          : ''
                      }
                      onChange={(e) => {
                        handleInclusionPredicateChange({
                          ...structuredInclusionPredicate,
                          left: { kind: 'itemField', fieldPath: e.target.value },
                        });
                      }}
                      placeholder='e.g. value.IsOpen'
                      className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Operator
                    </label>
                    <select
                      data-testid="object-fields-inclusion-operator"
                      value={structuredInclusionPredicate.operator}
                      onChange={(e) => {
                        const operator = e.target.value as FilterOperator;
                        handleInclusionPredicateChange({
                          ...structuredInclusionPredicate,
                          operator,
                          right: UNARY_OPERATORS.has(operator)
                            ? { kind: 'none' }
                            : structuredInclusionPredicate.right.kind === 'none'
                              ? { kind: 'static', value: '' }
                              : structuredInclusionPredicate.right,
                        });
                      }}
                      className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="eq">equals</option>
                      <option value="neq">not equals</option>
                      <option value="gt">greater than</option>
                      <option value="gte">greater or equal</option>
                      <option value="lt">less than</option>
                      <option value="lte">less or equal</option>
                      <option value="isNull">is null</option>
                      <option value="isNotNull">is not null</option>
                    </select>
                  </div>
                </div>

                {!isUnaryInclusion && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      Value
                    </label>
                    <input
                      type="text"
                      data-testid="object-fields-inclusion-right-static"
                      value={
                        structuredInclusionPredicate.right.kind === 'static'
                          ? structuredInclusionPredicate.right.value
                          : ''
                      }
                      onChange={(e) => {
                        handleInclusionPredicateChange({
                          ...structuredInclusionPredicate,
                          right: { kind: 'static', value: e.target.value },
                        });
                      }}
                      placeholder='e.g. true'
                      className="w-full rounded border border-slate-600 bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
