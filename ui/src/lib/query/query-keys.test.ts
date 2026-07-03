import { describe, expect, it } from 'vitest';

import { queryKeys, stableParams } from './query-keys';

describe('query-keys', () => {
  it('defines home dashboard key namespace', () => {
    expect(queryKeys.home.family()).toEqual(['home']);
    expect(queryKeys.home.dashboard()).toEqual(['home', 'dashboard']);
  });

  it('stableParams sorts object keys and removes undefined values', () => {
    const a = stableParams({ b: 2, a: 1, c: undefined });
    const b = stableParams({ a: 1, b: 2 });

    expect(a).toEqual({ a: 1, b: 2 });
    expect(a).toEqual(b);
  });

  it('produces deterministic project list key for equivalent params', () => {
    const keyA = queryKeys.projects.all({ sortDirection: 'asc', sortBy: 'name', page: 1 });
    const keyB = queryKeys.projects.all({ page: 1, sortBy: 'name', sortDirection: 'asc' });

    expect(keyA).toEqual(keyB);
  });

  it('includes identifiers for detail and scoped collection keys', () => {
    expect(queryKeys.projects.detail('project-1')).toEqual(['projects', 'detail', 'project-1']);
    expect(queryKeys.mappings.detail('mapping-1')).toEqual(['mappings', 'detail', 'mapping-1']);
    expect(queryKeys.mappings.versions('mapping-1')).toEqual(['mappings', 'versions', 'mapping-1']);
    expect(queryKeys.schemas.detail('schema-1')).toEqual(['schemas', 'detail', 'schema-1']);
    expect(queryKeys.schemas.usage('schema-1')).toEqual(['schemas', 'usage', 'schema-1']);
    expect(queryKeys.settings.project('project-1')).toEqual(['settings', 'project', 'project-1']);
  });

  it('includes environment dimension only where resource is environment-specific', () => {
    const envScoped = queryKeys.deployments.summary('DEV');
    expect(envScoped).toEqual(['deployments', 'summary', { environment: 'DEV' }]);

    const projectList = queryKeys.projects.all({ query: 'abc' });
    expect(projectList).toEqual(['projects', 'list', { query: 'abc' }]);
    expect(projectList).not.toContain('DEV');
  });
});
