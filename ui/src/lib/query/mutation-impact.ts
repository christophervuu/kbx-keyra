import type { QueryClient } from '@tanstack/react-query';

import { queryInvalidationKeys } from './query-invalidation';
import { queryKeys } from './query-keys';

import { resetQueryClient } from '@/lib/query-client';

/**
 * FS-103 T-05 mutation impact matrix helpers.
 *
 * These helpers centralize targeted cancel/invalidate/remove operations so
 * mutation callsites stay consistent with Rev 2 rules.
 */

export async function cancelProjectDetailReads(queryClient: QueryClient, projectId: string): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryInvalidationKeys.projects.detail(projectId) });
}

export async function cancelSchemaDetailReads(queryClient: QueryClient, schemaId: string): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryInvalidationKeys.schemas.detail(schemaId) });
}

export async function cancelDeploymentContextReads(queryClient: QueryClient, mappingId: string): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryInvalidationKeys.deployments.context(mappingId) });
  await queryClient.cancelQueries({ queryKey: queryInvalidationKeys.deployments.history(mappingId) });
}

export async function cancelMappingDetailReads(queryClient: QueryClient, mappingId: string): Promise<void> {
  await queryClient.cancelQueries({ queryKey: queryInvalidationKeys.mappings.detail(mappingId) });
}

export function invalidateProjectSummaries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.projects.list() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.home.dashboard() });
}

export function invalidateProjectDetailDependents(queryClient: QueryClient, projectId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.projects.detail(projectId) });
  invalidateProjectSummaries(queryClient);
}

export function invalidateSchemaDependents(queryClient: QueryClient, schemaId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.schemas.detail(schemaId) });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.schemas.list() });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.schemas.usage(schemaId) });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.projects.family() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.home.dashboard() });
}

export function invalidateMappingDependents(queryClient: QueryClient, projectId: string, mappingId?: string): void {
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.projects.detail(projectId) });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.projects.list() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.home.dashboard() });

  if (mappingId) {
    void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.mappings.detail(mappingId) });
    void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.deployments.context(mappingId) });
    void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.deployments.history(mappingId) });
  }
}

export function removeProjectCaches(
  queryClient: QueryClient,
  projectId: string,
  mappingIds: readonly string[] = [],
): void {
  queryClient.removeQueries({ queryKey: queryInvalidationKeys.projects.detail(projectId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.projects.mappings(projectId), exact: false });
  queryClient.removeQueries({ queryKey: queryInvalidationKeys.settings.project(projectId), exact: true });

  for (const mappingId of mappingIds) {
    queryClient.removeQueries({ queryKey: queryInvalidationKeys.mappings.detail(mappingId), exact: true });
    queryClient.removeQueries({ queryKey: queryInvalidationKeys.deployments.context(mappingId), exact: true });
    queryClient.removeQueries({ queryKey: queryInvalidationKeys.deployments.history(mappingId), exact: false });
  }

  invalidateProjectSummaries(queryClient);
}

export function removeMappingCaches(queryClient: QueryClient, mappingId: string): void {
  queryClient.removeQueries({ queryKey: queryInvalidationKeys.mappings.detail(mappingId), exact: true });
  queryClient.removeQueries({ queryKey: queryInvalidationKeys.deployments.context(mappingId), exact: true });
  queryClient.removeQueries({ queryKey: queryInvalidationKeys.deployments.history(mappingId), exact: false });
}

export function invalidateDeploymentDependents(queryClient: QueryClient, mappingId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.mappings.detail(mappingId) });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.deployments.context(mappingId) });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.deployments.history(mappingId) });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.projects.family() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.home.dashboard() });
}

export function invalidateValueTableDependents(queryClient: QueryClient, projectId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.valueTables.family() });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.projects.detail(projectId) });
  void queryClient.invalidateQueries({ queryKey: queryInvalidationKeys.mappings.family() });
}

export function clearIncompatibleQueryCache(queryClient: QueryClient): void {
  resetQueryClient(queryClient);
}
