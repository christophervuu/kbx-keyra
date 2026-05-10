import { useCallback, useEffect, useState } from 'react';

import { COMPARISON_MODES } from '../types';

import { useAdapter } from '@/lib/api/adapter-provider';
import type {
  ComparisonMode,
  DeploymentContext,
  DeploymentEnvironmentStatus,
  Environment,
} from '@/lib/types';

// ---------------------------------------------------------------------------

export interface ModeAvailability {
  readonly available: boolean;
  readonly reason?: string;
}

export interface UseDeploymentContextReturn {
  /** Raw deployment context loaded from the adapter, or `null` while loading / on error */
  deploymentContext: DeploymentContext | null;
  /** `true` while the initial (or refresh) load is in-flight */
  isLoading: boolean;
  /** User-facing error message, or `null` when no error */
  error: string | null;
  /**
   * Per-environment derived status map.
   * Populated from `deploymentContext.environments` once loaded.
   * Empty map while loading or on error.
   */
  environmentStatus: Map<Environment, DeploymentEnvironmentStatus>;
  /**
   * Returns whether a comparison mode can be executed given current
   * environment availability.
   *
   * - `current-vs-saved`: always available (client-only, no backend needed)
   * - All other modes: require the relevant environment(s) to have
   *   `status === 'deployed'`
   * - When adapter threw on load (Phase 0): all environment modes unavailable
   */
  isModeAvailable: (mode: ComparisonMode) => ModeAvailability;
  /** Re-fetch deployment context from the adapter */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Loads `DeploymentContext` for a mapping and derives per-environment and
 * per-comparison-mode availability.
 *
 * Phase 0 behaviour: if `adapter.getDeploymentContext()` throws (e.g.
 * LocalStorageAdapter stub), all environment-based modes are marked
 * unavailable with reason "requires backend connection".
 *
 * Must be rendered inside an `<AdapterProvider>`.
 */
export function useDeploymentContext(mappingId: string): UseDeploymentContextReturn {
  const adapter = useAdapter();

  const [deploymentContext, setDeploymentContext] = useState<DeploymentContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [environmentStatus, setEnvironmentStatus] = useState<
    Map<Environment, DeploymentEnvironmentStatus>
  >(new Map());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const ctx = await adapter.getDeploymentContext(mappingId);
      setDeploymentContext(ctx);

      const statusMap = new Map<Environment, DeploymentEnvironmentStatus>();
      for (const envStatus of ctx.environments) {
        statusMap.set(envStatus.environment, envStatus);
      }
      setEnvironmentStatus(statusMap);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || 'Failed to load deployment context');
      setDeploymentContext(null);
      setEnvironmentStatus(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [adapter, mappingId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const isModeAvailable = useCallback(
    (mode: ComparisonMode): ModeAvailability => {
      // current-vs-saved is always available — pure client-side execution
      if (mode === 'current-vs-saved') {
        return { available: true };
      }

      // If we have an error (e.g. Phase 0 adapter threw), all env modes are unavailable
      if (error !== null) {
        return { available: false, reason: 'requires backend connection' };
      }

      // If still loading, treat as unavailable
      if (isLoading) {
        return { available: false, reason: 'loading deployment status' };
      }

      const modeConfig = COMPARISON_MODES[mode];
      const requiredEnvironments: Environment[] = [];

      if (modeConfig.left.environment !== undefined) {
        requiredEnvironments.push(modeConfig.left.environment);
      }
      if (modeConfig.right.environment !== undefined) {
        requiredEnvironments.push(modeConfig.right.environment);
      }

      for (const env of requiredEnvironments) {
        const envStatus = environmentStatus.get(env);
        if (envStatus === undefined || envStatus.status !== 'deployed') {
          return {
            available: false,
            reason: `${env} has no active deployment`,
          };
        }
      }

      return { available: true };
    },
    [error, isLoading, environmentStatus],
  );

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return {
    deploymentContext,
    isLoading,
    error,
    environmentStatus,
    isModeAvailable,
    refresh,
  };
}
