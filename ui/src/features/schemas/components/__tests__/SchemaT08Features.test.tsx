import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, beforeEach, vi } from 'vitest';

import { InferredSchemaBanner } from '../InferredSchemaBanner';
import { ReplaceFileDialog } from '../ReplaceFileDialog';
import { ViewRawModal } from '../ViewRawModal';

import { AdapterProvider } from '@/lib/api';
import type { ApiAdapter } from '@/lib/api';
import type { SchemaDetail } from '@/lib/types';

describe('InferredSchemaBanner', () => {
  it('renders nothing when inferred is false', () => {
    render(<InferredSchemaBanner inferred={false} />);
    expect(screen.queryByTestId('inferred-schema-banner')).not.toBeInTheDocument();
  });

  it('renders the banner when inferred is true', () => {
    render(<InferredSchemaBanner inferred={true} />);
    expect(screen.getByTestId('inferred-schema-banner')).toBeInTheDocument();
    expect(screen.getByText(/inferred from sample data/i)).toBeInTheDocument();
  });

  it('shows Mark as Reviewed button only for needs_review', () => {
    render(
      <InferredSchemaBanner
        inferred={true}
        needsReview={true}
        onMarkReviewed={vi.fn()}
      />,
    );

    expect(screen.getByTestId('mark-reviewed-button')).toBeInTheDocument();
  });

  it('calls onMarkReviewed when button is clicked', async () => {
    const onMarkReviewed = vi.fn();
    render(
      <InferredSchemaBanner
        inferred={true}
        needsReview={true}
        onMarkReviewed={onMarkReviewed}
      />,
    );

    await userEvent.click(screen.getByTestId('mark-reviewed-button'));

    expect(onMarkReviewed).toHaveBeenCalledOnce();
  });

  it('renders mark reviewed error when provided', () => {
    render(
      <InferredSchemaBanner
        inferred={true}
        needsReview={true}
        onMarkReviewed={vi.fn()}
        markReviewedError="Unable to mark as reviewed"
      />,
    );

    expect(screen.getByTestId('mark-reviewed-error')).toHaveTextContent('Unable to mark as reviewed');
  });
});

describe('ViewRawModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  it('renders nothing when closed', () => {
    render(
      <ViewRawModal open={false} onClose={onClose} content={{ type: 'object' }} format="json-schema" />,
    );
    expect(screen.queryByTestId('view-raw-modal')).not.toBeInTheDocument();
  });

  it('renders modal with JSON content when open', () => {
    render(
      <ViewRawModal
        open={true}
        onClose={onClose}
        content={{ type: 'object', properties: {} }}
        format="json-schema"
      />,
    );
    expect(screen.getByTestId('view-raw-modal')).toBeInTheDocument();
    const pre = screen.getByTestId('view-raw-content');
    // The raw string should be in the rendered HTML (via dangerouslySetInnerHTML)
    expect(pre.textContent).toContain('"type"');
  });

  it('renders modal with XSD string content', () => {
    render(
      <ViewRawModal
        open={true}
        onClose={onClose}
        content="<xs:schema></xs:schema>"
        format="xsd"
      />,
    );
    expect(screen.getByTestId('view-raw-modal')).toBeInTheDocument();
    expect(screen.getByTestId('view-raw-content').textContent).toContain('xs:schema');
  });

  it('close button calls onClose', async () => {
    render(
      <ViewRawModal open={true} onClose={onClose} content={{ type: 'object' }} format="json-schema" />,
    );
    await userEvent.click(screen.getByTestId('view-raw-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('copy button calls clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <ViewRawModal open={true} onClose={onClose} content={{ type: 'object' }} format="json-schema" />,
    );
    await userEvent.click(screen.getByTestId('view-raw-copy'));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('"type"'),
    );
  });
});

const VALID_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { name: { type: 'string' } },
});

const INVALID_JSON = 'not valid json {{{{';

function makeUploadFile(contents: string, name: string, type: string) {
  const file = new File([contents], name, { type });
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(contents),
      configurable: true,
    });
  }
  return file;
}

