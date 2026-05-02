import { AlertTriangle, Info, XCircle } from 'lucide-react';

import type { Diagnostic, DiagnosticSeverity } from '@/lib/engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiagnosticDetailProps {
  diagnostics: readonly Diagnostic[];
  /** Optional id for aria-controls association */
  id?: string;
}

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const severityConfig: Record<DiagnosticSeverity, { icon: typeof XCircle; className: string; label: string }> = {
  error: { icon: XCircle, className: 'text-red-400 bg-red-950/50', label: 'Error' },
  warning: { icon: AlertTriangle, className: 'text-amber-400 bg-amber-950/50', label: 'Warning' },
  info: { icon: Info, className: 'text-blue-400 bg-blue-950/50', label: 'Info' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Expandable diagnostic detail panel for a single rule.
 * Shows all diagnostics with code, severity badge, message, and expression snippet.
 */
export function DiagnosticDetail({ diagnostics, id }: DiagnosticDetailProps) {
  if (diagnostics.length === 0) {
    return null;
  }

  return (
    <div
      id={id}
      className="border-t border-slate-800 bg-slate-950/50 px-4 py-2"
      data-testid="diagnostic-detail"
    >
      <ul className="space-y-2" role="list">
        {diagnostics.map((diagnostic, index) => {
          const config = severityConfig[diagnostic.severity];
          const Icon = config.icon;

          return (
            <li key={`${diagnostic.code}-${index}`} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {/* Severity badge */}
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${config.className}`}
                >
                  <Icon size={10} aria-hidden="true" />
                  {config.label}
                </span>

                {/* Diagnostic code */}
                <code className="text-[11px] font-mono text-slate-500">{diagnostic.code}</code>
              </div>

              {/* Message */}
              <p className="text-xs text-slate-300">{diagnostic.message}</p>

              {/* Expression snippet (if available) */}
              {diagnostic.expression && (
                <code className="block rounded bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-400">
                  {diagnostic.expression}
                </code>
              )}

              {/* Fix button placeholder */}
              <button
                type="button"
                disabled
                className="mt-0.5 self-start rounded px-2 py-0.5 text-[10px] text-slate-600 border border-slate-700 cursor-not-allowed"
                title="Coming in Phase 2"
                aria-label="Fix this diagnostic (coming in Phase 2)"
              >
                Fix
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
