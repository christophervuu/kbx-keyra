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
import { create as createDeployment } from '../../lib/persistence/deployments.js';
import { getConfig as getRevisionConfig } from '../../lib/persistence/mapping-revisions.js';
import { get as getVersion, getConfig as getVersionConfig } from '../../lib/persistence/mapping-versions.js';

type DeploymentEnvironment = 'DEV' | 'QA' | 'PROD';
type DeploymentSourceType = 'revision' | 'version';

interface DeployRequest {
  readonly environment: DeploymentEnvironment;
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
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
  return value === 'DEV' || value === 'QA' || value === 'PROD';
}

function isSourceType(value: unknown): value is DeploymentSourceType {
  return value === 'revision' || value === 'version';
}

function parseDeployRequest(body: Record<string, unknown> | null): DeployRequest | null {
  if (!body) {
    return null;
  }

  const environment = body.environment;
  const sourceType = body.sourceType;
  const sourceNumber = body.sourceNumber;

  if (!isEnvironment(environment) || !isSourceType(sourceType)) {
    return null;
  }

  if (typeof sourceNumber !== 'number' || !Number.isInteger(sourceNumber) || sourceNumber <= 0) {
    return null;
  }

  return { environment, sourceType, sourceNumber };
}

function isRevisionDeployDisallowed(environment: DeploymentEnvironment, sourceType: DeploymentSourceType): boolean {
  return sourceType === 'revision' && environment !== 'DEV';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parseDeployRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid deployment request body. Expected { environment: DEV|QA|PROD, sourceType: revision|version, sourceNumber: integer>0 }',
      400,
      false,
    );
  }

  if (isRevisionDeployDisallowed(request.environment, request.sourceType)) {
    return errorResponse(
      ERROR_CODES.REVISION_NOT_DEPLOYABLE_TO_ENV,
      'Revision deployments are only allowed for DEV',
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

    if (request.sourceType === 'revision') {
      const config = await getRevisionConfig(mappingId, request.sourceNumber);
      if (!config) {
        return errorResponse(
          ERROR_CODES.SOURCE_NOT_FOUND,
          `Revision source not found: ${mappingId}:${request.sourceNumber}`,
          404,
          false,
        );
      }

      const created = await createDeployment({
        mappingId,
        environment: request.environment,
        sourceType: 'revision',
        sourceNumber: request.sourceNumber,
        deployedBy: 'system',
        config,
      });

      return jsonResponse(201, created);
    }

    const version = await getVersion(mappingId, request.sourceNumber);
    if (!version) {
      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `Version source not found: ${mappingId}:${request.sourceNumber}`,
        404,
        false,
      );
    }

    const config = await getVersionConfig(mappingId, request.sourceNumber);
    if (!config) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Version config snapshot unavailable: ${mappingId}:${request.sourceNumber}`,
        500,
        false,
      );
    }

    const created = await createDeployment({
      mappingId,
      environment: request.environment,
      sourceType: 'version',
      sourceNumber: version.version,
      deployedBy: 'system',
      config,
    });

    return jsonResponse(201, created);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
