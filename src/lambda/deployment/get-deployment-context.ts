import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { getCurrentAll } from '../../lib/persistence/deployments.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';
type DeploymentStatus = 'deployed' | 'stale' | 'not-deployed';

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly version: number;
}

interface ProjectMetadata {
  readonly projectId: string;
  readonly name: string;
}

interface DeploymentEnvironmentStatus {
  readonly environment: DeploymentEnvironment;
  readonly status: DeploymentStatus;
  readonly deployedVersion?: number;
  readonly deployedAt?: string;
}

interface DeploymentContext {
  readonly mappingId: string;
  readonly mappingName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly environments: readonly DeploymentEnvironmentStatus[];
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

function getProjectsTableOrThrow(): string {
  const table = getEnvValue('PROJECTS_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: PROJECTS_TABLE');
  }

  return table;
}

function toEnvironmentStatus(input: {
  environment: DeploymentEnvironment;
  mappingVersion: number;
  current: {
    sourceType: 'revision' | 'version';
    sourceNumber: number;
    deployedAt: string;
  } | null;
}): DeploymentEnvironmentStatus {
  const { environment, mappingVersion, current } = input;
  if (!current) {
    return {
      environment,
      status: 'not-deployed',
    };
  }

  const isStale = current.sourceType === 'version' && current.sourceNumber < mappingVersion;

  return {
    environment,
    status: isStale ? 'stale' : 'deployed',
    ...(current.sourceType === 'version' ? { deployedVersion: current.sourceNumber } : {}),
    deployedAt: current.deployedAt,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  try {
    const mapping = await getItem<MappingMetadata>({
      TableName: getMappingsTableOrThrow(),
      Key: { mappingId },
    });

    if (!mapping) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Mapping with id '${mappingId}' not found`, 404, false);
    }

    const project = await getItem<ProjectMetadata>({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId: mapping.projectId },
    });

    const current = await getCurrentAll(mappingId);
    const payload: DeploymentContext = {
      mappingId,
      mappingName: mapping.name,
      projectId: mapping.projectId,
      projectName: project?.name ?? mapping.projectId,
      environments: [
        toEnvironmentStatus({ environment: 'DEV', mappingVersion: mapping.version, current: current.DEV }),
        toEnvironmentStatus({ environment: 'PREPROD', mappingVersion: mapping.version, current: current.PREPROD }),
        toEnvironmentStatus({ environment: 'PROD', mappingVersion: mapping.version, current: current.PROD }),
      ],
    };

    return jsonResponse(200, payload);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
