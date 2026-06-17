import { useMemo, useState } from 'react';

import type { ResolvedSmartBuilderAction } from '../lib/smart-builder-action-resolver';

interface BuilderActionListProps {
  readonly actions: readonly ResolvedSmartBuilderAction[];
  readonly className?: string;
  readonly onApplyAction?: (actionId: string) => void;
  readonly activeActionId?: string | null;
  readonly mappingExists?: boolean;
}

const STEP_ACTION_IDS = new Set([
  'text.trim',
  'text.upper',
  'text.lower',
  'condition.if',
  'condition.truthy',
]);

export function BuilderActionList({
  actions,
  className = '',
  onApplyAction,
  activeActionId = null,
  mappingExists = false,
}: BuilderActionListProps) {
  const [query, setQuery] = useState('');
  const [expandedDisabledId, setExpandedDisabledId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const enabled = actions.filter((entry) => entry.availability.enabled);
  const disabled = actions.filter((entry) => !entry.availability.enabled);

  const filteredEnabled = useMemo(() => {
    if (!normalizedQuery) return enabled;
    return enabled.filter((entry) => {
      const haystack = `${entry.action.label} ${entry.action.category}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [enabled, normalizedQuery]);

  const filteredDisabled = useMemo(() => {
    if (!normalizedQuery) return [] as typeof disabled;
    return disabled.filter((entry) => {
      const haystack = `${entry.action.label} ${entry.action.category} ${entry.availability.reason ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [disabled, normalizedQuery]);

  const addNextStep = filteredEnabled.filter((entry) => STEP_ACTION_IDS.has(entry.action.id));
  const changeBase = filteredEnabled.filter((entry) => !STEP_ACTION_IDS.has(entry.action.id));

  return (
    <section className={className} data-testid="smart-action-list" aria-label="Builder actions">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Actions</p>
        <p className="text-xs text-slate-500" data-testid="smart-action-count">
          {filteredEnabled.length} available{normalizedQuery ? ` · ${filteredDisabled.length} unavailable` : ''}
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setExpandedDisabledId(null);
        }}
        placeholder="Search actions..."
        aria-label="Search actions"
        data-testid="smart-actions-search"
        className="mb-2 h-8 w-full rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
      />

      {filteredEnabled.length === 0 ? (
        <div
          className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-3 py-2 text-xs text-slate-400"
          data-testid="smart-actions-empty"
        >
          No guided actions available yet. Add another input or switch to Advanced mode.
        </div>
      ) : (
        <div className="space-y-3" data-testid="smart-actions-enabled">
          {!mappingExists ? (
            <ActionList
              title="Recommended"
              entries={filteredEnabled}
              activeActionId={activeActionId}
              onApplyAction={onApplyAction}
            />
          ) : (
            <>
              <ActionList
                title="Add next step"
                entries={addNextStep}
                activeActionId={activeActionId}
                onApplyAction={onApplyAction}
              />
              <ActionList
                title="Change base mapping"
                entries={changeBase}
                activeActionId={activeActionId}
                onApplyAction={onApplyAction}
              />
            </>
          )}
        </div>
      )}

      {normalizedQuery.length > 0 && (
        <div className="mt-3" data-testid="smart-actions-unavailable-section">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Unavailable for now</p>
          {filteredDisabled.length === 0 ? (
            <p className="text-xs text-slate-500" data-testid="smart-actions-unavailable-empty">No unavailable actions.</p>
          ) : (
            <ul className="space-y-2" data-testid="smart-actions-disabled">
              {filteredDisabled.map((entry) => {
                const expanded = expandedDisabledId === entry.action.id;
                return (
                  <li
                    key={entry.action.id}
                    className="rounded border border-slate-800 bg-slate-950/50 px-2.5 py-2"
                    data-testid={`smart-action-disabled-${entry.action.id}`}
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        setExpandedDisabledId((prev) => (prev === entry.action.id ? null : entry.action.id));
                      }}
                    >
                      <p className="text-xs font-medium text-slate-300">{entry.action.label}</p>
                      {expanded && (
                        <p className="text-[11px] text-slate-500">{entry.availability.reason ?? 'Unavailable in current context.'}</p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ActionList({
  title,
  entries,
  activeActionId,
  onApplyAction,
}: {
  readonly title: string;
  readonly entries: readonly ResolvedSmartBuilderAction[];
  readonly activeActionId: string | null;
  readonly onApplyAction?: (actionId: string) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="space-y-2">
        {entries.map((entry) => {
          const active = activeActionId === entry.action.id;
          return (
            <li
              key={entry.action.id}
              className={`rounded border px-2.5 py-2 ${active ? 'border-blue-600 bg-blue-950/30' : 'border-slate-700 bg-slate-900/60'}`}
              data-testid={`smart-action-enabled-${entry.action.id}`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onApplyAction?.(entry.action.id)}
                data-testid={`smart-action-apply-${entry.action.id}`}
                aria-pressed={active}
              >
                <p className="text-xs font-medium text-slate-100">{entry.action.label}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{entry.action.category}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
