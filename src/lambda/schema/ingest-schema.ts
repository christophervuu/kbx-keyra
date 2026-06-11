import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

import {
  batchWriteSchemaNodes,
  createSchemaMetadata,
  getInlineFieldThreshold,
  getSchemaMetadata,
  parseJsonSchema,
  parseXsd,
  storeOriginalSchema,
  storeProcessedContent,
  updateSchemaStatus,
  type IngestionResult,
  type SchemaFormat,
  type SchemaMetadata,
  type SchemaOrigin,
} from '../../lib/schema/index.js';

export interface APIGatewayProxyEvent {
  readonly body: string | null;
  readonly httpMethod?: string;
  readonly headers?: Record<string, string | undefined>;
}

export interface APIGatewayProxyResult {
  readonly statusCode: number;
  readonly headers?: Record<string, string>;
  readonly body: string;
}

interface IngestSchemaRequest {
  readonly name?: unknown;
  readonly content?: unknown;
  readonly format?: unknown;
  readonly origin?: unknown;
}

const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const sfnClient = new SFNClient({});

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const INGESTION_STATE_MACHINE_ARN = getEnvValue('INGESTION_STATE_MACHINE_ARN');

function computeEmbeddingTelemetry(nodes: readonly {
  readonly embeddingText?: string;
  readonly embedding?: readonly number[];
}[]): {
  nodeCount: number;
  nodesWithEmbeddingText: number;
  nodesWithEmbeddingVector: number;
  approxEmbeddingBytes: number;
} {
  let nodesWithEmbeddingText = 0;
  let nodesWithEmbeddingVector = 0;
  let approxEmbeddingBytes = 0;

  for (const node of nodes) {
    if (typeof node.embeddingText === 'string' && node.embeddingText.trim() !== '') {
      nodesWithEmbeddingText += 1;
    }

    if (Array.isArray(node.embedding) && node.embedding.length > 0) {
      nodesWithEmbeddingVector += 1;
      approxEmbeddingBytes += node.embedding.length * 8;
    }
  }

  return {
    nodeCount: nodes.length,
    nodesWithEmbeddingText,
    nodesWithEmbeddingVector,
    approxEmbeddingBytes,
  };
}

function generateSchemaId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  return `schema-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function jsonResponse(statusCode: number, payload: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function parseRequestBody(body: string | null): IngestSchemaRequest | null {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    return parsed as IngestSchemaRequest;
  } catch {
    return null;
  }
}

function detectSchemaFormat(content: string): SchemaFormat | null {
  const trimmed = content.trim();

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Record<string, unknown>;
        if (
          typeof record.$schema === 'string'
          || typeof record.type === 'string'
          || typeof record.properties === 'object'
        ) {
          return 'json-schema';
        }
      }
    } catch {
      return null;
    }
  }

  if (/<\s*(xs|xsd):schema\b/i.test(trimmed)) {
    return 'xsd';
  }

  return null;
}

function isParseFailure(result: { readonly nodes: readonly unknown[]; readonly fieldCount: number; readonly errors?: readonly string[] }): boolean {
  return Boolean(result.errors && result.errors.length > 0 && result.nodes.length === 0 && result.fieldCount === 0);
}

function asSchemaOrigin(value: unknown): SchemaOrigin {
  if (value === 'cdm' || value === 'published' || value === 'local') {
    return value;
  }

  return 'local';
}

function getStateMachineArnOrThrow(): string {
  const arn = INGESTION_STATE_MACHINE_ARN?.trim();
  if (!arn) {
    throw new Error('Missing required environment variable: INGESTION_STATE_MACHINE_ARN');
  }

  return arn;
}

async function markSchemaError(schemaId: string): Promise<void> {
  try {
    await updateSchemaStatus(schemaId, 'error');
  } catch {
    // best-effort status update
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(200, { ok: true });
  }

  const requestBody = parseRequestBody(event.body);
  if (!requestBody) {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  if (typeof requestBody.name !== 'string' || requestBody.name.trim() === '') {
    return jsonResponse(400, { error: 'Missing required field: name' });
  }

  if (typeof requestBody.content !== 'string' || requestBody.content.trim() === '') {
    return jsonResponse(400, { error: 'Missing required field: content' });
  }

  const detectedFormat = requestBody.format ?? detectSchemaFormat(requestBody.content);
  if (detectedFormat !== 'json-schema' && detectedFormat !== 'xsd') {
    return jsonResponse(400, { error: 'Missing or unrecognized schema format' });
  }

  const schemaId = generateSchemaId();
  const origin = asSchemaOrigin(requestBody.origin);

  const metadata: SchemaMetadata = {
    schemaId,
    name: requestBody.name,
    format: detectedFormat,
    fieldCount: 0,
    origin,
    status: 'ingesting',
    source: {
      type: 'upload',
    },
    createdAt: '',
    updatedAt: '',
  };

  try {
    await createSchemaMetadata(metadata);
    const s3Key = await storeOriginalSchema(schemaId, requestBody.content, detectedFormat);

    const parseResult =
      detectedFormat === 'json-schema'
        ? parseJsonSchema(requestBody.content, schemaId)
        : parseXsd(requestBody.content, schemaId);

    if (isParseFailure(parseResult)) {
      await markSchemaError(schemaId);
      return jsonResponse(400, {
        schemaId,
        status: 'error',
        error: parseResult.errors?.[0] ?? 'Schema parse failed',
      });
    }

    const threshold = getInlineFieldThreshold();
    const isInline = parseResult.fieldCount < threshold;
    const embeddingTelemetry = computeEmbeddingTelemetry(parseResult.nodes);

    console.info('[schema-ingestion] retrieval fields prepared', {
      schemaId,
      fieldCount: parseResult.fieldCount,
      isInline,
      ...embeddingTelemetry,
    });

    if (!isInline) {
      const stateMachineArn = getStateMachineArnOrThrow();
      const execution = await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn,
          input: JSON.stringify({
            schemaId,
            s3Key,
            format: detectedFormat,
          }),
        }),
      );

      const result: IngestionResult = {
        schemaId,
        status: 'ingesting',
        executionArn: execution.executionArn ?? '',
      };

      return jsonResponse(202, result);
    }

    const writeResult = await batchWriteSchemaNodes(parseResult.nodes);
    if (writeResult.failed > 0) {
      await markSchemaError(schemaId);
      return jsonResponse(500, {
        schemaId,
        status: 'error',
        error: 'Failed to persist all schema nodes',
        details: writeResult,
      });
    }

    await storeProcessedContent(schemaId, {
      nodes: parseResult.nodes,
      fieldCount: parseResult.fieldCount,
      errors: parseResult.errors,
    });

    await updateSchemaStatus(schemaId, 'ready', {
      fieldCount: parseResult.fieldCount,
      format: detectedFormat,
      origin,
      name: requestBody.name,
      source: {
        type: 'upload',
      },
    });

    const persisted = await getSchemaMetadata(schemaId);
    const responseMetadata: SchemaMetadata =
      persisted
      ?? {
        ...metadata,
        fieldCount: parseResult.fieldCount,
        status: 'ready',
      };

    return jsonResponse(201, {
      schemaId,
      status: 'ready',
      metadata: responseMetadata,
    });
  } catch (error) {
    await markSchemaError(schemaId);

    return jsonResponse(500, {
      schemaId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unexpected ingestion failure',
    });
  }
}
