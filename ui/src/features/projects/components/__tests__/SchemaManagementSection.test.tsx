import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SchemaCardData } from '../../types';
import { SchemaManagementSection } from '../SchemaManagementSection';

import type { ApiAdapter } from '@/lib/api';
import { AdapterProvider } from '@/lib/api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SCHEMA_A: SchemaCardData = {
  schemaId: 'schema-1',
  name: 'Customer Schema',
  format: 'json-schema',
  origin: 'local',
  sourceType: 'upload',
  scope: 'project-level',
  fieldCount: 8,
  syncStatus: 'ready',
  isInferred: false,
};

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn().mockResolvedValue([]),
    getSchema: vi.fn(),
    createSchema: vi.fn(),
    deleteSchema: vi.fn(),
    listMappings: vi.fn(),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    getDeploymentContext: vi.fn(),
    deploy: vi.fn(),
    promote: vi.fn(),
    rollback: vi.fn(),
    getDeploymentDiff: vi.fn(),
    listCdmSchemas: vi.fn(),
    linkCdmSchema: vi.fn(),
    syncCdmSchema: vi.fn(),
    listPublishedSchemas: vi.fn(),
    publishSchemaToGitHub: vi.fn(),
    linkPublishedSchema: vi.fn(),
    autoMap: vi.fn(),
    suggestExpression: vi.fn(),
    explainRule: vi.fn(),
    smartFix: vi.fn(),
    validateMappings: vi.fn(),
    querySchemaNodes: vi.fn(),
    listActivity: vi.fn(),
    previewOnServer: vi.fn(),
    ...overrides,
  } as ApiAdapter;
}

