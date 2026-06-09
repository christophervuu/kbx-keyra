import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { UsageMapping } from '../../hooks/use-schema-usage';
import type { SchemaLibraryItem } from '../../types';
import { SchemaActions } from '../SchemaActions';
import { SchemaDetailPage } from '../SchemaDetailPage';
import { SchemaGitStatus } from '../SchemaGitStatus';
import { SchemaLibraryCard } from '../SchemaLibraryCard';

import { SchemaCard } from '@/features/projects/components/SchemaCard';
import { SchemaManagementSection } from '@/features/projects/components/SchemaManagementSection';
import type { SchemaCardData } from '@/features/projects/types';
import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail } from '@/lib/types/domain';

function makeProjectSchema(overrides: Partial<SchemaCardData> = {}): SchemaCardData {
  return {
    schemaId: 'schema-cdm-1',
    name: 'CDM Customer',
    format: 'json-schema',
    origin: 'cdm',
    sourceType: 'github',
    fieldCount: 12,
    syncStatus: 'synced',
    isInferred: false,
    ...overrides,
  };
}

function makeLibraryItem(overrides: Partial<SchemaLibraryItem> = {}): SchemaLibraryItem {
  return {
    schemaId: 'schema-cdm-1',
    name: 'CDM Customer',
    description: 'Canonical CDM fixture',
    origin: 'cdm',
    ownership: 'cdm',
    dataFormat: 'JSON',
    status: 'ready',
    format: 'json-schema',
    displayFormat: 'JSON',
    fieldCount: 12,
    syncStatus: 'synced',
    projectCount: 2,
    projectNames: ['Project One', 'Project Two'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeDetailSchema(overrides: Partial<SchemaDetail['metadata']> = {}): SchemaDetail {
  return {
    metadata: {
      schemaId: 'schema-cdm-1',
      name: 'CDM Customer',
      format: 'json-schema',
      fieldCount: 12,
      origin: 'cdm',
      status: 'ready',
      description: 'Canonical CDM fixture',
      syncStatus: 'synced',
      source: {
        type: 'github',
        repo: 'KBXT/CommonDataModels',
        branch: 'main',
        path: 'schemaDocuments/core/customer.cdm.json',
        commitSha: 'abc1234def5678',
      },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
      ...overrides,
    },
    content: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
    },
  };
}

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    syncCdmSchema: vi.fn().mockResolvedValue({
      schemaId: 'schema-cdm-1',
      status: 'updated',
      synced: true,
      message: 'Schema re-synced from CDM source.',
    }),
    ...overrides,
  } as unknown as ApiAdapter;
}

