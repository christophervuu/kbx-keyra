import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, GitBranch, History, Package, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import type {
  CdmDeployBlockUiIssue,
  DeploymentActionArtifactDetails,
  DeploymentActionOrchestrationDetails,
  DeploymentUiErrorDetails,
} from '../hooks/use-deployment-page';
import { useDeploymentPage } from '../hooks/use-deployment-page';

import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorBanner } from '@/components/ErrorBanner';
import { PageHeader } from '@/components/PageHeader';
import {
  buildTargetTypeByPathFromSchema,
  getErrorInfo,
  normalizeRuleTypesByTargetSchema,
  tryParseSchema,
} from '@/features/mappings/hooks/use-mapping-editor';
import { useAdapter } from '@/lib/api';
import type { DeploymentRecord } from '@/lib/api/types';
import { prefetchMappingEditorByIntent } from '@/lib/query';
import type { RuntimeEnvironment } from '@/lib/types';
import { PATHS } from '@/routes/paths';

type PipelineEnvironment = 'SANDBOX' | 'DEV' | 'PREPROD' | 'PROD';

const PIPELINE_ORDER: readonly PipelineEnvironment[] = ['SANDBOX', 'DEV', 'PREPROD', 'PROD'];

const HISTORY_FILTERS = ['all', 'deploy', 'promote', 'rollback'] as const;
type HistoryFilter = (typeof HISTORY_FILTERS)[number];

interface EnvironmentSnapshot {
  readonly sourceType: 'revision' | 'version' | null;
  readonly sourceNumber: number | null;
  readonly deployedAt: string | null;
  readonly artifactId?: string;
  readonly artifactHash?: string;
}

interface ReadinessCheck {
  readonly key: string;
  readonly label: string;
  readonly passed: boolean;
}

interface DeploymentCandidate {
  readonly version: number;
  readonly revisionNumber: number;
  readonly createdAt: string;
  readonly createdBy: string;
}

type PrimaryActionState =
  | {
    readonly label: string;
    readonly disabled: boolean;
    readonly reason?: string;
    readonly kind: 'deploy';
    readonly targetEnvironment: 'DEV';
  }
  | {
    readonly label: string;
    readonly disabled: boolean;
    readonly reason?: string;
    readonly kind: 'promote';
    readonly from: 'DEV' | 'PREPROD';
    readonly to: 'PREPROD' | 'PROD';
  }
  | {
    readonly label: string;
    readonly disabled: boolean;
    readonly reason: string;
    readonly kind: 'none';
  };

function getDeploymentCandidate(versions: readonly { version: number; revisionNumber: number; createdAt: string; createdBy: string }[]): DeploymentCandidate | null {
  const first = versions[0];
  if (!first) return null;

  return {
    version: first.version,
    revisionNumber: first.revisionNumber,
    createdAt: first.createdAt,
    createdBy: first.createdBy,
  };
}

interface FeedbackBannerProps {
  feedback:
    | {
      kind: 'success';
      message: string;
      orchestration?: DeploymentActionOrchestrationDetails;
      artifact?: DeploymentActionArtifactDetails;
    }
    | {
      kind: 'error';
      message: string;
      requestId?: string;
      technicalDetails?: DeploymentUiErrorDetails;
      cdmBlockIssues?: readonly CdmDeployBlockUiIssue[];
      orchestration?: DeploymentActionOrchestrationDetails;
      artifact?: DeploymentActionArtifactDetails;
    };
  onDismiss: () => void;
}

function fmtEnv(env: PipelineEnvironment): string {
  if (env === 'PREPROD') return 'Preprod';
  return env;
}

function fmtSource(snapshot: EnvironmentSnapshot): string {
  if (!snapshot.sourceType) return 'Not deployed';
  return snapshot.sourceType === 'revision' ? `Rev ${snapshot.sourceNumber ?? '?'}` : `v${snapshot.sourceNumber ?? '?'}`;
}

function mapRuntimeEnvironment(env: PipelineEnvironment): RuntimeEnvironment {
  return env === 'SANDBOX' ? 'DEV' : env;
}

