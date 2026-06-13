import { describe, expect, it, vi } from 'vitest';

import {
  DeploymentEnvironmentConfigError,
  getRuntimeEnvironmentConfig,
  loadDeploymentEnvironmentSettingsOrThrow,
  parseDeploymentEnvironmentSettingsFromEnv,
  parseDeploymentEnvironmentSettingsJson,
} from '../../../src/lambda/deployment/environment-config.js';
import {
  HttpRuntimeApiClient,
  toRuntimeRelayClient,
} from '../../../src/lambda/deployment/runtime-api-client.js';

describe('deployment environment configuration', () => {
  it('parses settings JSON and enforces required env keys', () => {
    const settings = parseDeploymentEnvironmentSettingsJson(
      JSON.stringify({
        deploymentEnvironments: [
          {
            key: 'DEV',
            runtimeApiBaseUrl: 'https://dev.runtime.example.com',
            label: 'Dev',
            deployApiPath: '/internal/deploy',
            rollbackApiPath: '/internal/rollback',
            previewApiPath: '/internal/preview',
            statusApiPath: '/internal/status/{mappingId}',
            requestTimeoutMs: 10000,
            retryPolicy: { maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 5000 },
          },
          {
            key: 'PREPROD',
            runtimeApiBaseUrl: 'https://preprod.runtime.example.com',
            label: 'Preprod',
            deployApiPath: '/internal/deploy',
            rollbackApiPath: '/internal/rollback',
            previewApiPath: '/internal/preview',
            statusApiPath: '/internal/status/{mappingId}',
            requestTimeoutMs: 10000,
            retryPolicy: { maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 5000 },
          },
          {
            key: 'PROD',
            runtimeApiBaseUrl: 'https://prod.runtime.example.com',
            label: 'Prod',
            deployApiPath: '/internal/deploy',
            rollbackApiPath: '/internal/rollback',
            previewApiPath: '/internal/preview',
            statusApiPath: '/internal/status/{mappingId}',
            requestTimeoutMs: 12000,
            retryPolicy: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 7000 },
          },
        ],
        promotionPolicy: {
          sequence: ['DEV', 'PREPROD', 'PROD'],
          allowSkip: false,
        },
      }),
    );

    expect(settings.source).toBe('env-json');
    expect(settings.deploymentEnvironments).toHaveLength(3);
    expect(getRuntimeEnvironmentConfig(settings, 'PREPROD').runtimeApiBaseUrl).toBe(
      'https://preprod.runtime.example.com',
    );
  });

  it('throws deterministic error when env fallback missing one runtime base URL', () => {
    expect(() =>
      parseDeploymentEnvironmentSettingsFromEnv({
        RUNTIME_API_BASE_URL_DEV: 'https://dev.runtime.example.com',
        RUNTIME_API_BASE_URL_PREPROD: 'https://preprod.runtime.example.com',
      }),
    ).toThrowError(DeploymentEnvironmentConfigError);
  });

  it('loads persisted settings provider before env fallback', async () => {
    const provider = {
      loadSettings: vi.fn().mockResolvedValue({
        source: 'persisted-settings',
        deploymentEnvironments: [
          {
            key: 'DEV',
            label: 'Dev',
            runtimeApiBaseUrl: 'https://persisted.dev.example.com',
            deployApiPath: '/internal/deploy',
            rollbackApiPath: '/internal/rollback',
            previewApiPath: '/internal/preview',
            statusApiPath: '/internal/status/{mappingId}',
            requestTimeoutMs: 10000,
            retryPolicy: { maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 5000 },
          },
          {
            key: 'PREPROD',
            label: 'Preprod',
            runtimeApiBaseUrl: 'https://persisted.preprod.example.com',
            deployApiPath: '/internal/deploy',
            rollbackApiPath: '/internal/rollback',
            previewApiPath: '/internal/preview',
            statusApiPath: '/internal/status/{mappingId}',
            requestTimeoutMs: 10000,
            retryPolicy: { maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 5000 },
          },
          {
            key: 'PROD',
            label: 'Prod',
            runtimeApiBaseUrl: 'https://persisted.prod.example.com',
            deployApiPath: '/internal/deploy',
            rollbackApiPath: '/internal/rollback',
            previewApiPath: '/internal/preview',
            statusApiPath: '/internal/status/{mappingId}',
            requestTimeoutMs: 10000,
            retryPolicy: { maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 5000 },
          },
        ],
        promotionPolicy: {
          sequence: ['DEV', 'PREPROD', 'PROD'],
          allowSkip: false,
        },
      }),
    };

    const settings = await loadDeploymentEnvironmentSettingsOrThrow({
      provider,
      env: {
        RUNTIME_API_BASE_URL_DEV: 'https://env.dev.example.com',
        RUNTIME_API_BASE_URL_PREPROD: 'https://env.preprod.example.com',
        RUNTIME_API_BASE_URL_PROD: 'https://env.prod.example.com',
      },
    });

    expect(settings.source).toBe('persisted-settings');
    expect(getRuntimeEnvironmentConfig(settings, 'DEV').runtimeApiBaseUrl).toBe(
      'https://persisted.dev.example.com',
    );
  });
});

