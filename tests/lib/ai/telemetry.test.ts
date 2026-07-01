import { describe, expect, it, vi } from 'vitest';

import {
  emitAutoMapReviewQualityTelemetry,
  emitAutoMapTimingTelemetry,
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

  it('emits auto-map timing telemetry with schema-size segment payload semantics', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    emitAutoMapTimingTelemetry('auto-map.ttfsm', {
      phase: 'editor_to_first_progress',
      duration_ms: 1380,
      schema_size_segment: 'medium',
      mapping_id: 'm-1',
      session_id: 'ams-1',
      run_id: 'run-1',
      request_id: 'req-1',
      correlation_id: 'corr-1',
    });

    expect(infoSpy).toHaveBeenCalledWith(
      '[ai-auto-map-telemetry] auto-map.ttfsm',
      expect.objectContaining({
        phase: 'editor_to_first_progress',
        duration_ms: 1380,
        schema_size_segment: 'medium',
      }),
    );

    infoSpy.mockRestore();
  });

  it('emits auto-map review-quality telemetry with acceptance/edit/dismiss distribution fields', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    emitAutoMapReviewQualityTelemetry('auto-map.review-quality', {
      mapping_id: 'm-2',
      session_id: 'ams-2',
      accepted: 4,
      edited: 1,
      dismissed: 2,
      total_reviewed: 7,
      required_coverage_delta: 0.25,
      request_id: 'req-2',
      correlation_id: 'corr-2',
    });

    expect(infoSpy).toHaveBeenCalledWith(
      '[ai-auto-map-telemetry] auto-map.review-quality',
      expect.objectContaining({
        mapping_id: 'm-2',
        accepted: 4,
        edited: 1,
        dismissed: 2,
        total_reviewed: 7,
        required_coverage_delta: 0.25,
      }),
    );

    infoSpy.mockRestore();
  });

  it('keeps auto-map telemetry sink failures non-fatal', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('auto-map telemetry sink unavailable');
    });

    expect(() => {
      emitAutoMapTimingTelemetry('auto-map.ttfsm', {
        phase: 'work_unit_to_first_visible',
        duration_ms: 900,
        schema_size_segment: 'small',
      });
    }).not.toThrow();

    expect(() => {
      emitAutoMapReviewQualityTelemetry('auto-map.review-quality', {
        mapping_id: 'm-3',
        accepted: 1,
        edited: 0,
        dismissed: 0,
        total_reviewed: 1,
        required_coverage_delta: 0.1,
      });
    }).not.toThrow();

    infoSpy.mockRestore();
  });
});
