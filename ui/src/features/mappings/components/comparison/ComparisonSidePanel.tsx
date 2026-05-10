import { EnvironmentMetadataBar } from './EnvironmentMetadataBar';

import type { ComparisonSideResult } from '@/lib/types';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComparisonSidePanelProps {
  side: 'left' | 'right';
  result: ComparisonSideResult;
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function JsonOutput({ output }: { output: Readonly<Record<string, unknown>> | null }) {
  if (output === null) {
    return (
      <div className="p-3">
        <pre className="whitespace-pre font-mono text-xs text-slate-400">null</pre>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3" data-testid="comparison-side-output">
      <pre className="whitespace-pre font-mono text-xs" aria-label="Comparison output">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Single side panel of the comparison view.
 *
 * Renders:
 * - `idle`: placeholder prompt
 * - `executing`: centered spinner
 * - `success`: EnvironmentMetadataBar + formatted JSON output
 * - `error`: EnvironmentMetadataBar + error message
 *
 * AE-03, AE-04, AE-07 (FS-037 T-06)
 */
export function ComparisonSidePanel({ side, result }: ComparisonSidePanelProps) {
  const { status, label, metadata, output, error } = result;

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      data-testid={`comparison-side-${side}`}
    >
      {/* Idle state */}
      {status === 'idle' && (
        <div className="flex h-full items-center justify-center p-4">
          <p className="text-xs text-slate-500">Run comparison to see results</p>
        </div>
      )}

      {/* Executing state */}
      {status === 'executing' && (
        <div className="flex h-full items-center justify-center gap-2 p-4">
          {/* Spinner */}
          <svg
            className="h-4 w-4 animate-spin text-blue-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-xs text-slate-400">Executing…</p>
        </div>
      )}

      {/* Success state */}
      {status === 'success' && (
        <>
          <EnvironmentMetadataBar metadata={metadata} label={label} />
          <div className="min-h-0 flex-1 overflow-auto">
            <JsonOutput output={output} />
          </div>
        </>
      )}

      {/* Error state */}
      {status === 'error' && (
        <>
          <EnvironmentMetadataBar metadata={metadata} label={label} />
          <div className="p-3" data-testid="comparison-side-error">
            <p className="text-xs text-red-400">
              {error ?? 'An unknown error occurred'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
