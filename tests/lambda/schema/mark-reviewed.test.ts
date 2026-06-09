import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  internalError: vi.fn(),
  notFound: vi.fn(),
  ERROR_CODES: { VALIDATION_ERROR: 'VALIDATION_ERROR' },
}));

const schemaMetadataMocks = vi.hoisted(() => ({
  get: vi.fn(),
  markReviewed: vi.fn(),
  aggregateReviewIssues: vi.fn(),
}));

const typesMocks = vi.hoisted(() => ({
  toSchemaMetadata: vi.fn(),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/persistence/schema-metadata.js', () => schemaMetadataMocks);
vi.mock('../../../src/lib/persistence/types.js', () => typesMocks);

async function importHandler() {
  return import('../../../src/lambda/schema/mark-reviewed.js');
}

describe('mark-reviewed schema handler', () => {
  beforeEach(() => {
    vi.resetModules();

    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({
      statusCode,
      body: JSON.stringify({ error: { code, message, statusCode, retryable } }),
    }));
    sharedMocks.internalError.mockReset().mockReturnValue({
      code: 'INTERNAL_ERROR',
      message: 'unexpected',
      statusCode: 500,
      retryable: true,
    });
    sharedMocks.notFound.mockReset().mockReturnValue({
      code: 'RESOURCE_NOT_FOUND',
      message: "Schema with id 'schema-1' not found",
      statusCode: 404,
      retryable: false,
    });

    schemaMetadataMocks.get.mockReset().mockResolvedValue({ schemaId: 'schema-1' });
    schemaMetadataMocks.markReviewed.mockReset().mockResolvedValue({
      schemaId: 'schema-1',
      inferred: true,
      reviewState: 'reviewed',
      status: 'ready',
      reviewedAt: '2026-06-09T00:00:00.000Z',
    });
    schemaMetadataMocks.aggregateReviewIssues.mockReset().mockReturnValue({
      reviewState: 'reviewed',
      reviewIssues: [{ code: 'missing_description', count: 2, blocking: false }],
      totalIssues: 2,
      blockingIssueCount: 0,
      hasBlockingIssues: false,
    });

    typesMocks.toSchemaMetadata.mockReset().mockImplementation((value: unknown) => value);
  });

  it('returns review summary and updated metadata after mark-reviewed', async () => {
    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'schema-1' } } as never);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as {
      metadata: { reviewState?: string; status?: string };
      reviewSummary: { totalIssues: number; hasBlockingIssues: boolean };
    };

    expect(body.metadata.reviewState).toBe('reviewed');
    expect(body.metadata.status).toBe('ready');
    expect(body.reviewSummary.totalIssues).toBe(2);
    expect(body.reviewSummary.hasBlockingIssues).toBe(false);
  });

  it('returns 404 when schema is not found', async () => {
    schemaMetadataMocks.get.mockResolvedValueOnce(null);

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: { id: 'missing' } } as never);

    expect(result.statusCode).toBe(404);
  });

  it('returns 400 when id path param is missing', async () => {
    sharedMocks.parsePathParam.mockReturnValueOnce(undefined);

    const { handler } = await importHandler();
    const result = await handler({ pathParameters: {} } as never);

    expect(result.statusCode).toBe(400);
  });
});
