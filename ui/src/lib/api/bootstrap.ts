import { HttpAdapter } from './http-adapter';
import { LocalStorageAdapter } from './local-storage-adapter';
import type { ApiAdapter } from './types';

export function normalizeApiUrl(apiUrl = import.meta.env.VITE_API_URL): string | null {
  if (!apiUrl) {
    return null;
  }

  const trimmed = apiUrl.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

// FS-061 T-05: keep bootstrap storage-free on HTTP path (no local/session storage reads).
export function createAdapter(apiUrl = import.meta.env.VITE_API_URL): ApiAdapter {
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  if (normalizedApiUrl) {
    return new HttpAdapter(normalizedApiUrl);
  }

  return new LocalStorageAdapter();
}

export function getAdapterIdentity(apiUrl = import.meta.env.VITE_API_URL): 'http' | 'local-storage' {
  return normalizeApiUrl(apiUrl) ? 'http' : 'local-storage';
}
