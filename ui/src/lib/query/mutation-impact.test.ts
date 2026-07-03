import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  cancelDeploymentContextReads,
  cancelProjectDetailReads,
  cancelSchemaDetailReads,
  clearIncompatibleQueryCache,
  invalidateDeploymentDependents,
  invalidateMappingDependents,
  invalidateProjectDetailDependents,
  invalidateProjectSummaries,
  invalidateSchemaDependents,
  invalidateValueTableDependents,
  removeMappingCaches,
  removeProjectCaches,
} from './mutation-impact';
import { queryKeys } from './query-keys';

function makeQueryClientSpies() {
  return {
    clear: vi.fn(),
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    removeQueries: vi.fn(),
  } as unknown as QueryClient;
}

describe('mutation-impact helpers', () => {
  it('cancels relevant in-flight reads before mutation cache handling', async () => {
    const queryClient = makeQueryClientSpies();

    await cancelProjectDetailReads(queryClient, 'project-1');
    await cancelSchemaDetailReads(queryClient, 'schema-1');
    await cancelDeploymentContextReads(queryClient, 'mapping-1');

    expect(queryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'detail', 'project-1'] });
    expect(queryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: ['schemas', 'detail', 'schema-1'] });
    expect(queryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: queryKeys.deployments.context('mapping-1') });
    expect(queryClient.cancelQueries).toHaveBeenCalledWith({ queryKey: queryKeys.deployments.history('mapping-1') });
  });

  it('invalidates project and dashboard dependents', () => {
    const queryClient = makeQueryClientSpies();

    invalidateProjectSummaries(queryClient);
    invalidateProjectDetailDependents(queryClient, 'project-1');

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'list'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['home', 'dashboard'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'detail', 'project-1'] });
  });

  it('invalidates schema/mapping/deployment/value-table dependents', () => {
    const queryClient = makeQueryClientSpies();

    invalidateSchemaDependents(queryClient, 'schema-1');
    invalidateMappingDependents(queryClient, 'project-1', 'mapping-1');
    invalidateDeploymentDependents(queryClient, 'mapping-1');
    invalidateValueTableDependents(queryClient, 'project-1');

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['schemas', 'detail', 'schema-1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['schemas', 'list'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['schemas', 'usage', 'schema-1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['mappings', 'detail', 'mapping-1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['deployments', 'context', 'mapping-1'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.deployments.history('mapping-1') });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['value-tables'] });
  });

  it('removes detail caches for delete operations and invalidates affected summaries', () => {
    const queryClient = makeQueryClientSpies();

    removeProjectCaches(queryClient, 'project-1', ['mapping-1']);
    removeMappingCaches(queryClient, 'mapping-1');

    expect(queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: ['projects', 'detail', 'project-1'], exact: true });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: queryKeys.projects.mappings('project-1'), exact: false });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: ['settings', 'project', 'project-1'], exact: true });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: ['mappings', 'detail', 'mapping-1'], exact: true });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: ['deployments', 'context', 'mapping-1'], exact: true });
    expect(queryClient.removeQueries).toHaveBeenCalledWith({ queryKey: queryKeys.deployments.history('mapping-1'), exact: false });
  });

  it('clears incompatible cache on backend context switch', () => {
    const queryClient = makeQueryClientSpies();

    clearIncompatibleQueryCache(queryClient);

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });
});
