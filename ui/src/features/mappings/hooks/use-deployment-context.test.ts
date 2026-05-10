import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useDeploymentContext } from './use-deployment-context';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import type { DeploymentContext } from '@/lib/types';


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAPPING_ID = 'mapping-xyz';

function makeContext(overrides?: Partial<DeploymentContext>): DeploymentContext {
  return {
    mappingId: MAPPING_ID,
    mappingName: 'Test Mapping',
    projectId: 'proj-1',
    projectName: 'Test Project',
    environments: [
      { environment: 'DEV', status: 'deployed', deployedVersion: 3, deployedAt: '2026-01-01T00:00:00Z' },
      { environment: 'QA', status: 'not-deployed' },
      { environment: 'PROD', status: 'stale', deployedVersion: 1, deployedAt: '2025-06-01T00:00:00Z' },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function makeAdapter(
  getDeploymentContext: ApiAdapter['getDeploymentContext'],
): Partial<ApiAdapter> {
  return { getDeploymentContext };
}

function makeWrapper(adapter: Partial<ApiAdapter>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      AdapterProvider,
      { adapter: adapter as ApiAdapter },
      children,
    );
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDeploymentContext', () => {
  it('loads deployment context and populates environmentStatus', async () => {
    const ctx = makeContext();
    const adapter = makeAdapter(vi.fn().mockResolvedValue(ctx));

    const { result } = renderHook(
      () => useDeploymentContext(MAPPING_ID),
      { wrapper: makeWrapper(adapter) },
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.deploymentContext).toEqual(ctx);
    expect(result.current.error).toBeNull();
    expect(result.current.environmentStatus.get('DEV')?.status).toBe('deployed');
    expect(result.current.environmentStatus.get('QA')?.status).toBe('not-deployed');
    expect(result.current.environmentStatus.get('PROD')?.status).toBe('stale');
  });

  it('current-vs-saved is always available regardless of environment status', async () => {
    // All environments not-deployed
    const ctx = makeContext({
      environments: [
        { environment: 'DEV', status: 'not-deployed' },
        { environment: 'QA', status: 'not-deployed' },
        { environment: 'PROD', status: 'not-deployed' },
      ],
    });
    const adapter = makeAdapter(vi.fn().mockResolvedValue(ctx));

    const { result } = renderHook(
      () => useDeploymentContext(MAPPING_ID),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isModeAvailable('current-vs-saved')).toEqual({ available: true });
  });

  it('isModeAvailable returns correct results based on environment status', async () => {
    // DEV deployed, QA not-deployed, PROD stale
    const ctx = makeContext();
    const adapter = makeAdapter(vi.fn().mockResolvedValue(ctx));

    const { result } = renderHook(
      () => useDeploymentContext(MAPPING_ID),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // current-vs-dev: DEV is deployed → available
    expect(result.current.isModeAvailable('current-vs-dev')).toEqual({ available: true });

    // current-vs-qa: QA is not-deployed → unavailable
    expect(result.current.isModeAvailable('current-vs-qa').available).toBe(false);
    expect(result.current.isModeAvailable('current-vs-qa').reason).toContain('QA');

    // dev-vs-qa: DEV deployed but QA not-deployed → unavailable
    expect(result.current.isModeAvailable('dev-vs-qa').available).toBe(false);

    // qa-vs-prod: QA not-deployed → unavailable
    expect(result.current.isModeAvailable('qa-vs-prod').available).toBe(false);
  });

  it('all environment modes unavailable when adapter throws (Phase 0)', async () => {
    const adapter = makeAdapter(
      vi.fn().mockRejectedValue(new Error('Not available in offline mode')),
    );

    const { result } = renderHook(
      () => useDeploymentContext(MAPPING_ID),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.deploymentContext).toBeNull();

    // current-vs-saved still available
    expect(result.current.isModeAvailable('current-vs-saved')).toEqual({ available: true });

    // All environment modes unavailable
    expect(result.current.isModeAvailable('current-vs-dev')).toEqual({
      available: false,
      reason: 'requires backend connection',
    });
    expect(result.current.isModeAvailable('current-vs-qa')).toEqual({
      available: false,
      reason: 'requires backend connection',
    });
    expect(result.current.isModeAvailable('dev-vs-qa')).toEqual({
      available: false,
      reason: 'requires backend connection',
    });
    expect(result.current.isModeAvailable('qa-vs-prod')).toEqual({
      available: false,
      reason: 'requires backend connection',
    });
  });

  it('sets error state on adapter failure', async () => {
    const adapter = makeAdapter(
      vi.fn().mockRejectedValue(new Error('Network error')),
    );

    const { result } = renderHook(
      () => useDeploymentContext(MAPPING_ID),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Network error');
    expect(result.current.deploymentContext).toBeNull();
    expect(result.current.environmentStatus.size).toBe(0);
  });

  it('refresh re-fetches deployment context', async () => {
    const ctx = makeContext();
    const fetchFn = vi.fn().mockResolvedValue(ctx);
    const adapter = makeAdapter(fetchFn);

    const { result } = renderHook(
      () => useDeploymentContext(MAPPING_ID),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchFn).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('all environments deployed makes all modes available', async () => {
    const ctx = makeContext({
      environments: [
        { environment: 'DEV', status: 'deployed', deployedVersion: 1, deployedAt: '2026-01-01T00:00:00Z' },
        { environment: 'QA', status: 'deployed', deployedVersion: 2, deployedAt: '2026-01-02T00:00:00Z' },
        { environment: 'PROD', status: 'deployed', deployedVersion: 3, deployedAt: '2026-01-03T00:00:00Z' },
      ],
    });
    const adapter = makeAdapter(vi.fn().mockResolvedValue(ctx));

    const { result } = renderHook(
      () => useDeploymentContext(MAPPING_ID),
      { wrapper: makeWrapper(adapter) },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isModeAvailable('current-vs-saved')).toEqual({ available: true });
    expect(result.current.isModeAvailable('current-vs-dev')).toEqual({ available: true });
    expect(result.current.isModeAvailable('current-vs-qa')).toEqual({ available: true });
    expect(result.current.isModeAvailable('dev-vs-qa')).toEqual({ available: true });
    expect(result.current.isModeAvailable('qa-vs-prod')).toEqual({ available: true });
  });
});
