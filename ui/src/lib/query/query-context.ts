import { getAdapterIdentity, normalizeApiUrl } from '@/lib/api/bootstrap';

export interface QueryBackendContext {
  readonly adapterIdentity: ReturnType<typeof getAdapterIdentity>;
  readonly backendBaseUrl: string | null;
}

/**
 * Canonical backend/adapter identity used for query-client reset decisions.
 */
export function deriveQueryBackendContext(apiUrl?: string): QueryBackendContext {
  return {
    adapterIdentity: getAdapterIdentity(apiUrl),
    backendBaseUrl: normalizeApiUrl(apiUrl),
  };
}

/**
 * Returns true when query cache must be recreated/cleared because identity changed.
 */
export function shouldResetQueryClient(
  previous: QueryBackendContext,
  next: QueryBackendContext,
): boolean {
  return (
    previous.adapterIdentity !== next.adapterIdentity ||
    previous.backendBaseUrl !== next.backendBaseUrl
  );
}
