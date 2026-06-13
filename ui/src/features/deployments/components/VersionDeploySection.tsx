import { Rocket } from 'lucide-react';

import { Button } from '@/components/Button';
import type { MappingVersion } from '@/lib/types';

export interface VersionDeploySectionProps {
  versions: readonly MappingVersion[];
  /** Whether a deploy action is currently in flight */
  isDeploying: boolean;
  onDeploy: (version: number) => void;
}

/**
 * Lists mapping versions (milestones) with a deploy button on each row.
 * Versions are deployable to all runtime environments (DEV/PREPROD/PROD).
 */
export function VersionDeploySection({
  versions,
  isDeploying,
  onDeploy,
}: VersionDeploySectionProps) {
  if (versions.length === 0) {
    return (
      <section aria-label="Versions" data-testid="version-section">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Versions
        </h2>
        <p className="text-sm text-slate-500">No versions yet. Create a version milestone in the editor.</p>
      </section>
    );
  }

  return (
    <section aria-label="Versions" data-testid="version-section">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Versions
      </h2>
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              <th
                scope="col"
                className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
              >
                Version
              </th>
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
                Created
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
            {versions.map((v) => (
              <tr
                key={v.version}
                className="border-t border-slate-700 hover:bg-slate-800/40 transition-colors"
                data-testid={`version-row-${v.version}`}
              >
                <td className="px-3 py-2.5 font-mono text-sm text-slate-200">v{v.version}</td>
                <td className="px-3 py-2.5 text-sm text-slate-300">Rev {v.revisionNumber}</td>
                <td className="px-3 py-2.5 text-sm text-slate-400">
                  <time dateTime={v.createdAt}>
                    {new Date(v.createdAt).toLocaleString()}
                  </time>
                </td>
                <td className="px-3 py-2.5 text-sm text-slate-400">{v.createdBy}</td>
                <td className="px-3 py-2.5 text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isDeploying}
                    onClick={() => onDeploy(v.version)}
                    aria-label={`Deploy version ${v.version}`}
                    data-testid={`deploy-version-${v.version}`}
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
