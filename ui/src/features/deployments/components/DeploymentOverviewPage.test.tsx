import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DeploymentOverviewPage } from './DeploymentOverviewPage';

import { AdapterProvider, createQueryClient } from '@/lib/api';
import type { ApiAdapter, DeploymentOverviewListResponse } from '@/lib/api/types';

const pageOne: DeploymentOverviewListResponse = {
  items: [
    {
      mappingId: 'map-1',
      projectId: 'proj-1',
      projectName: 'Project One',
      mappingName: 'Orders Map',
      latestVersion: 4,
      latestVersionCreatedAt: '2026-07-07T10:00:00.000Z',
      promotionState: 'AVAILABLE',
      attentionState: 'NEEDS_ATTENTION',
      activeOperationId: null,
      lastActivityAt: '2026-07-07T11:00:00.000Z',
      lastActorId: 'user-1',
      updatedAt: '2026-07-07T11:00:00.000Z',
      environments: {
        DEV: {
          activeArtifactId: 'a-dev-1',
          activeVersion: 4,
          freshness: 'CURRENT',
          lastOperationStatus: 'FAILED',
        },
        PREPROD: {
          activeArtifactId: null,
          activeVersion: null,
          freshness: 'NOT_DEPLOYED',
          lastOperationStatus: null,
        },
        PROD: {
          activeArtifactId: null,
          activeVersion: null,
          freshness: 'NOT_DEPLOYED',
          lastOperationStatus: null,
        },
      },
    },
  ],
  page: {
    pageSize: 50,
    nextCursor: 'cursor-2',
    returned: 1,
    totalMatched: 2,
  },
  summary: {
    failedCount: 1,
    attentionCount: 1,
  },
};

const pageTwo: DeploymentOverviewListResponse = {
  items: [
    {
      mappingId: 'map-2',
      projectId: 'proj-1',
      projectName: 'Project One',
      mappingName: 'Customer Map',
      latestVersion: 3,
      latestVersionCreatedAt: '2026-07-07T10:00:00.000Z',
      promotionState: 'AVAILABLE',
      attentionState: 'OK',
      activeOperationId: null,
      lastActivityAt: '2026-07-07T10:30:00.000Z',
      lastActorId: 'user-2',
      updatedAt: '2026-07-07T10:30:00.000Z',
      environments: {
        DEV: {
          activeArtifactId: 'a-dev-2',
          activeVersion: 3,
          freshness: 'CURRENT',
          lastOperationStatus: 'SUCCEEDED',
        },
        PREPROD: {
          activeArtifactId: null,
          activeVersion: null,
          freshness: 'NOT_DEPLOYED',
          lastOperationStatus: null,
        },
        PROD: {
          activeArtifactId: null,
          activeVersion: null,
          freshness: 'NOT_DEPLOYED',
          lastOperationStatus: null,
        },
      },
    },
  ],
  page: {
    pageSize: 50,
    nextCursor: null,
    returned: 1,
    totalMatched: 2,
  },
  summary: {
    failedCount: 0,
    attentionCount: 0,
  },
};

function createAdapterGlobalOnly(): ApiAdapter {
  const adapter = {
    listGlobalDeploymentSummaries: vi
      .fn()
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce(pageOne)
      .mockResolvedValueOnce(pageTwo),
    listProjectDeploymentSummaries: vi.fn().mockResolvedValue(pageOne),
  } as unknown as ApiAdapter;

  return adapter;
}

function createAdapterProjectOnly(): ApiAdapter {
  const adapter = {
    listGlobalDeploymentSummaries: vi.fn().mockResolvedValue(pageOne),
    listProjectDeploymentSummaries: vi.fn().mockResolvedValue({
      ...pageOne,
      projectId: 'proj-1',
    }),
  } as unknown as ApiAdapter;

  return adapter;
}

function renderPage(node: ReactNode, adapter: ApiAdapter) {
  const queryClient = createQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdapterProvider adapter={adapter}>{node}</AdapterProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('DeploymentOverviewPage', () => {
  it('renders global overview and supports drill-down + filter + pagination calls', async () => {
    const user = userEvent.setup();
    const adapter = createAdapterGlobalOnly();

    renderPage(<DeploymentOverviewPage scope="global" />, adapter);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Deployments' })).toBeInTheDocument();
    });

    expect(await screen.findByTestId('deployment-overview-row-map-1')).toBeInTheDocument();

    const drilldown = screen.getByRole('link', { name: 'Open deployment details for Orders Map' });
    expect(drilldown).toHaveAttribute('href', '/projects/proj-1/mappings/map-1/deploy');

    await user.selectOptions(screen.getByLabelText('Filter by attention'), 'NEEDS_ATTENTION');

    await waitFor(() => {
      expect((adapter.listGlobalDeploymentSummaries as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          attentionState: 'NEEDS_ATTENTION',
          pageSize: 50,
        }),
      );
    });

    await user.click(screen.getByTestId('deployment-overview-load-more'));

    await waitFor(() => {
      expect((adapter.listGlobalDeploymentSummaries as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        expect.objectContaining({
          attentionState: 'NEEDS_ATTENTION',
          pageSize: 50,
        }),
      );
      expect(screen.getByTestId('deployment-overview-row-map-2')).toBeInTheDocument();
    });
  });

  it('renders project-scoped overview title', async () => {
    const adapter = createAdapterProjectOnly();

    renderPage(
      <DeploymentOverviewPage scope="project" projectId="proj-1" projectName="Project One" />,
      adapter,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Project Deployments' })).toBeInTheDocument();
    });

    expect(screen.getByText(/Project One/)).toBeInTheDocument();
  });
});
