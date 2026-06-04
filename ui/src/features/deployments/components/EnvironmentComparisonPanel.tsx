import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/Button';
import type { CurrentDeployments, DeploymentStatus } from '@/lib/api/types';
import type { Environment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const statusConfig: Record<
  DeploymentStatus,
  { cls: string; label: string; dotCls: string }
> = {
  current: {
    cls: 'text-green-300',
    dotCls: 'bg-green-500',
    label: 'Current',
  },
  stale: {
    cls: 'text-amber-300',
    dotCls: 'bg-amber-500',
    label: 'Stale',
  },
  'not-deployed': {
    cls: 'text-slate-400',
    dotCls: 'bg-slate-500',
    label: 'Not deployed',
  },
};

// ---------------------------------------------------------------------------
// Promotion target map (sequential only)
// ---------------------------------------------------------------------------

const PROMOTE_TARGET: Partial<Record<Environment, Environment>> = {
  DEV: 'PREPROD',
  PREPROD: 'PROD',
};

// ---------------------------------------------------------------------------
// Single environment card
// ---------------------------------------------------------------------------

interface EnvCardProps {
  environment: Environment;
  sourceType: 'revision' | 'version' | null;
  sourceNumber: number | null;
  deployedAt: string | null;
  status: DeploymentStatus;
  /** Whether a promote action is in progress */
  isPromoting: boolean;
  onPromote?: (from: Environment, to: Environment) => void;
}

function EnvCard({
  environment,
  sourceType,
  sourceNumber,
  deployedAt,
  status,
  isPromoting,
  onPromote,
}: EnvCardProps) {
  const cfg = statusConfig[status];
  const promoteTarget = PROMOTE_TARGET[environment];

  const sourceLabel =
    status === 'not-deployed'
      ? '—'
      : sourceType === 'revision'
        ? `Rev ${sourceNumber ?? '?'}`
        : `v${sourceNumber ?? '?'}`;

  // Promote only available for version-backed deployments (AE-07)
  const canPromote =
    Boolean(onPromote) &&
    Boolean(promoteTarget) &&
    status !== 'not-deployed' &&
    sourceType === 'version';

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900 p-4"
      data-testid={`env-card-${environment}`}
    >
      {/* Environment label + status dot */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-200">{environment}</span>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${cfg.dotCls}`} aria-hidden="true" />
          <span className={`text-xs font-medium ${cfg.cls}`} data-testid={`env-status-${environment}`}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Source info */}
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-500">Deployed</p>
        <p
          className="mt-0.5 font-mono text-sm text-slate-200"
          data-testid={`env-source-${environment}`}
        >
          {sourceLabel}
        </p>
        {deployedAt && status !== 'not-deployed' && (
          <p className="mt-0.5 text-xs text-slate-500">
            <time dateTime={deployedAt}>
              {new Date(deployedAt).toLocaleString()}
            </time>
          </p>
        )}
      </div>

      {/* Promote button — only for version-backed deployments (AE-06, AE-07) */}
      {canPromote && promoteTarget && onPromote && (
        <Button
          variant="secondary"
          size="sm"
          disabled={isPromoting}
          onClick={() => onPromote(environment, promoteTarget)}
          aria-label={`Promote ${environment} to ${promoteTarget}`}
          data-testid={`promote-btn-${environment}`}
        >
          Promote to {promoteTarget}
          <ArrowRight size={12} aria-hidden="true" />
        </Button>
      )}

      {/* Revision-backed: promote button hidden (AE-07) — no button rendered */}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EnvironmentComparisonPanelProps {
  currentDeployments: CurrentDeployments | null;
  isPromoting: boolean;
  onPromote: (from: Environment, to: Environment) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Side-by-side DEV / PREPROD / PROD comparison panel.
 *
 * Shows current deployment source, staleness status, and promote button
 * (only for version-backed deployments, AE-07).
 * Implements AE-11 (environment comparison view).
 */
export function EnvironmentComparisonPanel({
  currentDeployments,
  isPromoting,
  onPromote,
}: EnvironmentComparisonPanelProps) {
  const environments: Environment[] = ['DEV', 'PREPROD', 'PROD'];

  return (
    <section aria-label="Environment comparison" data-testid="environment-comparison-panel">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Environments
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {environments.map((env) => {
          const summary = currentDeployments?.[env];
          return (
            <EnvCard
              key={env}
              environment={env}
              sourceType={summary?.deployment?.sourceType ?? null}
              sourceNumber={summary?.deployment?.sourceNumber ?? null}
              deployedAt={summary?.deployment?.deployedAt ?? null}
              status={summary?.status ?? 'not-deployed'}
              isPromoting={isPromoting}
              onPromote={onPromote}
            />
          );
        })}
      </div>
    </section>
  );
}
