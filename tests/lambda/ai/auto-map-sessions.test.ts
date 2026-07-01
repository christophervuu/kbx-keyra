import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { APIGatewayProxyEvent } from '../../../src/lambda/shared/index.js';

const storeMocks = vi.hoisted(() => ({
  getAutoMapRun: vi.fn(),
  getAutoMapSession: vi.fn(),
  getAutoMapSuggestion: vi.fn(),
  listAutoMapRuns: vi.fn(),
  listAutoMapSuggestions: vi.fn(),
  listAutoMapWorkUnits: vi.fn(),
  listOpenSessionsByMapping: vi.fn(),
  putAutoMapRun: vi.fn(),
  putAutoMapSession: vi.fn(),
  putAutoMapSuggestion: vi.fn(),
  supersedeSession: vi.fn(),
  updateSessionRunPointer: vi.fn(),
}));

const fingerprintMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/lib/persistence/auto-map-store.js', () => storeMocks);

vi.mock('../../../src/lib/persistence/auto-map.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/lib/persistence/auto-map.js')>(
    '../../../src/lib/persistence/auto-map.js',
  );

  return {
    ...actual,
    createRequestFingerprint: fingerprintMock,
  };
});

function createEvent(overrides: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    pathParameters: {},
    queryStringParameters: {},
    httpMethod: 'GET',
    ...overrides,
  };
}

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    PK: 'SESSION#ams_1',
    SK: 'META',
    entityType: 'AutoMapSession',
    sessionId: 'ams_1',
    mappingId: 'm_1',
    projectId: 'p_1',
    status: 'open',
    baseMappingRevision: 3,
    generationFingerprint: {
      sourceSchema: { id: 's1', version: '1' },
      targetSchema: { id: 't1', version: '1' },
      enrichmentSchemas: [],
      engineVersion: '1',
      dslVersion: '1',
      promptId: 'auto-map',
      promptVersion: '1',
      model: 'm',
    },
    reviewCounts: {
      pending: 0,
      editing: 0,
      accepted: 0,
      acceptedEdited: 0,
      dismissed: 0,
      keptCurrent: 0,
      stale: 0,
      conflict: 0,
      invalid: 0,
    },
    createdAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T00:00:00.000Z',
    GSI1PK: 'MAPPING#m_1',
    GSI1SK: 'CREATED#2026-06-28T00:00:00.000Z#ams_1',
    GSI2PK: 'MAPPING#m_1',
    GSI2SK: 'OPEN#2026-06-28T00:00:00.000Z#ams_1',
    ...overrides,
  };
}

