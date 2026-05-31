import { HttpAdapter } from './http-adapter';
import { LocalStorageAdapter } from './local-storage-adapter';
import type { ApiAdapter } from './types';

// FS-061 T-05: keep bootstrap storage-free on HTTP path (no local/session storage reads).
export function createAdapter(apiUrl = import.meta.env.VITE_API_URL): ApiAdapter {
  if (apiUrl) {
    return new HttpAdapter(apiUrl);
  }

  return new LocalStorageAdapter();
}
