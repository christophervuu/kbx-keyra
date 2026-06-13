import { AlertTriangle, Bot, Loader2, RefreshCw } from 'lucide-react';

import type {
  MappingRule,
  ValidationIssueCategory,
  ValidationIssueReference,
  ValidationIssueSeverity,
  ValidationReport,
} from '@/lib/types/domain';

type AiValidationStatus = 'idle' | 'loading' | 'success' | 'error';

export interface AiValidationPanelProps {
  status: AiValidationStatus;
  report: ValidationReport | null;
  error: string | null;
  rules: readonly MappingRule[];
  onRun: () => void;
  onRetry: () => void;
  onReset: () => void;
  onNavigateToRule: (ruleIndex: number) => void;
}

const SEVERITY_STYLES: Record<ValidationIssueSeverity, string> = {
  info: 'bg-blue-900/50 text-blue-300 border-blue-700/70',
  warning: 'bg-amber-900/50 text-amber-300 border-amber-700/70',
  error: 'bg-red-900/50 text-red-300 border-red-700/70',
};

function formatCategory(category: ValidationIssueCategory): string {
  switch (category) {
    case 'correctness':
      return 'Correctness';
    case 'completeness':
      return 'Completeness';
    case 'maintainability':
      return 'Maintainability';
    case 'risk':
      return 'Risk';
  }
}

function resolveIssueReference(
  reference: ValidationIssueReference,
  rules: readonly MappingRule[],
): { ruleIndex: number; label: string } | null {
  if (
    typeof reference.ruleIndex === 'number'
    && reference.ruleIndex >= 0
    && reference.ruleIndex < rules.length
  ) {
    const matchedRule = rules[reference.ruleIndex];
    return {
      ruleIndex: reference.ruleIndex,
      label: matchedRule?.target ?? `Rule ${reference.ruleIndex + 1}`,
    };
  }

  if (reference.targetPath) {
    const byPathIndex = rules.findIndex((rule) => rule.target === reference.targetPath);
    if (byPathIndex >= 0) {
      return {
        ruleIndex: byPathIndex,
        label: reference.targetPath,
      };
    }
  }

  return null;
}

export function AiValidationPanel({
  status,
  report,
  error,
  rules,
  onRun,
  onRetry,
  onReset,
  onNavigateToRule,
}: AiValidationPanelProps) {
  return (
    <section
      className="border-b border-slate-700 bg-slate-900/70"
      data-testid="ai-validation-panel"
      aria-label="AI Validation"
    >
      <div className="flex items-start justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Bot size={14} className="text-violet-300" aria-hidden="true" />
            <h3 className="text-xs font-semibold text-slate-100">AI Validation</h3>
          </div>
          <p className="mt-1 text-[11px] text-slate-400" data-testid="ai-validation-advisory-label">
            AI findings are advisory/additive. Deterministic engine diagnostics remain authoritative.
          </p>
        </div>

        <div className="flex items-center gap-1">
          {status === 'success' && (
            <button
              type="button"
              onClick={onReset}
              className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-slate-600"
              data-testid="ai-validation-reset"
            >
              Clear
            </button>
          )}
          {status === 'error' ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded border border-amber-700 px-2 py-1 text-[11px] text-amber-300 hover:border-amber-600"
              data-testid="ai-validation-retry"
            >
              <RefreshCw size={11} aria-hidden="true" /> Retry
            </button>
          ) : (
            <button
              type="button"
              onClick={onRun}
              disabled={status === 'loading'}
              className="inline-flex items-center gap-1 rounded border border-violet-700 px-2 py-1 text-[11px] text-violet-300 hover:border-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="ai-validation-run"
            >
              {status === 'loading' ? (
                <Loader2 size={11} aria-hidden="true" className="animate-spin" />
              ) : null}
              Validate with AI
            </button>
          )}
        </div>
      </div>

      {status === 'loading' && (
        <div className="px-3 pb-2 text-[11px] text-slate-300" data-testid="ai-validation-loading">
          Running AI validation…
        </div>
      )}

      {status === 'error' && (
        <div
          className="mx-3 mb-2 flex items-start gap-1 rounded border border-red-800/80 bg-red-950/40 px-2 py-1.5 text-[11px] text-red-300"
          data-testid="ai-validation-error"
          role="alert"
        >
          <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{error ?? 'AI validation failed.'}</span>
        </div>
      )}

      {status === 'success' && report && (
        <div className="space-y-2 border-t border-slate-800 px-3 py-2" data-testid="ai-validation-report">
          <div className="text-[11px] text-slate-300" data-testid="ai-validation-summary">
            {report.summary.totalIssues} issue{report.summary.totalIssues === 1 ? '' : 's'}
            {' • '}
            {report.summary.bySeverity.error} error
            {report.summary.bySeverity.error === 1 ? '' : 's'}
            {', '}
            {report.summary.bySeverity.warning} warning
            {report.summary.bySeverity.warning === 1 ? '' : 's'}
            {', '}
            {report.summary.bySeverity.info} info
          </div>

          <ul className="space-y-2" data-testid="ai-validation-issues">
            {report.issues.map((issue) => (
              <li
                key={issue.id}
                className="rounded border border-slate-700 bg-slate-950/60 p-2"
                data-testid={`ai-validation-issue-${issue.id}`}
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-slate-200">{formatCategory(issue.category)}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 uppercase tracking-wide ${SEVERITY_STYLES[issue.severity]}`}
                  >
                    {issue.severity}
                  </span>
                </div>

                <p className="mt-1 text-xs text-slate-200">{issue.description}</p>
                <p className="mt-1 text-[11px] text-slate-300">
                  <span className="font-medium text-slate-200">Recommendation:</span>{' '}
                  {issue.recommendation}
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="text-slate-400">Affected rule(s):</span>
                  {issue.affectedRules.length === 0 ? (
                    <span className="text-slate-500">No references provided</span>
                  ) : (
                    issue.affectedRules.map((reference, idx) => {
                      const resolved = resolveIssueReference(reference, rules);

                      if (resolved) {
                        return (
                          <button
                            key={`${issue.id}-ref-${idx}`}
                            type="button"
                            className="rounded border border-blue-700/70 px-1.5 py-0.5 text-blue-300 hover:border-blue-600"
                            onClick={() => onNavigateToRule(resolved.ruleIndex)}
                            data-testid={`ai-validation-issue-link-${issue.id}-${idx}`}
                          >
                            {resolved.label}
                          </button>
                        );
                      }

                      return (
                        <span
                          key={`${issue.id}-ref-${idx}`}
                          className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-500"
                          data-testid={`ai-validation-issue-unresolved-${issue.id}-${idx}`}
                        >
                          {reference.targetPath ?? 'Unresolvable rule reference'}
                        </span>
                      );
                    })
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
