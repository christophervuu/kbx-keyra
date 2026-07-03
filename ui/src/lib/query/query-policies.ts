export interface QueryPolicy {
  readonly staleTime: number;
  readonly gcTime: number;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/**
 * FS-103 Rev 2 exact initial cache policy defaults.
 */
export const queryPolicies = {
  homeDashboard: {
    staleTime: 60 * SECOND,
    gcTime: 10 * MINUTE,
  },
  projectsList: {
    staleTime: 60 * SECOND,
    gcTime: 10 * MINUTE,
  },
  projectDetail: {
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
  },
  projectMappingsList: {
    staleTime: 60 * SECOND,
    gcTime: 10 * MINUTE,
  },
  savedMappingConfig: {
    staleTime: 10 * MINUTE,
    gcTime: 30 * MINUTE,
  },
  schemasList: {
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
  },
  schemaDetail: {
    staleTime: 30 * MINUTE,
    gcTime: 45 * MINUTE,
  },
  schemaUsage: {
    staleTime: 5 * MINUTE,
    gcTime: 15 * MINUTE,
  },
  mappingVersions: {
    staleTime: 60 * SECOND,
    gcTime: 10 * MINUTE,
  },
  deploymentSummaryContext: {
    staleTime: 15 * SECOND,
    gcTime: 5 * MINUTE,
  },
  deploymentHistory: {
    staleTime: 60 * SECOND,
    gcTime: 10 * MINUTE,
  },
  settings: {
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  },
} satisfies Record<string, QueryPolicy>;
