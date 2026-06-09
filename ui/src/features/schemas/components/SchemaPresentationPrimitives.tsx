import type { SchemaOrigin, SchemaSyncStatus } from '@/lib/types';

type CanonicalSyncStatus = 'synced' | 'update-available' | 'sync-failed';

const ORIGIN_LABELS: Record<SchemaOrigin, string> = {
  cdm: 'CDM',
  uploaded: 'Uploaded',
  inferred: 'Inferred',
  published: 'Uploaded',
  local: 'Uploaded',
};

export function getSchemaOriginLabel(origin: SchemaOrigin): string {
  return ORIGIN_LABELS[origin];
}

export function normalizeSchemaSyncStatusForDisplay(
  status: SchemaSyncStatus | string,
): CanonicalSyncStatus {
  if (status === 'synced' || status === 'update-available' || status === 'sync-failed') {
    return status;
  }

  return 'sync-failed';
}

const SYNC_STATUS_LABELS: Record<CanonicalSyncStatus, string> = {
  synced: 'Synced',
  'update-available': 'Update available',
  'sync-failed': 'Sync failed',
};

const SYNC_STATUS_SYMBOLS: Record<CanonicalSyncStatus, string> = {
  synced: '✓',
  'update-available': '⚠',
  'sync-failed': '⚠',
};

export interface SchemaSyncStatusBadgeProps {
  status: SchemaSyncStatus | string;
  className?: string;
  dataTestIdPrefix?: string;
}

export function SchemaSyncStatusBadge({
  status,
  className,
  dataTestIdPrefix = 'sync-status',
}: SchemaSyncStatusBadgeProps) {
  const canonicalStatus = normalizeSchemaSyncStatusForDisplay(status);
  const symbol = SYNC_STATUS_SYMBOLS[canonicalStatus];
  const label = SYNC_STATUS_LABELS[canonicalStatus];
  const toneClass =
    canonicalStatus === 'synced'
      ? 'text-green-400'
      : canonicalStatus === 'update-available'
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <span
      className={`inline-flex items-center gap-1 ${toneClass} ${className ?? ''}`.trim()}
      aria-label={`${symbol} ${label}`}
      data-testid={`${dataTestIdPrefix}-${canonicalStatus}`}
    >
      <span aria-hidden="true">{symbol}</span>
      <span>{label}</span>
    </span>
  );
}
