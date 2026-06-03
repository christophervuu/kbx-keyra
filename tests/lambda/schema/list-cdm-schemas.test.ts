import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parseQueryParam: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  validationError: vi.fn(),
  serviceUnavailable: vi.fn(),
  internalError: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    SOURCE_NOT_FOUND: 'SOURCE_NOT_FOUND',
  },
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/list-cdm-schemas.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('list-cdm-schemas handler', () => {
  beforeEach(() => {
    vi.resetModules();
    const env = getEnvStore();
    env.GITHUB_API_BASE = 'https://api.github.com';
    env.GITHUB_TOKEN = 'ghp_test_token';
    env.CDM_REPO_OWNER = 'KBXT';
    env.CDM_REPO_NAME = 'KBX-Canonicals';
    env.CDM_REPO_BRANCH = 'main';
    env.CDM_ROOT_PATH = 'JSONSchemas/CommonDataModels';

    sharedMocks.parseQueryParam.mockReset().mockReturnValue(null);
    sharedMocks.jsonResponse
      .mockReset()
      .mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId) => ({
        statusCode,
        body: JSON.stringify({ error: { code, message, statusCode, retryable, requestId } }),
      }));

    sharedMocks.validationError
      .mockReset()
      .mockReturnValue({
        code: 'VALIDATION_ERROR',
        message: 'Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.',
        statusCode: 400,
        retryable: false,
        requestId: 'req-validation',
      });
    sharedMocks.serviceUnavailable
      .mockReset()
      .mockReturnValue({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
        statusCode: 503,
        retryable: true,
        requestId: 'req-unavailable',
      });
    sharedMocks.internalError
      .mockReset()
      .mockReturnValue({
        code: 'INTERNAL_ERROR',
        message: 'Internal failure',
        statusCode: 500,
        retryable: true,
        requestId: 'req-internal',
      });

    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('lists one-level CDM directory entries under root path (AE-01)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: vi.fn().mockResolvedValue([
        {
          name: 'Patient',
          path: 'JSONSchemas/CommonDataModels/Patient',
          type: 'dir',
          sha: 'sha-dir-1',
          html_url: 'https://github.com/KBXT/KBX-Canonicals/tree/main/JSONSchemas/CommonDataModels/Patient',
        },
        {
          name: 'Encounter.json',
          path: 'JSONSchemas/CommonDataModels/Encounter.json',
          type: 'file',
          sha: 'sha-file-1',
          size: 321,
          download_url: 'https://raw.githubusercontent.com/KBXT/KBX-Canonicals/main/JSONSchemas/CommonDataModels/Encounter.json',
        },
      ]),
    });

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: null } as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/repos/KBXT/KBX-Canonicals/contents/JSONSchemas/CommonDataModels?ref=main');

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual([
      {
        name: 'Patient',
        path: 'JSONSchemas/CommonDataModels/Patient',
        type: 'dir',
        sha: 'sha-dir-1',
        htmlUrl: 'https://github.com/KBXT/KBX-Canonicals/tree/main/JSONSchemas/CommonDataModels/Patient',
      },
      {
        name: 'Encounter.json',
        path: 'JSONSchemas/CommonDataModels/Encounter.json',
        type: 'file',
        sha: 'sha-file-1',
        size: 321,
        downloadUrl: 'https://raw.githubusercontent.com/KBXT/KBX-Canonicals/main/JSONSchemas/CommonDataModels/Encounter.json',
      },
    ]);
  });

  it('supports client-driven navigation by requested child path (one level per request)', async () => {
    sharedMocks.parseQueryParam.mockReturnValue('Patient');
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: vi.fn().mockResolvedValue([]),
    });

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: { path: 'Patient' } } as never);

    expect(result.statusCode).toBe(200);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('/contents/JSONSchemas/CommonDataModels/Patient?ref=main');
  });

  it('rejects out-of-root path traversal with deterministic validation error', async () => {
    sharedMocks.parseQueryParam.mockReturnValue('../outside');

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: { path: '../outside' } } as never);

    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.validationError).toHaveBeenCalledWith('Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.');
  });

  it('rejects nested traversal attempts that try to escape CDM root', async () => {
    sharedMocks.parseQueryParam.mockReturnValue('Patient/../../outside');

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: { path: 'Patient/../../outside' } } as never);

    expect(result.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.validationError).toHaveBeenCalledWith('Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.');
  });

  it('returns SOURCE_NOT_FOUND for missing CDM path', async () => {
    sharedMocks.parseQueryParam.mockReturnValue('UnknownFolder');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: vi.fn().mockResolvedValue({ message: 'Not Found' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: { path: 'UnknownFolder' } } as never);

    expect(result.statusCode).toBe(404);
    const parsed = JSON.parse(result.body) as { error: { code: string } };
    expect(parsed.error.code).toBe('SOURCE_NOT_FOUND');
  });

  it('maps rate-limit responses to service unavailable message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: {
        get: vi.fn().mockImplementation((name: string) => (name.toLowerCase() === 'x-ratelimit-remaining' ? '0' : null)),
      },
      json: vi.fn().mockResolvedValue({ message: 'API rate limit exceeded' }),
    });

    const { handler } = await importHandler();
    const result = await handler({ queryStringParameters: null } as never);

    expect(result.statusCode).toBe(503);
    expect(sharedMocks.serviceUnavailable).toHaveBeenCalledWith('GitHub rate limit reached. Please retry shortly.');
    expect(sharedMocks.errorResponse).toHaveBeenCalledWith(
      'SERVICE_UNAVAILABLE',
      'Service unavailable',
      503,
      true,
      'req-unavailable',
    );
  });

  it('uses read-only GitHub content listing call only (no write endpoint usage)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      json: vi.fn().mockResolvedValue([]),
    });

    const { handler } = await importHandler();
    await handler({ queryStringParameters: null } as never);

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    const method = (fetchMock.mock.calls[0]?.[1] as { method?: string } | undefined)?.method;

    expect(method).toBe('GET');
    expect(calledUrl).toContain('/repos/KBXT/KBX-Canonicals/contents/');
    expect(calledUrl).not.toContain('/git/refs');
    expect(calledUrl).not.toContain('/git/trees');
    expect(calledUrl).not.toContain('/contents/JSONSchemas/CommonDataModels?ref=main&message=');
  });
});
