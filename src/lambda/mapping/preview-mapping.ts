import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  internalError,
  jsonResponse,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { normalizeRuntimeDeploymentEnvironment, type RuntimeDeploymentEnvironment } from '../../lib/persistence/types.js';
import { getRuntimeInvokeClient } from '../deployment/runtime-invoke-client.js';

interface PreviewRequest {
  readonly environment: RuntimeDeploymentEnvironment;
  readonly sourceData: Readonly<Record<string, unknown>>;
  readonly externalSources: Readonly<Record<string, unknown>>;
}

function parseRuntimeEnvironment(value: unknown): RuntimeDeploymentEnvironment | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return normalizeRuntimeDeploymentEnvironment(value);
  } catch {
    return null;
  }
}

function parsePreviewRequest(body: Record<string, unknown> | null): PreviewRequest | null {
  if (!body) {
    return null;
  }

  const environment = parseRuntimeEnvironment(body.environment);
  const sourceData = body.sourceData;
  const externalSourcesCandidate = body.externalSources;

  const externalSources =
    externalSourcesCandidate && typeof externalSourcesCandidate === 'object' && !Array.isArray(externalSourcesCandidate)
      ? (externalSourcesCandidate as Readonly<Record<string, unknown>>)
      : {};

  if (!environment || !sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) {
    return null;
  }

  return {
    environment,
    sourceData: sourceData as Readonly<Record<string, unknown>>,
    externalSources,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parsePreviewRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid preview request body. Expected { environment: DEV|PREPROD|PROD, sourceData: object }',
      400,
      false,
    );
  }

  try {
    const requestId = generateRequestId();
    const invokeResult = await getRuntimeInvokeClient().preview({
      mappingId,
      environment: request.environment,
      sourceData: request.sourceData,
      externalSources: request.externalSources,
      requestId,
    });

    if (!invokeResult.ok) {
      const isNotDeployed = invokeResult.errorCode === ERROR_CODES.SOURCE_NOT_FOUND;
      const normalizedCode: (typeof ERROR_CODES)[keyof typeof ERROR_CODES] = isNotDeployed
        ? ERROR_CODES.NOT_DEPLOYED
        : (invokeResult.errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES]);
      const normalizedStatus = isNotDeployed ? 404 : invokeResult.statusCode;
      const normalizedMessage = isNotDeployed
        ? `NOT_DEPLOYED: no active deployment found for '${mappingId}' in environment '${request.environment}'`
        : invokeResult.message;

      return errorResponse(
        normalizedCode,
        normalizedMessage,
        normalizedStatus,
        invokeResult.retryable,
        invokeResult.requestId,
        {
          environment: request.environment,
          mappingId,
        },
      );
    }

    const previewData = invokeResult.data;
    if (!previewData) {
      const message = 'Runtime preview response missing data payload.';

      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        message,
        500,
        false,
        invokeResult.requestId,
        {
          environment: request.environment,
          mappingId,
        },
      );
    }

    return jsonResponse(200, {
      output: (previewData.output ?? {}) as Readonly<Record<string, unknown>>,
      diagnostics: previewData.diagnostics,
      metadata: {
        environment: previewData.environment,
        artifactId: previewData.artifactId,
        artifactHash: previewData.artifactHash,
        deployedAt: null,
        sourceType: previewData.sourceType ?? null,
        sourceNumber: previewData.sourceNumber ?? null,
        engineVersion: previewData.engineVersion ?? null,
      },
    }, invokeResult.requestId);
  } catch {
    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
