import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText('Add Schema')).toBeInTheDocument();
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

// ---------------------------------------------------------------------------
// Mode toggle tests
// ---------------------------------------------------------------------------

describe('SchemaUploadDialog — mode toggle', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders mode toggle with Upload File and Paste Content tabs', () => {
    renderDialog(createMockAdapter());
    expect(screen.getByTestId('mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-file')).toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-paste')).toBeInTheDocument();
  });

  it('Upload File tab is active by default', () => {
    renderDialog(createMockAdapter());
    expect(screen.getByTestId('mode-tab-file')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('mode-tab-paste')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('file-input')).toBeInTheDocument();
    expect(screen.queryByTestId('paste-input')).not.toBeInTheDocument();
  });

  it('clicking Paste Content shows textarea and hides file input', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    expect(screen.getByTestId('paste-input')).toBeInTheDocument();
    expect(screen.queryByTestId('file-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('mode-tab-paste')).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking Upload File restores file input after switching to paste', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));
    await user.click(screen.getByTestId('mode-tab-file'));

    expect(screen.getByTestId('file-input')).toBeInTheDocument();
    expect(screen.queryByTestId('paste-input')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Paste mode tests (AE-01, AE-02, AE-03, AE-08)
// ---------------------------------------------------------------------------

describe('SchemaUploadDialog — paste mode', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('AE-01: pasting valid JSON Schema shows format badge, field count, and default name', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: VALID_JSON_SCHEMA } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(screen.getByTestId('format-badge')).toHaveTextContent('JSON Schema');
    });

    expect(screen.getByTestId('field-count')).toBeInTheDocument();
    expect(screen.queryByTestId('inferred-warning')).not.toBeInTheDocument();

    const nameInput = screen.getByTestId('schema-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Pasted JSON Schema');

    expect(screen.getByTestId('upload-button')).not.toBeDisabled();
  });

  it('AE-02: pasting sample JSON shows inferred warning and default name', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: SAMPLE_JSON } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(screen.getByTestId('format-badge')).toHaveTextContent('Sample JSON');
    });

    expect(screen.getByTestId('inferred-warning')).toBeInTheDocument();

    const nameInput = screen.getByTestId('schema-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Pasted Sample JSON');
  });

  it('AE-03: pasting invalid content shows error and disables Add Schema button', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: 'this is not json' } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(screen.getByTestId('paste-error')).toBeInTheDocument();
    });

    expect(screen.getByTestId('paste-error')).toHaveTextContent(
      /could not determine format/i,
    );
    expect(screen.getByTestId('upload-button')).toBeDisabled();
  });

  it('AE-08: format badge does not appear until textarea is blurred, but name input is always visible', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    // Schema Name input is always visible — even before any content is pasted
    expect(screen.getByTestId('schema-name-input')).toBeInTheDocument();

    const textarea = screen.getByTestId('paste-input');
    // Set value without blurring
    fireEvent.change(textarea, { target: { value: VALID_JSON_SCHEMA } });

    // Format badge not yet shown (analysis runs on blur)
    expect(screen.queryByTestId('format-badge')).not.toBeInTheDocument();

    // Now blur
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(screen.getByTestId('format-badge')).toBeInTheDocument();
    });
  });

  it('schema name input is visible immediately in paste mode before any content', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    expect(screen.getByTestId('schema-name-input')).toBeInTheDocument();
  });

  it('AE-03: pasting JSON Schema with title auto-fills Schema Name immediately (no blur needed)', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    const schemaWithTitle = JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Patient Record',
      type: 'object',
      properties: { id: { type: 'string' } },
    });

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: schemaWithTitle } });

    // Name auto-filled immediately — no blur required
    const nameInput = screen.getByTestId('schema-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Patient Record');
  });

  it('AE-04: manual edit to Schema Name is preserved when pasting JSON with a different title', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    // Manually set a name
    const nameInput = screen.getByTestId('schema-name-input');
    await user.type(nameInput, 'My Custom Name');

    // Now paste JSON with a title
    const schemaWithTitle = JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Should Not Overwrite',
      type: 'object',
    });

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: schemaWithTitle } });

    // Name should remain as manually entered
    expect((screen.getByTestId('schema-name-input') as HTMLInputElement).value).toBe('My Custom Name');
  });

  it('pasting JSON without title leaves Schema Name empty', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: VALID_JSON_SCHEMA } });

    const nameInput = screen.getByTestId('schema-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  it('pasting invalid JSON does not crash and leaves Schema Name empty', async () => {
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    await user.click(screen.getByTestId('mode-tab-paste'));

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: 'not valid json {{' } });

    const nameInput = screen.getByTestId('schema-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  it('paste mode creates schema via adapter on Add Schema click', async () => {
    const createSchema = vi.fn().mockResolvedValue(CREATED_SCHEMA);
    const onSchemaCreated = vi.fn().mockResolvedValue(undefined);
    const adapter = createMockAdapter({ createSchema });
    const user = userEvent.setup();
    renderDialog(adapter, { onSchemaCreated });

    await user.click(screen.getByTestId('mode-tab-paste'));

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: VALID_JSON_SCHEMA } });
    fireEvent.blur(textarea);

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
});

