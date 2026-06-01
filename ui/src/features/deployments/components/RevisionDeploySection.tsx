import { Rocket } from 'lucide-react';

import { Button } from '@/components/Button';
import type { MappingRevision } from '@/lib/types';

export interface RevisionDeploySectionProps {
  revisions: readonly MappingRevision[];
  /** When true, deploy buttons are disabled (QA/PROD environments) */
  disabled: boolean;
  /** Whether a deploy action is currently in flight */
  isDeploying: boolean;
  onDeploy: (revision: number) => void;
}

/**
 * Lists mapping revisions with a deploy button on each row.
 * Deploy buttons are disabled when `disabled` is true (QA/PROD).
 * Revisions are deployable to DEV only.
 */
export function RevisionDeploySection({
  revisions,
  disabled,
  isDeploying,
  onDeploy,
}: RevisionDeploySectionProps) {
  if (revisions.length === 0) {
    return (
      <section aria-label="Revisions" data-testid="revision-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Revisions
        </h2>
        <p className="text-sm text-slate-500">No revisions yet.</p>
      </section>
    );
  }

  return (
    <section aria-label="Revisions" data-testid="revision-section">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Revisions
        {disabled && (
          <span className="ml-2 text-xs font-normal text-slate-500">(DEV only)</span>
        )}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              <th
                scope="col"
                className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                Revision
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                Rules
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                Saved
              </th>
              <th
                scope="col"
                className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                By
              </th>
              <th scope="col" className="px-3 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-slate-900">
            {revisions.map((rev) => (
              <tr
                key={rev.revision}
                className="border-t border-slate-700 hover:bg-slate-800/40 transition-colors"
                data-testid={`revision-row-${rev.revision}`}
              >
                <td className="px-3 py-2.5 font-mono text-sm text-slate-200">
                  Rev {rev.revision}
                </td>
                <td className="px-3 py-2.5 text-sm text-slate-300">{rev.ruleCount}</td>
                <td className="px-3 py-2.5 text-sm text-slate-400">
                  <time dateTime={rev.savedAt}>
                    {new Date(rev.savedAt).toLocaleString()}
                  </time>
                </td>
                <td className="px-3 py-2.5 text-sm text-slate-400">{rev.savedBy}</td>
                <td className="px-3 py-2.5 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled || isDeploying}
                    onClick={() => onDeploy(rev.revision)}
                    aria-label={
                      disabled
                        ? `Deploy revision ${rev.revision} — DEV only`
                        : `Deploy revision ${rev.revision}`
                    }
                    data-testid={`deploy-revision-${rev.revision}`}
                  >
                    <Rocket size={12} aria-hidden="true" />
                    Deploy
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
