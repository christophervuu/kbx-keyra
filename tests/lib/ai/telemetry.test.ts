import { describe, expect, it, vi } from 'vitest';

import {
  classifySchemaSizeSegment,
  createTelemetrySession,
  emitRetrievalTelemetry,
  readCorrelationId,
} from '../../../src/lib/ai/index.js';

describe('ai telemetry session', () => {
  it('emits start, success, and failure events with stable contract fields', () => {
    const events: unknown[] = [];
    const logger = {
      emit(event: unknown) {
        events.push(event);
      },
    };

    const session = createTelemetrySession({
      requestId: 'req-1',
      correlationId: 'corr-1',
      logger,
    });

    session.emitStart('explain-rule');
    session.emitSuccess('explain-rule', {
      feature: 'explain-rule',
      promptId: 'explain-rule',
      tier: 'tier1',
      model: 'openai/gpt-4.1-mini',
      timeoutMs: 20_000,
      maxOutputTokens: 1_200,
    });
    session.emitFailure('explain-rule', 'MODEL_ERROR', {
      feature: 'explain-rule',
      promptId: 'explain-rule',
      tier: 'tier1',
      model: 'openai/gpt-4.1-mini',
      timeoutMs: 20_000,
      maxOutputTokens: 1_200,
    });

    const typedEvents = events as Array<{
      eventType: string;
      outcome: string;
      promptId: string;
      timestamp: string;
      invocationId: string;
      requestId?: string;
      correlationId?: string;
      durationMs?: number;
      errorCode?: string;
    }>;

    expect(typedEvents).toHaveLength(3);

    const [start, success, failure] = typedEvents;
    expect(start?.eventType).toBe('ai.invoke.start');
    expect(start?.outcome).toBe('start');
    expect(start?.promptId).toBe('explain-rule');
    expect(start?.requestId).toBe('req-1');
    expect(start?.correlationId).toBe('corr-1');
    expect(typeof start?.timestamp).toBe('string');
    expect(start?.invocationId).toBeDefined();

    expect(success?.eventType).toBe('ai.invoke.success');
    expect(success?.outcome).toBe('success');
    expect(typeof success?.durationMs).toBe('number');

    expect(failure?.eventType).toBe('ai.invoke.failure');
    expect(failure?.outcome).toBe('failure');
    expect(failure?.errorCode).toBe('MODEL_ERROR');

    expect(start?.invocationId).toBe(success?.invocationId);
    expect(success?.invocationId).toBe(failure?.invocationId);
  });

  it('classifies schema-size segments deterministically', () => {
    expect(classifySchemaSizeSegment(undefined)).toBe('unknown');
    expect(classifySchemaSizeSegment(0)).toBe('unknown');
    expect(classifySchemaSizeSegment(12)).toBe('small');
    expect(classifySchemaSizeSegment(500)).toBe('small');
    expect(classifySchemaSizeSegment(501)).toBe('medium');
    expect(classifySchemaSizeSegment(5000)).toBe('medium');
    expect(classifySchemaSizeSegment(5001)).toBe('large');
  });

  it('reads correlation id from common header variants', () => {
    expect(readCorrelationId(undefined)).toBeUndefined();
    expect(readCorrelationId({ 'x-correlation-id': 'corr-1' })).toBe('corr-1');
    expect(readCorrelationId({ 'X-Correlation-Id': 'corr-2' })).toBe('corr-2');
    expect(readCorrelationId({ 'x-correlationId': 'corr-3' })).toBe('corr-3');
    expect(readCorrelationId({ 'X-CorrelationId': 'corr-4' })).toBe('corr-4');
  });

  it('keeps retrieval telemetry sink failures non-fatal', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('telemetry sink unavailable');
    });

    expect(() => {
      emitRetrievalTelemetry('retrieval.completed', {
        handler: 'test.handler',
        retriever_mode: 'dynamodb',
        schema_size_segment: 'unknown',
      });
    }).not.toThrow();

    infoSpy.mockRestore();
  });
});
