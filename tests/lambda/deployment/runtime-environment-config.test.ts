import { describe, expect, it, vi } from 'vitest';

import {
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
  it('parses settings JSON with canonical runtime environment coverage', () => {
    const settings = parseDeploymentEnvironmentSettingsJson(
      JSON.stringify({
        deploymentEnvironments: [
          {
            key: 'DEV',
            runtimeApiBaseUrl: 'https://dev.runtime.example.com',
            authMode: 'AWS_IAM',
            assumeRoleArn: 'arn:aws:iam::111111111111:role/keyra-runtime-dev-deploy',
            runtimeRegion: 'us-east-1',
            label: 'Dev',
            deployApiPath: '/internal/deploy',
            rollbackApiPath: '/internal/rollback',
            previewApiPath: '/internal/preview',
            statusApiPath: '/internal/status/{mappingId}',
            requestTimeoutMs: 10000,
            retryPolicy: { maxAttempts: 3, baseDelayMs: 400, maxDelayMs: 5000 },
          },
        ],
      }),
    );

    expect(settings.source).toBe('env-json');
    expect(settings.deploymentEnvironments).toHaveLength(1);
    expect(getRuntimeEnvironmentConfig(settings, 'DEV').runtimeApiBaseUrl).toBe('https://dev.runtime.example.com');
    expect(getRuntimeEnvironmentConfig(settings, 'DEV').authMode).toBe('AWS_IAM');
  });

  it('parses env fallback when only a subset of runtime base URLs is configured', () => {
    const settings = parseDeploymentEnvironmentSettingsFromEnv({
      RUNTIME_API_BASE_URL_DEV: 'https://dev.runtime.example.com',
      RUNTIME_API_AUTH_MODE_DEV: 'AWS_IAM',
      RUNTIME_ASSUME_ROLE_ARN_DEV: 'arn:aws:iam::111111111111:role/keyra-runtime-dev-deploy',
      AWS_REGION: 'us-east-1',
    });

    expect(settings?.source).toBe('env-fallback');
    expect(settings?.deploymentEnvironments).toHaveLength(1);
    expect(getRuntimeEnvironmentConfig(settings!, 'DEV').runtimeApiBaseUrl).toBe(
      'https://dev.runtime.example.com',
    );
    expect(getRuntimeEnvironmentConfig(settings!, 'DEV').authMode).toBe('AWS_IAM');
    expect(getRuntimeEnvironmentConfig(settings!, 'DEV').assumeRoleArn).toBe('arn:aws:iam::111111111111:role/keyra-runtime-dev-deploy');
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
            authMode: 'AWS_IAM',
            assumeRoleArn: 'arn:aws:iam::111111111111:role/keyra-runtime-dev-deploy',
            runtimeRegion: 'us-east-1',
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
      },
    });

    expect(settings.source).toBe('persisted-settings');
    expect(getRuntimeEnvironmentConfig(settings, 'DEV').runtimeApiBaseUrl).toBe(
      'https://persisted.dev.example.com',
    );
    expect(getRuntimeEnvironmentConfig(settings, 'DEV').authMode).toBe('AWS_IAM');
  });
});

