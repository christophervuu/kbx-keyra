import { Button } from '@/components/Button';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InferredSchemaBannerProps {
  inferred: boolean;
  needsReview?: boolean;
  onMarkReviewed?: () => Promise<void> | void;
  isMarkingReviewed?: boolean;
  markReviewedError?: string | null;
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
  onMarkReviewed,
  isMarkingReviewed = false,
  markReviewedError = null,
}: InferredSchemaBannerProps) {
  if (!inferred) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="inferred-schema-banner"
      className="border-b border-amber-700 bg-amber-900/30 px-6 py-3 text-sm text-amber-300"
    >
      <div className="flex items-start justify-between gap-4">
        <span className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-px shrink-0">⚠</span>
          <span>
            This schema was inferred from sample data and may be incomplete. Review and
            refine the structure before using it in mappings.
          </span>
        </span>

        {needsReview && onMarkReviewed && (
          <Button
            variant="secondary"
            size="sm"
            data-testid="mark-reviewed-button"
            onClick={() => void onMarkReviewed()}
            loading={isMarkingReviewed}
          >
            Mark as Reviewed
          </Button>
        )}
      </div>

      {markReviewedError && (
        <p
          role="alert"
          data-testid="mark-reviewed-error"
          className="mt-2 text-xs text-rose-200"
        >
          {markReviewedError}
        </p>
      )}
    </div>
  );
}
