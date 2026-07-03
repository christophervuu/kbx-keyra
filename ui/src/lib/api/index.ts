export { AdapterProvider, useAdapter } from './adapter-provider';
export { createAdapter, getAdapterIdentity, normalizeApiUrl } from './bootstrap';
export { devLogger } from './dev-logger';
export type { DevLogEntry } from './dev-logger';
export { LocalStorageAdapter } from './local-storage-adapter';
export type { ApiAdapter } from './types';

export { createQueryClient, resetQueryClient } from '@/lib/query-client';
export {
  queryInvalidationKeys,
  queryKeys,
  queryPolicies,
  stableParams,
  deriveQueryBackendContext,
  shouldResetQueryClient,
} from '@/lib/query';
