// HomeDashboardPage — Dashboard workspace layout (FS-084 T-02)

import { useNavigate } from 'react-router-dom';

import { Plus } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { PATHS } from '@/routes/paths';

import { useDashboardData } from '../hooks/use-dashboard-data';
import { useRecentActivity } from '../hooks/use-recent-activity';
import type { RecentActivityEntry } from '../types';
import { ActivityPlaceholder } from './ActivityPlaceholder';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardErrorBanner } from './DashboardErrorBanner';
import { DashboardSkeleton } from './DashboardSkeleton';
import { ProjectList } from './ProjectList';

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/** Full-width page wrapper — preserves data-testid and outer padding. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="page-home-dashboard" className="flex flex-col gap-6 p-6">
      {children}
    </div>
  );
}

/** Two-column grid: main content + right rail. */
function TwoColumnLayout({
  main,
  rail,
}: {
  main: React.ReactNode;
  rail: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <main className="flex min-w-0 flex-col gap-4">{main}</main>
      <aside
        aria-label="Activity"
        className="flex flex-col gap-4"
      >
        {rail}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page header (shared across all states)
// ---------------------------------------------------------------------------

function DashboardHeader({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <PageHeader
      title="Dashboard"
      description="Overview of all projects and mappings"
      actions={
        <button
          type="button"
          onClick={onCreateProject}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Plus size={14} aria-hidden="true" />
          New project
        </button>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// HomeDashboardPage
// ---------------------------------------------------------------------------

export function HomeDashboardPage() {
  const navigate = useNavigate();
  const { loadState, projects, retry } = useDashboardData();
  const { getRecentItems } = useRecentActivity();

  const handleCreateProject = () => navigate(PATHS.CREATE_PROJECT);
  const handleProjectClick = (id: string) =>
    navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', id));

  const handleRecentItemClick = (entry: RecentActivityEntry) => {
    if (entry.type === 'project') {
      navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', entry.id));
    } else {
      // mapping — projectId is required for the route
      if (entry.projectId) {
        navigate(
          PATHS.MAPPING_EDITOR
            .replace(':projectId', entry.projectId)
            .replace(':mappingId', entry.id),
        );
      }
    }
  };

  // --- Loading state ---
  if (loadState === 'loading') {
    return (
      <PageShell>
        <DashboardHeader onCreateProject={handleCreateProject} />
        <DashboardSkeleton />
      </PageShell>
    );
  }

  // --- Error state ---
  if (loadState === 'error') {
    return (
      <PageShell>
        <DashboardHeader onCreateProject={handleCreateProject} />
        <TwoColumnLayout
          main={<DashboardErrorBanner onRetry={retry} />}
          rail={<ActivityPlaceholder items={[]} />}
        />
      </PageShell>
    );
  }

  const recentItems = getRecentItems();

  // --- Empty state (loaded, no projects) ---
  if (loadState === 'loaded' && projects.length === 0) {
    return (
      <PageShell>
        <DashboardHeader onCreateProject={handleCreateProject} />
        <TwoColumnLayout
          main={<DashboardEmptyState />}
          rail={<ActivityPlaceholder items={recentItems} onItemClick={handleRecentItemClick} />}
        />
      </PageShell>
    );
  }

  // --- Loaded with projects ---
  return (
    <PageShell>
      <DashboardHeader onCreateProject={handleCreateProject} />
      <TwoColumnLayout
        main={<ProjectList projects={projects} onProjectClick={handleProjectClick} />}
        rail={<ActivityPlaceholder items={recentItems} onItemClick={handleRecentItemClick} />}
      />
    </PageShell>
  );
}