// ---------------------------------------------------------------------------
// Schema name field tests (AE-04, AE-05, AE-06)
// ---------------------------------------------------------------------------

describe('SchemaUploadDialog — schema name field', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('AE-04: file upload pre-populates name with filename sans extension', async () => {
    mockFileReaderWith(VALID_JSON_SCHEMA);
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    const file = new File([VALID_JSON_SCHEMA], 'patient-record.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('schema-name-input')).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId('schema-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('patient-record');
  });

  it('AE-04: edited name is used when creating schema in file mode', async () => {
    mockFileReaderWith(VALID_JSON_SCHEMA);
    const createSchema = vi.fn().mockResolvedValue(CREATED_SCHEMA);
    const adapter = createMockAdapter({ createSchema });
    const user = userEvent.setup();
    renderDialog(adapter);

    const file = new File([VALID_JSON_SCHEMA], 'patient-record.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('schema-name-input')).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId('schema-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'Patient Record v2');

    await user.click(screen.getByTestId('upload-button'));

    await waitFor(() => {
      expect(createSchema).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Patient Record v2' }),
      );
    });
  });

  it('AE-05: edited name is used when creating schema in paste mode', async () => {
    const createSchema = vi.fn().mockResolvedValue(CREATED_SCHEMA);
    const adapter = createMockAdapter({ createSchema });
    const user = userEvent.setup();
    renderDialog(adapter);

    await user.click(screen.getByTestId('mode-tab-paste'));

    const textarea = screen.getByTestId('paste-input');
    fireEvent.change(textarea, { target: { value: VALID_JSON_SCHEMA } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(screen.getByTestId('schema-name-input')).toBeInTheDocument();
    });

    const nameInput = screen.getByTestId('schema-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'Order Response Schema');

    await user.click(screen.getByTestId('upload-button'));

    await waitFor(() => {
      expect(createSchema).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Order Response Schema' }),
      );
    });
  });

  it('AE-06: clearing name disables Add Schema button', async () => {
    mockFileReaderWith(VALID_JSON_SCHEMA);
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    const file = new File([VALID_JSON_SCHEMA], 'my-schema.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('upload-button')).not.toBeDisabled();
    });

    const nameInput = screen.getByTestId('schema-name-input');
    await user.clear(nameInput);

    expect(screen.getByTestId('upload-button')).toBeDisabled();
  });

  it('AE-06: whitespace-only name disables Add Schema button', async () => {
    mockFileReaderWith(VALID_JSON_SCHEMA);
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    const file = new File([VALID_JSON_SCHEMA], 'my-schema.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('upload-button')).not.toBeDisabled();
    });

    const nameInput = screen.getByTestId('schema-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, '   ');

    expect(screen.getByTestId('upload-button')).toBeDisabled();
  });

  it('file re-selection resets name to new filename default', async () => {
    mockFileReaderWith(VALID_JSON_SCHEMA);
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    // Upload first file
    const file1 = new File([VALID_JSON_SCHEMA], 'first-schema.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file1);

    await waitFor(() => {
      expect(screen.getByTestId('schema-name-input')).toBeInTheDocument();
    });

    // Edit the name
    const nameInput = screen.getByTestId('schema-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'My Custom Name');
    expect((nameInput as HTMLInputElement).value).toBe('My Custom Name');

    // Upload a second file — name should reset
    const file2 = new File([VALID_JSON_SCHEMA], 'second-schema.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file2);

    await waitFor(() => {
      expect((screen.getByTestId('schema-name-input') as HTMLInputElement).value).toBe('second-schema');
    });
  });
});

// ---------------------------------------------------------------------------
// Mode toggle state preservation test (AE-07)
// ---------------------------------------------------------------------------

describe('SchemaUploadDialog — mode toggle state preservation (AE-07)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('AE-07: switching to paste and back preserves file info', async () => {
    mockFileReaderWith(VALID_JSON_SCHEMA);
    const user = userEvent.setup();
    renderDialog(createMockAdapter());

    // Upload a file
    const file = new File([VALID_JSON_SCHEMA], 'my-schema.json', { type: 'application/json' });
    await user.upload(screen.getByTestId('file-input'), file);

    await waitFor(() => {
      expect(screen.getByTestId('file-info')).toBeInTheDocument();
    });

    // Switch to paste mode
    await user.click(screen.getByTestId('mode-tab-paste'));
    expect(screen.queryByTestId('file-info')).not.toBeInTheDocument();

    // Switch back to file mode
    await user.click(screen.getByTestId('mode-tab-file'));

    // File info should still be visible
    expect(screen.getByTestId('file-info')).toBeInTheDocument();
    expect(screen.getByTestId('format-badge')).toHaveTextContent('JSON Schema');
  });
});