const MOCK_DETAIL: SchemaDetail = {
  metadata: {
    schemaId: 'schema-replace-1',
    name: 'Replaced',
    format: 'json-schema',
    fieldCount: 2,
    origin: 'local',
    status: 'ready',
    scope: 'project',
    syncStatus: 'sync-failed',
    source: { type: 'upload' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  content: { type: 'object', properties: { name: { type: 'string' } } },
};

function createMockAdapter(overrides: Partial<ApiAdapter> = {}): ApiAdapter {
  return {
    listSchemas: vi.fn(),
    getSchema: vi.fn().mockResolvedValue(MOCK_DETAIL),
    createSchema: vi.fn(),
    updateSchema: vi.fn().mockResolvedValue(MOCK_DETAIL.metadata),
    deleteSchema: vi.fn(),
    listMappings: vi.fn().mockResolvedValue([]),
    getMapping: vi.fn(),
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
    duplicateMapping: vi.fn(),
    listProjects: vi.fn().mockResolvedValue([]),
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
  } as unknown as ApiAdapter;
}

function renderDialog(adapter: ApiAdapter, onReplaced = vi.fn(), onClose = vi.fn()) {
  return render(
    <AdapterProvider adapter={adapter}>
      <MemoryRouter>
        <ReplaceFileDialog
          open={true}
          onClose={onClose}
          schemaId="schema-replace-1"
          currentFormat="json-schema"
          onReplaced={onReplaced}
        />
      </MemoryRouter>
    </AdapterProvider>,
  );
}

describe('ReplaceFileDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <AdapterProvider adapter={createMockAdapter()}>
        <MemoryRouter>
          <ReplaceFileDialog
            open={false}
            onClose={vi.fn()}
            schemaId="s1"
            currentFormat="json-schema"
            onReplaced={vi.fn()}
          />
        </MemoryRouter>
      </AdapterProvider>,
    );
    expect(screen.queryByTestId('replace-file-dialog')).not.toBeInTheDocument();
  });

  it('shows confirmation message in step 1', () => {
    renderDialog(createMockAdapter());
    expect(screen.getByTestId('replace-confirm-message')).toBeInTheDocument();
    expect(screen.getByText(/replace the current schema content/i)).toBeInTheDocument();
  });

  it('advances to file pick step on confirm click', async () => {
    renderDialog(createMockAdapter());
    await userEvent.click(screen.getByTestId('replace-confirm-button'));
    expect(screen.getByTestId('replace-pick-button')).toBeInTheDocument();
  });

  it('shows error when invalid JSON file is selected', async () => {
    renderDialog(createMockAdapter());
    await userEvent.click(screen.getByTestId('replace-confirm-button'));

    const file = makeUploadFile(INVALID_JSON, 'schema.json', 'application/json');
    const input = screen.getByTestId('replace-file-input');
    await userEvent.upload(input, file);

    const errorEl = await screen.findByTestId('replace-parse-error');
    expect(errorEl).toHaveTextContent(/not valid JSON/i);
  });

  it('calls updateSchema and onReplaced when valid JSON file is selected', async () => {
    const updateSchema = vi.fn().mockResolvedValue(MOCK_DETAIL.metadata);
    const getSchema = vi.fn().mockResolvedValue(MOCK_DETAIL);
    const onReplaced = vi.fn();

    renderDialog(createMockAdapter({ updateSchema, getSchema }), onReplaced);
    await userEvent.click(screen.getByTestId('replace-confirm-button'));

    const file = makeUploadFile(VALID_JSON_SCHEMA, 'schema.json', 'application/json');
    const input = screen.getByTestId('replace-file-input');
    await userEvent.upload(input, file);

    await screen.findByText(/replace schema file/i); // wait for async

    // Allow async ops to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(updateSchema).toHaveBeenCalledWith(
      'schema-replace-1',
      expect.objectContaining({ format: 'json-schema' }),
    );
    expect(onReplaced).toHaveBeenCalledWith(MOCK_DETAIL);
  });
});