function getHistoryRecordType(record: DeploymentRecord): 'deploy' | 'promote' | 'rollback' {
  if (record.rollbackOf) return 'rollback';
  if (record.promotedFrom) return 'promote';
  return 'deploy';
}

function issueReasonLabel(reason: CdmDeployBlockUiIssue['reason']): string {
  switch (reason) {
    case 'unsynced':
      return 'Not synced yet';
    case 'update-failed':
      return 'Last sync failed';
    case 'metadata-incomplete':
      return 'Schema metadata is incomplete';
    case 'ingest-not-ready':
      return 'Schema ingestion is still in progress';
    case 'schema-missing':
      return 'Schema is missing';
  }
}

function issueRoleLabel(role: CdmDeployBlockUiIssue['referenceRole']): string {
  return role === 'source' ? 'Source' : 'Target';
}

function remediationActionLabel(remediationKey: CdmDeployBlockUiIssue['remediationKey']): string {
  switch (remediationKey) {
    case 're-sync-schema':
      return 'Open schema to re-sync';
    case 'retry-sync':
      return 'Open schema to retry sync';
    case 'relink-cdm-schema':
      return 'Open schema library to relink';
    case 'complete-ingestion':
      return 'Open schema and check status';
  }
}

function remediationActionPath(issue: CdmDeployBlockUiIssue): string {
  if (issue.remediationKey === 'relink-cdm-schema') {
    return PATHS.SCHEMA_LIBRARY;
  }

  return PATHS.SCHEMA_DETAIL.replace(':schemaId', issue.schemaId);
}

