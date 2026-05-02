import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaMetadata, SchemaRef } from '@/lib/types/domain';

import { SchemaUploadDialog } from '../SchemaUploadDialog';

// ---------------------------------------------------------------------------
// FileReader mock helpers
// ---------------------------------------------------------------------------

function mockFileReaderWith(content: string) {
  const mockLoad = vi.fn();

  vi.stubGlobal(
    'FileReader',
    class MockFileReader {
      onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      result: string = content;

      readAsText() {
        // Invoke onload asynchronously
        setTimeout(() => {
          this.onload?.({ target: this as unknown as FileReader } as ProgressEvent<FileReader>);
        }, 0);
      }

      static _mockLoad = mockLoad;
    },
  );
}

function mockFileReaderError() {
  vi.stubGlobal(
    'FileReader',
    class MockFileReader {
      onload: ((ev: ProgressEvent<FileReader>) => void) | null = null;
      onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null;

      readAsText() {
        setTimeout(() => {
          this.onerror?.({} as ProgressEvent<FileReader>);
        }, 0);
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREATED_SCHEMA: SchemaMetadata = {
  schemaId: 'schema-new',
  name: 'my-schema',
  format: 'json-schema',
  fieldCount: 3,
  origin: 'local',
  status: 'ready',
  source: { type: 'upload' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const VALID_JSON_SCHEMA = JSON.stringify({
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
    active: { type: 'boolean' },
  },
});

const SAMPLE_JSON = JSON.stringify({ name: 'Alice', age: 30 });

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn(),
    createSchema: vi.fn().mockResolvedValue(CREATED_SCHEMA),
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
    smartFix: vi.fn(),
    previewMapping: vi.fn(),
    ...overrides,
  } as unknown as ApiAdapter;
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderDialog(
  adapter: ApiAdapter,
  opts: {
    open?: boolean;
    onClose?: () => void;
    onSchemaCreated?: (ref: SchemaRef) => Promise<void>;
  } = {},
) {
  return render(
    <AdapterProvider adapter={adapter}>
      <SchemaUploadDialog
        open={opts.open ?? true}
        onClose={opts.onClose ?? vi.fn()}
        onSchemaCreated={opts.onSchemaCreated ?? vi.fn().mockResolvedValue(undefined)}
      />
    </AdapterProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaUploadDialog', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders nothing when open=false', () => {
    renderDialog(createMockAdapter(), { open: false });
    expect(screen.queryByTestId('schema-upload-dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when open=true', () => {
    renderDialog(createMockAdapter());
    expect(screen.getByTestId('schema-upload-dialog')).toBeInTheDocument();
    expect(screen.getByText('Upload Schema')).toBeInTheDocument();
  });

  it('file input accepts correct extensions', () => {
    renderDialog(createMockAdapter());
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    expect(input.accept).toContain('.json');
    expect(input.accept).toContain('.xsd');
    expect(input.accept).toContain('.xml');
  });

  it('Upload button is disabled before file is selected', () => {
    renderDialog(createMockAdapter());
    expect(screen.getByTestId('upload-button')).toBeDisabled();
  });

  it('shows file info and format badge after JSON Schema file selected', async () => {
    mockFileReaderWith(VALID_JSON_SCHEMA);
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    const file = new File([VALID_JSON_SCHEMA], 'my-schema.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('file-info')).toBeInTheDocument();
    });

    expect(screen.getByTestId('format-badge')).toHaveTextContent('JSON Schema');
    expect(screen.queryByTestId('inferred-warning')).not.toBeInTheDocument();
  });

  it('shows inferred warning for sample JSON file', async () => {
    mockFileReaderWith(SAMPLE_JSON);
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    const file = new File([SAMPLE_JSON], 'sample.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('inferred-warning')).toBeInTheDocument();
    });

    expect(screen.getByTestId('format-badge')).toHaveTextContent('Sample JSON');
  });

  it('shows error for empty file', async () => {
    mockFileReaderWith('');
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    const file = new File([''], 'empty.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('file-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/file is empty/i)).toBeInTheDocument();
  });

  it('shows error when FileReader fails', async () => {
    mockFileReaderError();
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    const file = new File(['content'], 'bad.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('file-error')).toBeInTheDocument();
    });

    expect(screen.getByText(/could not read file/i)).toBeInTheDocument();
  });

  it('calls createSchema and onSchemaCreated on Upload', async () => {
    mockFileReaderWith(VALID_JSON_SCHEMA);
    const createSchema = vi.fn().mockResolvedValue(CREATED_SCHEMA);
    const onSchemaCreated = vi.fn().mockResolvedValue(undefined);
    const adapter = createMockAdapter({ createSchema });
    const user = userEvent.setup();
    renderDialog(adapter, { onSchemaCreated });

    const file = new File([VALID_JSON_SCHEMA], 'my-schema.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('upload-button')).not.toBeDisabled();
    });

    await user.click(screen.getByTestId('upload-button'));

    await waitFor(() => {
      expect(createSchema).toHaveBeenCalled();
      expect(onSchemaCreated).toHaveBeenCalledWith(
        expect.objectContaining({ schemaId: 'schema-new' }),
      );
    });
  });

  it('Cancel button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(createMockAdapter(), { onClose });

    await user.click(screen.getByTestId('cancel-button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows scope radio options', () => {
    renderDialog(createMockAdapter());
    expect(screen.getByTestId('scope-global')).toBeInTheDocument();
    expect(screen.getByTestId('scope-project-level')).toBeInTheDocument();
    // Project-level is default selected
    expect((screen.getByTestId('scope-project-level') as HTMLInputElement).checked).toBe(true);
  });
});
