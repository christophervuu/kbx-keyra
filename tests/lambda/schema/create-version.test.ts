import { beforeEach, describe, expect, it, vi } from 'vitest';

const sharedMocks = vi.hoisted(() => ({
  parsePathParam: vi.fn(),
  parseBody: vi.fn(),
  generateRequestId: vi.fn(),
  jsonResponse: vi.fn(),
  errorResponse: vi.fn(),
  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    CONFLICT: 'CONFLICT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
  },
}));

const schemaLifecycleMocks = vi.hoisted(() => ({
  createImmutableSchemaVersion: vi.fn(),
}));

const sfnMocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ executionArn: 'arn:aws:states:local:123:execution:derived:run-1' }),
}));

vi.mock('../../../src/lambda/shared/index.js', () => sharedMocks);
vi.mock('../../../src/lib/schema/lifecycle.js', () => schemaLifecycleMocks);
vi.mock('@aws-sdk/client-sfn', () => ({
  SFNClient: vi.fn().mockImplementation(() => ({ send: sfnMocks.send })),
  StartExecutionCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

async function importHandler() {
  return import('../../../src/lambda/schema/create-version.js');
}

describe('schema create-version handler', () => {
  beforeEach(() => {
    vi.resetModules();
    sharedMocks.parsePathParam.mockReset().mockReturnValue('schema-1');
    sharedMocks.parseBody.mockReset().mockReturnValue({ expectedDraftRevision: 3 });
    sharedMocks.generateRequestId.mockReset().mockReturnValue('req-1');
    sharedMocks.jsonResponse.mockReset().mockImplementation((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
    sharedMocks.errorResponse.mockReset().mockImplementation((code, message, statusCode, retryable) => ({
      statusCode,
      body: JSON.stringify({ error: { code, message, statusCode, retryable } }),
    }));

    schemaLifecycleMocks.createImmutableSchemaVersion.mockReset();
    sfnMocks.send.mockReset().mockResolvedValue({ executionArn: 'arn:aws:states:local:123:execution:derived:run-1' });
    process.env.SCHEMA_DERIVED_STATUS_STATE_MACHINE_ARN = 'arn:aws:states:local:123:stateMachine:derived-status';
  });

  it('returns 201 on successful version create', async () => {
    schemaLifecycleMocks.createImmutableSchemaVersion.mockResolvedValueOnce({
      noChange: false,
      item: {
        schemaId: 'schema-1',
        version: 4,
        schemaVersionId: 'ver-uuid-1',
        draftRevision: 3,
      },
    });

    const { handler } = await importHandler();
    const result = await handler({ headers: {}, pathParameters: { id: 'schema-1' }, body: '{}' } as never);

    expect(result.statusCode).toBe(201);
    const parsed = JSON.parse(result.body) as { noChange: boolean; version: { version: number; draftRevision: number } };
    expect(parsed.noChange).toBe(false);
    expect(parsed.version.version).toBe(4);
    expect(parsed.version.draftRevision).toBe(3);
    expect(sfnMocks.send).toHaveBeenCalledTimes(1);
  });

  it('returns 200 on noChange result', async () => {
    schemaLifecycleMocks.createImmutableSchemaVersion.mockResolvedValueOnce({ noChange: true });

    const { handler } = await importHandler();
    const result = await handler({ headers: {}, pathParameters: { id: 'schema-1' }, body: '{}' } as never);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ noChange: true });
  });

  it('returns 200 replayed for idempotent retry', async () => {
    schemaLifecycleMocks.createImmutableSchemaVersion.mockResolvedValueOnce({
      noChange: false,
      replayed: true,
      item: {
        schemaId: 'schema-1',
        version: 4,
        schemaVersionId: 'ver-uuid-1',
        draftRevision: 3,
      },
    });

    const { handler } = await importHandler();
    const result = await handler({
      headers: { 'x-idempotency-key': 'idem-1' },
      pathParameters: { id: 'schema-1' },
      body: '{}',
    } as never);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ replayed: true, noChange: false });
  });

  it('returns 409 on expectedDraftRevision conflict', async () => {
    schemaLifecycleMocks.createImmutableSchemaVersion.mockRejectedValueOnce(
      new Error("Schema draft revision conflict for schema 'schema-1': expected 3, actual 4"),
    );

    const { handler } = await importHandler();
    const result = await handler({ headers: {}, pathParameters: { id: 'schema-1' }, body: '{}' } as never);

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).error.code).toBe('CONFLICT');
  });

  it('does not fail create-version when derived orchestration start fails', async () => {
    schemaLifecycleMocks.createImmutableSchemaVersion.mockResolvedValueOnce({
      noChange: false,
      item: {
        schemaId: 'schema-1',
        version: 4,
        schemaVersionId: 'ver-uuid-1',
        draftRevision: 3,
        versionStatus: 'ready',
        indexStatus: 'pending',
        impactStatus: 'pending',
        sampleValidationStatus: 'pending',
      },
    });
    sfnMocks.send.mockRejectedValueOnce(new Error('sfn unavailable'));

    const { handler } = await importHandler();
    const result = await handler({ headers: {}, pathParameters: { id: 'schema-1' }, body: '{}' } as never);

    expect(result.statusCode).toBe(201);
  });

  it('validates request body', async () => {
    sharedMocks.parseBody.mockReturnValueOnce({ expectedDraftRevision: 0 });

    const { handler } = await importHandler();
    const result = await handler({ headers: {}, pathParameters: { id: 'schema-1' }, body: '{}' } as never);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
  });
});
