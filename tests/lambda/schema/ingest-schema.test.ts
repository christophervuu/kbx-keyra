import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../src/lib/schema/index.js', () => schemaLibMocks);

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

const ORIGINAL_STATE_MACHINE_ARN = getEnvStore().INGESTION_STATE_MACHINE_ARN;

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

describe('ingest-schema handler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    startExecutionSendMock.mockReset();
    setStateMachineArn('arn:aws:states:us-east-1:123:stateMachine:schema-ingestion');

    schemaLibMocks.createSchemaMetadata.mockReset().mockResolvedValue(undefined);
    schemaLibMocks.storeOriginalSchema.mockReset().mockResolvedValue('schemas/generated/original.json');
    schemaLibMocks.parseJsonSchema.mockReset().mockReturnValue({ nodes: [], fieldCount: 0 });
    schemaLibMocks.parseXsd.mockReset().mockReturnValue({ nodes: [], fieldCount: 0 });
    schemaLibMocks.getInlineFieldThreshold.mockReset().mockReturnValue(500);
    schemaLibMocks.batchWriteSchemaNodes.mockReset().mockResolvedValue({ written: 0, failed: 0 });
    schemaLibMocks.storeProcessedContent.mockReset().mockResolvedValue('schemas/generated/content.json');
    schemaLibMocks.updateSchemaStatus.mockReset().mockResolvedValue(undefined);
    schemaLibMocks.getSchemaMetadata.mockReset().mockResolvedValue(null);

    startExecutionSendMock.mockResolvedValue({ executionArn: 'arn:aws:states:exec-123' });
    vi.spyOn(console, 'info').mockImplementation(() => {
      // noop
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setStateMachineArn(ORIGINAL_STATE_MACHINE_ARN);
  });

  it('processes small schema inline and returns 201 (AE-01)', async () => {
    schemaLibMocks.parseJsonSchema.mockReturnValue({
      nodes: [{ schemaId: 'schema-fixed-id', path: 'Order.Id' }],
      fieldCount: 50,
    });

    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Small Order',
        content: '{"type":"object","properties":{"Id":{"type":"string"}}}',
        format: 'json-schema',
        origin: 'local',
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(schemaLibMocks.createSchemaMetadata).toHaveBeenCalledTimes(1);
    expect(schemaLibMocks.batchWriteSchemaNodes).toHaveBeenCalledTimes(1);
    expect(startExecutionSendMock).not.toHaveBeenCalled();
  });

  it('processes schema below threshold (499) inline (AE-02)', async () => {
    schemaLibMocks.parseJsonSchema.mockReturnValue({ nodes: [], fieldCount: 499 });
    schemaLibMocks.batchWriteSchemaNodes.mockResolvedValue({ written: 499, failed: 0 });

    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Medium Schema',
        content: '{"type":"object","properties":{}}',
        format: 'json-schema',
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(startExecutionSendMock).not.toHaveBeenCalled();
  });

  it('delegates schema at threshold (500) to Step Functions with 202 (AE-03)', async () => {
    schemaLibMocks.parseJsonSchema.mockReturnValue({ nodes: [], fieldCount: 500 });

    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Large Schema',
        content: '{"type":"object","properties":{}}',
        format: 'json-schema',
      }),
    );

    expect(response.statusCode).toBe(202);
    expect(startExecutionSendMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when name is missing', async () => {
    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        content: '{"type":"object"}',
        format: 'json-schema',
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'Missing required field: name' });
  });

  it('returns 400 when content is missing', async () => {
    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Missing Content',
        format: 'json-schema',
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'Missing required field: content' });
  });

  it('sets schema status error and returns parse failure response (AE-09)', async () => {
    schemaLibMocks.parseJsonSchema.mockReturnValue({
      nodes: [],
      fieldCount: 0,
      errors: ['Invalid JSON schema content'],
    });

    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Broken Schema',
        content: '{"bad": true}',
        format: 'json-schema',
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(schemaLibMocks.updateSchemaStatus).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('handles empty schema and returns 201 with fieldCount 0 (AE-10)', async () => {
    schemaLibMocks.parseJsonSchema.mockReturnValue({
      nodes: [],
      fieldCount: 0,
    });
    schemaLibMocks.getSchemaMetadata.mockResolvedValue({
      schemaId: 'generated-schema-id',
      name: 'Empty',
      format: 'json-schema',
      fieldCount: 0,
      origin: 'local',
      status: 'ready',
      source: { type: 'upload' },
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    });

    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Empty',
        content: '{"type":"object","properties":{}}',
        format: 'json-schema',
      }),
    );

    expect(response.statusCode).toBe(201);
    const parsed = JSON.parse(response.body) as { metadata: { fieldCount: number } };
    expect(parsed.metadata.fieldCount).toBe(0);
  });

  it('auto-detects json-schema format from JSON content', async () => {
    schemaLibMocks.parseJsonSchema.mockReturnValue({ nodes: [], fieldCount: 1 });

    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Detected JSON',
        content: '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object"}',
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(schemaLibMocks.parseJsonSchema).toHaveBeenCalledTimes(1);
  });

  it('auto-detects xsd format from XML content', async () => {
    schemaLibMocks.parseXsd.mockReturnValue({ nodes: [], fieldCount: 1 });

    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Detected XSD',
        content: '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"></xs:schema>',
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(schemaLibMocks.parseXsd).toHaveBeenCalledTimes(1);
  });

  it('emits embedding size/throughput telemetry for inline ingestion retrieval fields', async () => {
    schemaLibMocks.parseJsonSchema.mockReturnValue({
      nodes: [
        {
          schemaId: 'schema-fixed-id',
          path: 'Order.Id',
          fieldName: 'Id',
          type: 'string',
          depth: 0,
          isArray: false,
          isRequired: true,
          childCount: 0,
          subtreeFieldCount: 1,
          embeddingText: 'Order.Id | Id (string)',
          embedding: [0.1, 0.2, 0.3],
        },
      ],
      fieldCount: 1,
    });

    const infoSpy = vi.spyOn(console, 'info');
    const { handler } = await importHandler();
    const response = await handler(
      createEvent({
        name: 'Telemetry Schema',
        content: '{"type":"object","properties":{"Id":{"type":"string"}}}',
        format: 'json-schema',
      }),
    );

    expect(response.statusCode).toBe(201);
    expect(infoSpy).toHaveBeenCalledWith(
      '[schema-ingestion] retrieval fields prepared',
      expect.objectContaining({
        schemaId: expect.any(String),
        fieldCount: 1,
        isInline: true,
        nodeCount: 1,
        nodesWithEmbeddingText: 1,
        nodesWithEmbeddingVector: 1,
        approxEmbeddingBytes: 24,
      }),
    );
  });
});
