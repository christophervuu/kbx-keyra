// HomeDashboardPage — Dashboard workspace layout (FS-084 T-02)


import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';


import { useDashboardData } from '../hooks/use-dashboard-data';
import { useRecentActivity } from '../hooks/use-recent-activity';
import type { RecentActivityEntry } from '../types';
import { ActivityPlaceholder } from './ActivityPlaceholder';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardErrorBanner } from './DashboardErrorBanner';
import { DashboardSkeleton } from './DashboardSkeleton';
import { ProjectList } from './ProjectList';

import { PageHeader } from '@/components/PageHeader';
import { useAdapter } from '@/lib/api';
import { prefetchProjectOverviewByIntent } from '@/lib/query';
import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

/** Full-width page wrapper — preserves data-testid and outer padding. */
function PageShell({ children }: { children: ReactNode }) {
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
  main: ReactNode;
  rail: ReactNode;
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
  const queryClient = useQueryClient();
  const adapter = useAdapter();
  const { loadState, projects, retry, isRefreshing, refreshError, lastUpdatedAt } = useDashboardData();
  const { getRecentItems } = useRecentActivity();

  const handleCreateProject = () => navigate(PATHS.CREATE_PROJECT);
  const handleProjectClick = (id: string) =>
    navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', id));

  const handleProjectIntent = (projectId: string, reason: 'hover' | 'focus') => {
    void prefetchProjectOverviewByIntent(queryClient, adapter, projectId, reason).catch(() => undefined);
  };

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

  const refreshMeta = (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
      <span data-testid="dashboard-refresh-status">
        {isRefreshing
          ? 'Refreshing dashboard…'
          : lastUpdatedAt
            ? `Last updated ${new Date(lastUpdatedAt).toLocaleTimeString()}`
            : 'Loaded'}
      </span>
      {refreshError ? (
        <button
          type="button"
          onClick={retry}
          className="rounded border border-amber-700/60 px-2 py-0.5 text-amber-300 hover:bg-amber-900/30"
          data-testid="dashboard-refresh-retry"
        >
          Retry refresh
        </button>
      ) : null}
    </div>
  );

  const refreshWarning = refreshError ? (
    <div
      role="status"
      className="rounded-md border border-amber-800 bg-amber-950/20 px-3 py-2 text-sm text-amber-200"
      data-testid="dashboard-refresh-warning"
    >
      Could not refresh the latest dashboard data. Showing cached results.
    </div>
  ) : null;

  // --- Empty state (loaded, no projects) ---
  if (loadState === 'loaded' && projects.length === 0) {
    return (
      <PageShell>
        <DashboardHeader onCreateProject={handleCreateProject} />
        {refreshMeta}
        {refreshWarning}
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
      {refreshMeta}
      {refreshWarning}
      <TwoColumnLayout
        main={(
          <ProjectList
            projects={projects}
            onProjectClick={handleProjectClick}
            onProjectIntent={handleProjectIntent}
          />
        )}
        rail={<ActivityPlaceholder items={recentItems} onItemClick={handleRecentItemClick} />}
      />
    </PageShell>
  );
}