function FeedbackBanner({ feedback, onDismiss }: FeedbackBannerProps) {
  const [showTechnical, setShowTechnical] = useState(false);

  const statusClass = feedback.kind === 'success'
    ? 'border-green-700/40 bg-green-900/30 text-green-200'
    : 'border-red-700/40 bg-red-900/30 text-red-200';

  return (
    <div role={feedback.kind === 'success' ? 'status' : 'alert'} className={`rounded border px-4 py-3 ${statusClass}`}>
      <div className="flex items-start gap-3">
        {feedback.kind === 'success' ? (
          <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        ) : (
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm">{feedback.message}</p>
          {feedback.kind === 'error' && feedback.requestId && (
            <p className="mt-1 text-xs text-red-300" data-testid="deploy-error-request-id">
              Request ID: <span className="font-mono">{feedback.requestId}</span>
            </p>
          )}

          {feedback.kind === 'error' && feedback.technicalDetails && (
            <div className="mt-2" data-testid="deploy-error-technical-details">
              <button
                type="button"
                onClick={() => setShowTechnical((prev) => !prev)}
                aria-label="Technical details"
                aria-expanded={showTechnical}
                aria-controls="deploy-technical-details-panel"
                className="inline-flex items-center gap-1 rounded text-xs text-red-200 hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                {showTechnical ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                Technical details
              </button>
              {showTechnical && (
                <div
                  id="deploy-technical-details-panel"
                  className="mt-2 rounded border border-red-800/60 bg-slate-950/40 p-2 text-xs"
                >
                  <pre className="whitespace-pre-wrap break-words text-red-100" data-testid="deploy-error-technical-details-content">
                    {JSON.stringify(feedback.technicalDetails, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {feedback.kind === 'error' && feedback.cdmBlockIssues && feedback.cdmBlockIssues.length > 0 && (
            <div className="mt-3 rounded border border-red-700/40 bg-slate-950/40 p-3" data-testid="cdm-block-list">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-red-200">
                Resolve these schema issues before retrying:
              </p>
              <ul className="space-y-2">
                {feedback.cdmBlockIssues.map((issue) => (
                  <li
                    key={`${issue.referenceRole}-${issue.schemaId}-${issue.reason}`}
                    className="rounded border border-red-900/40 bg-red-950/20 p-2"
                    data-testid={`cdm-block-issue-${issue.referenceRole}-${issue.schemaId}`}
                  >
                    <p className="text-sm text-red-100">
                      <span className="font-semibold">{issueRoleLabel(issue.referenceRole)} schema:</span>{' '}
                      {issue.schemaName ?? issue.schemaId} — {issueReasonLabel(issue.reason)}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="text-xs text-red-200">{remediationActionLabel(issue.remediationKey)}</p>
                      <Link
                        to={remediationActionPath(issue)}
                        aria-label={remediationActionLabel(issue.remediationKey)}
                        className="shrink-0 rounded border border-red-700/50 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        data-testid={`cdm-remediation-cta-${issue.referenceRole}-${issue.schemaId}`}
                      >
                        {remediationActionLabel(issue.remediationKey)}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(feedback.orchestration || feedback.artifact) && (
            <div className="mt-2 rounded border border-slate-700/70 bg-slate-950/50 px-3 py-2 text-xs text-slate-300" data-testid="deploy-operation-details">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {feedback.orchestration?.orchestrationId && <span>Orchestration: <span className="font-mono">{feedback.orchestration.orchestrationId}</span></span>}
                {(feedback.orchestration?.finalStatus ?? feedback.orchestration?.status) && (
                  <span>Status: <span className="uppercase">{(feedback.orchestration?.finalStatus ?? feedback.orchestration?.status ?? '').replace(/_/g, ' ')}</span></span>
                )}
                {typeof feedback.orchestration?.attemptCount === 'number' && <span>Attempts: {feedback.orchestration.attemptCount}</span>}
              </div>
              {(feedback.artifact?.artifactId || feedback.artifact?.artifactHash) && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {feedback.artifact?.artifactId && <span>Artifact: <span className="font-mono">{feedback.artifact.artifactId}</span></span>}
                  {feedback.artifact?.artifactHash && <span>Hash: <span className="font-mono">{feedback.artifact.artifactHash.slice(0, 12)}</span></span>}
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={feedback.kind === 'success' ? 'Dismiss success notification' : 'Dismiss error notification'}
          className="rounded p-0.5 hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export interface DeploymentPageProps {
  mappingId: string;
  projectId: string;
  mappingName?: string;
}

export function DeploymentPage({ mappingId, projectId, mappingName }: DeploymentPageProps) {
  const queryClient = useQueryClient();
  const adapter = useAdapter();
  const {
    environment,
    setEnvironment,
    versions,
    currentDeployments,
    deploymentHistory,
    isHistoryLoading,
    historyError,
    isLoading,
    error,
    isRefreshing,
    refreshError,
    lastUpdatedAt,
    isDeploying,
    deployFeedback,
    clearDeployFeedback,
    deploy,
    promote,
    rollback,
    refresh,
  } = useDeploymentPage(mappingId);

  const [pendingPrimary, setPendingPrimary] = useState<PrimaryActionState | null>(null);
  const [pendingRollback, setPendingRollback] = useState<DeploymentRecord | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');

  const editorPath = PATHS.MAPPING_EDITOR.replace(':projectId', projectId).replace(':mappingId', mappingId);

  const handleEditorIntent = (reason: 'hover' | 'focus') => {
    void prefetchMappingEditorByIntent(queryClient, adapter, mappingId, {
      parseTargetSchema: tryParseSchema,
      buildTargetTypeByPathFromSchema,
      normalizeRuleTypesByTargetSchema,
      getErrorInfo,
      debugRuleTypeLog: () => undefined,
    }, reason).catch(() => undefined);
  };

  const candidate = useMemo(() => getDeploymentCandidate(versions), [versions]);

  const snapshots = useMemo<Record<PipelineEnvironment, EnvironmentSnapshot>>(() => {
    const dev = currentDeployments?.DEV?.deployment ?? null;
    const preprod = currentDeployments?.PREPROD?.deployment ?? null;
    const prod = currentDeployments?.PROD?.deployment ?? null;

    const from = (entry: typeof dev): EnvironmentSnapshot => ({
      sourceType: entry?.sourceType ?? null,
      sourceNumber: entry?.sourceNumber ?? null,
      deployedAt: entry?.deployedAt ?? null,
      artifactId: entry?.artifactId,
      artifactHash: entry?.artifactHash,
    });

    return {
      SANDBOX: from(dev),
      DEV: from(dev),
      PREPROD: from(preprod),
      PROD: from(prod),
    };
  }, [currentDeployments]);

  const selectedEnv: PipelineEnvironment = environment === 'SANDBOX'
    ? 'SANDBOX'
    : environment === 'QA'
      ? 'PREPROD'
      : environment;

  const primaryAction: PrimaryActionState = useMemo(() => {
    if (selectedEnv === 'SANDBOX') {
      const hasCandidate = Boolean(candidate);
      return {
        kind: 'deploy',
        targetEnvironment: 'DEV',
        label: hasCandidate ? `Deploy v${candidate?.version ?? ''} to SANDBOX` : 'Deploy to SANDBOX',
        disabled: !hasCandidate || isDeploying,
        ...(hasCandidate ? {} : { reason: 'Create a saved version milestone before deploying.' }),
      };
    }

    if (selectedEnv === 'DEV') {
      const hasCandidate = Boolean(candidate);
      return {
        kind: 'deploy',
        targetEnvironment: 'DEV',
        label: 'Promote SANDBOX snapshot to DEV',
        disabled: !hasCandidate || isDeploying,
        ...(hasCandidate ? {} : { reason: 'A saved version candidate is required before promoting to DEV.' }),
      };
    }

    if (selectedEnv === 'PREPROD') {
      const dev = snapshots.DEV;
      const canPromote = dev.sourceType === 'version';
      return {
        kind: 'promote',
        from: 'DEV',
        to: 'PREPROD',
        label: 'Promote DEV snapshot to PREPROD',
        disabled: !canPromote || isDeploying,
        ...(canPromote ? {} : { reason: 'DEV must have a deployed version snapshot before promotion.' }),
      };
    }

    if (selectedEnv === 'PROD') {
      const preprod = snapshots.PREPROD;
      const canPromote = preprod.sourceType === 'version';
      return {
        kind: 'promote',
        from: 'PREPROD',
        to: 'PROD',
        label: 'Promote PREPROD snapshot to PROD',
        disabled: !canPromote || isDeploying,
        ...(canPromote ? {} : { reason: 'PREPROD must have a deployed version snapshot before promotion.' }),
      };
    }

    return {
      kind: 'none',
      label: 'No action available',
      disabled: true,
      reason: 'No action available for the selected stage.',
    };
  }, [candidate, isDeploying, selectedEnv, snapshots]);

  const readinessChecks: readonly ReadinessCheck[] = useMemo(() => {
    if (selectedEnv === 'SANDBOX') {
      return [
        { key: 'saved-version', label: 'Saved version is available for deploy', passed: Boolean(candidate) },
      ];
    }

    if (selectedEnv === 'DEV') {
      return [
        { key: 'saved-version', label: 'Saved version is available for promotion target', passed: Boolean(candidate) },
        { key: 'dev-runtime-path', label: 'Promotion target runtime path is available', passed: true },
      ];
    }

    if (selectedEnv === 'PREPROD') {
      return [
        { key: 'dev-deployed', label: 'DEV has an active deployed snapshot', passed: snapshots.DEV.sourceType !== null },
        { key: 'dev-version', label: 'DEV active snapshot is version-backed', passed: snapshots.DEV.sourceType === 'version' },
      ];
    }

    return [
      { key: 'preprod-deployed', label: 'PREPROD has an active deployed snapshot', passed: snapshots.PREPROD.sourceType !== null },
      { key: 'preprod-version', label: 'PREPROD active snapshot is version-backed', passed: snapshots.PREPROD.sourceType === 'version' },
    ];
  }, [candidate, selectedEnv, snapshots]);

  const selectedSnapshot = snapshots[selectedEnv];

  const blockers = readinessChecks.filter((check) => !check.passed);

  async function executePrimaryAction(action: PrimaryActionState) {
    if (action.kind === 'deploy') {
      if (!candidate) return;
      await deploy({ environment: action.targetEnvironment, sourceType: 'version', sourceNumber: candidate.version });
      return;
    }

    if (action.kind === 'promote') {
      await promote(action.from, action.to);
    }
  }

  const historyByStage = useMemo<Record<PipelineEnvironment, readonly DeploymentRecord[]>>(() => {
    const sandboxAlias = deploymentHistory.filter((record) => record.environment === 'DEV');
    return {
      SANDBOX: sandboxAlias,
      DEV: sandboxAlias,
      PREPROD: deploymentHistory.filter((record) => record.environment === 'PREPROD'),
      PROD: deploymentHistory.filter((record) => record.environment === 'PROD'),
    };
  }, [deploymentHistory]);

  const combinedHistory = useMemo(() => {
    const filtered = deploymentHistory.filter((record) => {
      if (historyFilter === 'all') return true;
      return getHistoryRecordType(record) === historyFilter;
    });

    return [...filtered].sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime());
  }, [deploymentHistory, historyFilter]);

  function openPrimaryConfirmation() {
    setPendingPrimary(primaryAction);
  }

  function closePrimaryConfirmation() {
    setPendingPrimary(null);
  }

  async function confirmPrimaryAction() {
    if (pendingPrimary) {
      await executePrimaryAction(pendingPrimary);
    }
    setPendingPrimary(null);
  }

  async function confirmRollback() {
    if (!pendingRollback) return;
    await rollback(mapRuntimeEnvironment(selectedEnv), pendingRollback.environmentDeployedAt);
    setPendingRollback(null);
  }

  const selectedHistory = useMemo(
    () => [...historyByStage[selectedEnv]].sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime()),
    [historyByStage, selectedEnv],
  );
  const rollbackTarget = selectedHistory.length > 1 ? selectedHistory[1] : null;
  const canRollback = rollbackTarget !== null;

  function handlePipelineCardKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = PIPELINE_ORDER.indexOf(selectedEnv);
    if (index < 0) {
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = PIPELINE_ORDER[(index + 1) % PIPELINE_ORDER.length];
      if (next) {
        setEnvironment(next);
      }
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = PIPELINE_ORDER[(index - 1 + PIPELINE_ORDER.length) % PIPELINE_ORDER.length];
      if (prev) {
        setEnvironment(prev);
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8" data-testid="deployment-page">
      <PageHeader
        title={mappingName ? `Deploy: ${mappingName}` : 'Deploy Mapping'}
        description="Promote a single immutable snapshot through SANDBOX → DEV → PREPROD → PROD."
        actions={
          <Link
            to={editorPath}
            onMouseEnter={() => handleEditorIntent('hover')}
            onFocus={() => handleEditorIntent('focus')}
            className="rounded text-sm text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            data-testid="back-to-editor-link"
          >
            ← Back to editor
          </Link>
        }
      />

      {deployFeedback && (
        <div className="mb-6">
          <FeedbackBanner feedback={deployFeedback} onDismiss={clearDeployFeedback} />
        </div>
      )}

      {error && (
        <div className="mb-6 space-y-2">
          <ErrorBanner message={error.message} />
          {error.requestId && (
            <p className="text-xs text-slate-400" data-testid="deployment-load-error-request-id">
              Request ID: <span className="font-mono">{error.requestId}</span>
            </p>
          )}
        </div>
      )}

      {!isLoading && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
          <span data-testid="deployment-refresh-status">
            {isRefreshing
              ? 'Refreshing deployment data…'
              : lastUpdatedAt
                ? `Last updated ${new Date(lastUpdatedAt).toLocaleTimeString()}`
                : 'Loaded'}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="rounded border border-slate-700 px-2 py-0.5 text-slate-200 hover:bg-slate-800"
            data-testid="deployment-refresh-button"
          >
            Refresh
          </button>
        </div>
      )}

      {!isLoading && refreshError && (
        <div
          role="status"
          className="mb-4 rounded-md border border-amber-800 bg-amber-950/20 px-3 py-2 text-sm text-amber-200"
          data-testid="deployment-refresh-warning"
        >
          Could not refresh deployment data. Showing cached results.
        </div>
      )}

      {isLoading && (
        <div className="space-y-4" data-testid="deployment-loading" aria-busy="true" aria-label="Loading deployment data">
          <div className="h-24 animate-pulse rounded bg-slate-800" />
          <div className="h-40 animate-pulse rounded bg-slate-800" />
          <div className="h-48 animate-pulse rounded bg-slate-800" />
        </div>
      )}

      {!isLoading && (
        <>
          <section aria-label="Deployment pipeline" className="mb-6" data-testid="deployment-pipeline-cards">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4" role="tablist" aria-label="Deployment stage selector">
              {PIPELINE_ORDER.map((env) => {
                const snapshot = snapshots[env];
                const selected = env === selectedEnv;
                const label = fmtEnv(env);
                return (
                  <button
                    key={env}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onKeyDown={handlePipelineCardKeyDown}
                    onClick={() => setEnvironment(env)}
                    data-testid={`pipeline-card-${env}`}
                    className={[
                      'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      selected
                        ? 'border-blue-500 bg-slate-800'
                        : 'border-slate-700 bg-slate-900 hover:border-slate-500',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-100">{label}</span>
                      <span className="text-xs text-slate-400">{env === 'SANDBOX' ? 'Deploy' : 'Promote'}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{fmtSource(snapshot)}</p>
                    {snapshot.artifactId && (
                      <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{snapshot.artifactId}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3" aria-label="Deployment candidate and readiness">
            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4" data-testid="candidate-panel">
              <div className="mb-3 flex items-center gap-2 text-slate-200">
                <Package size={16} aria-hidden="true" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">Candidate</h2>
              </div>
              {candidate ? (
                <dl className="space-y-1 text-sm text-slate-300">
                  <div><dt className="inline text-slate-400">Version:</dt> <dd className="inline font-mono">v{candidate.version}</dd></div>
                  <div><dt className="inline text-slate-400">From revision:</dt> <dd className="inline font-mono">Rev {candidate.revisionNumber}</dd></div>
                  <div><dt className="inline text-slate-400">Created by:</dt> <dd className="inline">{candidate.createdBy}</dd></div>
                  <div><dt className="inline text-slate-400">Created:</dt> <dd className="inline">{new Date(candidate.createdAt).toLocaleString()}</dd></div>
                </dl>
              ) : (
                <p className="text-sm text-slate-400">No saved versions available yet.</p>
              )}
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4" data-testid="change-summary-panel">
              <div className="mb-3 flex items-center gap-2 text-slate-200">
                <GitBranch size={16} aria-hidden="true" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">Change Summary</h2>
              </div>
              <p className="text-sm text-slate-300">
                {selectedEnv === 'SANDBOX'
                  ? 'Deploy the latest saved version to establish the SANDBOX active snapshot.'
                  : `Promote the currently active ${selectedEnv === 'DEV' ? 'SANDBOX' : selectedEnv === 'PREPROD' ? 'DEV' : 'PREPROD'} snapshot without rebuilding artifacts.`}
              </p>
              <p className="mt-2 text-xs text-slate-500" data-testid="selected-stage-source">
                Active snapshot: {fmtSource(selectedSnapshot)}
              </p>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900 p-4" data-testid="readiness-panel">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-200">Readiness Checks</h2>
              <ul className="space-y-2">
                {readinessChecks.map((check) => (
                  <li
                    key={check.key}
                    className={`text-sm ${check.passed ? 'text-green-300' : 'text-amber-300'}`}
                    data-testid={`readiness-${check.key}`}
                  >
                    {check.passed ? '✓' : '•'} {check.label}
                  </li>
                ))}
              </ul>
              {blockers.length > 0 && (
                <p className="mt-3 text-xs text-amber-300" data-testid="readiness-blocker-message">
                  {primaryAction.reason ?? 'Resolve readiness blockers before continuing.'}
                </p>
              )}
            </div>
          </section>

          <section className="mb-8 flex flex-wrap items-center gap-3" aria-label="Deployment actions">
            <Button
              type="button"
              onClick={openPrimaryConfirmation}
              disabled={primaryAction.disabled}
              data-testid="primary-deployment-action"
            >
              {primaryAction.label}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!canRollback || isDeploying}
              onClick={() => setPendingRollback(rollbackTarget)}
              data-testid="secondary-rollback-action"
            >
              Roll back {fmtEnv(selectedEnv)}
            </Button>
          </section>

          <section aria-label="Deployment history" data-testid="combined-history-section" className="rounded-lg border border-slate-700 bg-slate-900 p-4">
            <div className="mb-3 flex items-center gap-2 text-slate-200">
              <History size={16} aria-hidden="true" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Combined History — {fmtEnv(selectedEnv)}</h2>
            </div>
            <div className="mb-3 flex flex-wrap gap-2" role="toolbar" aria-label="History filters">
              {HISTORY_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setHistoryFilter(filter)}
                  aria-label={`Filter history: ${filter}`}
                  aria-pressed={historyFilter === filter}
                  data-testid={`history-filter-${filter}`}
                  className={[
                    'rounded border px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    historyFilter === filter
                      ? 'border-blue-500 bg-blue-900/30 text-blue-200'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800',
                  ].join(' ')}
                >
                  {filter === 'all' ? 'All' : filter === 'deploy' ? 'Deploys' : filter === 'promote' ? 'Promotions' : 'Rollbacks'}
                </button>
              ))}
            </div>

            {isHistoryLoading && <p className="text-sm text-slate-400" data-testid="history-loading">Loading history…</p>}
            {!isHistoryLoading && historyError && (
              <div>
                <p className="text-sm text-red-300" data-testid="history-error">{historyError.message}</p>
                {historyError.requestId && <p className="mt-1 text-xs text-slate-400">Request ID: <span className="font-mono">{historyError.requestId}</span></p>}
              </div>
            )}
            {!isHistoryLoading && !historyError && combinedHistory.length === 0 && (
              <p className="text-sm text-slate-400" data-testid="history-empty">No deployment records for this stage yet.</p>
            )}

            {!isHistoryLoading && !historyError && combinedHistory.length > 0 && (
              <div className="overflow-x-auto rounded border border-slate-700">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-800/60 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Environment</th>
                      <th className="px-3 py-2">Source</th>
                      <th className="px-3 py-2">Artifact</th>
                      <th className="px-3 py-2">Hash</th>
                      <th className="px-3 py-2">Deployed</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody data-testid="history-table-body">
                    {combinedHistory.map((record) => {
                      const recordType = getHistoryRecordType(record);
                      const notes = recordType === 'rollback'
                        ? 'Rollback'
                        : recordType === 'promote'
                          ? `Promoted from ${record.promotedFrom}`
                          : 'Deploy';

                      return (
                        <tr key={record.environmentDeployedAt} className="border-t border-slate-800 text-slate-300">
                          <td className="px-3 py-2">{record.environment}</td>
                          <td className="px-3 py-2 font-mono">
                            {record.sourceType === 'revision' ? `Rev ${record.sourceNumber}` : `v${record.sourceNumber}`}
                          </td>
                          <td className="px-3 py-2 font-mono" data-testid={`history-artifact-${record.environmentDeployedAt}`}>{record.artifactId ?? '—'}</td>
                          <td className="px-3 py-2 font-mono">{record.artifactHash ? record.artifactHash.slice(0, 12) : '—'}</td>
                          <td className="px-3 py-2">{new Date(record.deployedAt).toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs text-slate-400">{notes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingPrimary)}
        title="Confirm deployment action"
        message={pendingPrimary?.label ?? ''}
        confirmLabel={pendingPrimary?.kind === 'deploy' ? 'Deploy' : 'Promote'}
        cancelLabel="Cancel"
        onConfirm={() => {
          void confirmPrimaryAction();
        }}
        onCancel={closePrimaryConfirmation}
      />

      <ConfirmDialog
        open={Boolean(pendingRollback)}
        title="Confirm rollback"
        message={pendingRollback
          ? `Roll back ${fmtEnv(selectedEnv)} to ${pendingRollback.sourceType === 'revision' ? `Rev ${pendingRollback.sourceNumber}` : `v${pendingRollback.sourceNumber}`}?`
          : ''}
        confirmLabel="Rollback"
        cancelLabel="Cancel"
        onConfirm={() => {
          void confirmRollback();
        }}
        onCancel={() => setPendingRollback(null)}
      />
    </div>
  );
}
