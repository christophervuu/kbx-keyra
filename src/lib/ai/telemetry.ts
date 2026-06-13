import type {
  AIErrorCode,
  AIInvocationMetadata,
  AIInvocationTelemetryContext,
  AIInvocationTelemetryEvent,
  AITelemetryLogger,
} from './types.js';

export type SchemaSizeSegment = 'small' | 'medium' | 'large' | 'unknown';

export interface RetrievalTelemetryPayload {
  readonly handler: string;
  readonly request_id?: string;
  readonly correlation_id?: string;
  readonly schema_id?: string;
  readonly retriever_mode: string;
  readonly schema_field_count?: number;
  readonly schema_size_segment: SchemaSizeSegment;
  readonly query_length?: number;
  readonly requested_limit?: number;
  readonly candidate_count?: number;
  readonly result_count?: number;
  readonly retrieval_ms?: number;
  readonly rerank_ms?: number;
  readonly topk_hit_depth?: number;
  readonly include_parent_chain?: boolean;
  readonly include_context_expansion?: boolean;
  readonly sampled?: boolean;
  readonly shadow_topk_jaccard_at_10?: number;
  readonly shadow_ndcg_delta_at_10?: number;
  readonly shadow_timing_delta_ms?: number;
  readonly secondary_failed?: boolean;
  readonly secondary_error?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createInvocationId(): string {
  return `aii-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

class ConsoleTelemetryLogger implements AITelemetryLogger {
  emit(event: AIInvocationTelemetryEvent): void {
    console.info('[ai-telemetry]', event);
  }
}

function resolveLogger(context?: AIInvocationTelemetryContext): AITelemetryLogger {
  return context?.logger ?? new ConsoleTelemetryLogger();
}

function normalizeHeaderValue(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function toFiniteInteger(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.floor(value);
}

export function classifySchemaSizeSegment(fieldCount?: number): SchemaSizeSegment {
  const normalized = toFiniteInteger(fieldCount);
  if (typeof normalized !== 'number' || normalized <= 0) {
    return 'unknown';
  }

  if (normalized <= 500) {
    return 'small';
  }

  if (normalized <= 5000) {
    return 'medium';
  }

  return 'large';
}

export function emitRetrievalTelemetry(eventName: string, payload: RetrievalTelemetryPayload): void {
  try {
    console.info(`[ai-retrieval] ${eventName}`, payload);
  } catch {
    // Telemetry sink failures must remain non-fatal.
  }
}

export function readCorrelationId(headers: Record<string, string | undefined> | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }

  return normalizeHeaderValue(
    headers['x-correlation-id']
      ?? headers['X-Correlation-Id']
      ?? headers['x-correlationId']
      ?? headers['X-CorrelationId'],
  );
}

export interface AIInvocationTelemetrySession {
  readonly invocationId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly startMs: number;
  emitStart(promptId: string): void;
  emitSuccess(promptId: string, invocation: AIInvocationMetadata | undefined): void;
  emitFailure(promptId: string, errorCode: AIErrorCode, invocation?: AIInvocationMetadata): void;
}

export function createTelemetrySession(context?: AIInvocationTelemetryContext): AIInvocationTelemetrySession {
  const invocationId = createInvocationId();
  const logger = resolveLogger(context);
  const startMs = Date.now();

  const base = {
    invocationId,
    requestId: context?.requestId,
    correlationId: context?.correlationId,
  } as const;

  return {
    invocationId,
    requestId: context?.requestId,
    correlationId: context?.correlationId,
    startMs,
    emitStart(promptId: string): void {
      logger.emit({
        ...base,
        eventType: 'ai.invoke.start',
        timestamp: nowIso(),
        outcome: 'start',
        promptId,
      });
    },
    emitSuccess(promptId: string, invocation: AIInvocationMetadata | undefined): void {
      logger.emit({
        ...base,
        eventType: 'ai.invoke.success',
        timestamp: nowIso(),
        outcome: 'success',
        promptId,
        durationMs: Date.now() - startMs,
        feature: invocation?.feature,
        tier: invocation?.tier,
        model: invocation?.model,
        timeoutMs: invocation?.timeoutMs,
        maxOutputTokens: invocation?.maxOutputTokens,
      });
    },
    emitFailure(promptId: string, errorCode: AIErrorCode, invocation?: AIInvocationMetadata): void {
      logger.emit({
        ...base,
        eventType: 'ai.invoke.failure',
        timestamp: nowIso(),
        outcome: 'failure',
        promptId,
        durationMs: Date.now() - startMs,
        errorCode,
        feature: invocation?.feature,
        tier: invocation?.tier,
        model: invocation?.model,
        timeoutMs: invocation?.timeoutMs,
        maxOutputTokens: invocation?.maxOutputTokens,
      });
    },
  };
}
