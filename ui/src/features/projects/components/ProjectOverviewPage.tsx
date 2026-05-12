import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/PageHeader';
import { useRecentActivity } from '@/features/home/hooks/use-recent-activity';
import { PATHS } from '@/routes/paths';

import { useProjectOverview } from '../hooks/use-project-overview';
import { ProjectMetadataSection } from './ProjectMetadataSection';
import { SchemaManagementSection } from './SchemaManagementSection';
import { MappingListSection } from './MappingListSection';
import { ProjectActionsSection } from './ProjectActionsSection';
import { SchemaUploadDialog } from './SchemaUploadDialog';
import { ProjectOverviewSkeleton } from './ProjectOverviewSkeleton';
import { ProjectErrorState } from './ProjectErrorState';
import { ProjectNotFoundState } from './ProjectNotFoundState';

// ---------------------------------------------------------------------------
// Inner page (receives resolved projectId)
// ---------------------------------------------------------------------------

function ProjectOverviewPageInner({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const { recordActivity } = useRecentActivity();

  const {
    loadState,
    project,
    schemas,
    mappings,
    updateName,
    updateDescription,
    updateTags,
    removeSchema,
    addSchemaRef,
    deleteMappingAction,
    duplicateMappingAction,
    deleteProjectAction,
    duplicateProjectAction,
    retry,
    schemasReferencingMapping,
  } = useProjectOverview(projectId);

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
        <PageHeader title="Loading…" />
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
        <PageHeader title="Project Not Found" />
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
        <PageHeader title="Project Overview" />
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
    setShowUploadDialog(true);
  }

  function handleViewSchema(schemaId: string) {
    navigate(PATHS.SCHEMA_DETAIL.replace(':schemaId', schemaId));
  }

  return (
    <div data-testid="page-project-overview">
      <PageHeader title={project.name} description={project.description ?? undefined} />

      <div className="flex flex-col gap-6">
        {/* Section A — Metadata */}
        <ProjectMetadataSection
          project={project}
          onUpdateName={updateName}
          onUpdateDescription={updateDescription}
          onUpdateTags={updateTags}
        />

        {/* Section B — Schemas */}
        <SchemaManagementSection
          schemas={schemas}
          onUpload={handleOpenSchemaUpload}
          onLink={addSchemaRef}
          onRemove={removeSchema}
          onView={handleViewSchema}
          mappingsReferencingSchema={schemasReferencingMapping}
        />

        {/* Section C — Mappings */}
        <MappingListSection
          mappings={mappings}
          projectId={projectId}
          onCreateMapping={handleCreateMapping}
          onDuplicate={duplicateMappingAction}
          onDelete={deleteMappingAction}
        />

        {/* Section D — Actions */}
        <ProjectActionsSection
          projectId={projectId}
          mappingCount={mappings.length}
          schemaCount={schemas.length}
          onCreateMapping={handleCreateMapping}
          onAddSchema={handleOpenSchemaUpload}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
        />
      </div>

      {/* Schema Upload Dialog (T-11) */}
      <SchemaUploadDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSchemaCreated={async (ref) => {
          await addSchemaRef(ref);
          setShowUploadDialog(false);
        }}
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
