import { Copy, FlaskConical, Rocket, Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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

function getDeploymentDisplay(
  devDeploy: DeployStatus,
  qaDeploy: DeployStatus,
  prodDeploy: DeployStatus,
): string {
  // Deterministic precedence (T-03):
  // 1) deploying in any env
  // 2) stale in any env (normalized copy: Changed since deploy)
  // 3) highest deployed env by PROD > QA > DEV
  // 4) not deployed
  if (devDeploy === 'deploying' || qaDeploy === 'deploying' || prodDeploy === 'deploying') {
    return 'Deploying';
  }
  if (devDeploy === 'stale' || qaDeploy === 'stale' || prodDeploy === 'stale') {
    return 'Changed since deploy';
  }
  if (prodDeploy === 'deployed') return 'PROD deployed';
  if (qaDeploy === 'deployed') return 'QA deployed';
  if (devDeploy === 'deployed') return 'DEV deployed';
  return 'Not deployed';
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
 * Deployment rendering (T-03):
 * - single compact deployment column with deterministic display copy
 *
 * Actions are icon-based and status-aware:
 * - row click opens mapping editor
 * - Deploy icon is always visible
 * - Deploy icon is enabled for ready mappings and disabled otherwise
 */
export function MappingRow({ mapping, projectId, onDuplicate, onDelete }: MappingRowProps) {
  const navigate = useNavigate();

  const editorPath = `/projects/${projectId}/mappings/${mapping.mappingId}`;
  const deployPath = `/projects/${projectId}/mappings/${mapping.mappingId}/deploy`;
  const testLabPath = `/projects/${projectId}/mappings/${mapping.mappingId}/test-lab`;

  const sourceName = mapping.sourceSchemaName ?? 'No schema';
  const targetName = mapping.targetSchemaName ?? 'No schema';

  const coverageDisplay =
    mapping.ruleCount === 0 && mapping.coverage === 0
      ? '—'
      : `${Math.round(mapping.coverage * 100)}%`;

  const deploymentDisplay = getDeploymentDisplay(mapping.devDeploy, mapping.qaDeploy, mapping.prodDeploy);
  const canDeploy = mapping.status === 'ready';

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    const target = event.target as HTMLElement;
    if (target.closest('a, button')) return;
    navigate(editorPath);
  }

  return (
    <tr
      className="cursor-pointer border-t border-slate-700 transition-colors hover:bg-slate-800/50"
      onClick={handleRowClick}
    >
      {/* Name */}
      <td className="px-3 py-2.5">
        <Link
          to={editorPath}
          className="rounded font-medium text-blue-400 hover:text-blue-300 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {mapping.name}
        </Link>
      </td>

      {/* Source → Target */}
      <td className="px-3 py-2.5 text-sm text-slate-300 whitespace-nowrap" data-testid="source-target-cell">
        <span className="inline-block max-w-[220px] truncate align-bottom" title={sourceName}>{sourceName}</span>
        <span className="mx-1 text-slate-500">→</span>
        <span className="inline-block max-w-[220px] truncate align-bottom" title={targetName}>{targetName}</span>
      </td>

      {/* Rules */}
      <td className="px-3 py-2.5 text-center text-sm text-slate-300" data-testid="rules-cell">
        {mapping.ruleCount}
      </td>

      {/* Coverage */}
      <td className="px-3 py-2.5 text-center text-sm text-slate-300" data-testid="coverage-cell">
        {coverageDisplay}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5 text-center" data-testid="status-cell">
        <MappingStatusBadge status={mapping.status} />
      </td>

      {/* Deployment (single compact column) */}
      <td className="px-3 py-2.5 text-center" data-testid="deployment-cell">
        <Link
          to={deployPath}
          aria-label={`Deployment state: ${deploymentDisplay}`}
          className="rounded whitespace-nowrap text-xs text-slate-300 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {deploymentDisplay}
        </Link>
      </td>

      {/* Last modified */}
      <td className="px-3 py-2.5 text-center text-sm text-slate-400" data-testid="last-modified-cell">
        <time dateTime={mapping.updatedAt}>
          {new Date(mapping.updatedAt).toLocaleDateString()}
        </time>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Link
            to={testLabPath}
            aria-label={`Test mapping ${mapping.name} in Test Lab`}
            className="inline-flex items-center justify-center rounded px-1.5 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid={`test-lab-link-${mapping.mappingId}`}
          >
            <FlaskConical size={13} aria-hidden="true" />
          </Link>

          <Button
            variant="ghost"
            size="sm"
            aria-label={canDeploy ? `Deploy mapping ${mapping.name}` : `Deploy mapping ${mapping.name} (disabled)`}
            aria-disabled={!canDeploy}
            disabled={!canDeploy}
            onClick={() => {
              if (!canDeploy) return;
              navigate(deployPath);
            }}
            className={canDeploy ? 'text-blue-300 hover:text-blue-200' : 'cursor-not-allowed text-slate-600 hover:text-slate-600'}
          >
            <Rocket size={13} aria-hidden="true" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            aria-label={`Duplicate mapping ${mapping.name}`}
            onClick={() => onDuplicate(mapping.mappingId)}
          >
            <Copy size={13} aria-hidden="true" />
          </Button>

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