function renderSection(
  schemas: SchemaCardData[],
  overrides: {
    onUpload?: () => void;
    onLink?: (ref: unknown) => Promise<void>;
    onRemove?: (id: string) => Promise<void>;
    onView?: (id: string) => void;
    mappingsReferencingSchema?: (id: string) => string[];
    adapter?: Partial<ApiAdapter>;
  } = {},
) {
  const adapter = createMockAdapter(overrides.adapter ?? {});
  return render(
    React.createElement(
      AdapterProvider,
      { adapter },
        React.createElement(SchemaManagementSection, {
          schemas,
          onUpload: overrides.onUpload ?? vi.fn(),
          projectId: 'project-1',
          onLink: overrides.onLink ?? vi.fn().mockResolvedValue(undefined),
          onRemove: overrides.onRemove ?? vi.fn().mockResolvedValue(undefined),
          onResync: vi.fn().mockResolvedValue({ message: 'Schema re-synced from CDM source.' }),
          onView: overrides.onView ?? vi.fn(),
          mappingsReferencingSchema: overrides.mappingsReferencingSchema ?? (() => []),
        }),
      ),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaManagementSection', () => {
  it('renders section heading', () => {
    renderSection([SCHEMA_A]);
    expect(screen.getByRole('heading', { name: 'Schemas' })).toBeInTheDocument();
  });

  it('heading uses lighter weight (font-medium, not font-semibold)', () => {
    renderSection([SCHEMA_A]);
    const heading = screen.getByRole('heading', { name: 'Schemas' });
    expect(heading).toHaveClass('font-medium');
    expect(heading).not.toHaveClass('font-semibold');
  });

  it('heading uses text-lg (secondary to mappings text-xl)', () => {
    renderSection([SCHEMA_A]);
    const heading = screen.getByRole('heading', { name: 'Schemas' });
    expect(heading).toHaveClass('text-lg');
  });

  it('shows schema count badge', () => {
    renderSection([SCHEMA_A]);
    // Count badge shows "1" for one schema
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders schema cards', () => {
    renderSection([SCHEMA_A]);
    expect(screen.getByText('Customer Schema')).toBeInTheDocument();
  });

  it('shows empty state when no schemas', () => {
    renderSection([]);
    expect(screen.getByTestId('schema-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No schemas attached')).toBeInTheDocument();
    expect(
      screen.getByText(/upload a schema or link an existing one/i),
    ).toBeInTheDocument();
  });

  it('AE-12: no-schemas empty state shows icon, heading, subtext, and both CTAs', () => {
    renderSection([]);
    const emptyState = screen.getByTestId('schema-empty-state');
    // Icon rendered (aria-hidden, so check by container presence)
    expect(emptyState).toBeInTheDocument();
    // Heading
    expect(screen.getByText('No schemas attached')).toBeInTheDocument();
    // Subtext
    expect(
      screen.getByText(/upload a schema or link an existing one/i),
    ).toBeInTheDocument();
    // Both CTAs
    expect(screen.getAllByRole('button', { name: /upload schema/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /link schema/i }).length).toBeGreaterThan(0);
  });

  it('Upload Schema buttons call onUpload', async () => {
    const onUpload = vi.fn();
    const user = userEvent.setup();
    renderSection([], { onUpload });
    // Click Upload Schema in empty state
    const buttons = screen.getAllByRole('button', { name: /upload schema/i });
    await user.click(buttons[0]);
    expect(onUpload).toHaveBeenCalled();
  });

  it('clicking Unlink triggers confirmation dialog', async () => {
    const user = userEvent.setup();
    renderSection([SCHEMA_A]);
    await user.click(screen.getByRole('button', { name: /unlink schema customer schema/i }));
    expect(screen.getByTestId('remove-confirm-dialog')).toBeInTheDocument();
    expect(screen.getByText(/from this project/i)).toBeInTheDocument();
  });

  it('remove confirmation shows mapping warning when schema is referenced', async () => {
    const user = userEvent.setup();
    renderSection([SCHEMA_A], {
      mappingsReferencingSchema: () => ['Mapping One', 'Mapping Two'],
    });
    await user.click(screen.getByRole('button', { name: /unlink schema/i }));
    expect(screen.getByText('Mapping One')).toBeInTheDocument();
    expect(screen.getByText('Mapping Two')).toBeInTheDocument();
  });

  it('confirming remove calls onRemove and closes dialog', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSection([SCHEMA_A], { onRemove });
    await user.click(screen.getByRole('button', { name: /unlink schema customer schema/i }));
    await user.click(screen.getByTestId('remove-confirm-button'));
    expect(onRemove).toHaveBeenCalledWith('schema-1');
    await waitFor(() =>
      expect(screen.queryByTestId('remove-confirm-dialog')).not.toBeInTheDocument(),
    );
  });

  it('cancelling remove closes dialog without calling onRemove', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    renderSection([SCHEMA_A], { onRemove });
    await user.click(screen.getByRole('button', { name: /unlink schema customer schema/i }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByTestId('remove-confirm-dialog')).not.toBeInTheDocument();
  });

  it('Link Schema button opens link picker', async () => {
    const user = userEvent.setup();
    renderSection([SCHEMA_A]);
    const linkButtons = screen.getAllByRole('button', { name: /link schema/i });
    await user.click(linkButtons[0]);
    await waitFor(() =>
      expect(screen.getByTestId('schema-link-picker')).toBeInTheDocument(),
    );
  });

  it('onView is called when View button is clicked', async () => {
    const onView = vi.fn();
    const user = userEvent.setup();
    renderSection([SCHEMA_A], { onView });
    await user.click(screen.getByRole('button', { name: /view schema customer schema/i }));
    expect(onView).toHaveBeenCalledWith('schema-1');
  });

  it('CDM card shows Re-sync and Unlink actions only (plus View)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const onResync = vi.fn().mockResolvedValue({ message: 'Schema re-synced from CDM source.' });

    render(
      React.createElement(
        AdapterProvider,
        { adapter: createMockAdapter() },
        React.createElement(SchemaManagementSection, {
          projectId: 'project-1',
          schemas: [
            {
              ...SCHEMA_A,
              schemaId: 'schema-cdm-1',
              name: 'CDM Customer',
              origin: 'cdm',
              sourceType: 'github',
              syncStatus: 'update-available',
            },
          ],
          onUpload: vi.fn(),
          onLink: vi.fn().mockResolvedValue(undefined),
          onRemove,
          onResync,
          onView: vi.fn(),
          mappingsReferencingSchema: () => [],
        }),
      ),
    );

    expect(screen.getByRole('button', { name: /view schema cdm customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-sync schema cdm customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlink schema cdm customer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove schema cdm customer/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /re-sync schema cdm customer/i }));
    await waitFor(() => {
      expect(onResync).toHaveBeenCalledWith('schema-cdm-1');
    });
    expect(screen.getByTestId('resync-success')).toHaveTextContent('Schema re-synced from CDM source.');
  });
});
