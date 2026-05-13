import { FlaskConical, Pencil, Copy, Trash2, Rocket } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { MappingRowData } from '../types';

import { Button } from '@/components/Button';
import type { DeployStatus } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Status badge — filled backgrounds (AE-08)
// ---------------------------------------------------------------------------

function MappingStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    ready: { cls: 'bg-green-600 text-white', label: 'Ready' },
    'has-errors': { cls: 'bg-red-600 text-white', label: 'Has Errors' },
    draft: { cls: 'bg-slate-600 text-slate-200', label: 'Draft' },
  };
  const { cls, label } = cfg[status] ?? { cls: 'bg-slate-600 text-slate-200', label: status };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

// ---------------------------------------------------------------------------
// Deploy badge — individual environment badge
// ---------------------------------------------------------------------------

const deployBadgeConfig: Record<DeployStatus, { cls: string; label: string }> = {
  deployed: { cls: 'bg-green-900/60 text-green-300', label: 'Deployed' },
  stale: { cls: 'bg-amber-900/60 text-amber-300', label: 'Stale' },
  'not-deployed': { cls: 'bg-slate-700 text-slate-400', label: 'Not deployed' },
  deploying: { cls: 'bg-blue-900/60 text-blue-300', label: 'Deploying' },
};

function EnvDeployBadge({
  env,
  status,
  deployPath,
}: {
  env: string;
  status: DeployStatus;
  deployPath: string;
}) {
  const { cls, label } = deployBadgeConfig[status];
  return (
    <Link
      to={deployPath}
      aria-label={`${env}: ${label}`}
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cls}`}
    >
      {env}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Deploy cells — condensed or individual (AE-07)
// ---------------------------------------------------------------------------

/**
 * Returns true when all three deploy statuses are 'not-deployed'.
 * In that case we render a single condensed cell spanning 3 columns.
 */
function allNotDeployed(
  devDeploy: DeployStatus,
  qaDeploy: DeployStatus,
  prodDeploy: DeployStatus,
): boolean {
  return devDeploy === 'not-deployed' && qaDeploy === 'not-deployed' && prodDeploy === 'not-deployed';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MappingRowProps {
  mapping: MappingRowData;
  projectId: string;
  onDuplicate: (mappingId: string) => void;
  onDelete: (mappingId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A single row in the mapping table.
 *
 * Deploy badge rendering (AE-07):
 * - All environments not-deployed → single condensed "Not deployed" cell (colSpan=3)
 * - Any environment differs → individual DEV/QA/PROD cells with status badges
 *
 * Status badge (AE-08): filled backgrounds (green/red/slate).
 * Test Lab action (AE-17): link to test-lab route.
 * Deploy badge click (AE-14): navigates to deployment page.
 */
export function MappingRow({ mapping, projectId, onDuplicate, onDelete }: MappingRowProps) {
  const editorPath = `/projects/${projectId}/mappings/${mapping.mappingId}`;
  const deployPath = `/projects/${projectId}/mappings/${mapping.mappingId}/deploy`;
  const testLabPath = `/projects/${projectId}/mappings/${mapping.mappingId}/test-lab`;

  const sourceName = mapping.sourceSchemaName ?? 'No schema';
  const targetName = mapping.targetSchemaName ?? 'No schema';

  const coverageDisplay =
    mapping.ruleCount === 0 && mapping.coverage === 0
      ? '—'
      : `${Math.round(mapping.coverage * 100)}%`;

  const condensed = allNotDeployed(mapping.devDeploy, mapping.qaDeploy, mapping.prodDeploy);

  return (
    <tr className="border-t border-slate-700 hover:bg-slate-800/50 transition-colors">
      {/* Name */}
      <td className="px-3 py-2.5">
        <Link
          to={editorPath}
          className="font-medium text-blue-400 hover:text-blue-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          {mapping.name}
        </Link>
      </td>

      {/* Source → Target */}
      <td className="px-3 py-2.5 text-sm text-slate-300">
        <span>{sourceName}</span>
        <span className="mx-1 text-slate-500">→</span>
        <span>{targetName}</span>
      </td>

      {/* Rules */}
      <td className="px-3 py-2.5 text-right text-sm text-slate-300">
        {mapping.ruleCount}
      </td>

      {/* Coverage */}
      <td className="px-3 py-2.5 text-right text-sm text-slate-300">
        {coverageDisplay}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <MappingStatusBadge status={mapping.status} />
      </td>

      {/* Deploy columns — condensed or individual (AE-07) */}
      {condensed ? (
        <td
          colSpan={3}
          className="px-3 py-2.5"
          data-testid="deploy-condensed"
        >
          <Link
            to={deployPath}
            aria-label="Not deployed — click to view deployment"
            className="whitespace-nowrap text-xs text-slate-500 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            ○ Not deployed
          </Link>
        </td>
      ) : (
        <>
          <td className="px-3 py-2.5">
            <EnvDeployBadge env="DEV" status={mapping.devDeploy} deployPath={deployPath} />
          </td>
          <td className="px-3 py-2.5">
            <EnvDeployBadge env="QA" status={mapping.qaDeploy} deployPath={deployPath} />
          </td>
          <td className="px-3 py-2.5">
            <EnvDeployBadge env="PROD" status={mapping.prodDeploy} deployPath={deployPath} />
          </td>
        </>
      )}

      {/* Last modified */}
      <td className="px-3 py-2.5 text-sm text-slate-400">
        <time dateTime={mapping.updatedAt}>
          {new Date(mapping.updatedAt).toLocaleDateString()}
        </time>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          {/* Edit */}
          <Link
            to={editorPath}
            aria-label={`Edit mapping ${mapping.name}`}
            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Pencil size={13} aria-hidden="true" />
          </Link>
          {/* Test Lab (AE-17) */}
          <Link
            to={testLabPath}
            aria-label={`Test mapping ${mapping.name} in Test Lab`}
            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid={`test-lab-link-${mapping.mappingId}`}
          >
            <FlaskConical size={13} aria-hidden="true" />
          </Link>
          {/* Deploy */}
          <Link
            to={deployPath}
            aria-label={`Deploy mapping ${mapping.name}`}
            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Rocket size={13} aria-hidden="true" />
          </Link>
          {/* Duplicate */}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Duplicate mapping ${mapping.name}`}
            onClick={() => onDuplicate(mapping.mappingId)}
          >
            <Copy size={13} aria-hidden="true" />
          </Button>
          {/* Delete */}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete mapping ${mapping.name}`}
            onClick={() => onDelete(mapping.mappingId)}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 size={13} aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
