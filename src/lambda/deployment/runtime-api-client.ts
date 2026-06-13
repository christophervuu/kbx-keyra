import {
  DeploymentEnvironmentConfigError,
  getRuntimeEnvironmentConfig,
  loadDeploymentEnvironmentSettingsOrThrow,
  type DeploymentEnvironmentSettingsProvider,
  type RuntimeEnvironmentKey,
} from './environment-config.js';
import type {
  RuntimeDeployArtifact,
  RuntimeDeploymentEnvironment,
  RuntimeRelayClient,
  RuntimeRelayFailure,
  RuntimeRelayResponse,
  RuntimeRelayResult,
} from './runtime-relay.js';
import { ERROR_CODES } from '../shared/errors.js';

type FetchLike = (input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  headers?: {
    get(name: string): string | null;
  };
}>;

interface RuntimeClientRequestBase {
  readonly requestId?: string;
  readonly orchestrationId?: string;
  readonly triggeredBy?: 'user' | 'system';
}

export interface RuntimeDeployRequest extends RuntimeClientRequestBase {
  readonly mappingId: string;
  readonly environment: RuntimeEnvironmentKey;
  readonly operation: 'deploy' | 'promote';
  readonly artifact: RuntimeDeployArtifact;
  readonly promotedFrom?: RuntimeEnvironmentKey | null;
}

export interface RuntimeRollbackRequest extends RuntimeClientRequestBase {
  readonly mappingId: string;
  readonly environment: RuntimeEnvironmentKey;
  readonly targetArtifactId: string;
  readonly reason?: string;
}

export interface RuntimePreviewRequest extends RuntimeClientRequestBase {
  readonly mappingId: string;
  readonly environment: RuntimeEnvironmentKey;
  readonly sourceData: Readonly<Record<string, unknown>>;
  readonly externalSources?: Readonly<Record<string, unknown>>;
}

export interface RuntimeStatusRequest extends RuntimeClientRequestBase {
  readonly mappingId: string;
  readonly environment: RuntimeEnvironmentKey;
}

export interface RuntimeApiSuccess<T> {
  readonly ok: true;
  readonly statusCode: number;
  readonly requestId: string;
  readonly data: T;
}

export interface RuntimeApiFailure {
  readonly ok: false;
  readonly statusCode: number;
  readonly requestId: string;
  readonly errorCode: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: unknown;
}

export type RuntimeApiResult<T> = RuntimeApiSuccess<T> | RuntimeApiFailure;

export interface RuntimeDeployResponseData {
  readonly mappingId: string;
  readonly environment: RuntimeEnvironmentKey;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly activatedAt?: string;
  readonly deploymentEventId?: string;
  readonly activePointerVersion?: number;
}

export interface RuntimeRollbackResponseData {
  readonly mappingId: string;
  readonly environment: RuntimeEnvironmentKey;
  readonly artifactId: string;
  readonly artifactHash?: string;
  readonly activatedAt?: string;
  readonly rollbackEventId?: string;
}

export interface RuntimePreviewResponseData {
  readonly environment: RuntimeEnvironmentKey;
  readonly mappingId: string;
  readonly artifactId: string | null;
  readonly artifactHash: string | null;
  readonly executedAt?: string;
  readonly output: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly unknown[];
}

export interface RuntimeStatusResponseData {
  readonly status?: string;
  readonly state?: string;
  readonly mappingId?: string;
  readonly artifactId?: string | null;
  readonly activeSnapshot?: {
    readonly activeSnapshotId?: string;
    readonly snapshotHash?: string;
  } | null;
}

export interface RuntimeApiClient {
  deploy(request: RuntimeDeployRequest): Promise<RuntimeApiResult<RuntimeDeployResponseData>>;
  rollback(request: RuntimeRollbackRequest): Promise<RuntimeApiResult<RuntimeRollbackResponseData>>;
  preview(request: RuntimePreviewRequest): Promise<RuntimeApiResult<RuntimePreviewResponseData>>;
  status(request: RuntimeStatusRequest): Promise<RuntimeApiResult<RuntimeStatusResponseData>>;
}

function getNowRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function resolvePathTemplate(path: string, mappingId: string): string {
  return path.replace('{mappingId}', encodeURIComponent(mappingId));
}

function withTimeout<T>(
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return request(controller.signal).finally(() => {
    clearTimeout(timeout);
  });
}

