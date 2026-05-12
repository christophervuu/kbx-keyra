// HomeDashboardPage — Two-column layout (FS-049 T-05)
// Main column: MetricsBar → NeedsAttention → ContinueWhereYouLeftOff → ProjectList
// Right rail: ActivityPlaceholder

import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { PATHS } from '@/routes/paths';

import { useDashboardData } from '../hooks/use-dashboard-data';
import { useRecentActivity } from '../hooks/use-recent-activity';
import type { RecentActivityEntry } from '../types';
import { ActivityPlaceholder } from './ActivityPlaceholder';
import { ContinueWhereYouLeftOff } from './ContinueWhereYouLeftOff';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardErrorBanner } from './DashboardErrorBanner';
import { DashboardSkeleton } from './DashboardSkeleton';
import { MetricsBar } from './MetricsBar';
import { NeedsAttention } from './NeedsAttention';
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
        <Button variant="primary" size="sm" onClick={onCreateProject}>
          Create Project
        </Button>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// HomeDashboardPage
// ---------------------------------------------------------------------------

export function HomeDashboardPage() {
  const navigate = useNavigate();
  const { loadState, metrics, projects, retry } = useDashboardData();
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
          rail={<ActivityPlaceholder />}
        />
      </PageShell>
    );
  }

  const recentItems = getRecentItems();
  const errorsCount = metrics?.statusBreakdown.hasErrors ?? 0;

  // --- Empty state (loaded, no projects) ---
  if (loadState === 'loaded' && projects.length === 0) {
    return (
      <PageShell>
        <DashboardHeader onCreateProject={handleCreateProject} />
        <TwoColumnLayout
          main={
            <>
              <MetricsBar metrics={metrics} loading={false} />
              <NeedsAttention errorsCount={errorsCount} />
              <DashboardEmptyState />
            </>
          }
          rail={<ActivityPlaceholder />}
        />
      </PageShell>
    );
  }

  // --- Loaded with projects ---
  return (
    <PageShell>
      <DashboardHeader onCreateProject={handleCreateProject} />
      <TwoColumnLayout
        main={
          <>
            <MetricsBar metrics={metrics} loading={false} />
            <NeedsAttention errorsCount={errorsCount} />
            <ContinueWhereYouLeftOff
              items={recentItems}
              onItemClick={handleRecentItemClick}
            />
            <ProjectList projects={projects} onProjectClick={handleProjectClick} />
          </>
        }
        rail={<ActivityPlaceholder />}
      />
    </PageShell>
  );
}
