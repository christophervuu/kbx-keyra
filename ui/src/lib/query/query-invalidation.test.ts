import { describe, expect, it } from 'vitest';

import { queryInvalidationKeys } from './query-invalidation';

describe('query-invalidation keys', () => {
  it('supports family/list/detail targeting for major domains', () => {
    expect(queryInvalidationKeys.projects.family()).toEqual(['projects']);
    expect(queryInvalidationKeys.projects.list()).toEqual(['projects', 'list']);
    expect(queryInvalidationKeys.projects.detail('project-1')).toEqual([
      'projects',
      'detail',
      'project-1',
    ]);

    expect(queryInvalidationKeys.mappings.family()).toEqual(['mappings']);
    expect(queryInvalidationKeys.schemas.family()).toEqual(['schemas']);
    expect(queryInvalidationKeys.settings.family()).toEqual(['settings']);
    expect(queryInvalidationKeys.valueTables.family()).toEqual(['value-tables']);
  });

  it('supports deployment summary/context/history targeting', () => {
    expect(queryInvalidationKeys.deployments.family()).toEqual(['deployments']);
    expect(queryInvalidationKeys.deployments.summaryList()).toEqual(['deployments', 'summary']);
    expect(queryInvalidationKeys.deployments.globalOverviewList()).toEqual([
      'deployments',
      'overview',
      'global',
    ]);
    expect(queryInvalidationKeys.deployments.projectOverviewList()).toEqual([
      'deployments',
      'overview',
      'project',
    ]);
    expect(queryInvalidationKeys.deployments.globalOverview({ attentionState: 'NEEDS_ATTENTION' })).toEqual([
      'deployments',
      'overview',
      'global',
      { attentionState: 'NEEDS_ATTENTION' },
    ]);
    expect(queryInvalidationKeys.deployments.projectOverview('project-1', { environment: 'DEV' })).toEqual([
      'deployments',
      'overview',
      'project',
      'project-1',
      { environment: 'DEV' },
    ]);
    expect(queryInvalidationKeys.deployments.context('mapping-1')).toEqual([
      'deployments',
      'context',
      'mapping-1',
    ]);
    expect(queryInvalidationKeys.deployments.history('mapping-1', { environment: 'DEV' })).toEqual([
      'deployments',
      'history',
      'mapping-1',
      { environment: 'DEV' },
    ]);
  });
});