describe('runtime api client contracts', () => {
  it('adds SigV4 authorization header when runtime auth mode is AWS_IAM', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ({
        mappingId: 'map-1',
        environment: 'DEV',
        artifactId: 'art-1',
        artifactHash: 'hash-1',
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
      settingsProvider: {
        loadSettings: vi.fn().mockResolvedValue({
          source: 'persisted-settings',
          deploymentEnvironments: [
            {
              key: 'DEV',
              label: 'Dev',
              runtimeApiBaseUrl: 'https://dev.runtime.example.com',
              authMode: 'AWS_IAM',
              assumeRoleArn: 'arn:aws:iam::111111111111:role/keyra-runtime-dev-deploy',
              runtimeRegion: 'us-east-1',
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
      },
      credentialsProvider: {
        getCredentials: vi.fn().mockResolvedValue({
          accessKeyId: 'AKIA_TEST',
          secretAccessKey: 'SECRET_TEST',
          sessionToken: 'TOKEN_TEST',
        }),
      },
    });

    const result = await client.deploy({
      mappingId: 'map-1',
      environment: 'DEV',
      operation: 'deploy',
      artifact: {
        artifactId: 'art-1',
        snapshotId: 'art-1',
        artifactHash: 'hash-1',
        mappingId: 'map-1',
        sourceType: 'version',
        sourceNumber: 1,
        sourceConfigHash: 'hash-1',
        engineVersion: '1.0.0',
        mappingConfig: {
          name: 'Map',
          version: 1,
          engineVersion: '1.0.0',
          config: {},
          rules: [],
        },
        bundleFormatVersion: 1,
        manifest: {
          artifactId: 'art-1',
          artifactHash: 'hash-1',
          mappingId: 'map-1',
          mappingVersion: 1,
          engineVersion: '1.0.0',
          dslVersion: '1',
          bundleFormatVersion: 1,
          sourceSchemaRefs: [],
          targetSchemaRef: null,
          enrichmentSchemaRefs: [],
          valueMapRefs: [],
          constantsHash: 'const',
          compiledDslHash: 'dsl',
        },
      },
      requestId: 'cp-req-iam-1',
    });

    expect(result.ok).toBe(true);
    const call = fetchImpl.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(call[1]?.headers?.authorization ?? call[1]?.headers?.Authorization).toBeTruthy();
    expect(call[1]?.headers?.['x-amz-security-token'] ?? call[1]?.headers?.['X-Amz-Security-Token']).toBeTruthy();
  });

  it('does not add SigV4 authorization header when runtime auth mode is NONE', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ status: 'ok' }),
      text: async () => '',
    }));

    const client = new HttpRuntimeApiClient({
      fetchImpl,
      settingsProvider: {
        loadSettings: vi.fn().mockResolvedValue({
          source: 'persisted-settings',
          deploymentEnvironments: [
            {
              key: 'DEV',
              label: 'Dev',
              runtimeApiBaseUrl: 'https://dev.runtime.example.com',
              authMode: 'NONE',
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
      },
      credentialsProvider: {
        getCredentials: vi.fn().mockResolvedValue({
          accessKeyId: 'AKIA_TEST',
          secretAccessKey: 'SECRET_TEST',
        }),
      },
    });

    const result = await client.status({
      mappingId: 'map-1',
      environment: 'DEV',
      requestId: 'cp-req-none-1',
    });

    expect(result.ok).toBe(true);
    const call = fetchImpl.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(call[1]?.headers?.authorization ?? call[1]?.headers?.Authorization).toBeFalsy();
  });

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

  it('returns VALIDATION_ERROR when AWS_IAM runtime config is missing assumeRoleArn', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ status: 'ok' }),
      text: async () => '',
    }));

    const client = new HttpRuntimeApiClient({
      fetchImpl,
      settingsProvider: {
        loadSettings: vi.fn().mockResolvedValue({
          source: 'persisted-settings',
          deploymentEnvironments: [
            {
              key: 'DEV',
              label: 'Dev',
              runtimeApiBaseUrl: 'https://dev.runtime.example.com',
              authMode: 'AWS_IAM',
              runtimeRegion: 'us-east-1',
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
      },
    });

    const result = await client.status({
      mappingId: 'map-1',
      environment: 'DEV',
      requestId: 'cp-config-err-1',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected config failure');
    }

    expect(result.errorCode).toBe('VALIDATION_ERROR');
    expect(result.retryable).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.message).toContain('assumeRoleArn');
    expect(fetchImpl).not.toHaveBeenCalled();
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
      bundleFormatVersion: 1,
      manifest: {
        artifactId: 'art-1',
        artifactHash: 'hash-1',
        mappingId: 'map-1',
        mappingVersion: 1,
        engineVersion: '1.0.0',
        dslVersion: '1',
        bundleFormatVersion: 1,
        sourceSchemaRefs: [],
        targetSchemaRef: null,
        enrichmentSchemaRefs: [],
        valueMapRefs: [],
        constantsHash: 'const',
        compiledDslHash: 'dsl',
      },
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
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCall = fetchImpl.mock.calls[0] as unknown as [string, { body?: string } | undefined] | undefined;
    if (!firstCall) {
      throw new Error('Expected preview request call.');
    }
    const requestInit = firstCall[1];
    const body = JSON.parse((requestInit?.body ?? '{}')) as {
      externalSources?: Record<string, unknown>;
      sourceData?: Record<string, unknown>;
    };
    expect(body.sourceData).toEqual({ amount: 12 });
    expect(body.externalSources).toEqual({ customerProfile: { id: 'c-1' } });
  });
});
