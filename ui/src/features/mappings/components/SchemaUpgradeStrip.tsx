import { AlertTriangle } from 'lucide-react';

import type {
  MappingSchemaUpgradeImmutableRef,
  MappingSchemaUpgradeRole,
  MappingSchemaUpgradePreviewResult,
  SchemaRef,
} from '@/lib/types/domain';

export type UpgradeIndicatorStatus = 'Current' | 'Update available' | 'Review required' | 'Upgrade blocked';

interface SchemaUpgradeTarget {
  readonly key: string;
  readonly role: MappingSchemaUpgradeRole;
  readonly label: string;
  readonly currentPin: MappingSchemaUpgradeImmutableRef;
  readonly destinationPin: MappingSchemaUpgradeImmutableRef;
  readonly status: UpgradeIndicatorStatus;
  readonly isArchivedFamily?: boolean;
  readonly warningMessage?: string;
  readonly blockReason?: string;
  readonly upgradeState?: {
    readonly status: 'idle' | 'loading' | 'preview-ready' | 'applying' | 'error';
    readonly error?: string | null;
    readonly preview?: MappingSchemaUpgradePreviewResult;
    readonly acceptedSuggestionIds: ReadonlySet<string>;
    readonly previewInvalidated?: boolean;
    readonly previewInvalidationReason?: string | null;
  };
}

export interface SchemaUpgradeStripProps {
  readonly targets: readonly SchemaUpgradeTarget[];
  readonly onReviewUpdate: (targetKey: string) => void;
  readonly onToggleSuggestion: (targetKey: string, suggestionId: string) => void;
  readonly onApplyUpgrade: (targetKey: string) => void;
  readonly onRefreshPreview: (targetKey: string) => void;
}

function schemaLabelFromRef(ref: Pick<SchemaRef, 'schemaId' | 'schemaVersion'>): string {
  return `${ref.schemaId} · v${ref.schemaVersion}`;
}

function indicatorClasses(status: UpgradeIndicatorStatus): string {
  switch (status) {
    case 'Current':
      return 'border-emerald-700/60 bg-emerald-900/20 text-emerald-200';
    case 'Update available':
      return 'border-amber-700/60 bg-amber-900/20 text-amber-200';
    case 'Review required':
      return 'border-blue-700/60 bg-blue-900/20 text-blue-200';
    case 'Upgrade blocked':
      return 'border-red-700/60 bg-red-900/20 text-red-200';
    default:
      return 'border-slate-700 bg-slate-900 text-slate-300';
  }
}

function roleLabel(role: MappingSchemaUpgradeRole, label: string): string {
  return `${role[0]?.toUpperCase() ?? ''}${role.slice(1)}${label ? ` · ${label}` : ''}`;
}