function normalizeErrorEnvelope(
  statusCode: number,
  requestId: string,
  payload: unknown,
): RuntimeApiFailure {
  const envelope = payload as {
    error?: {
      code?: unknown;
      message?: unknown;
      statusCode?: unknown;
      retryable?: unknown;
      requestId?: unknown;
      details?: unknown;
    };
  };

  const code = typeof envelope?.error?.code === 'string'
    ? envelope.error.code
    : statusCode >= 500
      ? ERROR_CODES.SERVICE_UNAVAILABLE
      : ERROR_CODES.VALIDATION_ERROR;

  const message = typeof envelope?.error?.message === 'string'
    ? envelope.error.message
    : `Runtime API request failed with status ${statusCode}`;

  const retryable = typeof envelope?.error?.retryable === 'boolean'
    ? envelope.error.retryable
    : statusCode >= 500;

  const envelopeRequestId = typeof envelope?.error?.requestId === 'string'
    ? envelope.error.requestId
    : requestId;

  return {
    ok: false,
    statusCode,
    requestId: envelopeRequestId,
    errorCode: code,
    message,
    retryable,
    details: envelope?.error?.details,
  };
}

function toRelayResponse(result: RuntimeApiResult<RuntimeDeployResponseData>): RuntimeRelayResponse {
  if (result.ok) {
    const success: RuntimeRelayResult = {
      ok: true,
      statusCode: result.statusCode === 200 ? 200 : 201,
      requestId: result.requestId,
    };

    return success;
  }

  const failure: RuntimeRelayFailure = {
    ok: false,
    statusCode: result.statusCode,
    errorCode: result.errorCode,
    message: result.message,
    retryable: result.retryable,
    requestId: result.requestId,
  };

  return failure;
}

class HttpRuntimeApiClient implements RuntimeApiClient {
  private readonly fetchImpl: FetchLike;
  private readonly settingsProvider?: DeploymentEnvironmentSettingsProvider;
  private readonly env?: Record<string, string | undefined>;

  constructor(options?: {
    readonly fetchImpl?: FetchLike;
    readonly settingsProvider?: DeploymentEnvironmentSettingsProvider;
    readonly env?: Record<string, string | undefined>;
  }) {
    this.fetchImpl = options?.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.settingsProvider = options?.settingsProvider;
    this.env = options?.env;
  }

  async deploy(request: RuntimeDeployRequest): Promise<RuntimeApiResult<RuntimeDeployResponseData>> {
    const config = await this.getEnvConfig(request.environment);
    const requestId = request.requestId ?? getNowRequestId();

    return this.postJson<RuntimeDeployResponseData>(
      config.runtimeApiBaseUrl,
      config.deployApiPath,
      request.mappingId,
      {
        requestId,
        mappingId: request.mappingId,
        environment: request.environment,
        operation: request.operation,
        artifact: request.artifact,
        controlPlaneMetadata: {
          orchestrationId: request.orchestrationId,
          triggeredBy: request.triggeredBy ?? 'system',
          promotedFrom: request.promotedFrom ?? null,
        },
      },
      config.requestTimeoutMs,
      requestId,
    );
  }

  async rollback(request: RuntimeRollbackRequest): Promise<RuntimeApiResult<RuntimeRollbackResponseData>> {
    const config = await this.getEnvConfig(request.environment);
    const requestId = request.requestId ?? getNowRequestId();

    return this.postJson<RuntimeRollbackResponseData>(
      config.runtimeApiBaseUrl,
      config.rollbackApiPath,
      request.mappingId,
      {
        requestId,
        mappingId: request.mappingId,
        environment: request.environment,
        targetArtifactId: request.targetArtifactId,
        reason: request.reason ?? 'user-request',
        controlPlaneMetadata: {
          orchestrationId: request.orchestrationId,
          triggeredBy: request.triggeredBy ?? 'system',
        },
      },
      config.requestTimeoutMs,
      requestId,
    );
  }

  async preview(request: RuntimePreviewRequest): Promise<RuntimeApiResult<RuntimePreviewResponseData>> {
    const config = await this.getEnvConfig(request.environment);
    const requestId = request.requestId ?? getNowRequestId();

    return this.postJson<RuntimePreviewResponseData>(
      config.runtimeApiBaseUrl,
      config.previewApiPath,
      request.mappingId,
      {
        requestId,
        mappingId: request.mappingId,
        environment: request.environment,
        sourceData: request.sourceData,
        externalSources: request.externalSources ?? {},
      },
      config.requestTimeoutMs,
      requestId,
    );
  }

  async status(request: RuntimeStatusRequest): Promise<RuntimeApiResult<RuntimeStatusResponseData>> {
    const config = await this.getEnvConfig(request.environment);
    const requestId = request.requestId ?? getNowRequestId();
    const path = resolvePathTemplate(config.statusApiPath, request.mappingId);

    const url = `${config.runtimeApiBaseUrl}${ensureLeadingSlash(path)}`;

    try {
      const response = await withTimeout(config.requestTimeoutMs, (signal) =>
        this.fetchImpl(url, {
          method: 'GET',
          headers: {
            'x-request-id': requestId,
          },
          signal,
        }),
      );

      const payload = await safeJson(response);
      const runtimeRequestId = response.headers?.get('x-request-id') ?? requestId;

      if (!response.ok) {
        return normalizeErrorEnvelope(response.status, runtimeRequestId, payload);
      }

      const data = extractData<RuntimeStatusResponseData>(payload);
      return {
        ok: true,
        statusCode: response.status,
        requestId: runtimeRequestId,
        data,
      };
    } catch (error) {
      return timeoutOrServiceFailure(error, requestId);
    }
  }

