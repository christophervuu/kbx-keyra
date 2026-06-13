import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateJsonSchemaString } from './fixtures/generate-schema.js';
import { parseJsonSchema as realParseJsonSchema } from '../../../src/lib/schema/parser/parse-json-schema.js';
import { parseXsd as realParseXsd } from '../../../src/lib/schema/parser/parse-xsd.js';

import type { APIGatewayProxyEvent } from '../../../src/lambda/schema/ingest-schema.js';

const startExecutionSendMock = vi.hoisted(() => vi.fn());

const schemaLibMocks = vi.hoisted(() => ({
  createSchemaMetadata: vi.fn(),
  storeOriginalSchema: vi.fn(),
  parseJsonSchema: vi.fn(),
  parseXsd: vi.fn(),
  getInlineFieldThreshold: vi.fn(),
  batchWriteSchemaNodes: vi.fn(),
  storeProcessedContent: vi.fn(),
  updateSchemaStatus: vi.fn(),
  getSchemaMetadata: vi.fn(),
}));

vi.mock('@aws-sdk/client-sfn', () => {
  class StartExecutionCommand {
    constructor(public readonly input: unknown) {}
  }

  class SFNClient {
    send = startExecutionSendMock;
  }

  return {
    StartExecutionCommand,
    SFNClient,
  };
});

vi.mock('../../../src/lib/schema/index.js', () => {
  return {
    ...schemaLibMocks,
    parseJsonSchema: vi.fn(realParseJsonSchema),
    parseXsd: vi.fn(realParseXsd),
  };
});

function createEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: body === null ? null : JSON.stringify(body),
    httpMethod: 'POST',
    headers: {},
  };
}

type EnvStore = Record<string, string | undefined>;

function getEnvStore(): EnvStore {
  const processRef = (globalThis as { process?: { env?: EnvStore } }).process;
  if (!processRef?.env) {
    throw new Error('process.env is not available in this runtime');
  }

  return processRef.env;
}

function setStateMachineArn(value: string | undefined): void {
  const envStore = getEnvStore();
  if (value === undefined) {
    delete envStore.INGESTION_STATE_MACHINE_ARN;
    return;
  }

  envStore.INGESTION_STATE_MACHINE_ARN = value;
}

async function importHandler() {
  return import('../../../src/lambda/schema/ingest-schema.js');
}

describe('schema ingestion integration - inline path', () => {
  beforeEach(() => {
    vi.resetModules();
    startExecutionSendMock.mockReset().mockResolvedValue({ executionArn: 'arn:aws:states:exec-123' });
    setStateMachineArn('arn:aws:states:us-east-1:123:stateMachine:schema-ingestion');

    schemaLibMocks.createSchemaMetadata.mockReset().mockResolvedValue(undefined);
    schemaLibMocks.storeOriginalSchema.mockReset().mockResolvedValue('schemas/schema-id/original.json');
    schemaLibMocks.getInlineFieldThreshold.mockReset().mockReturnValue(500);
    schemaLibMocks.batchWriteSchemaNodes.mockReset().mockImplementation(async (nodes: unknown[]) => ({ written: nodes.length, failed: 0 }));
    schemaLibMocks.storeProcessedContent.mockReset().mockResolvedValue('schemas/schema-id/content.json');
    schemaLibMocks.updateSchemaStatus.mockReset().mockResolvedValue(undefined);
    schemaLibMocks.getSchemaMetadata.mockReset().mockResolvedValue(null);
  });

  it('50-field schema processes inline with node persistence expectations (AE-01)', async () => {
    const { handler } = await importHandler();
    const schemaContent = generateJsonSchemaString(50);

    const response = await handler(
      createEvent({
        name: 'Generated 50',
        content: schemaContent,
        format: 'json-schema',
        origin: 'local',
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(schemaLibMocks.createSchemaMetadata).toHaveBeenCalledTimes(1);
    expect(schemaLibMocks.batchWriteSchemaNodes).toHaveBeenCalledTimes(1);
    expect(startExecutionSendMock).not.toHaveBeenCalled();

    const writtenNodes = schemaLibMocks.batchWriteSchemaNodes.mock.calls[0]?.[0] as Array<{ path: string; depth: number; type: string }>;
    const persistedCount = schemaLibMocks.getSchemaMetadata.mock.calls.length > 0
      ? (JSON.parse(response.body) as { metadata?: { fieldCount?: number } }).metadata?.fieldCount
      : undefined;

    expect(persistedCount).toBe(50);
    expect(writtenNodes.length).toBeGreaterThanOrEqual(50);
    expect(writtenNodes.some((node) => node.path.includes('Order.Header'))).toBe(true);
    expect(writtenNodes.some((node) => node.path.includes('Order.LineItems'))).toBe(true);
    expect(writtenNodes.every((node) => node.depth >= 0)).toBe(true);
    expect(writtenNodes.some((node) => node.type === 'number' || node.type === 'boolean' || node.type === 'string')).toBe(true);
  });

  it('499-field schema remains inline and does not dispatch Step Functions (AE-02)', async () => {
    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Generated 499',
        content: generateJsonSchemaString(499),
        format: 'json-schema',
        origin: 'local',
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(startExecutionSendMock).not.toHaveBeenCalled();
    const writtenNodes = schemaLibMocks.batchWriteSchemaNodes.mock.calls[0]?.[0] as unknown[];
    expect(writtenNodes.length).toBeGreaterThanOrEqual(499);

    const parsedResponse = JSON.parse(response.body) as { metadata?: { fieldCount?: number } };
    expect(parsedResponse.metadata?.fieldCount).toBe(499);
  });

  it('500-field schema triggers Step Functions orchestration dispatch (AE-03)', async () => {
    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Generated 500',
        content: generateJsonSchemaString(500),
        format: 'json-schema',
        origin: 'local',
      }),
    );

    expect(response.statusCode).toBe(202);
    expect(startExecutionSendMock).toHaveBeenCalledTimes(1);
  });
});
