import { describe, expect, it } from 'vitest';

import { queryPolicies } from './query-policies';

describe('query-policies', () => {
  it('matches FS-103 Rev 2 exact baseline defaults', () => {
    expect(queryPolicies.homeDashboard).toEqual({ staleTime: 60_000, gcTime: 600_000 });
    expect(queryPolicies.projectsList).toEqual({ staleTime: 60_000, gcTime: 600_000 });
    expect(queryPolicies.projectDetail).toEqual({ staleTime: 300_000, gcTime: 900_000 });
    expect(queryPolicies.projectMappingsList).toEqual({ staleTime: 60_000, gcTime: 600_000 });
    expect(queryPolicies.savedMappingConfig).toEqual({ staleTime: 600_000, gcTime: 1_800_000 });
    expect(queryPolicies.schemasList).toEqual({ staleTime: 300_000, gcTime: 900_000 });
    expect(queryPolicies.schemaDetail).toEqual({ staleTime: 1_800_000, gcTime: 2_700_000 });
    expect(queryPolicies.schemaUsage).toEqual({ staleTime: 300_000, gcTime: 900_000 });
    expect(queryPolicies.mappingVersions).toEqual({ staleTime: 60_000, gcTime: 600_000 });
    expect(queryPolicies.deploymentSummaryContext).toEqual({ staleTime: 15_000, gcTime: 300_000 });
    expect(queryPolicies.deploymentHistory).toEqual({ staleTime: 60_000, gcTime: 600_000 });
    expect(queryPolicies.settings).toEqual({
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    });
  });
});
