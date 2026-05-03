import { useState } from 'react';

import { Button } from '@/components/Button';

// ---------------------------------------------------------------------------
// localStorage key helper
// ---------------------------------------------------------------------------

function dismissalKey(schemaId: string): string {
  return `keyra:schema-banner-dismissed:${schemaId}`;
}

function isDismissed(schemaId: string): boolean {
  try {
    return localStorage.getItem(dismissalKey(schemaId)) === 'true';
  } catch {
    return false;
  }
}

function writeDismissal(schemaId: string): void {
  try {
    localStorage.setItem(dismissalKey(schemaId), 'true');
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InferredSchemaBannerProps {
  schemaId: string;
  inferred: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Amber warning banner shown when a schema was inferred from sample data.
 * Dismissal is persisted in localStorage so it survives page reloads.
 */
export function InferredSchemaBanner({ schemaId, inferred }: InferredSchemaBannerProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed(schemaId));

  if (!inferred || dismissed) {
    return null;
  }

  function handleDismiss() {
    writeDismissal(schemaId);
    setDismissed(true);
  }

  return (
    <div
      role="alert"
      data-testid="inferred-schema-banner"
      className="flex items-start justify-between gap-4 border-b border-amber-700 bg-amber-900/30 px-6 py-3 text-sm text-amber-300"
    >
      <span className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-px shrink-0">⚠</span>
        <span>
          This schema was inferred from sample data and may be incomplete. Review and
          refine the structure before using it in mappings.
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        data-testid="inferred-banner-dismiss"
        onClick={handleDismiss}
        className="shrink-0 text-amber-300 hover:text-amber-100"
      >
        Dismiss
      </Button>
    </div>
  );
}
