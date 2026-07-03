import { useQuery } from '@tanstack/react-query';

import { loadSchemaUsageData } from './schema-query-data';

import { useAdapter } from '@/lib/api';
import { queryKeys, queryPolicies } from '@/lib/query';

export interface UsageProject {
  readonly projectId: string;
  readonly name: string;
}

export interface UsageMapping {
  readonly mappingId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly name: string;
  readonly role: 'source' | 'target';
  readonly updatedAt?: string;
}

export interface UseSchemaUsageResult {
  readonly projects: UsageProject[];
  readonly mappings: UsageMapping[];
  readonly isLoading: boolean;
}

/**
 * Query-backed usage derivation for a schema.
 * Errors are non-blocking for the Schema Detail page usage section.
 */
export function useSchemaUsage(schemaId: string): UseSchemaUsageResult {
  const adapter = useAdapter();

  const usageQuery = useQuery({
    queryKey: queryKeys.schemas.usage(schemaId),
    staleTime: queryPolicies.schemaUsage.staleTime,
    gcTime: queryPolicies.schemaUsage.gcTime,
    retry: false,
    queryFn: () => loadSchemaUsageData(adapter, schemaId),
  });

  if (usageQuery.isError && !usageQuery.data) {
    return {
      projects: [],
      mappings: [],
      isLoading: usageQuery.isPending,
    };
  }

  return {
    projects: usageQuery.data?.projects ?? [],
    mappings: usageQuery.data?.mappings ?? [],
    isLoading: usageQuery.isPending,
  };
}
