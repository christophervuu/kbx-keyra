import { describe, expect, it } from 'vitest';

import { createTelemetrySession } from '../../../src/lib/ai/index.js';

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
});
