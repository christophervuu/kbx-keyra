// HomeDashboardPage — Final assembled Home Dashboard (FS-014 T-11)
// Wires useDashboardData + useViewMode into the full page layout.

import { BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { PATHS } from '@/routes/paths';

import { useDashboardData } from '../hooks/use-dashboard-data';
import { DashboardErrorBanner } from './DashboardErrorBanner';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardSkeleton } from './DashboardSkeleton';
import { DashboardTabs } from './DashboardTabs';
import { MetricsBar } from './MetricsBar';
import { ProjectList } from './ProjectList';

// ---------------------------------------------------------------------------
// Schema Library link card
// ---------------------------------------------------------------------------

interface SchemaLibraryCardProps {
  schemaCount: number;
  onClick: () => void;
}

function SchemaLibraryCard({ schemaCount, onClick }: SchemaLibraryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-5 py-4 text-left shadow-sm transition-colors hover:border-slate-600 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label={`Schema Library — ${schemaCount} schemas`}
    >
      <div className="flex items-center gap-3">
        <BookOpen size={20} className="text-slate-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-slate-100">Schema Library</p>
          <p className="text-xs text-slate-400">{schemaCount} schema{schemaCount !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <span className="text-xs text-slate-500">View all →</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function HomeDashboardPage() {
  const navigate = useNavigate();
  const { loadState, metrics, projects, schemaCount, retry } = useDashboardData();

  const handleCreateProject = () => navigate(PATHS.CREATE_PROJECT);
  const handleProjectClick = (id: string) =>
    navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', id));
  const handleSchemaLibrary = () => navigate(PATHS.SCHEMA_LIBRARY);

  // --- Loading state ---
  if (loadState === 'loading') {
    return (
      <div data-testid="page-home-dashboard" className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Dashboard"
          description="Overview of all projects and mappings"
          actions={
            <Button variant="primary" size="sm" onClick={handleCreateProject}>
              Create Project
            </Button>
          }
        />
        <DashboardSkeleton />
      </div>
    );
  }

  // --- Error state ---
  if (loadState === 'error') {
    return (
      <div data-testid="page-home-dashboard" className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Dashboard"
          description="Overview of all projects and mappings"
          actions={
            <Button variant="primary" size="sm" onClick={handleCreateProject}>
              Create Project
            </Button>
          }
        />
        <DashboardErrorBanner onRetry={retry} />
      </div>
    );
  }

  // --- Empty state (loaded, no projects) ---
  if (loadState === 'loaded' && projects.length === 0) {
    return (
      <div data-testid="page-home-dashboard" className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Dashboard"
          description="Overview of all projects and mappings"
          actions={
            <Button variant="primary" size="sm" onClick={handleCreateProject}>
              Create Project
            </Button>
          }
        />
        <DashboardEmptyState />
        <SchemaLibraryCard schemaCount={schemaCount} onClick={handleSchemaLibrary} />
      </div>
    );
  }

  // --- Loaded with projects ---
  return (
    <div data-testid="page-home-dashboard" className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Dashboard"
        description="Overview of all projects and mappings"
        actions={
          <Button variant="primary" size="sm" onClick={handleCreateProject}>
            Create Project
          </Button>
        }
      />

      <DashboardTabs>
        <div className="flex flex-col gap-6">
          <MetricsBar metrics={metrics} loading={false} />
          <ProjectList projects={projects} onProjectClick={handleProjectClick} />
        </div>
      </DashboardTabs>

      <SchemaLibraryCard schemaCount={schemaCount} onClick={handleSchemaLibrary} />
    </div>
  );
}
