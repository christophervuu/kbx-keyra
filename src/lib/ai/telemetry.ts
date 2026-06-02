import type {
  AIErrorCode,
  AIInvocationMetadata,
  AIInvocationTelemetryContext,
  AIInvocationTelemetryEvent,
  AITelemetryLogger,
} from './types.js';

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