  private async getEnvConfig(environment: RuntimeEnvironmentKey) {
    const settings = await loadDeploymentEnvironmentSettingsOrThrow({
      provider: this.settingsProvider,
      env: this.env,
    });

    return getRuntimeEnvironmentConfig(settings, environment);
  }

  private async postJson<T>(
    baseUrl: string,
    path: string,
    mappingId: string,
    body: Record<string, unknown>,
    timeoutMs: number,
    requestId: string,
  ): Promise<RuntimeApiResult<T>> {
    const resolvedPath = resolvePathTemplate(path, mappingId);
    const url = `${baseUrl}${ensureLeadingSlash(resolvedPath)}`;

    try {
      const response = await withTimeout(timeoutMs, (signal) =>
        this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-request-id': requestId,
          },
          body: JSON.stringify(body),
          signal,
        }),
      );

      const payload = await safeJson(response);
      const runtimeRequestId = response.headers?.get('x-request-id') ?? requestId;

      if (!response.ok) {
        return normalizeErrorEnvelope(response.status, runtimeRequestId, payload);
      }

      const data = extractData<T>(payload);
      return {
        ok: true,
        statusCode: response.status,
        requestId: runtimeRequestId,
        data,
      };
    } catch (error) {
      return timeoutOrServiceFailure(error, requestId);
    }
  }
}

async function safeJson(response: {
  json(): Promise<unknown>;
  text(): Promise<string>;
}): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    const text = await response.text();
    if (text.trim() === '') {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
}

function extractData<T>(payload: unknown): T {
  const objectPayload = payload as { data?: unknown };
  if (Object.hasOwn(objectPayload, 'data')) {
    return objectPayload.data as T;
  }

  return payload as T;
}

function timeoutOrServiceFailure(error: unknown, requestId: string): RuntimeApiFailure {
  const isAbort =
    (error as { name?: unknown } | null | undefined)?.name === 'AbortError';

  if (isAbort) {
    return {
      ok: false,
      statusCode: 504,
      requestId,
      errorCode: ERROR_CODES.TIMEOUT,
      message: 'Runtime API request timed out.',
      retryable: true,
    };
  }

  return {
    ok: false,
    statusCode: 503,
    requestId,
    errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
    message: 'Runtime API request failed due to transport error.',
    retryable: true,
  };
}

let defaultRuntimeApiClient: RuntimeApiClient | null = null;

export function getRuntimeApiClient(options?: {
  readonly fetchImpl?: FetchLike;
  readonly settingsProvider?: DeploymentEnvironmentSettingsProvider;
  readonly env?: Record<string, string | undefined>;
}): RuntimeApiClient {
  if (options?.fetchImpl || options?.settingsProvider || options?.env) {
    return new HttpRuntimeApiClient(options);
  }

  if (!defaultRuntimeApiClient) {
    defaultRuntimeApiClient = new HttpRuntimeApiClient();
  }

  return defaultRuntimeApiClient;
}

export function toRuntimeRelayClient(runtimeApiClient: RuntimeApiClient): RuntimeRelayClient {
  return {
    async pushArtifact(
      environment: RuntimeDeploymentEnvironment,
      artifact: RuntimeDeployArtifact,
      options,
    ): Promise<RuntimeRelayResponse> {
      try {
        const deployResult = await runtimeApiClient.deploy({
          mappingId: artifact.mappingId,
          environment,
          operation: options?.operation ?? 'deploy',
          artifact,
          requestId: options?.requestId,
          orchestrationId: options?.orchestrationId,
          promotedFrom: options?.promotedFrom,
          triggeredBy: options?.triggeredBy,
        });

        return toRelayResponse(deployResult);
      } catch (error) {
        if (error instanceof DeploymentEnvironmentConfigError) {
          const failure: RuntimeRelayFailure = {
            ok: false,
            statusCode: 500,
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: `Runtime environment configuration error: ${error.message}`,
            retryable: false,
            requestId: getNowRequestId(),
          };

          return failure;
        }

        const failure: RuntimeRelayFailure = {
          ok: false,
          statusCode: 503,
          errorCode: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: 'Runtime API client transport failure.',
          retryable: true,
          requestId: getNowRequestId(),
        };

        return failure;
      }
    },
  };
}

export { HttpRuntimeApiClient };
export { DeploymentEnvironmentConfigError };
