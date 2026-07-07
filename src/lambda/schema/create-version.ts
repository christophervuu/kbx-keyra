import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  jsonResponse,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { createImmutableSchemaVersion } from '../../lib/schema/lifecycle.js';

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const sfnClient = new SFNClient({});
const SCHEMA_DERIVED_STATUS_STATE_MACHINE_ARN = getEnvValue('SCHEMA_DERIVED_STATUS_STATE_MACHINE_ARN')?.trim();

interface CreateSchemaVersionRequest {
  readonly expectedDraftRevision: number;
  readonly idempotencyKey?: string;
  readonly changeSummary?: string;
}

function parseIdempotencyKey(event: APIGatewayProxyEvent, body: Record<string, unknown> | null): string | null {
  const headerValue = event.headers?.['x-idempotency-key'] ?? event.headers?.['X-Idempotency-Key'];
  if (typeof headerValue === 'string' && headerValue.trim() !== '') {
    return headerValue.trim();
  }

  if (body && typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() !== '') {
    return body.idempotencyKey.trim();
  }

  return null;
}

function parseRequest(body: Record<string, unknown> | null): CreateSchemaVersionRequest | null {
  if (!body) {
    return null;
  }

  if (typeof body.expectedDraftRevision !== 'number' || !Number.isInteger(body.expectedDraftRevision) || body.expectedDraftRevision <= 0) {
    return null;
  }

  const request: CreateSchemaVersionRequest = {
    expectedDraftRevision: body.expectedDraftRevision,
  };

  if (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() !== '') {
    request.idempotencyKey = body.idempotencyKey.trim();
  }

  if (typeof body.changeSummary === 'string' && body.changeSummary.trim() !== '') {
    request.changeSummary = body.changeSummary.trim();
  }

  return request;
}

function classifyError(error: unknown): { code: string; message: string; statusCode: number; retryable: boolean } {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (/revision conflict/i.test(message) || /idempotency key reuse conflict/i.test(message)) {
    return {
      code: ERROR_CODES.CONFLICT,
      message,
      statusCode: 409,
      retryable: false,
    };
  }

  if (/no active draft/i.test(message)) {
    return {
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message,
      statusCode: 404,
      retryable: false,
    };
  }

  return {
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'Failed to create schema version',
    statusCode: 500,
    retryable: true,
  };
}

async function startDerivedStatusOrchestration(input: {
  readonly requestId: string;
  readonly schemaId: string;
  readonly actor: string;
  readonly version: {
    readonly version: number;
    readonly schemaVersionId: string;
    readonly draftRevision: number;
    readonly versionStatus: string;
    readonly indexStatus: string;
    readonly impactStatus: string;
    readonly sampleValidationStatus: string;
  };
}): Promise<void> {
  const emittedAt = new Date().toISOString();

  if (!SCHEMA_DERIVED_STATUS_STATE_MACHINE_ARN) {
    console.info('[schema-create-version] derived-status-orchestration-skipped', {
      eventType: 'schema-version-derived-processing-skipped',
      requestId: input.requestId,
      schemaId: input.schemaId,
      schemaVersion: input.version.version,
      schemaVersionId: input.version.schemaVersionId,
      draftRevision: input.version.draftRevision,
      actor: input.actor,
      emittedAt,
      reason: 'state-machine-not-configured',
      versionStatus: input.version.versionStatus,
      indexStatus: input.version.indexStatus,
      impactStatus: input.version.impactStatus,
      sampleValidationStatus: input.version.sampleValidationStatus,
    });
    return;
  }

  try {
    const execution = await sfnClient.send(
      new StartExecutionCommand({
        stateMachineArn: SCHEMA_DERIVED_STATUS_STATE_MACHINE_ARN,
        input: JSON.stringify({
          schemaId: input.schemaId,
          schemaVersion: input.version.version,
          schemaVersionId: input.version.schemaVersionId,
          draftRevision: input.version.draftRevision,
          actor: input.actor,
          requestId: input.requestId,
          emittedAt,
        }),
      }),
    );

    console.info('[schema-create-version] derived-status-orchestration-started', {
      eventType: 'schema-version-derived-processing-started',
      requestId: input.requestId,
      schemaId: input.schemaId,
      schemaVersion: input.version.version,
      schemaVersionId: input.version.schemaVersionId,
      draftRevision: input.version.draftRevision,
      actor: input.actor,
      emittedAt,
      executionArn: execution.executionArn,
      versionStatus: input.version.versionStatus,
      indexStatus: input.version.indexStatus,
      impactStatus: input.version.impactStatus,
      sampleValidationStatus: input.version.sampleValidationStatus,
    });
  } catch (error) {
    console.error('[schema-create-version] derived-status-orchestration-failed', {
      eventType: 'schema-version-derived-processing-start-failed',
      requestId: input.requestId,
      schemaId: input.schemaId,
      schemaVersion: input.version.version,
      schemaVersionId: input.version.schemaVersionId,
      draftRevision: input.version.draftRevision,
      actor: input.actor,
      emittedAt,
      reason: error instanceof Error ? error.message : 'Unknown error',
      versionStatus: input.version.versionStatus,
      indexStatus: input.version.indexStatus,
      impactStatus: input.version.impactStatus,
      sampleValidationStatus: input.version.sampleValidationStatus,
    });
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const schemaId = parsePathParam(event, 'id') ?? parsePathParam(event, 'schemaId');
  if (!schemaId) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Missing required path parameter: id',
      400,
      false,
      requestId,
    );
  }

  const body = parseBody(event) as Record<string, unknown> | null;
  const parsed = parseRequest(body);
  if (!parsed) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid request body. Expected { expectedDraftRevision: integer>0, idempotencyKey?: string, changeSummary?: string }',
      400,
      false,
      requestId,
    );
  }

  const idempotencyKey = parseIdempotencyKey(event, body);

  try {
    const result = await createImmutableSchemaVersion(schemaId, {
      createdBy: 'system',
      expectedDraftRevision: parsed.expectedDraftRevision,
      idempotencyKey: idempotencyKey ?? parsed.idempotencyKey,
      changeSummary: parsed.changeSummary,
    });

    if (result.noChange) {
      return jsonResponse(
        200,
        {
          noChange: true,
          replayed: result.replayed ?? false,
        },
        requestId,
      );
    }

    if (result.item) {
      await startDerivedStatusOrchestration({
        requestId,
        schemaId,
        actor: 'system',
        version: {
          version: result.item.version,
          schemaVersionId: result.item.schemaVersionId,
          draftRevision: result.item.draftRevision,
          versionStatus: result.item.versionStatus,
          indexStatus: result.item.indexStatus,
          impactStatus: result.item.impactStatus,
          sampleValidationStatus: result.item.sampleValidationStatus,
        },
      });
    }

    return jsonResponse(
      result.replayed ? 200 : 201,
      {
        noChange: false,
        replayed: result.replayed ?? false,
        version: result.item,
      },
      requestId,
    );
  } catch (error) {
    const classified = classifyError(error);
    return errorResponse(
      classified.code as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
      classified.message,
      classified.statusCode,
      classified.retryable,
      requestId,
    );
  }
}