describe('runtime api client contracts', () => {
  it('normalizes backend error envelope and preserves requestId/retryable', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 409,
      headers: {
        get: () => null,
      },
      json: async () => ({
        error: {
          code: 'ARTIFACT_NOT_PRESENT',
          message: 'Artifact missing in target runtime local storage',
          statusCode: 409,
          retryable: false,
          requestId: 'runtime-req-409',
        },
      }),
      text: async () => '',
    }));

    const client = new HttpRuntimeApiClient({
      fetchImpl,
      env: {
        RUNTIME_API_BASE_URL_DEV: 'https://dev.runtime.example.com',
        RUNTIME_API_BASE_URL_PREPROD: 'https://preprod.runtime.example.com',
        RUNTIME_API_BASE_URL_PROD: 'https://prod.runtime.example.com',
      },
    });

    const result = await client.rollback({
      mappingId: 'map-1',
      environment: 'DEV',
      targetArtifactId: 'art-1',
      requestId: 'cp-req-1',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure');
    }

    expect(result.errorCode).toBe('ARTIFACT_NOT_PRESENT');
    expect(result.retryable).toBe(false);
    expect(result.requestId).toBe('runtime-req-409');
  });

  it('classifies timeout as retryable TIMEOUT', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      init?.signal?.throwIfAborted?.();
      await new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortError = new DOMException('Aborted', 'AbortError');
          reject(abortError);
        });
      });

      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
        text: async () => '',
      };
    });

    const client = new HttpRuntimeApiClient({
      fetchImpl,
      env: {
        RUNTIME_API_BASE_URL_DEV: 'https://dev.runtime.example.com',
        RUNTIME_API_BASE_URL_PREPROD: 'https://preprod.runtime.example.com',
        RUNTIME_API_BASE_URL_PROD: 'https://prod.runtime.example.com',
        RUNTIME_REQUEST_TIMEOUT_MS: '1',
      },
    });

    const result = await client.status({
      mappingId: 'map-1',
      environment: 'DEV',
      requestId: 'cp-timeout-1',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected timeout failure');
    }

    expect(result.errorCode).toBe('TIMEOUT');
    expect(result.retryable).toBe(true);
    expect(result.statusCode).toBe(504);
  });

  it('relay adapter returns deterministic validation failure on config error', async () => {
    const client = new HttpRuntimeApiClient({
      fetchImpl: vi.fn(),
      env: {},
    });
    const relayClient = toRuntimeRelayClient(client);

    const relayResult = await relayClient.pushArtifact('DEV', {
      artifactId: 'art-1',
      artifactHash: 'hash-1',
      snapshotId: 'art-1',
      mappingId: 'map-1',
      sourceType: 'version',
      sourceNumber: 1,
      sourceConfigHash: 'hash-1',
      engineVersion: '1.0.0',
      mappingConfig: {
        name: 'Config',
        version: 1,
        engineVersion: '1.0.0',
        config: {},
        rules: [],
      },
      createdAt: new Date().toISOString(),
    });

    expect(relayResult.ok).toBe(false);
    if (relayResult.ok) {
      throw new Error('Expected relay failure');
    }

    expect(relayResult.errorCode).toBe('VALIDATION_ERROR');
    expect(relayResult.retryable).toBe(false);
  });

  it('preview client sends externalSources payload', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        environment: 'DEV',
        mappingId: 'map-1',
        artifactId: null,
        artifactHash: null,
        output: {},
        diagnostics: [],
      }),
      text: async () => '',
    }));

    const client = new HttpRuntimeApiClient({
      fetchImpl,
      env: {
        RUNTIME_API_BASE_URL_DEV: 'https://dev.runtime.example.com',
        RUNTIME_API_BASE_URL_PREPROD: 'https://preprod.runtime.example.com',
        RUNTIME_API_BASE_URL_PROD: 'https://prod.runtime.example.com',
      },
    });

    const result = await client.preview({
      mappingId: 'map-1',
      environment: 'DEV',
      sourceData: { amount: 12 },
      externalSources: { customerProfile: { id: 'c-1' } },
      requestId: 'cp-preview-1',
    });

    expect(result.ok).toBe(true);
    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1]?.body as string) ?? '{}') as {
      externalSources?: Record<string, unknown>;
      sourceData?: Record<string, unknown>;
    };
    expect(body.sourceData).toEqual({ amount: 12 });
    expect(body.externalSources).toEqual({ customerProfile: { id: 'c-1' } });
  });
});
