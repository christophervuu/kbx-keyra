import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  generateRequestId: vi.fn(),
  scan: vi.fn(),
  getItem: vi.fn(),
  putItem: vi.fn(),
  putObject: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  validationError: vi.fn(),
  serviceUnavailable: vi.fn(),
}));

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/sync-all-cdm-schemas.js');
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

describe('sync-all-cdm-schemas handler', () => {
  beforeEach(() => {
    vi.resetModules();

    const env = getEnvStore();
    env.GITHUB_API_BASE = 'https://api.github.com';
    env.GITHUB_TOKEN = 'ghp_test_token';
    env.CDM_REPO_OWNER = 'KBXT';
    env.CDM_REPO_NAME = 'KBX-Canonicals';
    env.CDM_REPO_ID = '1052821334';
    env.CDM_REPO_BRANCH = 'main';
    env.CDM_ROOT_PATH = 'JSONSchemas-bundled/CommonDataModels';
    env.SCHEMAS_TABLE = 'Schemas';
    env.CONTENT_BUCKET = 'Content';
    env.CDM_GITHUB_READ_MAX_ATTEMPTS = '3';
    env.CDM_GITHUB_READ_BASE_DELAY_MS = '1';
    env.CDM_GITHUB_READ_MAX_DELAY_MS = '1';
    env.CDM_GITHUB_READ_JITTER_MS = '1';

    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-sync-all-1');
    sharedMocks.scan.mockReset().mockResolvedValue([]);
    sharedMocks.getItem.mockReset().mockResolvedValue(null);
    sharedMocks.putItem.mockReset().mockResolvedValue(undefined);
    sharedMocks.putObject.mockReset().mockResolvedValue(undefined);
    sharedMocks.jsonResponse
      .mockReset()
      .mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse
      .mockReset()
      .mockImplementation((code, message, statusCode, retryable, requestId, details, additionalHeaders) => ({
        statusCode,
        headers: {
          ...((additionalHeaders as Record<string, string> | undefined) ?? {}),
        },
        body: JSON.stringify({
          error: {
            code,
            message,
            statusCode,
            retryable,
            requestId,
            ...(details !== undefined ? { details } : {}),
          },
        }),
      }));

    sharedMocks.validationError
      .mockReset()
      .mockImplementation((message: string) => ({
        code: 'VALIDATION_ERROR',
        message,
        statusCode: 400,
        retryable: false,
      }));
    sharedMocks.serviceUnavailable
      .mockReset()
      .mockImplementation((message: string) => ({
        code: 'SERVICE_UNAVAILABLE',
        message,
        statusCode: 503,
        retryable: true,
      }));

    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('recursively imports candidate CDM files and returns summary', async () => {
    // Directory listing at root
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([
          {
            name: 'nested',
            path: 'JSONSchemas-bundled/CommonDataModels/nested',
            type: 'dir',
            sha: 'sha-dir-1',
          },
          {
            name: 'Encounter.json',
            path: 'JSONSchemas-bundled/CommonDataModels/Encounter.json',
            type: 'file',
            sha: 'sha-file-1',
          },
        ]),
      })
      // Directory listing at nested dir
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue([
          {
            name: 'Invoice.xsd',
            path: 'JSONSchemas-bundled/CommonDataModels/nested/Invoice.xsd',
            type: 'file',
            sha: 'sha-file-2',
          },
        ]),
      })
      // Fetch file payload Encounter
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue({
          name: 'Encounter.json',
          path: 'JSONSchemas-bundled/CommonDataModels/Encounter.json',
          type: 'file',
          sha: 'sha-file-1',
          content: Buffer.from('{"type":"object"}', 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      })
      // Fetch file payload Invoice
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: vi.fn().mockResolvedValue({
          name: 'Invoice.xsd',
          path: 'JSONSchemas-bundled/CommonDataModels/nested/Invoice.xsd',
          type: 'file',
          sha: 'sha-file-2',
          content: Buffer.from('<xsd:schema></xsd:schema>', 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      });

    const { handler } = await importHandler();
    const result = await handler({ headers: {} } as never);

    expect(result.statusCode).toBe(200);
    const parsed = JSON.parse(result.body) as {
      scannedFiles: number;
      imported: number;
      skipped: number;
      failed: number;
      excludedSchemaIds: string[];
      message: string;
    };

    expect(parsed.scannedFiles).toBe(2);
    expect(parsed.imported).toBe(2);
    expect(parsed.skipped).toBe(0);
    expect(parsed.failed).toBe(0);
    expect(parsed.excludedSchemaIds).toContain('c0f95533-4965-45cc-8b35-5adbd44630f5');
    expect(parsed.message).toBe('CDM sync completed.');

    expect(sharedMocks.putObject).toHaveBeenCalledTimes(2);
    expect(sharedMocks.putItem).toHaveBeenCalledTimes(2);
  });

  it('returns service unavailable when GitHub token is missing', async () => {
    delete getEnvStore().GITHUB_TOKEN;

    const { handler } = await importHandler();
    const result = await handler({ headers: {} } as never);

    expect(result.statusCode).toBe(503);
    expect(sharedMocks.serviceUnavailable).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sharedMocks.putItem).not.toHaveBeenCalled();
  });
});
