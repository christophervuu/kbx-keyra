import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';

import { Button } from '@/components/Button';
import type { SchemaReviewIssueSummary } from '@/lib/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InferredSchemaBannerProps {
  inferred: boolean;
  needsReview?: boolean;
  reviewed?: boolean;
  reviewIssues?: readonly SchemaReviewIssueSummary[];
  onReviewIssue?: (issueCode: SchemaReviewIssueSummary['code']) => void;
  onMarkReviewed?: () => Promise<void> | void;
  isMarkingReviewed?: boolean;
  markReviewedError?: string | null;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

const ISSUE_LABELS: Record<SchemaReviewIssueSummary['code'], string> = {
  low_sample_evidence: 'Low sample evidence',
  type_ambiguity_conflict: 'Type ambiguity or conflict',
  optionality_uncertainty: 'Optionality uncertainty',
  empty_shape_unknown: 'Unknown empty shape',
  field_name_quality: 'Field name quality warning',
  missing_description: 'Missing descriptions',
};

function issueSubtitle(issue: SchemaReviewIssueSummary): string {
  if (issue.code === 'missing_description') {
    return 'Jump to fields missing descriptions';
  }

  return 'Focus inferred fields for targeted review';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Amber informational banner shown when a schema was inferred from sample data.
 *
 * FS-089 contract: this callout remains visible for inferred schemas.
 */
export function InferredSchemaBanner({
  inferred,
  needsReview = false,
  reviewed = false,
  reviewIssues = [],
  onReviewIssue,
  onMarkReviewed,
  isMarkingReviewed = false,
  markReviewedError = null,
  collapsed = false,
  onToggleCollapsed,
}: InferredSchemaBannerProps) {
  if (!inferred) {
    return null;
  }

  if (reviewed) {
    return (
      <section
        role="status"
        data-testid="inferred-schema-banner"
        className="rounded-lg border border-emerald-700/70 bg-emerald-950/30 px-4 py-3"
      >
        <div className="flex items-start gap-2 text-sm text-emerald-200">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Schema marked as reviewed</p>
            <p className="text-xs text-emerald-300/90">
              Inferred lineage is preserved. You can continue refining fields at any time.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const issues = reviewIssues.filter((issue) => issue.count > 0);

  return (
    <section
      role="region"
      aria-label="Schema review panel"
      data-testid="inferred-schema-banner"
      className="rounded-lg border border-amber-700/70 bg-amber-950/30 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium">Inferred schema needs review</p>
        </div>

        <button
          type="button"
          data-testid="inferred-review-toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand inferred review panel' : 'Collapse inferred review panel'}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          onClick={() => onToggleCollapsed?.()}
        >
          {collapsed ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronUp size={14} aria-hidden="true" />}
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <p className="text-xs text-amber-300/90">
              This schema was inferred from sample data. Review issues before relying on it in mappings.
            </p>

            {needsReview && onMarkReviewed && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="mark-reviewed-button"
                onClick={() => void onMarkReviewed()}
                loading={isMarkingReviewed}
              >
                Mark as Ready
              </Button>
            )}
          </div>

          {issues.length > 0 && (
            <ul className="mt-3 space-y-2" data-testid="review-issues-list">
              {issues.map((issue) => (
                <li key={issue.code}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-amber-800/60 bg-amber-900/25 px-3 py-2 text-left transition-colors hover:bg-amber-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    data-testid={`review-issue-${issue.code}`}
                    onClick={() => onReviewIssue?.(issue.code)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>
                        <span className="text-sm font-medium text-amber-100">
                          {ISSUE_LABELS[issue.code]} ({issue.count})
                        </span>
                        <span className="mt-0.5 block text-xs text-amber-300/90">{issueSubtitle(issue)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-amber-200">
                        Review <ChevronRight size={14} aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {markReviewedError && (
            <p
              role="alert"
              data-testid="mark-reviewed-error"
              className="mt-2 text-xs text-rose-200"
            >
              {markReviewedError}
            </p>
          )}
        </>
      )}
    </section>
  );
}
