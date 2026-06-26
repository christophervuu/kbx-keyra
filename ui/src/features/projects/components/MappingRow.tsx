import { CircleHelp, Copy, FlaskConical, Rocket, Trash2 } from 'lucide-react';
import { useId, useState, type MouseEvent } from 'react';
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
  sandboxDeploy: DeployStatus,
  devDeploy: DeployStatus,
  preprodDeploy: DeployStatus,
  prodDeploy: DeployStatus,
): string {
  // Deterministic precedence (T-03/T-09):
  // 1) deploying in any env
  // 2) stale in any env (normalized copy: Changed since deploy)
  // 3) highest deployed env by PROD > PREPROD > DEV > SANDBOX
  // 4) not deployed
  if (sandboxDeploy === 'deploying' || devDeploy === 'deploying' || preprodDeploy === 'deploying' || prodDeploy === 'deploying') {
    return 'Deploying';
  }
  if (sandboxDeploy === 'stale' || devDeploy === 'stale' || preprodDeploy === 'stale' || prodDeploy === 'stale') {
    return 'Changed since deploy';
  }
  if (prodDeploy === 'deployed') return 'PROD deployed';
  if (preprodDeploy === 'deployed') return 'PREPROD deployed';
  if (devDeploy === 'deployed') return 'DEV deployed';
  if (sandboxDeploy === 'deployed') return 'SANDBOX deployed';
  return 'Not deployed';
}

function formatCoveragePercent(coverage: number): string {
  // Backend canonical coverage is 0-100. Keep compatibility with legacy 0-1 values.
  const normalizedCoverage = coverage <= 1 ? coverage * 100 : coverage;
  return `${Math.round(normalizedCoverage)}%`;
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
  const [showInputDetails, setShowInputDetails] = useState(false);
  const detailsId = useId();

  const editorPath = `/projects/${projectId}/mappings/${mapping.mappingId}`;
  const deployPath = `/projects/${projectId}/mappings/${mapping.mappingId}/deploy`;
  const testLabPath = `/projects/${projectId}/mappings/${mapping.mappingId}/test-lab`;

  const sourceName = mapping.sourceSchemaName ?? 'No schema';
  const targetName = mapping.targetSchemaName ?? 'No schema';
  const enrichmentCount = mapping.enrichmentInputs?.length ?? 0;
  const hasEnrichments = enrichmentCount > 0;

  const coverageDisplay =
    mapping.ruleCount === 0 && mapping.coverage === 0
      ? '—'
      : formatCoveragePercent(mapping.coverage);

  const deploymentDisplay = getDeploymentDisplay(
    mapping.sandboxDeploy,
    mapping.devDeploy,
    mapping.preprodDeploy,
    mapping.prodDeploy,
  );
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
        {hasEnrichments && (
          <>
            <span className="mx-1 text-slate-500">+</span>
            <span className="text-slate-300" data-testid="enrichment-summary-count">
              {enrichmentCount} enrichment{enrichmentCount === 1 ? '' : 's'}
            </span>
          </>
        )}
        <span className="mx-1 text-slate-500">→</span>
        <span className="inline-block max-w-[220px] truncate align-bottom" title={targetName}>{targetName}</span>

        {hasEnrichments && (
          <span className="relative ml-1.5 inline-flex align-middle">
            <button
              type="button"
              aria-label={`View mapping inputs for ${mapping.name}`}
              aria-expanded={showInputDetails}
              aria-controls={detailsId}
              onClick={() => setShowInputDetails((open) => !open)}
              className="inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              data-testid={`mapping-input-details-toggle-${mapping.mappingId}`}
            >
              <CircleHelp size={14} aria-hidden="true" />
            </button>

            {showInputDetails && (
              <div
                id={detailsId}
                role="dialog"
                aria-label={`Input details for ${mapping.name}`}
                className="absolute top-6 right-0 z-20 w-80 rounded-md border border-slate-700 bg-slate-900 p-3 text-xs shadow-xl"
                data-testid={`mapping-input-details-${mapping.mappingId}`}
              >
                <p className="font-semibold text-slate-100">Primary source</p>
                <p className="mt-0.5 text-slate-300">{sourceName}</p>

                <p className="mt-2 font-semibold text-slate-100">Enrichment inputs</p>
                <ul className="mt-1 list-disc pl-4 text-slate-300">
                  {(mapping.enrichmentInputs ?? []).map((input) => (
                    <li key={input.alias}>
                      <span className="font-medium text-slate-200">{input.alias}</span>
                      {' · '}
                      <span>{input.schemaName ?? 'Unknown schema'}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-2 font-semibold text-slate-100">Target</p>
                <p className="mt-0.5 text-slate-300">{targetName}</p>
              </div>
            )}
          </span>
        )}
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
