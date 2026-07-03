import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { MappingRowData, ProjectLoadState, SchemaCardData } from '../types';
import {
  loadProjectOverviewQueryData,
  type ProjectOverviewQueryData,
} from './project-overview-query-data';

import { useOptimisticMutation } from '@/hooks';
import { useAdapter } from '@/lib/api';
import type { CurrentDeployments } from '@/lib/api/types';
import {
  cancelProjectDetailReads,
  invalidateMappingDependents,
  invalidateProjectDetailDependents,
  invalidateProjectSummaries,
  queryKeys,
  queryPolicies,
  removeMappingCaches,
  removeProjectCaches,
} from '@/lib/query';
import type { AppError } from '@/lib/state/app-error';
import { toAppError } from '@/lib/state/app-error';
import type {
  DeployStatus,
  MappingMetadata,
  SchemaDetail,
  SchemaRef,
} from '@/lib/types/domain';
import { normalizeProjectLinkedSchemaIds, type ProjectDetail } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Deployment status helpers
// ---------------------------------------------------------------------------

/**
 * Maps DeploymentStatus (from the deployments API) to the legacy
 * DeployStatus used by MappingRowData / MappingRow badges.
 */
function toDeployStatus(
  deployments: CurrentDeployments | null,
  env: 'DEV' | 'PREPROD' | 'PROD',
): DeployStatus {
  const summary = deployments?.[env];
  if (!summary) return 'not-deployed';
  switch (summary.status) {
    case 'current':
      return 'deployed';
    case 'stale':
      return 'stale';
    default:
      return 'not-deployed';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSchemaCardData(detail: SchemaDetail): SchemaCardData {
  const { metadata } = detail;
  return {
    schemaId: metadata.schemaId,
    name: metadata.name,
    format: metadata.format,
    origin: metadata.origin,
    sourceType: metadata.source.type,
    fieldCount: metadata.fieldCount,
    syncStatus: metadata.syncStatus,
    isInferred: false,
  };
}

function buildMappingRowData(
  mapping: MappingMetadata,
  schemaMap: Map<string, string>,
  deployments: CurrentDeployments | null,
): MappingRowData {
  const enrichmentInputs = (mapping.enrichmentSources ?? []).map((input) => ({
    alias: input.alias,
    schemaName: input.schemaId ? (schemaMap.get(input.schemaId) ?? 'Unknown Schema') : null,
  }));

  return {
    mappingId: mapping.mappingId,
    name: mapping.name,
    sourceSchemaName: mapping.sourceSchemaId
      ? (schemaMap.get(mapping.sourceSchemaId) ?? 'Unknown Schema')
      : null,
    targetSchemaName: mapping.targetSchemaId
      ? (schemaMap.get(mapping.targetSchemaId) ?? 'Unknown Schema')
      : null,
    enrichmentInputs,
    ruleCount: mapping.ruleCount,
    coverage: mapping.coverage,
    status: mapping.status,
    sandboxDeploy: toDeployStatus(deployments, 'DEV'),
    devDeploy: toDeployStatus(deployments, 'DEV'),
    preprodDeploy: toDeployStatus(deployments, 'PREPROD'),
    prodDeploy: toDeployStatus(deployments, 'PROD'),
    updatedAt: mapping.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseProjectOverviewResult {
  loadState: ProjectLoadState;
  isRefreshing: boolean;
  refreshError: AppError | null;
  lastUpdatedAt: string | null;
  project: ProjectDetail | null;
  schemas: SchemaCardData[];
  mappings: MappingRowData[];
  mutationError: AppError | null;
  clearMutationError: () => void;

  updateName: (name: string) => Promise<void>;
  updateDescription: (description: string) => Promise<void>;
  updateTags: (tags: string[]) => Promise<void>;

  removeSchema: (schemaId: string) => Promise<void>;
  addSchemaRef: (ref: SchemaRef) => Promise<void>;
  resyncSchema: (schemaId: string) => Promise<{ message: string }>;

  deleteMappingAction: (mappingId: string) => Promise<void>;
  duplicateMappingAction: (mappingId: string) => Promise<void>;

  deleteProjectAction: () => Promise<void>;
  duplicateProjectAction: () => Promise<{ projectId: string }>;

  retry: () => void;
  schemasReferencingMapping: (schemaId: string) => string[];
}

const EMPTY_SCHEMA_DETAILS: SchemaDetail[] = [];
const EMPTY_MAPPINGS_META: MappingMetadata[] = [];
const EMPTY_DEPLOYMENTS_MAP = new Map<string, CurrentDeployments | null>();

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProjectOverview(projectId: string): UseProjectOverviewResult {
  const adapter = useAdapter();
  const queryClient = useQueryClient();

  const overviewQueryKey = queryKeys.projects.detail(projectId);

  const overviewQuery = useQuery<ProjectOverviewQueryData>({
    queryKey: overviewQueryKey,
    staleTime: queryPolicies.projectDetail.staleTime,
    gcTime: queryPolicies.projectDetail.gcTime,
    retry: false,
    queryFn: () => loadProjectOverviewQueryData(adapter, projectId),
  });

  const project = overviewQuery.data?.project ?? null;
  const schemaDetails = overviewQuery.data?.schemaDetails ?? EMPTY_SCHEMA_DETAILS;
  const mappingsMeta = overviewQuery.data?.mappingsMeta ?? EMPTY_MAPPINGS_META;
  const deploymentsMap = overviewQuery.data?.deploymentsMap ?? EMPTY_DEPLOYMENTS_MAP;

  const patchOverviewData = useCallback(
    (updater: (current: ProjectOverviewQueryData) => ProjectOverviewQueryData) => {
      queryClient.setQueryData<ProjectOverviewQueryData | undefined>(overviewQueryKey, (current) => {
        if (!current) {
          return current;
        }

        return updater(current);
      });
    },
    [queryClient, overviewQueryKey],
  );

  const loadState: ProjectLoadState = (() => {
    if (!overviewQuery.data && overviewQuery.isPending) {
      return 'loading';
    }

    if (overviewQuery.isError && !overviewQuery.data) {
      const msg = overviewQuery.error instanceof Error ? overviewQuery.error.message : String(overviewQuery.error);
      if (msg.includes('not found') || msg.includes('404')) {
        return 'not-found';
      }

      return 'error';
    }

    return 'loaded';
  })();

  const isRefreshing = overviewQuery.isFetching && Boolean(overviewQuery.data);
  const refreshError = overviewQuery.error && overviewQuery.data ? toAppError(overviewQuery.error) : null;
  const lastUpdatedAt = overviewQuery.dataUpdatedAt
    ? new Date(overviewQuery.dataUpdatedAt).toISOString()
    : null;

  // ---------------------------------------------------------------------------
  // Derived view models
  // ---------------------------------------------------------------------------

  const schemaMap = new Map<string, string>(
    schemaDetails.map((d) => [d.metadata.schemaId, d.metadata.name]),
  );

  const schemas: SchemaCardData[] = schemaDetails.map(buildSchemaCardData);
  const mappings: MappingRowData[] = mappingsMeta.map((m) =>
    buildMappingRowData(m, schemaMap, deploymentsMap.get(m.mappingId) ?? null),
  );

  // ---------------------------------------------------------------------------
  // Inline editing
  // ---------------------------------------------------------------------------

  const nameMutation = useOptimisticMutation<string, string, Awaited<ReturnType<typeof adapter.updateProject>>>({
    captureSnapshot: () => project?.name ?? '',
    applyOptimistic: (name) => {
      patchOverviewData((current) => ({
        ...current,
        project: { ...current.project, name },
      }));
    },
    rollback: (snapshot) => {
      patchOverviewData((current) => ({
        ...current,
        project: { ...current.project, name: snapshot },
      }));
    },
    mutate: (name) => adapter.updateProject(projectId, { name }),
    onSuccess: (updated) => {
      patchOverviewData((current) => ({
        ...current,
        project: { ...current.project, name: updated.name },
      }));
    },
  });

  const descriptionMutation = useOptimisticMutation<string, string, Awaited<ReturnType<typeof adapter.updateProject>>>({
    captureSnapshot: () => project?.description ?? '',
    applyOptimistic: (description) => {
      patchOverviewData((current) => ({
        ...current,
        project: { ...current.project, description },
      }));
    },
    rollback: (snapshot) => {
      patchOverviewData((current) => ({
        ...current,
        project: { ...current.project, description: snapshot },
      }));
    },
    mutate: (description) => adapter.updateProject(projectId, { description }),
    onSuccess: (updated) => {
      patchOverviewData((current) => ({
        ...current,
        project: { ...current.project, description: updated.description },
      }));
    },
  });

  const mutationError = nameMutation.error ?? descriptionMutation.error;

  const clearMutationError = useCallback(() => {
    nameMutation.clearError();
    descriptionMutation.clearError();
  }, [nameMutation, descriptionMutation]);

  const updateName = useCallback(
    async (name: string) => {
      if (!project) return;
      await nameMutation.run(name);
    },
    [nameMutation, project],
  );

  const updateDescription = useCallback(
    async (description: string) => {
      if (!project) return;
      await descriptionMutation.run(description);
    },
    [descriptionMutation, project],
  );

  const updateTags = useCallback(
    async (tags: string[]) => {
      if (!project) return;
      await cancelProjectDetailReads(queryClient, projectId);
      const updated = await adapter.updateProject(projectId, { tags });
      void updated; // returned ProjectMetadata does not carry tags; use input value
      patchOverviewData((current) => ({
        ...current,
        project: { ...current.project, tags },
      }));
      invalidateProjectDetailDependents(queryClient, projectId);
    },
    [adapter, patchOverviewData, project, projectId, queryClient],
  );

  // ---------------------------------------------------------------------------
  // Schema actions
  // ---------------------------------------------------------------------------

  const removeSchema = useCallback(
    async (schemaId: string) => {
      const current = project;
      if (!current) return;

      const currentLinkedSchemaIds = normalizeProjectLinkedSchemaIds(current);
      const nextLinkedSchemaIds = currentLinkedSchemaIds.filter((id) => id !== schemaId);
      const nextSchemaRefs = current.schemaRefs.filter((r) => r.schemaId !== schemaId);

      await cancelProjectDetailReads(queryClient, projectId);
      await adapter.updateProject(projectId, { linkedSchemaIds: nextLinkedSchemaIds });
      patchOverviewData((currentData) => ({
        ...currentData,
        project: {
          ...currentData.project,
          linkedSchemaIds: nextLinkedSchemaIds,
          schemaRefs: nextSchemaRefs,
        },
        schemaDetails: currentData.schemaDetails.filter((d) => d.metadata.schemaId !== schemaId),
      }));
      invalidateProjectDetailDependents(queryClient, projectId);
    },
    [adapter, patchOverviewData, project, projectId, queryClient],
  );

  const addSchemaRef = useCallback(
    async (ref: SchemaRef) => {
      const current = project;
      if (!current) return;

      const currentLinkedSchemaIds = normalizeProjectLinkedSchemaIds(current);
      if (currentLinkedSchemaIds.includes(ref.schemaId)) return;

      const nextLinkedSchemaIds = [...currentLinkedSchemaIds, ref.schemaId];
      const nextSchemaRefs = current.schemaRefs.some((existing) => existing.schemaId === ref.schemaId)
        ? current.schemaRefs
        : [...current.schemaRefs, ref];

      await cancelProjectDetailReads(queryClient, projectId);
      await adapter.updateProject(projectId, { linkedSchemaIds: nextLinkedSchemaIds });
      const detail = await adapter.getSchema(ref.schemaId);
      patchOverviewData((currentData) => ({
        ...currentData,
        project: {
          ...currentData.project,
          linkedSchemaIds: nextLinkedSchemaIds,
          schemaRefs: nextSchemaRefs,
        },
        schemaDetails: [...currentData.schemaDetails, detail],
      }));
      invalidateProjectDetailDependents(queryClient, projectId);
    },
    [adapter, patchOverviewData, project, projectId, queryClient],
  );

  const resyncSchema = useCallback(
    async (schemaId: string): Promise<{ message: string }> => {
      const result = await adapter.syncCdmSchema(schemaId);
      const refreshed = await adapter.getSchema(schemaId);
      patchOverviewData((current) => ({
        ...current,
        schemaDetails: current.schemaDetails.map((detail) =>
          detail.metadata.schemaId === schemaId ? refreshed : detail,
        ),
      }));
      invalidateProjectDetailDependents(queryClient, projectId);
      return {
        message: result.message || 'Schema re-synced from CDM source.',
      };
    },
    [adapter, patchOverviewData, projectId, queryClient],
  );

  // ---------------------------------------------------------------------------
  // Mapping actions
  // ---------------------------------------------------------------------------

  const deleteMappingAction = useCallback(
    async (mappingId: string) => {
      const currentMappings = mappingsMeta;
      const removedIndex = currentMappings.findIndex((m) => m.mappingId === mappingId);
      const removedMapping = removedIndex >= 0 ? currentMappings[removedIndex] : null;

      if (removedIndex >= 0) {
        patchOverviewData((current) => ({
          ...current,
          mappingsMeta: current.mappingsMeta.filter((m) => m.mappingId !== mappingId),
        }));
      }

      try {
        removeMappingCaches(queryClient, mappingId);
        await adapter.deleteMapping(mappingId);
        invalidateMappingDependents(queryClient, projectId, mappingId);
      } catch (error: unknown) {
        const appError = toAppError(error);

        if (appError.code === 'MALFORMED_RESPONSE') {
          return;
        }

        try {
          await adapter.getMapping(mappingId);
        } catch (verifyError: unknown) {
          const verifyAppError = toAppError(verifyError);
          if (
            verifyAppError.statusCode === 404
            || verifyAppError.code === 'RESOURCE_NOT_FOUND'
            || verifyAppError.code === 'NOT_FOUND'
          ) {
            return;
          }
        }

        if (removedMapping && removedIndex >= 0) {
          patchOverviewData((current) => {
            const alreadyRestored = current.mappingsMeta.some((m) => m.mappingId === mappingId);
            if (alreadyRestored) return current;
            const next = [...current.mappingsMeta];
            const insertIndex = Math.min(Math.max(removedIndex, 0), next.length);
            next.splice(insertIndex, 0, removedMapping);
            return {
              ...current,
              mappingsMeta: next,
            };
          });
        }

        throw error;
      }
    },
    [adapter, mappingsMeta, patchOverviewData, projectId, queryClient],
  );

  const duplicateMappingAction = useCallback(
    async (mappingId: string) => {
      const original = mappingsMeta.find((m) => m.mappingId === mappingId);
      const newName = original ? `${original.name} (Copy)` : 'Copy';
      const copy = await adapter.duplicateMapping(mappingId, newName);
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.detail(projectId) });
      patchOverviewData((current) => ({
        ...current,
        mappingsMeta: [...current.mappingsMeta, copy],
      }));
      invalidateMappingDependents(queryClient, projectId, copy.mappingId);
    },
    [adapter, mappingsMeta, patchOverviewData, projectId, queryClient],
  );

  // ---------------------------------------------------------------------------
  // Project actions
  // ---------------------------------------------------------------------------

  const deleteProjectAction = useCallback(async () => {
    // Delete all project mappings first
    const mappingIds = mappingsMeta.map((m) => m.mappingId);
    await Promise.all(mappingsMeta.map((m) => adapter.deleteMapping(m.mappingId)));
    mappingIds.forEach((mappingId) => removeMappingCaches(queryClient, mappingId));
    await adapter.deleteProject(projectId);
    removeProjectCaches(queryClient, projectId, mappingIds);
  }, [adapter, mappingsMeta, projectId, queryClient]);

  const duplicateProjectAction = useCallback(async (): Promise<{ projectId: string }> => {
    const current = project;
    if (!current) throw new Error('Project not loaded');

    // Create the duplicate project
    const slug = `${current.slug}-copy-${Date.now()}`;
    const linkedSchemaIds = normalizeProjectLinkedSchemaIds(current);
    const newProject = await adapter.createProject({
      name: `${current.name} (Copy)`,
      description: current.description,
      slug,
      linkedSchemaIds,
      tags: [...current.tags],
    });

    // Duplicate all mappings into the new project
    await Promise.all(
      mappingsMeta.map((m) => adapter.duplicateMapping(m.mappingId, m.name)),
    );

    invalidateProjectSummaries(queryClient);

    return { projectId: newProject.projectId };
  }, [adapter, mappingsMeta, project, queryClient]);

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  const retry = useCallback(() => {
    void overviewQuery.refetch();
  }, [overviewQuery]);

  const schemasReferencingMapping = useCallback(
    (schemaId: string): string[] => {
      return mappingsMeta
        .filter(
          (m) => m.sourceSchemaId === schemaId || m.targetSchemaId === schemaId,
        )
        .map((m) => m.name);
    },
    [mappingsMeta],
  );

  // ---------------------------------------------------------------------------

  return {
    loadState,
    isRefreshing,
    refreshError,
    lastUpdatedAt,
    project,
    schemas,
    mappings,
    mutationError,
    clearMutationError,
    updateName,
    updateDescription,
    updateTags,
    removeSchema,
    addSchemaRef,
    resyncSchema,
    deleteMappingAction,
    duplicateMappingAction,
    deleteProjectAction,
    duplicateProjectAction,
    retry,
    schemasReferencingMapping,
  };
}
