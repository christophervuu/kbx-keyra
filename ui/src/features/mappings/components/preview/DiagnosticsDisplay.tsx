import type { Diagnostic } from '@keyra/engine';
import type { PreviewExecutionState } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DiagnosticsDisplayProps {
  state: PreviewExecutionState;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityIcon(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return '✕';
    case 'warning':
      return '⚠';
    case 'info':
      return 'ℹ';
  }
}

function severityColor(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return 'text-red-400';
    case 'warning':
      return 'text-amber-400';
    case 'info':
      return 'text-blue-400';
  }
}

function severityIconAriaLabel(severity: Diagnostic['severity']): string {
  switch (severity) {
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
      return 'Info';
  }
}

// ---------------------------------------------------------------------------
// DiagnosticItem sub-component
// ---------------------------------------------------------------------------

interface DiagnosticItemProps {
  diagnostic: Diagnostic;
  index: number;
}

function DiagnosticItem({ diagnostic, index }: DiagnosticItemProps) {
  const color = severityColor(diagnostic.severity);

  return (
    <li
      className="flex gap-2 border-b border-zinc-800 px-3 py-2 last:border-0"
      data-testid={`diagnostic-item-${index}`}
    >
      {/* Severity icon */}
      <span
        className={`mt-px shrink-0 text-xs font-bold ${color}`}
        aria-label={severityIconAriaLabel(diagnostic.severity)}
        role="img"
      >
        {severityIcon(diagnostic.severity)}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${color}`}>{diagnostic.message}</p>

        {/* Target path */}
        {diagnostic.targetPath !== undefined && diagnostic.targetPath !== '' && (
          <p
            className="mt-0.5 font-mono text-xs text-zinc-500"
            data-testid={`diagnostic-path-${index}`}
          >
            {diagnostic.targetPath}
          </p>
        )}

        {/* Expression snippet */}
        {diagnostic.expression !== undefined && diagnostic.expression !== '' && (
          <p
            className="mt-0.5 font-mono text-xs text-zinc-600"
            data-testid={`diagnostic-expression-${index}`}
          >
            {diagnostic.expression}
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Diagnostics tab content for the Preview Panel.
 *
 * Renders a severity-categorised list of engine diagnostics from execution
 * results. Shows an empty/success state when no issues were produced and a
 * prompt when no execution has yet been run.
 */
export function DiagnosticsDisplay({ state }: DiagnosticsDisplayProps) {
  // No execution run yet
  if (state.status === 'idle') {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="diagnostics-idle"
      >
        <p className="text-xs text-zinc-500">Run a mapping to see diagnostics</p>
      </div>
    );
  }

  // Executing
  if (state.status === 'executing') {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="diagnostics-executing"
      >
        <p className="text-xs text-zinc-500">Executing…</p>
      </div>
    );
  }

  // Timeout — no diagnostics available
  if (state.status === 'timeout') {
    return (
      <div className="p-3" data-testid="diagnostics-timeout">
        <p className="text-xs text-amber-400">
          Execution timed out — no diagnostics available
        </p>
      </div>
    );
  }

  // Error — no diagnostics available
  if (state.status === 'error') {
    return (
      <div className="p-3" data-testid="diagnostics-error">
        <p className="text-xs text-red-400">
          Execution failed — no diagnostics available
        </p>
      </div>
    );
  }

  // Success — render diagnostics list
  const { diagnostics } = state.result;

  if (diagnostics.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center p-4"
        data-testid="diagnostics-empty"
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-base text-green-400" aria-hidden="true">
            ✓
          </span>
          <p className="text-xs text-zinc-400">No issues found</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-auto"
      data-testid="diagnostics-list-container"
    >
      <ul
        role="list"
        aria-label={`${diagnostics.length} diagnostic${diagnostics.length === 1 ? '' : 's'}`}
        data-testid="diagnostics-list"
      >
        {diagnostics.map((d, i) => (
          <DiagnosticItem key={i} diagnostic={d} index={i} />
        ))}
      </ul>
    </div>
  );
}
