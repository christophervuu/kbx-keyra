import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

import { ERROR_CODES } from '../shared/errors.js';
import type { RuntimeApiResult } from './runtime-api-client.js';
import type { RuntimeEnvironmentKey } from './environment-config.js';

export interface RuntimePreviewInvokeRequest {
  readonly mappingId: string;
  readonly environment: RuntimeEnvironmentKey;
  readonly sourceData: Readonly<Record<string, unknown>>;
  readonly externalSources?: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
}

export interface RuntimePreviewInvokeResponseData {
  readonly environment: RuntimeEnvironmentKey;
  readonly mappingId: string;
  readonly artifactId: string | null;
  readonly artifactHash: string | null;
  readonly sourceType: 'revision' | 'version' | null;
  readonly sourceNumber: number | null;
  readonly engineVersion: string | null;
  readonly executedAt?: string;
  readonly output: unknown;
  readonly diagnostics: readonly unknown[];
}

interface RuntimeInvokeClient {
  preview(request: RuntimePreviewInvokeRequest): Promise<RuntimeApiResult<RuntimePreviewInvokeResponseData>>;
}

function getNowRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const raw = env?.[key];
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveRuntimeExecuteFunctionArn(environment: RuntimeEnvironmentKey): string | null {
  const key = `RUNTIME_EXECUTE_FUNCTION_ARN_${environment}`;
  return getEnvValue(key) ?? null;
}

function decodePayload(payload: Uint8Array | undefined): string {
  if (!payload || payload.length === 0) {
    return '';
  }

  return new TextDecoder().decode(payload);
}

function parseJsonObject(raw: string): Record<string, unknown> {
  if (raw.trim() === '') {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore parse failure and normalize to empty object
  }

  return {};
}

function toApiFailure(input: {
  statusCode: number;
  requestId: string;
  payload: Record<string, unknown>;
}): RuntimeApiResult<RuntimePreviewInvokeResponseData> {
  const envelope = input.payload.error as {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
    requestId?: unknown;
  } | undefined;

  const code = typeof envelope?.code === 'string'
    ? envelope.code
    : input.statusCode >= 500
      ? ERROR_CODES.SERVICE_UNAVAILABLE
      : ERROR_CODES.VALIDATION_ERROR;

  const message = typeof envelope?.message === 'string'
    ? envelope.message
    : `Runtime invoke failed with status ${input.statusCode}`;

  const retryable = typeof envelope?.retryable === 'boolean'
    ? envelope.retryable
    : input.statusCode >= 500;

  const requestId = typeof envelope?.requestId === 'string' ? envelope.requestId : input.requestId;

  return {
    ok: false,
    statusCode: input.statusCode,
    requestId,
    errorCode: code,
    message,
    retryable,
  };
}

class DirectRuntimeInvokeClient implements RuntimeInvokeClient {
  private readonly lambda: LambdaClient;

  constructor(options?: { readonly lambdaClient?: LambdaClient }) {
    this.lambda = options?.lambdaClient ?? new LambdaClient({});
  }

  async preview(request: RuntimePreviewInvokeRequest): Promise<RuntimeApiResult<RuntimePreviewInvokeResponseData>> {
    const requestId = request.requestId ?? getNowRequestId();
    const functionArn = resolveRuntimeExecuteFunctionArn(request.environment);

    if (!functionArn) {
      return {
        ok: false,
        statusCode: 500,
        requestId,
        errorCode: ERROR_CODES.VALIDATION_ERROR,
        message: `Missing required runtime execute function ARN configuration for environment '${request.environment}'.`,
        retryable: false,
      };
    }

    try {
      const command = new InvokeCommand({
        FunctionName: functionArn,
        InvocationType: 'RequestResponse',
        Payload: new TextEncoder().encode(
          JSON.stringify({
            body: JSON.stringify({
              mappingId: request.mappingId,
              sourceData: request.sourceData,
              externalSources: request.externalSources ?? {},
              responseMode: 'canonical',
            }),
          }),
        ),
      });

      const result = await this.lambda.send(command);
      if (result.FunctionError) {
        return {
          ok: false,
          statusCode: 503,
          requestId,
          errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: `Runtime execute Lambda returned function error: ${result.FunctionError}`,
          retryable: true,
        };
      }

      const outerPayload = parseJsonObject(decodePayload(result.Payload));
      const statusCode = typeof outerPayload.statusCode === 'number' ? outerPayload.statusCode : 503;
      const headers = (outerPayload.headers && typeof outerPayload.headers === 'object')
        ? (outerPayload.headers as Record<string, unknown>)
        : {};

      const runtimeRequestId = (typeof headers['x-request-id'] === 'string' && headers['x-request-id'].trim() !== '')
        ? headers['x-request-id']
        : requestId;

      const bodyPayload = parseJsonObject(typeof outerPayload.body === 'string' ? outerPayload.body : '');
      if (statusCode >= 400) {
        return toApiFailure({
          statusCode,
          requestId: runtimeRequestId,
          payload: bodyPayload,
        });
      }

      const metadata = (bodyPayload.metadata && typeof bodyPayload.metadata === 'object')
        ? (bodyPayload.metadata as Record<string, unknown>)
        : {};

      return {
        ok: true,
        statusCode,
        requestId: runtimeRequestId,
        data: {
          environment: request.environment,
          mappingId:
            typeof metadata.mappingId === 'string' && metadata.mappingId.trim() !== ''
              ? metadata.mappingId
              : request.mappingId,
          artifactId:
            typeof metadata.snapshotId === 'string' && metadata.snapshotId.trim() !== ''
              ? metadata.snapshotId
              : null,
          artifactHash:
            typeof metadata.snapshotHash === 'string' && metadata.snapshotHash.trim() !== ''
              ? metadata.snapshotHash
              : null,
          sourceType:
            metadata.sourceType === 'revision' || metadata.sourceType === 'version'
              ? metadata.sourceType
              : null,
          sourceNumber:
            typeof metadata.sourceNumber === 'number' && Number.isFinite(metadata.sourceNumber)
              ? metadata.sourceNumber
              : null,
          engineVersion:
            typeof metadata.engineVersion === 'string' && metadata.engineVersion.trim() !== ''
              ? metadata.engineVersion
              : null,
          executedAt:
            typeof metadata.executedAt === 'string' && metadata.executedAt.trim() !== ''
              ? metadata.executedAt
              : undefined,
          output: bodyPayload.output,
          diagnostics: Array.isArray(bodyPayload.diagnostics) ? bodyPayload.diagnostics : [],
        },
      };
    } catch {
      return {
        ok: false,
        statusCode: 503,
        requestId,
        errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Runtime execute Lambda invoke failed due to transport error.',
        retryable: true,
      };
    }
  }
}

let defaultRuntimeInvokeClient: RuntimeInvokeClient | null = null;

export function getRuntimeInvokeClient(options?: { readonly lambdaClient?: LambdaClient }): RuntimeInvokeClient {
  if (options?.lambdaClient) {
    return new DirectRuntimeInvokeClient(options);
  }

  if (!defaultRuntimeInvokeClient) {
    defaultRuntimeInvokeClient = new DirectRuntimeInvokeClient();
  }

  return defaultRuntimeInvokeClient;
}
