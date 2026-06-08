import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { LinkedSchemasDialog } from './LinkedSchemasDialog';
import { MappingListSection } from './MappingListSection';
import { ProjectErrorState } from './ProjectErrorState';
import { ProjectHeader } from './ProjectHeader';
import { ProjectNotFoundState } from './ProjectNotFoundState';
import { ProjectOverviewSkeleton } from './ProjectOverviewSkeleton';
import { SchemaUploadDialog } from './SchemaUploadDialog';
import { useProjectOverview } from '../hooks/use-project-overview';

import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { useRecentActivity } from '@/features/home/hooks/use-recent-activity';
import { PATHS } from '@/routes/paths';

interface UnlinkConflictDetails {
  dependentMappings?: Array<{ mappingId?: string; name?: string }>;
}

function isUnlinkConflictError(error: unknown): error is { code?: string; statusCode?: number; details?: unknown } {
  return typeof error === 'object' && error !== null;
}

// ---------------------------------------------------------------------------
// Inner page (receives resolved projectId)
// ---------------------------------------------------------------------------

function ProjectOverviewPageInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showLinkedSchemasDialog, setShowLinkedSchemasDialog] = useState(false);
  const [unlinkBlockMessage, setUnlinkBlockMessage] = useState<string | null>(null);
  const { recordActivity } = useRecentActivity();

  const {
    loadState,
    project,
    schemas,
    mappings,
    updateName,
    updateDescription,
    removeSchema,
    addSchemaRef,
    deleteMappingAction,
    duplicateMappingAction,
    deleteProjectAction,
    duplicateProjectAction,
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

  async function handleDuplicateProject() {
    const { projectId: newId } = await duplicateProjectAction();
    navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', newId));
  }

  function handleCreateMapping() {
    navigate(PATHS.CREATE_MAPPING.replace(':projectId', projectId));
  }

  function handleOpenSchemaUpload() {
    setUnlinkBlockMessage(null);
    setShowUploadDialog(true);
  }

  function handleOpenLinkedSchemas() {
    setUnlinkBlockMessage(null);
    setShowLinkedSchemasDialog(true);
  }

  function handleCloseLinkedSchemas() {
    setUnlinkBlockMessage(null);
    setShowLinkedSchemasDialog(false);
  }

  async function handleSchemaCreated(ref: { schemaId: string; type: 'github' | 'local' | 'published'; commitSha?: string }) {
    await addSchemaRef(ref);
    setShowUploadDialog(false);
  }

  async function handleRemoveSchema(schemaId: string) {
    setUnlinkBlockMessage(null);
    try {
      await removeSchema(schemaId);
    } catch (error) {
      if (isUnlinkConflictError(error) && (error.code === 'CONFLICT' || error.statusCode === 409)) {
        const details = (error.details ?? {}) as UnlinkConflictDetails;
        const dependent = details.dependentMappings ?? [];
        if (dependent.length > 0) {
          const names = dependent
            .map((item) => item.name)
            .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
          setUnlinkBlockMessage(
            names.length > 0
              ? `Cannot unlink schema while used by mapping(s): ${names.join(', ')}. Update or delete those mappings first.`
              : 'Cannot unlink schema while it is used by mappings in this project. Update or delete those mappings first.',
          );
        } else {
          setUnlinkBlockMessage('Cannot unlink schema while it is used by mappings in this project. Update or delete those mappings first.');
        }
        return;
      }
      throw error;
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
          errorCount={mappings.filter((m) => m.status === 'has-errors').length}
          onUpdateName={updateName}
          onUpdateDescription={updateDescription}
          onCreateMapping={handleCreateMapping}
          onAddSchema={handleOpenSchemaUpload}
          onLinkedSchemasClick={handleOpenLinkedSchemas}
          linkedSchemasExpanded={showLinkedSchemasDialog}
          linkedSchemasControlsId="linked-schemas-dialog"
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
        />

        {unlinkBlockMessage && (
          <div
            role="alert"
            className="rounded-md border border-amber-700 bg-amber-950 px-3 py-2 text-sm text-amber-200"
            data-testid="schema-unlink-blocked-message"
          >
            {unlinkBlockMessage}
          </div>
        )}

        {/* Section 2 — full-width mappings content */}
        <div className="min-w-0" data-testid="project-overview-main-column">
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
        onUnlinkSchema={handleRemoveSchema}
        onAddSchema={() => {
          setShowLinkedSchemasDialog(false);
          handleOpenSchemaUpload();
        }}
        dialogId="linked-schemas-dialog"
      />

      {/* Schema Upload Dialog */}
      <SchemaUploadDialog
        open={showUploadDialog}
        onClose={() => {
          setUnlinkBlockMessage(null);
          setShowUploadDialog(false);
        }}
        onSchemaCreated={handleSchemaCreated}
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
