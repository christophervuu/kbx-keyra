import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { DeploymentHistorySection } from './DeploymentHistorySection';
import { EnvironmentComparisonPanel } from './EnvironmentComparisonPanel';
import { EnvironmentSelector } from './EnvironmentSelector';
import { RevisionDeploySection } from './RevisionDeploySection';
import { VersionDeploySection } from './VersionDeploySection';
import { useDeploymentPage } from '../hooks/use-deployment-page';

import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';
import type { Environment } from '@/lib/types';
import { PATHS } from '@/routes/paths';


// ---------------------------------------------------------------------------
// Per-environment current deployment summary strip
// ---------------------------------------------------------------------------

interface CurrentDeploymentStripProps {
  environment: Environment;
  sourceType: 'revision' | 'version' | null;
  sourceNumber: number | null;
  status: 'current' | 'stale' | 'not-deployed';
}

function CurrentDeploymentStrip({
  environment,
  sourceType,
  sourceNumber,
  status,
}: CurrentDeploymentStripProps) {
  const statusConfig = {
    current: { cls: 'bg-green-900/30 border-green-700/40 text-green-300', label: 'Current' },
    stale: { cls: 'bg-amber-900/30 border-amber-700/40 text-amber-300', label: 'Stale' },
    'not-deployed': {
      cls: 'bg-slate-800/60 border-slate-700 text-slate-400',
      label: 'Not deployed',
    },
  } as const;

  const cfg = statusConfig[status];

  const deployedLabel =
    status === 'not-deployed'
      ? 'Nothing deployed'
      : sourceType === 'revision'
        ? `Rev ${sourceNumber ?? '?'}`
        : `v${sourceNumber ?? '?'}`;

  return (
    <div
      className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${cfg.cls}`}
      data-testid={`current-deploy-strip-${environment}`}
    >
      <span className="font-medium">{environment} — {deployedLabel}</span>
      <span className="text-xs uppercase tracking-wide opacity-80">{cfg.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback banner
// ---------------------------------------------------------------------------

interface FeedbackBannerProps {
  kind: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}

function FeedbackBanner({ kind, message, onDismiss }: FeedbackBannerProps) {
  if (kind === 'success') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="deploy-success-banner"
        className="flex items-center gap-3 rounded border border-green-700/40 bg-green-900/30 px-4 py-3 text-sm text-green-300"
      >
        <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss success notification"
          className="rounded p-0.5 hover:bg-green-800/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-green-500"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      role="alert"
      data-testid="deploy-error-banner"
      className="flex items-center gap-3 rounded border border-red-700/40 bg-red-900/30 px-4 py-3 text-sm text-red-300"
    >
      <AlertCircle size={16} aria-hidden="true" className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error notification"
        className="rounded p-0.5 hover:bg-red-800/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DeploymentPageProps {
  mappingId: string;
  projectId: string;
  mappingName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Deployment page for a mapping.
 *
 * - Environment selector (DEV/QA/PROD tabs)
 * - DEV: shows both Revisions and Versions sections with active deploy buttons
 * - QA/PROD: shows Versions only (revisions section disabled / hidden)
 * - Deploy action calls adapter.deployMapping(); shows feedback banner on outcome
 * - Links back to editor
 *
 * Implements AE-01, AE-03, AE-09 (DEV shows both), AE-10 (QA/PROD versions only).
 */
export function DeploymentPage({ mappingId, projectId, mappingName }: DeploymentPageProps) {
  const {
    environment,
    setEnvironment,
    revisions,
    versions,
    currentDeployments,
    deploymentHistory,
    isHistoryLoading,
    historyError,
    isLoading,
    error,
    isDeploying,
    deployFeedback,
    clearDeployFeedback,
    deploy,
    promote,
    rollback,
  } = useDeploymentPage(mappingId);

  const editorPath = PATHS.MAPPING_EDITOR.replace(':projectId', projectId).replace(
    ':mappingId',
    mappingId,
  );

  const isDevEnv = environment === 'DEV';

  // Current deployment info for the active environment
  const envSummary = currentDeployments?.[environment] ?? null;

  async function handleRevisionDeploy(revision: number) {
    await deploy({ environment, sourceType: 'revision', sourceNumber: revision });
  }

  async function handleVersionDeploy(version: number) {
    await deploy({ environment, sourceType: 'version', sourceNumber: version });
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8" data-testid="deployment-page">
      <PageHeader
        title={mappingName ? `Deploy: ${mappingName}` : 'Deploy Mapping'}
        description="Deploy a revision or version to an environment."
        actions={
          <Link
            to={editorPath}
            className="text-sm text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            data-testid="back-to-editor-link"
          >
            ← Back to editor
          </Link>
        }
      />

      {/* Feedback banner */}
      {deployFeedback && (
        <div className="mb-6">
          <FeedbackBanner
            kind={deployFeedback.kind}
            message={deployFeedback.message}
            onDismiss={clearDeployFeedback}
          />
        </div>
      )}

      {/* Load error */}
      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} />
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div
          className="space-y-4 animate-pulse"
          aria-busy="true"
          aria-label="Loading deployment data"
          data-testid="deployment-loading"
        >
          <div className="h-10 w-48 rounded bg-slate-800" />
          <div className="h-4 w-64 rounded bg-slate-800" />
          <div className="h-40 rounded bg-slate-800" />
        </div>
      )}

      {!isLoading && (
        <>
          {/* Environment selector */}
          <div className="mb-6 flex items-center gap-4">
            <EnvironmentSelector value={environment} onChange={setEnvironment} />
            {isDeploying && (
              <span
                className="text-sm text-slate-400"
                aria-live="polite"
                role="status"
                data-testid="deploying-indicator"
              >
                Deploying…
              </span>
            )}
          </div>

          {/* Current deployment strip */}
          {envSummary && (
            <div className="mb-6" data-testid="current-deployment-summary">
              <CurrentDeploymentStrip
                environment={environment}
                sourceType={envSummary.deployment?.sourceType ?? null}
                sourceNumber={envSummary.deployment?.sourceNumber ?? null}
                status={envSummary.status}
              />
            </div>
          )}

          {/* Content sections */}
          <div className="space-y-8">
            {/* Revisions — DEV only */}
            {isDevEnv ? (
              <RevisionDeploySection
                revisions={revisions}
                disabled={false}
                isDeploying={isDeploying}
                onDeploy={(rev) => void handleRevisionDeploy(rev)}
              />
            ) : (
              /* QA/PROD: show revisions section in disabled state so user knows they exist */
              <RevisionDeploySection
                revisions={revisions}
                disabled={true}
                isDeploying={isDeploying}
                onDeploy={() => {
                  /* no-op — buttons are disabled */
                }}
              />
            )}

            <VersionDeploySection
              versions={versions}
              isDeploying={isDeploying}
              onDeploy={(v) => void handleVersionDeploy(v)}
            />
          </div>

          {/* Environment comparison panel */}
          <div className="mt-10">
            <EnvironmentComparisonPanel
              currentDeployments={currentDeployments}
              isPromoting={isDeploying}
              onPromote={(from, to) => void promote(from, to)}
            />
          </div>

          {/* Deployment history for selected environment */}
          <div className="mt-10">
            <DeploymentHistorySection
              environment={environment}
              records={deploymentHistory}
              isLoading={isHistoryLoading}
              error={historyError}
              isRollingBack={isDeploying}
              onRollback={(env, sk) => void rollback(env, sk)}
            />
          </div>
        </>
      )}
    </div>
  );
}
