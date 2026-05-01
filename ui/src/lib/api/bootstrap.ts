import { LocalStorageAdapter } from './local-storage-adapter';
import type { ApiAdapter } from './types';

export function createAdapter(apiUrl = import.meta.env.VITE_API_URL): ApiAdapter {
  if (apiUrl) {
    throw new Error('HttpAdapter not implemented');
  }

  return new LocalStorageAdapter();
}
