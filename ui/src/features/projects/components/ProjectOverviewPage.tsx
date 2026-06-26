import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { LinkedSchemasDialog } from './LinkedSchemasDialog';
import { MappingListSection } from './MappingListSection';
import { ProjectErrorState } from './ProjectErrorState';
import { ProjectHeader } from './ProjectHeader';
import { ProjectNotFoundState } from './ProjectNotFoundState';
import { ProjectOverviewSkeleton } from './ProjectOverviewSkeleton';
import { useProjectOverview } from '../hooks/use-project-overview';

import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { useRecentActivity } from '@/features/home/hooks/use-recent-activity';
import { useAdapter } from '@/lib/api';
import type { MappingImportSummary } from '@/lib/api/types';
import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Inner page (receives resolved projectId)
// ---------------------------------------------------------------------------

function ProjectOverviewPageInner({ projectId }: { projectId: string }) {
  const adapter = useAdapter();
  const navigate = useNavigate();
  const [showLinkedSchemasDialog, setShowLinkedSchemasDialog] = useState(false);
  const [unlinkingSchemaId, setUnlinkingSchemaId] = useState<string | null>(null);
  const [isImportingMappings, setIsImportingMappings] = useState(false);
  const [mappingImportSummary, setMappingImportSummary] = useState<MappingImportSummary | null>(null);
  const [valueTableSummary, setValueTableSummary] = useState<{
    projectId: string;
    activeCount: number | null;
  }>({
    projectId: '',
    activeCount: null,
  });
  const { recordActivity } = useRecentActivity();

  const {
    loadState,
    project,
    schemas,
    mappings,
    updateName,
    updateDescription,
    deleteMappingAction,
    duplicateMappingAction,
    deleteProjectAction,
    duplicateProjectAction,
    removeSchema,
    retry,
    schemasReferencingMapping,
  } = useProjectOverview(projectId);

  // Register the project name in the breadcrumb (FS-050 T-01).
  // - While loading: project is undefined → shows "Loading..."
  // - When loaded: shows project.name
  // - On error/not-found: loadState is 'error'/'not-found' and project is
  //   undefined, so we pass projectId as the label to show the raw ID fallback.
  const breadcrumbLabel =
    loadState === 'error' || loadState === 'not-found' ? projectId : project?.name;
  useBreadcrumbLabel(projectId, breadcrumbLabel);

  // Record recent activity when the project loads successfully (FS-049 T-03)
  useEffect(() => {
    if (loadState === 'loaded' && project) {
      recordActivity({ type: 'project', id: projectId, name: project.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on successful load
  }, [loadState]);

  useEffect(() => {
    if (loadState !== 'loaded') {
      return;
    }

    let cancelled = false;

    void adapter
      .listProjectValueTables(projectId, {
        status: 'active',
        sortBy: 'updatedAt',
        sortDirection: 'desc',
      })
      .then((tables) => {
        if (cancelled) return;
        setValueTableSummary({ projectId, activeCount: tables.length });
      })
      .catch(() => {
        if (cancelled) return;
        // Non-blocking summary metric: omit when fetch fails.
        setValueTableSummary({ projectId, activeCount: null });
      });

    return () => {
      cancelled = true;
    };
  }, [adapter, projectId, loadState]);

  const activeValueTableCount =
    valueTableSummary.projectId === projectId ? valueTableSummary.activeCount : null;

  const canImportMappings = useMemo(
    () => typeof adapter.importLocalMappings === 'function',
    [adapter],
  );

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  if (loadState === 'loading') {
    return (
      <div data-testid="page-project-overview">
        <ProjectOverviewSkeleton />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  if (loadState === 'not-found') {
    return (
      <div data-testid="page-project-overview">
        <ProjectNotFoundState />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error
  // -------------------------------------------------------------------------

  if (loadState === 'error') {
    return (
      <div data-testid="page-project-overview">
        <ProjectErrorState onRetry={retry} />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Loaded — project is guaranteed non-null here
  // -------------------------------------------------------------------------

  if (!project) return null;

  async function handleDeleteProject() {
    await deleteProjectAction();
    navigate(PATHS.HOME);
  }

  async function handleImportMappings() {
    if (!adapter.importLocalMappings) {
      return;
    }

    setIsImportingMappings(true);
    try {
      const summary = await adapter.importLocalMappings(projectId);
      setMappingImportSummary(summary);
      if (summary.imported > 0) {
        retry();
      }
    } finally {
      setIsImportingMappings(false);
    }
  }

  async function handleDuplicateProject() {
    const { projectId: newId } = await duplicateProjectAction();
    navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', newId));
  }

  function handleCreateMapping() {
    navigate(PATHS.CREATE_MAPPING.replace(':projectId', projectId));
  }

  function handleOpenLinkedSchemas() {
    setShowLinkedSchemasDialog(true);
  }

  function handleCloseLinkedSchemas() {
    setShowLinkedSchemasDialog(false);
  }

  async function handleUnlinkSchema(schemaId: string) {
    setUnlinkingSchemaId(schemaId);
    try {
      await removeSchema(schemaId);
    } finally {
      setUnlinkingSchemaId(null);
    }
  }

  const usageBySchemaId = schemas.reduce<Record<string, number>>((acc, schema) => {
    acc[schema.schemaId] = schemasReferencingMapping(schema.schemaId).length;
    return acc;
  }, {});

  return (
    <div data-testid="page-project-overview">
      <div className="flex flex-col gap-6">
        {/* Section 1 — Refined Header (FS-050 T-02) */}
        <ProjectHeader
          project={project}
          mappingCount={mappings.length}
          schemaCount={schemas.length}
          activeValueTableCount={activeValueTableCount}
          errorCount={mappings.filter((m) => m.status === 'has-errors').length}
          onUpdateName={updateName}
          onUpdateDescription={updateDescription}
          onCreateMapping={handleCreateMapping}
          onLinkedSchemasClick={handleOpenLinkedSchemas}
          linkedSchemasExpanded={showLinkedSchemasDialog}
          linkedSchemasControlsId="linked-schemas-dialog"
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
          onImportMappings={canImportMappings ? handleImportMappings : undefined}
          isImportingMappings={isImportingMappings}
        />

        {mappingImportSummary ? (
          <div
            data-testid="mapping-import-summary"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          >
            Imported {mappingImportSummary.imported}, skipped {mappingImportSummary.skipped}, failed {mappingImportSummary.failed}
            {mappingImportSummary.issues.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-slate-300">View import details</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
                  {mappingImportSummary.issues.map((issue, index) => (
                    <li key={`${issue.code}:${issue.localMappingId ?? issue.remoteMappingId ?? index}`}>
                      [{issue.code}] {issue.mappingName ? `${issue.mappingName}: ` : ''}{issue.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        {/* Section 2 — full-width mappings content */}
        <div className="min-w-0 space-y-4" data-testid="project-overview-main-column">
          <MappingListSection
            mappings={mappings}
            projectId={projectId}
            onCreateMapping={handleCreateMapping}
            onDuplicate={duplicateMappingAction}
            onDelete={deleteMappingAction}
          />
        </div>
      </div>

      <LinkedSchemasDialog
        open={showLinkedSchemasDialog}
        onClose={handleCloseLinkedSchemas}
        schemas={schemas}
        usageBySchemaId={usageBySchemaId}
        onUnlinkSchema={handleUnlinkSchema}
        unlinkingSchemaId={unlinkingSchemaId}
        dialogId="linked-schemas-dialog"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page (reads route params)
// ---------------------------------------------------------------------------

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return (
      <div data-testid="page-project-overview">
        <p className="text-slate-400">No project ID provided.</p>
      </div>
    );
  }

  return <ProjectOverviewPageInner projectId={projectId} />;
}
