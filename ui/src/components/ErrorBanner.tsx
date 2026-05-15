import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AsyncState } from '@/lib/state/async-state';

// ---------------------------------------------------------------------------
// ErrorBanner — primitive props interface
// ---------------------------------------------------------------------------

export interface ErrorBannerProps {
  message: string;
  retryable?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// AsyncErrorBanner — convenience wrapper that accepts AsyncState directly
// ---------------------------------------------------------------------------

export interface AsyncErrorBannerProps<T> {
  state: AsyncState<T>;
  retry: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Internal: "Recovered" flash state
// ---------------------------------------------------------------------------

const RECOVERED_DISPLAY_MS = 2000;

// ---------------------------------------------------------------------------
// ErrorBanner component
// ---------------------------------------------------------------------------

export function ErrorBanner({
  message,
  retryable = false,
  onRetry,
  retrying = false,
  className = '',
}: ErrorBannerProps) {
  const showRetry = retryable && typeof onRetry === 'function';

  // Track whether we were previously in an error state so we can show the
  // "Recovered" flash when the error clears after a retry.
  const [recovered, setRecovered] = useState(false);
  const prevRetryingRef = useRef(retrying);

  useEffect(() => {
    // retrying just flipped from true → false while we still have a message
    // means the retry completed. The parent will unmount us on success, but
    // we handle the brief flash here in case the parent keeps us mounted.
    if (prevRetryingRef.current && !retrying) {
      setRecovered(true);
      const timer = setTimeout(() => setRecovered(false), RECOVERED_DISPLAY_MS);
      prevRetryingRef.current = retrying;
      return () => clearTimeout(timer);
    }
    prevRetryingRef.current = retrying;
  }, [retrying]);

  if (recovered) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-2 rounded-md px-4 py-3 text-sm font-medium bg-green-950 text-green-400 border border-green-800 ${className}`}
      >
        <span>Recovered</span>
      </div>
    );
  }

  const containerClass = showRetry
    ? 'bg-amber-950 text-amber-300 border border-amber-800'
    : 'bg-red-950 text-red-400 border border-red-800';

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm ${containerClass} ${className}`}
    >
      <AlertCircle size={16} aria-hidden="true" className="shrink-0" />
      <span className="flex-1">{message}</span>
      {showRetry && (
        <button
          type="button"
          aria-label="Retry"
          disabled={retrying}
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium bg-amber-800 hover:bg-amber-700 text-amber-100 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 focus-visible:ring-offset-amber-950 transition-colors"
        >
          {retrying ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={12} aria-hidden="true" />
          )}
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AsyncErrorBanner convenience wrapper
// ---------------------------------------------------------------------------

export function AsyncErrorBanner<T>({ state, retry, className }: AsyncErrorBannerProps<T>) {
  if (state.status !== 'error') return null;

  return (
    <ErrorBanner
      message={state.error.message}
      retryable={state.retryable}
      onRetry={retry}
      className={className}
    />
  );
}
