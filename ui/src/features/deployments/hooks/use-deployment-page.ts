import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdapter } from '@/lib/api';
import type { CurrentDeployments, DeploymentRecord, DeploymentSourceType } from '@/lib/api/types';
import type { Environment, MappingRevision, MappingVersion } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeployTarget = Environment;

export interface DeployInput {
  environment: Environment;
  sourceType: DeploymentSourceType;
  sourceNumber: number;
}

export interface UseDeploymentPageResult {
  /** Selected environment tab */
  environment: DeployTarget;
  /** Set the active environment */
  setEnvironment: (env: DeployTarget) => void;

  /** Revision list — sorted descending */
  revisions: readonly MappingRevision[];
  /** Version list — sorted descending */
  versions: readonly MappingVersion[];
  /** Current deployments per environment, or null while loading */
  currentDeployments: CurrentDeployments | null;

  /** Deployment history for the selected environment */
  deploymentHistory: readonly DeploymentRecord[];
  /** True while history is loading */
  isHistoryLoading: boolean;
  /** History load error, or null */
  historyError: string | null;

  /** True while initial data is loading */
  isLoading: boolean;
  /** Error message, or null */
  error: string | null;

  /** Whether a deploy/promote/rollback action is in progress */
  isDeploying: boolean;
  /** Feedback message after a deploy/promote/rollback (success or error) */
  deployFeedback: { kind: 'success' | 'error'; message: string } | null;
  /** Clear the deploy feedback banner */
  clearDeployFeedback: () => void;

  /** Execute a deploy */
  deploy: (input: DeployInput) => Promise<void>;
  /** Promote the current deployment of fromEnvironment to toEnvironment */
  promote: (fromEnvironment: Environment, toEnvironment: Environment) => Promise<void>;
  /** Rollback environment to a previous deployment snapshot */
  rollback: (environment: Environment, deploymentSK: string) => Promise<void>;

  /** Refresh all data */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDeploymentPage(mappingId: string): UseDeploymentPageResult {
  const adapter = useAdapter();

  const [environment, setEnvironmentState] = useState<DeployTarget>('DEV');
  const [revisions, setRevisions] = useState<readonly MappingRevision[]>([]);
  const [versions, setVersions] = useState<readonly MappingVersion[]>([]);
  const [currentDeployments, setCurrentDeployments] = useState<CurrentDeployments | null>(null);
  const [deploymentHistory, setDeploymentHistory] = useState<readonly DeploymentRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployFeedback, setDeployFeedback] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);

  const mountedRef = useRef(true);

  // ---------------------------------------------------------------------------
  // Load history
  // ---------------------------------------------------------------------------

  const loadHistory = useCallback(
    async (env: Environment) => {
      setIsHistoryLoading(true);
      setHistoryError(null);
      try {
        const records = await adapter.listDeployments(mappingId, { environment: env });
        if (!mountedRef.current) return;
        // Sort descending by deployedAt
        const sorted = [...records].sort(
          (a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime(),
        );
        setDeploymentHistory(sorted);
      } catch (err) {
        if (!mountedRef.current) return;
        setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
        setDeploymentHistory([]);
      } finally {
        if (mountedRef.current) {
          setIsHistoryLoading(false);
        }
      }
    },
    [adapter, mappingId],
  );

  // ---------------------------------------------------------------------------
  // Load initial data
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [revisionList, versionList, deployments] = await Promise.all([
        adapter.listRevisions(mappingId),
        adapter.listVersions(mappingId),
        adapter.getCurrentDeployments(mappingId),
      ]);
      if (!mountedRef.current) return;
      setRevisions([...revisionList].sort((a, b) => b.revision - a.revision));
      setVersions([...versionList].sort((a, b) => b.version - a.version));
      setCurrentDeployments(deployments);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load deployment data');
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [adapter, mappingId]);

  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Reload history whenever the selected environment changes
  const setEnvironment = useCallback(
    (env: Environment) => {
      setEnvironmentState(env);
      void loadHistory(env);
    },
    [loadHistory],
  );

  // Load initial history for DEV on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory('DEV');
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Refresh current deployments (used after mutating actions)
  // ---------------------------------------------------------------------------

  const refreshCurrentDeployments = useCallback(async () => {
    try {
      const updated = await adapter.getCurrentDeployments(mappingId);
      if (mountedRef.current) setCurrentDeployments(updated);
    } catch {
      // non-critical
    }
  }, [adapter, mappingId]);

  // ---------------------------------------------------------------------------
  // Deploy
  // ---------------------------------------------------------------------------

  const deploy = useCallback(
    async (input: DeployInput): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
        const record: DeploymentRecord = await adapter.deployMapping(mappingId, input);
        if (!mountedRef.current) return;
        const label =
          record.sourceType === 'revision'
            ? `Rev ${record.sourceNumber}`
            : `v${record.sourceNumber}`;
        setDeployFeedback({
          kind: 'success',
          message: `${label} deployed to ${record.environment} successfully.`,
        });
        await refreshCurrentDeployments();
        void loadHistory(input.environment);
      } catch (err) {
        if (!mountedRef.current) return;
        setDeployFeedback({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Deploy failed',
        });
      } finally {
        if (mountedRef.current) {
          setIsDeploying(false);
        }
      }
    },
    [adapter, mappingId, refreshCurrentDeployments, loadHistory],
  );

  // ---------------------------------------------------------------------------
  // Promote
  // ---------------------------------------------------------------------------

  const promote = useCallback(
    async (fromEnvironment: Environment, toEnvironment: Environment): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
        const record = await adapter.promoteDeployment(mappingId, {
          fromEnvironment,
          toEnvironment,
        });
        if (!mountedRef.current) return;
        const label = `v${record.sourceNumber}`;
        setDeployFeedback({
          kind: 'success',
          message: `${label} promoted from ${fromEnvironment} to ${toEnvironment} successfully.`,
        });
        await refreshCurrentDeployments();
        void loadHistory(toEnvironment);
      } catch (err) {
        if (!mountedRef.current) return;
        setDeployFeedback({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Promote failed',
        });
      } finally {
        if (mountedRef.current) {
          setIsDeploying(false);
        }
      }
    },
    [adapter, mappingId, refreshCurrentDeployments, loadHistory],
  );

  // ---------------------------------------------------------------------------
  // Rollback
  // ---------------------------------------------------------------------------

  const rollback = useCallback(
    async (env: Environment, deploymentSK: string): Promise<void> => {
      setIsDeploying(true);
      setDeployFeedback(null);
      try {
        const record = await adapter.rollbackDeployment(mappingId, {
          environment: env,
          deploymentSK,
        });
        if (!mountedRef.current) return;
        const label =
          record.sourceType === 'revision'
            ? `Rev ${record.sourceNumber}`
            : `v${record.sourceNumber}`;
        setDeployFeedback({
          kind: 'success',
          message: `Rolled back ${env} to ${label}.`,
        });
        await refreshCurrentDeployments();
        void loadHistory(env);
      } catch (err) {
        if (!mountedRef.current) return;
        setDeployFeedback({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Rollback failed',
        });
      } finally {
        if (mountedRef.current) {
          setIsDeploying(false);
        }
      }
    },
    [adapter, mappingId, refreshCurrentDeployments, loadHistory],
  );

  const clearDeployFeedback = useCallback(() => setDeployFeedback(null), []);

  const refresh = useCallback(() => {
    void load();
    void loadHistory(environment);
  }, [load, loadHistory, environment]);

  return {
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
    refresh,
  };
}
