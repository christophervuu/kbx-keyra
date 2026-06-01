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
import { create as createDeployment, getCurrent } from '../../lib/persistence/deployments.js';
import { getConfig as getVersionConfig } from '../../lib/persistence/mapping-versions.js';

type DeploymentEnvironment = 'DEV' | 'QA' | 'PROD';

interface PromoteRequest {
  readonly fromEnvironment: DeploymentEnvironment;
  readonly toEnvironment: DeploymentEnvironment;
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

function parsePromoteRequest(body: Record<string, unknown> | null): PromoteRequest | null {
  if (!body) {
    return null;
  }

  const fromEnvironment = body.fromEnvironment;
  const toEnvironment = body.toEnvironment;

  if (!isEnvironment(fromEnvironment) || !isEnvironment(toEnvironment)) {
    return null;
  }

  return { fromEnvironment, toEnvironment };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parsePromoteRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid promotion request body. Expected { fromEnvironment: DEV|QA|PROD, toEnvironment: DEV|QA|PROD }',
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

    const source = await getCurrent(mappingId, request.fromEnvironment);
    if (!source) {
      return errorResponse(
        ERROR_CODES.SOURCE_NOT_FOUND,
        `No deployment found in ${request.fromEnvironment} for mapping '${mappingId}'`,
        404,
        false,
      );
    }

    if (source.sourceType !== 'version') {
      return errorResponse(
        ERROR_CODES.PROMOTION_REQUIRES_VERSION,
        'Promotion requires a version-backed source deployment',
        400,
        false,
      );
    }

    const config = await getVersionConfig(mappingId, source.sourceNumber);
    if (!config) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Version config snapshot unavailable: ${mappingId}:${source.sourceNumber}`,
        500,
        false,
      );
    }

    const created = await createDeployment({
      mappingId,
      environment: request.toEnvironment,
      sourceType: 'version',
      sourceNumber: source.sourceNumber,
      deployedBy: 'system',
      promotedFrom: request.fromEnvironment,
      config,
    });

    return jsonResponse(201, created);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
