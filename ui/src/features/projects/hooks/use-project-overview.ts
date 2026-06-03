import { useCallback, useEffect, useRef, useState } from 'react';

import type { MappingRowData, ProjectLoadState, SchemaCardData } from '../types';

import { useOptimisticMutation } from '@/hooks';
import { useAdapter } from '@/lib/api';
import type { CurrentDeployments } from '@/lib/api/types';
import type { AppError } from '@/lib/state/app-error';
import type { DeployStatus } from '@/lib/types/domain';
import type {
  MappingMetadata,
  ProjectDetail,
  SchemaDetail,
  SchemaRef,
} from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Deployment status helpers
// ---------------------------------------------------------------------------

/**
 * Maps DeploymentStatus (from the deployments API) to the legacy
 * DeployStatus used by MappingRowData / MappingRow badges.
 */
function toDeployStatus(
  deployments: CurrentDeployments | null,
  env: 'DEV' | 'QA' | 'PROD',
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
    scope: 'project-level',
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
  return {
    mappingId: mapping.mappingId,
    name: mapping.name,
    sourceSchemaName: mapping.sourceSchemaId
      ? (schemaMap.get(mapping.sourceSchemaId) ?? 'Unknown Schema')
      : null,
    targetSchemaName: mapping.targetSchemaId
      ? (schemaMap.get(mapping.targetSchemaId) ?? 'Unknown Schema')
      : null,
    ruleCount: mapping.ruleCount,
    coverage: mapping.coverage,
    status: mapping.status,
    devDeploy: toDeployStatus(deployments, 'DEV'),
    qaDeploy: toDeployStatus(deployments, 'QA'),
    prodDeploy: toDeployStatus(deployments, 'PROD'),
    updatedAt: mapping.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseProjectOverviewResult {
  loadState: ProjectLoadState;
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProjectOverview(projectId: string): UseProjectOverviewResult {
  const adapter = useAdapter();

  const [loadState, setLoadState] = useState<ProjectLoadState>('loading');
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [schemaDetails, setSchemaDetails] = useState<SchemaDetail[]>([]);
  const [mappingsMeta, setMappingsMeta] = useState<MappingMetadata[]>([]);
  const [deploymentsMap, setDeploymentsMap] = useState<Map<string, CurrentDeployments | null>>(new Map());

  // Incremented by retry() to trigger re-fetch
  const [fetchKey, setFetchKey] = useState(0);

  // Stable ref so action callbacks always see current project
  const projectRef = useRef<ProjectDetail | null>(null);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setProject(null);
      setSchemaDetails([]);
      setMappingsMeta([]);
      setDeploymentsMap(new Map());

      try {
        const detail = await adapter.getProject(projectId);

        if (cancelled) return;

        // Load schemas and current deployments in parallel (best-effort)
        const [schemaResults, deploymentResults] = await Promise.all([
          Promise.allSettled(
            detail.schemaRefs.map((ref) => adapter.getSchema(ref.schemaId)),
          ),
          Promise.allSettled(
            detail.mappings.map((m) => adapter.getCurrentDeployments(m.mappingId)),
          ),
        ]);

        if (cancelled) return;

        const loaded = schemaResults
          .filter((r): r is PromiseFulfilledResult<SchemaDetail> => r.status === 'fulfilled')
          .map((r) => r.value);

        // Build mappingId → CurrentDeployments lookup (null for failed fetches)
        const deploymentsMap = new Map<string, CurrentDeployments | null>(
          detail.mappings.map((m, i) => [
            m.mappingId,
            deploymentResults[i]?.status === 'fulfilled'
              ? (deploymentResults[i] as PromiseFulfilledResult<CurrentDeployments>).value
              : null,
          ]),
        );

        setProject(detail);
        setSchemaDetails(loaded);
        setMappingsMeta([...detail.mappings]);
        setDeploymentsMap(deploymentsMap);
        setLoadState('loaded');
      } catch (err: unknown) {
        if (cancelled) return;

        // Treat 404-like errors as not-found
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found') || msg.includes('404')) {
          setLoadState('not-found');
        } else {
          setLoadState('error');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [adapter, projectId, fetchKey]);

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
    captureSnapshot: () => projectRef.current?.name ?? '',
    applyOptimistic: (name) => {
      setProject((prev) => (prev ? { ...prev, name } : prev));
    },
    rollback: (snapshot) => {
      setProject((prev) => (prev ? { ...prev, name: snapshot } : prev));
    },
    mutate: (name) => adapter.updateProject(projectId, { name }),
    onSuccess: (updated) => {
      setProject((prev) => (prev ? { ...prev, name: updated.name } : prev));
    },
  });

  const descriptionMutation = useOptimisticMutation<string, string, Awaited<ReturnType<typeof adapter.updateProject>>>({
    captureSnapshot: () => projectRef.current?.description ?? '',
    applyOptimistic: (description) => {
      setProject((prev) => (prev ? { ...prev, description } : prev));
    },
    rollback: (snapshot) => {
      setProject((prev) => (prev ? { ...prev, description: snapshot } : prev));
    },
    mutate: (description) => adapter.updateProject(projectId, { description }),
    onSuccess: (updated) => {
      setProject((prev) => (prev ? { ...prev, description: updated.description } : prev));
    },
  });

  const mutationError = nameMutation.error ?? descriptionMutation.error;

  const clearMutationError = useCallback(() => {
    nameMutation.clearError();
    descriptionMutation.clearError();
  }, [nameMutation, descriptionMutation]);

  const updateName = useCallback(
    async (name: string) => {
      if (!projectRef.current) return;
      await nameMutation.run(name);
    },
    [nameMutation],
  );

  const updateDescription = useCallback(
    async (description: string) => {
      if (!projectRef.current) return;
      await descriptionMutation.run(description);
    },
    [descriptionMutation],
  );

  const updateTags = useCallback(
    async (tags: string[]) => {
      if (!projectRef.current) return;
      const updated = await adapter.updateProject(projectId, { tags });
      void updated; // returned ProjectMetadata does not carry tags; use input value
      setProject((prev) => (prev ? { ...prev, tags } : prev));
    },
    [adapter, projectId],
  );

  // ---------------------------------------------------------------------------
  // Schema actions
  // ---------------------------------------------------------------------------

  const removeSchema = useCallback(
    async (schemaId: string) => {
      const current = projectRef.current;
      if (!current) return;
      const newRefs = current.schemaRefs.filter((r) => r.schemaId !== schemaId);
      await adapter.updateProject(projectId, { schemaRefs: newRefs });
      setProject((prev) => (prev ? { ...prev, schemaRefs: newRefs } : prev));
      setSchemaDetails((prev) => prev.filter((d) => d.metadata.schemaId !== schemaId));
    },
    [adapter, projectId],
  );

  const addSchemaRef = useCallback(
    async (ref: SchemaRef) => {
      const current = projectRef.current;
      if (!current) return;
      const newRefs = [...current.schemaRefs, ref];
      await adapter.updateProject(projectId, { schemaRefs: newRefs });
      const detail = await adapter.getSchema(ref.schemaId);
      setProject((prev) => (prev ? { ...prev, schemaRefs: newRefs } : prev));
      setSchemaDetails((prev) => [...prev, detail]);
    },
    [adapter, projectId],
  );

  const resyncSchema = useCallback(
    async (schemaId: string): Promise<{ message: string }> => {
      const result = await adapter.syncCdmSchema(schemaId);
      const refreshed = await adapter.getSchema(schemaId);
      setSchemaDetails((prev) =>
        prev.map((detail) =>
          detail.metadata.schemaId === schemaId ? refreshed : detail,
        ),
      );
      return {
        message: result.message || 'Schema re-synced from CDM source.',
      };
    },
    [adapter],
  );

  // ---------------------------------------------------------------------------
  // Mapping actions
  // ---------------------------------------------------------------------------

  const deleteMappingAction = useCallback(
    async (mappingId: string) => {
      await adapter.deleteMapping(mappingId);
      setMappingsMeta((prev) => prev.filter((m) => m.mappingId !== mappingId));
    },
    [adapter],
  );

  const duplicateMappingAction = useCallback(
    async (mappingId: string) => {
      const original = mappingsMeta.find((m) => m.mappingId === mappingId);
      const newName = original ? `${original.name} (Copy)` : 'Copy';
      const copy = await adapter.duplicateMapping(mappingId, newName);
      setMappingsMeta((prev) => [...prev, copy]);
    },
    [adapter, mappingsMeta],
  );

  // ---------------------------------------------------------------------------
  // Project actions
  // ---------------------------------------------------------------------------

  const deleteProjectAction = useCallback(async () => {
    // Delete all project mappings first
    await Promise.all(mappingsMeta.map((m) => adapter.deleteMapping(m.mappingId)));
    await adapter.deleteProject(projectId);
  }, [adapter, projectId, mappingsMeta]);

  const duplicateProjectAction = useCallback(async (): Promise<{ projectId: string }> => {
    const current = projectRef.current;
    if (!current) throw new Error('Project not loaded');

    // Create the duplicate project
    const slug = `${current.slug}-copy-${Date.now()}`;
    const newProject = await adapter.createProject({
      name: `${current.name} (Copy)`,
      description: current.description,
      slug,
      schemaRefs: [...current.schemaRefs],
      tags: [...current.tags],
    });

    // Duplicate all mappings into the new project
    await Promise.all(
      mappingsMeta.map((m) => adapter.duplicateMapping(m.mappingId, m.name)),
    );

    return { projectId: newProject.projectId };
  }, [adapter, mappingsMeta]);

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  const retry = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

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
