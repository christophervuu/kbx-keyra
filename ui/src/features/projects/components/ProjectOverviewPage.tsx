import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';


import { MappingListSection } from './MappingListSection';
import { ProjectErrorState } from './ProjectErrorState';
import { ProjectHeader } from './ProjectHeader';
import { ProjectNotFoundState } from './ProjectNotFoundState';
import { ProjectOverviewSkeleton } from './ProjectOverviewSkeleton';
import { ProjectSummaryRow } from './ProjectSummaryRow';
import { SchemaManagementSection } from './SchemaManagementSection';
import { SchemaUploadDialog } from './SchemaUploadDialog';
import { useProjectOverview } from '../hooks/use-project-overview';

import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { useRecentActivity } from '@/features/home/hooks/use-recent-activity';
import { PATHS } from '@/routes/paths';

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
    setShowUploadDialog(true);
  }

  function handleViewSchema(schemaId: string) {
    navigate(PATHS.SCHEMA_DETAIL.replace(':schemaId', schemaId));
  }

  return (
    <div data-testid="page-project-overview">
      <div className="flex flex-col gap-6">
        {/* Section 1 — Refined Header (FS-050 T-02) */}
        <ProjectHeader
          project={project}
          mappingCount={mappings.length}
          schemaCount={schemas.length}
          onUpdateName={updateName}
          onUpdateDescription={updateDescription}
          onUpdateTags={updateTags}
          onCreateMapping={handleCreateMapping}
          onAddSchema={handleOpenSchemaUpload}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
        />

        {/* Section 2 — Summary Row (FS-050 T-03) */}
        <ProjectSummaryRow
          mappingCount={mappings.length}
          schemaCount={schemas.length}
          errorCount={mappings.filter((m) => m.status === 'has-errors').length}
          projectId={projectId}
        />

        {/* Section 3 — Mappings (promoted above schemas, AE-06) */}
        <MappingListSection
          mappings={mappings}
          projectId={projectId}
          onCreateMapping={handleCreateMapping}
          onDuplicate={duplicateMappingAction}
          onDelete={deleteMappingAction}
        />

        {/* Section 4 — Schemas */}
        <SchemaManagementSection
          schemas={schemas}
          onUpload={handleOpenSchemaUpload}
          onLink={addSchemaRef}
          onRemove={removeSchema}
          onView={handleViewSchema}
          mappingsReferencingSchema={schemasReferencingMapping}
        />
      </div>

      {/* Schema Upload Dialog */}
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