describe('FS-078 cross-surface CDM consistency (T-06)', () => {
  it('AE-01: renders canonical CDM origin label across Project Overview, Schema Library, and Schema Detail', async () => {
    const project = makeProjectSchema();
    const detail = makeDetailSchema();

    const { unmount } = render(
      <SchemaCard schema={project} usageCount={1} onView={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText('CDM')).toBeInTheDocument();
    unmount();

    render(
      <MemoryRouter>
        <SchemaLibraryCard item={makeLibraryItem()} />
      </MemoryRouter>,
    );
    expect(screen.getByText('CDM')).toBeInTheDocument();

    const adapter = createMockAdapter({ getSchema: vi.fn().mockResolvedValue(detail) });
    render(
      <AdapterProvider adapter={adapter}>
        <MemoryRouter initialEntries={['/schemas/schema-cdm-1']}>
          <Routes>
            <Route path="/schemas/:schemaId" element={<SchemaDetailPage schemaId="schema-cdm-1" />} />
          </Routes>
        </MemoryRouter>
      </AdapterProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText('CDM').length).toBeGreaterThan(0);
    });
  });

  it.each([
    ['synced', 'Synced', 'sync-status-synced', 'git-status-indicator-synced'],
    ['update-available', 'Update available', 'sync-status-update-available', 'git-status-indicator-update-available'],
    ['sync-failed', 'Sync failed', 'sync-status-sync-failed', 'git-status-indicator-sync-failed'],
  ] as const)('AE-02: status %s resolves consistently across all surfaces', (status, label, projectBadgeId, detailBadgeId) => {
    const projectView = render(
      <SchemaCard
        schema={makeProjectSchema({ syncStatus: status })}
        usageCount={1}
        onView={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId(projectBadgeId)).toBeInTheDocument();
    projectView.unmount();

    const libraryView = render(
      <MemoryRouter>
        <SchemaLibraryCard item={makeLibraryItem({ syncStatus: status })} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    libraryView.unmount();

    render(
      <SchemaGitStatus
        source={makeDetailSchema().metadata.source}
        syncStatus={status}
        lastSyncedAt="2026-01-02T00:00:00Z"
      />,
    );
    expect(screen.getByTestId(detailBadgeId)).toBeInTheDocument();
  });

  it('AE-03/AE-04: enforces action policy by surface (project: View/Re-sync/Unlink, library: navigation-first, detail: overflow View raw only for CDM)', async () => {
    const projectView = render(
      <SchemaCard
        schema={makeProjectSchema()}
        usageCount={1}
        onView={vi.fn()}
        onRemove={vi.fn()}
        onResync={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole('button', { name: /view schema cdm customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-sync schema cdm customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlink schema cdm customer/i })).toBeInTheDocument();
    projectView.unmount();

    const libraryView = render(
      <MemoryRouter>
        <SchemaLibraryCard item={makeLibraryItem()} />
      </MemoryRouter>,
    );
    const card = screen.getByTestId('schema-library-card');
    expect(card.querySelector('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /re-sync/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unlink/i })).not.toBeInTheDocument();
    libraryView.unmount();

    render(
      <AdapterProvider adapter={createMockAdapter()}>
        <MemoryRouter>
          <SchemaActions
            schema={makeDetailSchema()}
            onEdit={vi.fn()}
            onViewRaw={vi.fn()}
            usageMappings={[] as UsageMapping[]}
            isEditing={false}
          />
        </MemoryRouter>
      </AdapterProvider>,
    );

    expect(screen.queryByTestId('action-edit')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-overflow-trigger')).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('action-overflow-trigger'));

    expect(screen.getByTestId('action-overflow-menu')).toBeInTheDocument();
    expect(screen.getByTestId('action-view-raw')).toBeInTheDocument();
    expect(screen.queryByTestId('action-replace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-remove')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-resync')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-sync-github')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unlink/i })).not.toBeInTheDocument();
  });

  it('AE-02 fallback: unknown/legacy status deterministically maps to sync-failed across surfaces', () => {
    const projectView = render(
      <SchemaCard
        schema={makeProjectSchema({ syncStatus: 'legacy-status' })}
        usageCount={1}
        onView={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('sync-status-sync-failed')).toBeInTheDocument();
    projectView.unmount();

    const libraryView = render(
      <MemoryRouter>
        <SchemaLibraryCard item={makeLibraryItem({ syncStatus: 'legacy-status' as unknown as SchemaLibraryItem['syncStatus'] })} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('sync-status-sync-failed')).toBeInTheDocument();
    libraryView.unmount();

    render(
      <SchemaGitStatus
        source={makeDetailSchema().metadata.source}
        syncStatus={'legacy-status' as unknown as SchemaDetail['metadata']['syncStatus']}
      />,
    );
    expect(screen.getByTestId('git-status-indicator-sync-failed')).toBeInTheDocument();
  });

  it('AE-07: Re-sync success feedback remains on Project Overview (Schema Detail no longer has re-sync)', async () => {
    const user = userEvent.setup();
    const successMessage = 'Schema re-synced from CDM source.';

    const onResync = vi.fn().mockResolvedValue({ message: successMessage });
    const projectView = render(
      <SchemaManagementSection
        projectId="project-1"
        schemas={[makeProjectSchema()]}
        onUpload={vi.fn()}
        onLink={vi.fn().mockResolvedValue(undefined)}
        onRemove={vi.fn().mockResolvedValue(undefined)}
        onResync={onResync}
        onView={vi.fn()}
        mappingsReferencingSchema={() => []}
      />,
    );

    await user.click(screen.getByRole('button', { name: /re-sync schema cdm customer/i }));
    await waitFor(() => {
      expect(screen.getByTestId('resync-success')).toHaveTextContent(successMessage);
    });

    projectView.unmount();

    render(
      <AdapterProvider adapter={createMockAdapter()}>
        <MemoryRouter>
          <SchemaActions
            schema={makeDetailSchema()}
            onEdit={vi.fn()}
            onViewRaw={vi.fn()}
            usageMappings={[] as UsageMapping[]}
            isEditing={false}
          />
        </MemoryRouter>
      </AdapterProvider>,
    );

    expect(screen.queryByTestId('action-resync')).not.toBeInTheDocument();
    expect(screen.getByTestId('action-overflow-trigger')).toBeInTheDocument();
  });
});
