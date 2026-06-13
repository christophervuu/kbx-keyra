import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parseBody: vi.fn(),
  requireFields: vi.fn(),
  putItem: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/project/create-project.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('create-project handler', () => {
  beforeEach(() => {
    vi.resetModules();
    getEnvStore().PROJECTS_TABLE = 'Projects';
    sharedMocks.parseBody.mockReset().mockReturnValue({ name: 'My Project', slug: 'my-project', description: 'Test' });
    sharedMocks.requireFields.mockReset().mockReturnValue({ ok: true });
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({ statusCode, body: JSON.stringify({ error: { code, message, statusCode, retryable } }) }));
    sharedMocks.internalError.mockReset().mockReturnValue({ code: 'INTERNAL_ERROR', message: 'err', statusCode: 500, retryable: true });
  });

  it('valid input returns 201 with project metadata', async () => {
    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as { projectId: string; name: string; slug: string; mappingCount: number; schemaCount: number };
    expect(parsed.name).toBe('My Project');
    expect(parsed.slug).toBe('my-project');
    expect(parsed.mappingCount).toBe(0);
    expect(parsed.schemaCount).toBe(0);
    expect(typeof parsed.projectId).toBe('string');
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(1);
  });

  it('normalizes linkedSchemaIds from schemaRefs fallback for metadata counts', async () => {
    sharedMocks.parseBody.mockReturnValue({
      name: 'My Project',
      slug: 'my-project',
      schemaRefs: [{ schemaId: 'schema-1', type: 'local' }],
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });
    const parsed = JSON.parse(result.body) as { schemaCount: number };

    expect(result.statusCode).toBe(201);
    expect(parsed.schemaCount).toBe(1);
  });

  it('missing name returns 400 validation error', async () => {
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: name', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });

  it('missing slug returns 400 validation error', async () => {
    sharedMocks.requireFields.mockReturnValue({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Missing required field: slug', statusCode: 400, retryable: false },
    });

    const { handler } = await importHandler();
    const result = await handler({ body: '{}' });

    expect(result.statusCode).toBe(400);
  });
});
