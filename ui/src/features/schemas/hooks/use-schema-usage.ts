import { useEffect, useState } from 'react';

import { useAdapter } from '@/lib/api';

// ---------------------------------------------------------------------------
// Public types (also consumed by T-07 Remove action)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Derives which projects and mappings reference the given schema.
 *
 * Algorithm (Phase 0 — acceptable for small localStorage datasets):
 * 1. `listProjects()` → ProjectMetadata[]
 * 2. `getProject(id)` for each to obtain full Project (with schemaRefs)
 * 3. Filter projects whose schemaRefs contain schemaId
 * 4. For each referencing project, `listMappings(projectId)`
 * 5. Filter mappings where sourceSchemaId or targetSchemaId matches schemaId
 *
 * NOTE: This is a read-only scan; future optimisation can add an index.
 */
export function useSchemaUsage(schemaId: string): UseSchemaUsageResult {
  const adapter = useAdapter();

  const [projects, setProjects] = useState<UsageProject[]>([]);
  const [mappings, setMappings] = useState<UsageMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const projectMetas = await adapter.listProjects();

        // Fetch full project details to access schemaRefs
        const fullProjects = await Promise.all(
          projectMetas.map((pm) => adapter.getProject(pm.projectId)),
        );

        const referencingProjects = fullProjects.filter((p) =>
          p.schemaRefs.some((ref) => ref.schemaId === schemaId),
        );

        if (cancelled) return;

        const usageProjects: UsageProject[] = referencingProjects.map((p) => ({
          projectId: p.projectId,
          name: p.name,
        }));

        // Fetch mappings for each referencing project in parallel
        const mappingArrays = await Promise.all(
          referencingProjects.map((p) => adapter.listMappings(p.projectId)),
        );

        if (cancelled) return;

        const projectNameById = new Map(
          referencingProjects.map((p) => [p.projectId, p.name] as const),
        );

        const usageMappings: UsageMapping[] = [];
        mappingArrays.forEach((mappings) => {
          for (const m of mappings) {
            if (m.sourceSchemaId === schemaId) {
              usageMappings.push({
                mappingId: m.mappingId,
                projectId: m.projectId,
                projectName: projectNameById.get(m.projectId) ?? m.projectId,
                name: m.name,
                role: 'source',
                updatedAt: m.updatedAt,
              });
            } else if (m.targetSchemaId === schemaId) {
              usageMappings.push({
                mappingId: m.mappingId,
                projectId: m.projectId,
                projectName: projectNameById.get(m.projectId) ?? m.projectId,
                name: m.name,
                role: 'target',
                updatedAt: m.updatedAt,
              });
            }
          }
        });

        setProjects(usageProjects);
        setMappings(usageMappings);
      } catch {
        // Non-critical — usage section fails gracefully with empty lists
        if (!cancelled) {
          setProjects([]);
          setMappings([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [adapter, schemaId]);

  return { projects, mappings, isLoading };
}
