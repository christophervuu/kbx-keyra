import { HeadBucketCommand } from '@aws-sdk/client-s3';

import { getActiveSnapshot, listDeploymentHistory } from '../../lib/persistence/deployments.js';
import { RUNTIME_BUCKET_NAME } from '../../lib/persistence/config.js';
import { s3Client } from '../../lib/persistence/clients.js';
import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  jsonResponse,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

function logStatus(fields: {
  requestId: string;
  mappingId?: string;
  snapshotId?: string;
  outcome: 'ok' | 'not-deployed' | 'error' | 'validation-error';
  durationMs: number;
  eventType: 'health' | 'status';
}): void {
  console.info(JSON.stringify(fields));
}

async function checkS3Ready(): Promise<boolean> {
  try {
    await s3Client.send(
      new HeadBucketCommand({
        Bucket: RUNTIME_BUCKET_NAME,
      }),
    );

    return true;
  } catch {
    return false;
  }
}

async function checkDynamoReady(): Promise<boolean> {
  try {
    await getActiveSnapshot('__healthcheck__');
    return true;
  } catch {
    return false;
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const startedAt = Date.now();
  const requestId = generateRequestId();
  const mappingId = parsePathParam(event, 'mappingId');

  if (!mappingId) {
    const dynamoReady = await checkDynamoReady();
    const s3Ready = await checkS3Ready();
    const readiness = {
      dynamo: dynamoReady,
      s3: s3Ready,
    };

    logStatus({
      eventType: 'health',
      requestId,
      outcome: readiness.dynamo && readiness.s3 ? 'ok' : 'error',
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(
      200,
      {
        service: 'keyra-runtime',
        status: readiness.dynamo && readiness.s3 ? 'ready' : 'degraded',
        environment: (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.ENVIRONMENT_NAME ?? null,
        readiness,
      },
      requestId,
    );
  }

  if (!mappingId) {
    logStatus({
      eventType: 'status',
      requestId,
      outcome: 'validation-error',
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false, requestId);
  }

  try {
    const [active, history] = await Promise.all([
      getActiveSnapshot(mappingId),
      listDeploymentHistory(mappingId, 5),
    ]);

    if (!active) {
      logStatus({
        eventType: 'status',
        requestId,
        mappingId,
        outcome: 'not-deployed',
        durationMs: Date.now() - startedAt,
      });

      return jsonResponse(
        200,
        {
          mappingId,
          status: 'not-deployed',
          activeSnapshot: null,
          recentHistory: history,
        },
        requestId,
      );
    }

    logStatus({
      eventType: 'status',
      requestId,
      mappingId,
      snapshotId: active.activeSnapshotId,
      outcome: 'ok',
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(
      200,
      {
        mappingId,
        status: 'deployed',
        activeSnapshot: active,
        recentHistory: history,
      },
      requestId,
    );
  } catch {
    logStatus({
      eventType: 'status',
      requestId,
      mappingId,
      outcome: 'error',
      durationMs: Date.now() - startedAt,
    });

    return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'Internal server error', 500, true, requestId);
  }
}
