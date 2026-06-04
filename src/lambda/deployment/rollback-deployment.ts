import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { createRollback as createRollbackDeployment, listHistory } from '../../lib/persistence/deployments.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

interface RollbackRequest {
  readonly environment: DeploymentEnvironment;
  readonly deploymentSK: string;
}

interface MappingMetadata {
  readonly mappingId: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function getMappingsTableOrThrow(): string {
  const table = getEnvValue('MAPPINGS_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function isEnvironment(value: unknown): value is DeploymentEnvironment {
  return value === 'DEV' || value === 'PREPROD' || value === 'PROD';
}

function parseRollbackRequest(body: Record<string, unknown> | null): RollbackRequest | null {
  if (!body) {
    return null;
  }

  const environment = body.environment;
  const deploymentSK = body.deploymentSK;

  if (!isEnvironment(environment)) {
    return null;
  }

  if (typeof deploymentSK !== 'string' || deploymentSK.trim() === '') {
    return null;
  }

  return {
    environment,
    deploymentSK: deploymentSK.trim(),
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parseRollbackRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid rollback request body. Expected { environment: DEV|PREPROD|PROD, deploymentSK: string }',
      400,
      false,
    );
  }

  try {
    const mapping = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!mapping) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Mapping with id '${mappingId}' not found`, 404, false);
    }

    const history = await listHistory(mappingId, request.environment);
    const target = history.find((entry) => entry.environmentDeployedAt === request.deploymentSK);

    if (!target) {
      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `Deployment snapshot not found: ${mappingId}:${request.deploymentSK}`,
        404,
        false,
      );
    }

    if (!target.configS3Key || !target.configHash) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Rollback artifact metadata unavailable: ${mappingId}:${request.deploymentSK}`,
        500,
        false,
      );
    }

    if (!target.artifactId || !target.artifactHash) {
      return errorResponse(
        ERROR_CODES.CONFLICT,
        'artifact_not_available_for_rollback: artifact metadata missing in target environment. Redeploy/promote the desired snapshot first.',
        409,
        false,
        undefined,
        {
          reason: 'artifact_not_available_for_rollback',
          environment: request.environment,
          deploymentSK: request.deploymentSK,
          remediation: 'redeploy-or-promote-artifact',
        },
      );
    }

    const created = await createRollbackDeployment({
      mappingId,
      environment: request.environment,
      sourceType: target.sourceType,
      sourceNumber: target.sourceNumber,
      deployedBy: 'system',
      artifactId: target.artifactId,
      artifactHash: target.artifactHash,
      configHash: target.configHash,
      configS3Key: target.configS3Key,
      rollbackOf: request.deploymentSK,
    });

    return jsonResponse(201, created);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