describe('auto-map sessions handler', () => {
  beforeEach(() => {
    process.env.AUTO_MAP_EXECUTION_MODE = 'async';
    fingerprintMock.mockReset().mockResolvedValue('fp-1');
    Object.values(storeMocks).forEach((mock) => mock.mockReset());
    storeMocks.listAutoMapRuns.mockResolvedValue([]);
    storeMocks.listAutoMapWorkUnits.mockResolvedValue([]);
    storeMocks.listOpenSessionsByMapping.mockResolvedValue([]);
  });

  it('returns capabilities payload with executionMode', async () => {
    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({ httpMethod: 'GET' }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      capabilities: {
        autoMap: {
          enabled: true,
          executionMode: 'async',
        },
      },
    });
  });

  it('mode-gates mutation endpoints when execution mode is disabled', async () => {
    process.env.AUTO_MAP_EXECUTION_MODE = 'disabled';
    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        projectId: 'p_1',
        mappingId: 'm_1',
        baseMappingRevision: 1,
        scope: { mode: 'whole' },
      }),
    }));

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error.code).toBe('FEATURE_NOT_ENABLED');
  });

  it('normalizes suggestion limit contract and emits cursor bound to session/filter/sort version', async () => {
    storeMocks.listAutoMapSuggestions.mockResolvedValue([
      { suggestionId: 'sg_1', reviewStatus: 'pending', validationState: 'ready', version: 1 },
      { suggestionId: 'sg_2', reviewStatus: 'pending', validationState: 'ready', version: 1 },
      { suggestionId: 'sg_3', reviewStatus: 'pending', validationState: 'ready', version: 1 },
    ]);

    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({
      httpMethod: 'GET',
      pathParameters: {
        sessionId: 'ams_1',
      },
      queryStringParameters: {
        limit: '1',
        status: 'pending',
      },
    }));

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body) as {
      items: Array<{ suggestionId: string }>;
      page: { limit: number; nextCursor: string | null };
    };
    expect(parsed.page.limit).toBe(20);
    expect(parsed.items).toHaveLength(3);
    expect(parsed.page.nextCursor).toBeNull();
  });

  it('returns validation error for cursor with mismatched session/filter binding', async () => {
    storeMocks.listAutoMapSuggestions.mockResolvedValue([]);

    const badCursor = encodeURIComponent(JSON.stringify({ s: 'other_session', fh: '{"status":[]}', sv: 1, o: 10 }));

    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({
      httpMethod: 'GET',
      pathParameters: {
        sessionId: 'ams_1',
      },
      queryStringParameters: {
        cursor: badCursor,
      },
    }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('deduplicates equivalent active start requests and returns existing run', async () => {
    storeMocks.listOpenSessionsByMapping.mockResolvedValue([baseSession()]);
    storeMocks.listAutoMapRuns.mockResolvedValue([
      {
        runId: 'run_existing',
        status: 'generating',
        requestFingerprint: 'fp-1',
        idempotencyKey: 'idk_1',
      },
    ]);

    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        projectId: 'p_1',
        mappingId: 'm_1',
        baseMappingRevision: 3,
        idempotencyKey: 'idk_1',
        scope: {
          mode: 'whole',
        },
      }),
    }));

    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toMatchObject({
      sessionId: 'ams_1',
      runId: 'run_existing',
      deduped: true,
    });
    expect(storeMocks.putAutoMapRun).not.toHaveBeenCalled();
  });

  it('enforces expectedVersion for suggestion decisions', async () => {
    storeMocks.getAutoMapSuggestion.mockResolvedValue({
      suggestionId: 'sg_1',
      reviewStatus: 'pending',
      version: 7,
      validationState: 'ready',
    });

    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({
      httpMethod: 'PATCH',
      pathParameters: {
        sessionId: 'ams_1',
        suggestionId: 'sg_1',
      },
      body: JSON.stringify({
        action: 'accept',
        expectedVersion: 6,
      }),
    }));

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe('CONFLICT');
  });

  it('returns applied/skipped counts with deterministic skip reasons for batch action', async () => {
    storeMocks.listAutoMapSuggestions.mockResolvedValue([
      {
        suggestionId: 'sg_invalid',
        reviewStatus: 'pending',
        validationState: 'invalid',
        version: 1,
      },
      {
        suggestionId: 'sg_ok',
        reviewStatus: 'pending',
        validationState: 'ready',
        version: 1,
      },
    ]);

    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({
      httpMethod: 'POST',
      pathParameters: {
        sessionId: 'ams_1',
      },
      body: JSON.stringify({
        action: 'accept',
      }),
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      appliedCount: 1,
      skippedCount: 1,
      skipped: [{ suggestionId: 'sg_invalid', reason: 'invalid' }],
    });
  });

  it('creates retry-failed run scoped to failed work units when retry ids omitted', async () => {
    storeMocks.getAutoMapSession.mockResolvedValue(baseSession());
    storeMocks.listAutoMapRuns.mockResolvedValue([{ runId: 'run_prev', status: 'partial' }]);
    storeMocks.listAutoMapWorkUnits.mockResolvedValue([
      { workUnitId: 'wu_1', status: 'failed' },
      { workUnitId: 'wu_2', status: 'completed' },
      { workUnitId: 'wu_3', status: 'failed' },
    ]);

    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({
      httpMethod: 'POST',
      pathParameters: {
        sessionId: 'ams_1',
      },
      body: JSON.stringify({
        scope: {
          mode: 'retry-failed',
        },
        idempotencyKey: 'retry_1',
      }),
    }));

    expect(response.statusCode).toBe(202);
    expect(JSON.parse(response.body)).toMatchObject({
      sessionId: 'ams_1',
      status: 'queued',
      scope: {
        mode: 'retry-failed',
        retryWorkUnitIds: ['wu_1', 'wu_3'],
      },
      deduped: false,
    });
    expect(storeMocks.putAutoMapRun).toHaveBeenCalledTimes(1);
  });

  it('returns mapping-level open session or null deterministically', async () => {
    storeMocks.listOpenSessionsByMapping.mockResolvedValue([baseSession({ status: 'open' })]);
    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');

    const hit = await handler(createEvent({
      httpMethod: 'GET',
      pathParameters: {
        mappingId: 'm_1',
      },
    }));

    expect(hit.statusCode).toBe(200);
    expect(JSON.parse(hit.body).sessionId).toBe('ams_1');

    storeMocks.listOpenSessionsByMapping.mockResolvedValue([]);
    const miss = await handler(createEvent({
      httpMethod: 'GET',
      pathParameters: {
        mappingId: 'm_1',
      },
    }));

    expect(miss.statusCode).toBe(200);
    expect(JSON.parse(miss.body)).toBeNull();
  });

  it('does not surface resolved sessions in mapping-level open-session lookup', async () => {
    storeMocks.listOpenSessionsByMapping.mockResolvedValue([
      baseSession({ status: 'resolved' }),
      baseSession({ sessionId: 'ams_2', status: 'superseded' }),
    ]);

    const { handler } = await import('../../../src/lambda/ai/auto-map-sessions.js');
    const response = await handler(createEvent({
      httpMethod: 'GET',
      pathParameters: {
        mappingId: 'm_1',
      },
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toBeNull();
  });
});
