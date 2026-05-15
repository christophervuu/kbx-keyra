import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDevLogger } from './dev-logger';

describe('devLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('error() calls console grouping/logging in dev mode', () => {
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const endSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);

    const logger = createDevLogger(true);

    logger.error({
      endpoint: 'PUT /mappings/map-1',
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      requestId: 'req-123',
      duration: 1234,
      attempt: 3,
      message: 'All retry attempts failed',
    });

    expect(groupSpy).toHaveBeenCalledTimes(1);
    expect(groupSpy).toHaveBeenCalledWith(
      expect.stringContaining('%c[API ERROR]%c'),
      expect.stringContaining('color: #ef4444'),
      'color: inherit;',
    );
    expect(logSpy).toHaveBeenCalled();
    expect(endSpy).toHaveBeenCalledTimes(1);
  });

  it('is no-op in production mode', () => {
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const endSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);

    const logger = createDevLogger(false);

    logger.error({ endpoint: 'GET /schemas/s-1', message: 'boom' });
    logger.warn({ endpoint: 'GET /schemas/s-1', message: 'retrying' });
    logger.info({ endpoint: 'GET /schemas/s-1', message: 'retry succeeded' });

    expect(groupSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(endSpy).not.toHaveBeenCalled();
  });

  it('logs all fields when provided', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined);
    vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);

    const logger = createDevLogger(true);

    logger.warn({
      endpoint: 'GET /projects/p-1',
      statusCode: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      requestId: 'req-abc123',
      duration: 250,
      attempt: 2,
      message: 'Transient upstream failure; retrying',
    });

    expect(logSpy).toHaveBeenCalledWith('endpoint:', 'GET /projects/p-1');
    expect(logSpy).toHaveBeenCalledWith('message:', 'Transient upstream failure; retrying');
    expect(logSpy).toHaveBeenCalledWith('statusCode:', 503);
    expect(logSpy).toHaveBeenCalledWith('errorCode:', 'SERVICE_UNAVAILABLE');
    expect(logSpy).toHaveBeenCalledWith('requestId:', 'req-abc123');
    expect(logSpy).toHaveBeenCalledWith('durationMs:', 250);
    expect(logSpy).toHaveBeenCalledWith('attempt:', 2);
  });

  it('missing optional fields does not throw', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);

    const logger = createDevLogger(true);

    expect(() => {
      logger.info({
        endpoint: 'POST /schemas',
        message: 'Retry succeeded',
      });
    }).not.toThrow();
  });
});
