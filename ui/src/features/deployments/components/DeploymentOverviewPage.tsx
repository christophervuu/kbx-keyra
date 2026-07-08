import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DeploymentOverviewFilters } from './DeploymentOverviewFilters';
import { DeploymentOverviewTable } from './DeploymentOverviewTable';
import {
  useGlobalDeploymentOverview,
  useProjectDeploymentOverview,
  type DeploymentOverviewFilters as DeploymentOverviewFilterState,
} from '../hooks/use-deployment-overview';

import { PageHeader } from '@/components/PageHeader';
import type { DeploymentOverviewItem } from '@/lib/api/types';
import { PATHS } from '@/routes';

export interface DeploymentOverviewPageProps {
  readonly scope: 'global' | 'project';
  readonly projectId?: string;
  readonly projectName?: string;
}

const DEFAULT_PAGE_SIZE = 50;

function normalizeFilters(
  filters: DeploymentOverviewFilterState,
  cursor?: string,
): DeploymentOverviewFilterState {
  return {
    ...filters,
    pageSize: filters.pageSize,
    ...(cursor ? { cursor } : {}),
  };
}

export function DeploymentOverviewPage({ scope, projectId, projectName }: DeploymentOverviewPageProps) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<DeploymentOverviewFilterState>({ pageSize: DEFAULT_PAGE_SIZE });
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const effectiveFilters = useMemo(() => normalizeFilters(filters, cursor), [filters, cursor]);

  const globalResult = useGlobalDeploymentOverview(effectiveFilters, {
    enabled: scope === 'global',
  });
  const projectResult = useProjectDeploymentOverview(projectId ?? '', effectiveFilters, {
    enabled: scope === 'project',
  });
  const result = scope === 'global' ? globalResult : projectResult;
  const resolvedProjectId = projectId ?? '';

  const title = scope === 'global' ? 'Deployments' : 'Project Deployments';

  const description = scope === 'global'
    ? 'Read-only deployment overview for all mappings. Filter by environment freshness, attention state, and operation status.'
    : `Read-only deployment overview for mappings in ${projectName ?? projectId ?? 'this project'}.`;

  const handleRowClick = (item: DeploymentOverviewItem) => {
    navigate(
      PATHS.MAPPING_DEPLOYMENT
        .replace(':projectId', item.projectId)
        .replace(':mappingId', item.mappingId),
    );
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-6 py-8" data-testid={scope === 'global' ? 'page-deployments' : 'page-project-deployments'}>
      <PageHeader
        title={title}
        description={description}
        actions={(
          <div className="rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-300" data-testid="deployment-overview-summary">
            <span className="mr-3">Failed: {result.summary.failedCount}</span>
            <span>Needs attention: {result.summary.attentionCount}</span>
          </div>
        )}
      />

      <DeploymentOverviewFilters
        filters={filters}
        onChange={(next) => {
          setCursor(undefined);
          setFilters(next);
        }}
        onResetPage={() => setCursor(undefined)}
      />

      <DeploymentOverviewTable
        items={result.items}
        isLoading={result.isLoading}
        isFetching={Boolean(result.nextCursor) && result.isFetching}
        isError={result.isError}
        errorMessage={result.errorMessage}
        nextCursor={result.nextCursor}
        onLoadMore={() => {
          if (result.nextCursor) {
            setCursor(result.nextCursor);
          }
        }}
        onRowClick={(item) => {
          if (scope === 'project' && item.projectId !== resolvedProjectId) {
            return;
          }

          handleRowClick(item);
        }}
      />
    </div>
  );
}
