import { beforeEach, describe, expect, it, vi } from 'vitest';

const lambdaMocks = vi.hoisted(() => ({
  send: vi.fn(),
  InvokeCommand: vi.fn((input: unknown) => ({ input })),
  LambdaClient: vi.fn(() => ({ send: lambdaMocks.send })),
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  InvokeCommand: lambdaMocks.InvokeCommand,
  LambdaClient: lambdaMocks.LambdaClient,
}));

async function importModule() {
  return import('../../../src/lambda/deployment/runtime-invoke-client.js');
}

type EnvStore = Record<string, string | undefined>;

function envStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env unavailable');
  }

  return processRef.env;
}

describe('runtime invoke client', () => {
  beforeEach(() => {
    vi.resetModules();
    lambdaMocks.send.mockReset();
    lambdaMocks.InvokeCommand.mockClear();
    lambdaMocks.LambdaClient.mockClear();

    envStore().RUNTIME_EXECUTE_FUNCTION_ARN_DEV = 'arn:aws:lambda:us-east-1:111111111111:function:dev-keyra-runtime-execute';
    envStore().RUNTIME_EXECUTE_FUNCTION_ARN_PREPROD = 'arn:aws:lambda:us-east-1:222222222222:function:preprod-keyra-runtime-execute';
    envStore().RUNTIME_EXECUTE_FUNCTION_ARN_PROD = 'arn:aws:lambda:us-east-1:333333333333:function:prod-keyra-runtime-execute';
  });

  it('invokes runtime execute lambda directly and maps canonical response metadata', async () => {
    lambdaMocks.send.mockResolvedValue({
      Payload: new TextEncoder().encode(
        JSON.stringify({
          statusCode: 200,
          headers: {
            'x-request-id': 'runtime-request-1',
          },
          body: JSON.stringify({
            output: { total: 42 },
            diagnostics: [],
            metadata: {
              mappingId: 'map-1',
              snapshotId: 'artifact-1',
              snapshotHash: 'hash-1',
              sourceType: 'version',
              sourceNumber: 7,
              engineVersion: '1.2.3',
              executedAt: '2026-06-25T10:00:00.000Z',
            },
          }),
        }),
      ),
    });

    const { getRuntimeInvokeClient } = await importModule();
    const client = getRuntimeInvokeClient();

    const result = await client.preview({
      mappingId: 'map-1',
      environment: 'PREPROD',
      sourceData: { value: 10 },
      externalSources: { customer: { id: 'c-1' } },
      requestId: 'cp-req-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected invoke success');
    }

    expect(result.requestId).toBe('runtime-request-1');
    expect(result.data).toEqual({
      environment: 'PREPROD',
      mappingId: 'map-1',
      artifactId: 'artifact-1',
      artifactHash: 'hash-1',
      sourceType: 'version',
      sourceNumber: 7,
      engineVersion: '1.2.3',
      executedAt: '2026-06-25T10:00:00.000Z',
      output: { total: 42 },
      diagnostics: [],
    });

    expect(lambdaMocks.InvokeCommand).toHaveBeenCalledTimes(1);
    const invokeInput = lambdaMocks.InvokeCommand.mock.calls[0]?.[0] as {
      FunctionName?: string;
      Payload?: Uint8Array;
    };
    expect(invokeInput.FunctionName).toContain(':function:preprod-keyra-runtime-execute');

    const payloadText = new TextDecoder().decode(invokeInput.Payload);
    const payloadObject = JSON.parse(payloadText) as { body: string };
    const requestBody = JSON.parse(payloadObject.body) as {
      mappingId: string;
      responseMode: string;
      sourceData: Record<string, unknown>;
      externalSources: Record<string, unknown>;
    };
    expect(requestBody).toEqual({
      mappingId: 'map-1',
      responseMode: 'canonical',
      sourceData: { value: 10 },
      externalSources: { customer: { id: 'c-1' } },
    });
  });

  it('returns deterministic validation error when runtime execute function arn config missing', async () => {
    delete envStore().RUNTIME_EXECUTE_FUNCTION_ARN_DEV;
    delete envStore().RUNTIME_EXECUTE_FUNCTION_ARN_PREPROD;
    delete envStore().RUNTIME_EXECUTE_FUNCTION_ARN_PROD;

    const { getRuntimeInvokeClient } = await importModule();
    const client = getRuntimeInvokeClient();
    const result = await client.preview({
      mappingId: 'map-1',
      environment: 'DEV',
      sourceData: { value: 10 },
      requestId: 'cp-req-missing',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invoke failure');
    }

    expect(result.statusCode).toBe(500);
    expect(result.errorCode).toBe('VALIDATION_ERROR');
    expect(result.retryable).toBe(false);
    expect(result.message).toContain("environment 'DEV'");
    expect(lambdaMocks.send).not.toHaveBeenCalled();
  });

  it('maps runtime not-deployed envelope from invoked lambda response', async () => {
    lambdaMocks.send.mockResolvedValue({
      Payload: new TextEncoder().encode(
        JSON.stringify({
          statusCode: 404,
          headers: {
            'x-request-id': 'runtime-not-deployed-req',
          },
          body: JSON.stringify({
            error: {
              code: 'SOURCE_NOT_FOUND',
              message: "No active runtime snapshot found for mapping 'map-1'",
              statusCode: 404,
              retryable: false,
              requestId: 'runtime-not-deployed-req',
            },
          }),
        }),
      ),
    });

    const { getRuntimeInvokeClient } = await importModule();
    const client = getRuntimeInvokeClient();
    const result = await client.preview({
      mappingId: 'map-1',
      environment: 'PROD',
      sourceData: { value: 1 },
      requestId: 'cp-req-not-deployed',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected invoke failure');
    }

    expect(result.statusCode).toBe(404);
    expect(result.errorCode).toBe('SOURCE_NOT_FOUND');
    expect(result.retryable).toBe(false);
    expect(result.requestId).toBe('runtime-not-deployed-req');
  });
});