export function SchemaUpgradeStrip({
  targets,
  onReviewUpdate,
  onToggleSuggestion,
  onApplyUpgrade,
  onRefreshPreview,
}: SchemaUpgradeStripProps) {
  if (targets.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2" data-testid="schema-upgrade-strip">
      {targets.map((target) => {
        const state = target.upgradeState;
        const preview = state?.preview;
        const hasSuggestions = (preview?.suggestions.length ?? 0) > 0;
        const allSuggestionsDecided = !hasSuggestions
          || preview?.suggestions.every((s) => state?.acceptedSuggestionIds.has(s.suggestionId)) === true;
        const canApply = state?.status === 'preview-ready' && !state.previewInvalidated && allSuggestionsDecided;

        return (
          <article
            key={target.key}
            className="rounded border border-slate-800 bg-slate-900/50 px-3 py-2"
            data-testid={`schema-upgrade-card-${target.role}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300" data-testid={`schema-upgrade-role-${target.role}`}>
                {roleLabel(target.role, target.label)}
              </p>
              <span
                className={`rounded border px-2 py-0.5 text-[11px] font-medium ${indicatorClasses(target.status)}`}
                data-testid={`schema-upgrade-status-${target.role}`}
              >
                {target.status}
              </span>
              <span className="text-xs text-slate-400" data-testid={`schema-upgrade-pin-${target.role}`}>
                Pinned: {schemaLabelFromRef(target.currentPin)}
              </span>
              <span className="text-xs text-slate-500" aria-hidden="true">→</span>
              <span className="text-xs text-slate-300" data-testid={`schema-upgrade-destination-${target.role}`}>
                Latest: {schemaLabelFromRef(target.destinationPin)}
              </span>
            </div>

            {(target.warningMessage || target.blockReason || target.isArchivedFamily) ? (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-200" data-testid={`schema-upgrade-warning-${target.role}`}>
                <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                <p>
                  {target.blockReason
                    ?? target.warningMessage
                    ?? (target.isArchivedFamily
                      ? 'Pinned schema family is archived. Existing mappings remain editable/deployable with warning.'
                      : '')}
                </p>
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onReviewUpdate(target.key)}
                disabled={target.status === 'Upgrade blocked' || state?.status === 'loading'}
                className="rounded border border-blue-700/70 bg-blue-900/30 px-2.5 py-1 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-900/50 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid={`schema-upgrade-review-${target.role}`}
              >
                {state?.status === 'loading' ? 'Loading preview…' : 'Review update'}
              </button>

              {state?.previewInvalidated ? (
                <button
                  type="button"
                  onClick={() => onRefreshPreview(target.key)}
                  className="rounded border border-amber-700/70 bg-amber-900/30 px-2.5 py-1 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-900/50"
                  data-testid={`schema-upgrade-refresh-${target.role}`}
                >
                  Refresh preview
                </button>
              ) : null}

              {state?.error ? (
                <p className="text-xs text-red-300" role="status" data-testid={`schema-upgrade-error-${target.role}`}>
                  {state.error}
                </p>
              ) : null}
            </div>

            {preview ? (
              <div className="mt-2 rounded border border-slate-800 bg-slate-950/70 p-2" data-testid={`schema-upgrade-preview-${target.role}`}>
                <p className="text-xs text-slate-300" data-testid={`schema-upgrade-impact-${target.role}`}>
                  Impact: {preview.impact.breakingCount} breaking · {preview.impact.nonBreakingCount} non-breaking · {preview.impact.affectedRules.length} affected rules
                </p>

                {state?.previewInvalidated ? (
                  <p className="mt-1 text-xs text-amber-300" role="status" data-testid={`schema-upgrade-preview-invalid-${target.role}`}>
                    {state.previewInvalidationReason ?? 'Preview invalidated. Refresh preview before applying.'}
                  </p>
                ) : null}

                {preview.suggestions.length > 0 ? (
                  <div className="mt-2 space-y-1" data-testid={`schema-upgrade-suggestions-${target.role}`}>
                    {preview.suggestions.map((suggestion) => {
                      const checked = state?.acceptedSuggestionIds.has(suggestion.suggestionId) ?? false;
                      return (
                        <label
                          key={suggestion.suggestionId}
                          className="flex items-start gap-2 rounded border border-slate-800 px-2 py-1 text-xs text-slate-200"
                          data-testid={`schema-upgrade-suggestion-${target.role}-${suggestion.suggestionId}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleSuggestion(target.key, suggestion.suggestionId)}
                            className="mt-0.5"
                          />
                          <span>
                            {suggestion.type}: {suggestion.fromPath} → {suggestion.toPath}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                {(preview.warnings?.length ?? 0) > 0 ? (
                  <div className="mt-2 space-y-1" data-testid={`schema-upgrade-preview-warnings-${target.role}`}>
                    {preview.warnings?.map((warning) => (
                      <p key={warning} className="text-xs text-amber-300">{warning}</p>
                    ))}
                  </div>
                ) : null}

                <div className="mt-2 flex items-center gap-2">
                  <button
                  type="button"
                    onClick={() => onApplyUpgrade(target.key)}
                    disabled={!canApply || state?.status === 'applying'}
                    className="rounded border border-emerald-700/70 bg-emerald-900/30 px-2.5 py-1 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-900/50 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`schema-upgrade-apply-${target.role}`}
                  >
                    {state?.status === 'applying' ? 'Applying…' : 'Apply upgrade'}
                  </button>
                  {!allSuggestionsDecided ? (
                    <p className="text-xs text-amber-300" role="status" data-testid={`schema-upgrade-suggestions-required-${target.role}`}>
                      Review all suggested updates before applying.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
