import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPrefetchDiagnosticsSnapshot,
  prefetchProjectOverview,
  resetPrefetchDiagnostics,
} from './prefetch-definitions';
import { queryKeys } from './query-keys';
import { queryPolicies } from './query-policies';

import type { ApiAdapter } from '@/lib/api';
import type { ProjectDetail } from '@/lib/types/domain';

function makeProjectDetail(projectId: string): ProjectDetail {
  return {
    projectId,
    name: 'Project Alpha',
    description: 'desc',
    slug: 'project-alpha',
    schemaRefs: [],
    linkedSchemaIds: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    mappings: [],
  };
}

function createAdapter(projectId: string): ApiAdapter {
  return {
    getProject: vi.fn().mockResolvedValue(makeProjectDetail(projectId)),
    getSchema: vi.fn(),
    getCurrentDeployments: vi.fn(),
  } as unknown as ApiAdapter;
}

describe('prefetch-definitions', () => {
  beforeEach(() => {
    resetPrefetchDiagnostics();
  });

  it('prefetchProjectOverview warms canonical destination query key', async () => {
    const projectId = 'proj-1';
    const adapter = createAdapter(projectId);
    const queryClient = new QueryClient();

    const started = await prefetchProjectOverview(queryClient, adapter, projectId, 'hover');
    expect(started).toBe(true);

    expect(queryClient.getQueryData(queryKeys.projects.detail(projectId))).toBeTruthy();
    expect(adapter.getProject).toHaveBeenCalledWith(projectId);
  });

  it('prefetchProjectOverview is bounded and skips repeated trigger within cooldown', async () => {
    const projectId = 'proj-1';
    const adapter = createAdapter(projectId);
    const queryClient = new QueryClient();

    const first = await prefetchProjectOverview(queryClient, adapter, projectId, 'hover');
    const second = await prefetchProjectOverview(queryClient, adapter, projectId, 'hover');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(adapter.getProject).toHaveBeenCalledTimes(1);
  });

  it('prefetchProjectOverview skips when cached data is still fresh', async () => {
    const projectId = 'proj-1';
    const adapter = createAdapter(projectId);
    const queryClient = new QueryClient();

    queryClient.setQueryData(queryKeys.projects.detail(projectId), {
      project: makeProjectDetail(projectId),
      schemaDetails: [],
      mappingsMeta: [],
      deploymentsMap: new Map(),
    });

    const started = await prefetchProjectOverview(queryClient, adapter, projectId, 'focus');

    expect(started).toBe(false);
    expect(adapter.getProject).not.toHaveBeenCalled();

    const snapshot = getPrefetchDiagnosticsSnapshot();
    expect(snapshot.attempts).toBe(1);
    expect(snapshot.skipped).toBe(1);
    expect(snapshot.reasons.focus).toBe(1);
    expect(snapshot.keys[JSON.stringify(queryKeys.projects.detail(projectId))]).toBe(1);
    expect(queryPolicies.projectDetail.staleTime).toBeGreaterThan(0);
  });
});
