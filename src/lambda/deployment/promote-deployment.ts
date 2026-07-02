import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  getItem,
  internalError,
  jsonResponse,
  parseBody,
  parsePathParam,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { create as createDeployment, getCurrent, listHistory as listDeploymentHistory } from '../../lib/persistence/deployments.js';
import {
  create as createDeploymentOrchestration,
  get as getDeploymentOrchestration,
  updateStatus as updateDeploymentOrchestrationStatus,
} from '../../lib/persistence/deployment-orchestrations.js';
import { getConfig as getVersionConfig } from '../../lib/persistence/mapping-versions.js';
import { validateCdmDeployGuard } from './cdm-deploy-guard.js';
import {
  assertArtifactPayloadWithinLimit,
  buildRuntimeDeployArtifact,
  getRuntimeRelayClient,
} from './runtime-relay.js';
import { executeRuntimeOperationWithRetry } from './orchestration-retry.js';
import { getRuntimeApiClient } from './runtime-api-client.js';

type DeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';

interface PromoteRequest {
  readonly fromEnvironment: DeploymentEnvironment;
  readonly toEnvironment: DeploymentEnvironment;
}

interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId?: string;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
}

interface ValueMapDependencyIssue {
  readonly valueMapId: string;
  readonly dependencyState: 'needs-review' | 'invalid';
  readonly reason: 'dependency-state' | 'link-missing' | 'value-map-missing';
}

interface ValueTableItem {
  readonly valueTableId: string;
  readonly scope?: 'project' | 'global';
}

interface ValueMapProjectLinkItem {
  readonly dependencyState?: 'current' | 'needs-review' | 'invalid';
}

interface MappingConfigLike {
  readonly rules?: readonly Array<{
    readonly valueTableRef?: {
      readonly scope?: string;
      readonly valueTableId?: string;
      readonly resolvedEntries?: unknown;
    };
  }>;
}

interface OrchestrationContext {
  readonly orchestrationId: string;
  readonly requestId: string;
}

interface ReplayResult {
  readonly replayed: true;
  readonly response: APIGatewayProxyResult;
}

function mapRelayStatusCodeToHttp(statusCode: number): number {
  if (statusCode >= 400 && statusCode < 600) {
    return statusCode;
  }

  return 503;
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

function getValueTablesTableOrThrow(): string {
  const table = getEnvValue('VALUE_TABLES_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: VALUE_TABLES_TABLE');
  }

  return table;
}

function getValueTableRevisionsTableOrThrow(): string {
  const table = getEnvValue('VALUE_TABLE_REVISIONS_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: VALUE_TABLE_REVISIONS_TABLE');
  }

  return table;
}

function projectLinkSk(projectId: string, valueMapId: string): string {
  return `link#${projectId}#${valueMapId}`;
}

function extractProjectValueMapIds(config: MappingConfigLike): readonly string[] {
  const rules = Array.isArray(config.rules) ? config.rules : [];
  const ids = new Set<string>();

  for (const rule of rules) {
    const ref = rule?.valueTableRef;
    if (!ref || ref.scope !== 'project' || typeof ref.valueTableId !== 'string' || ref.valueTableId.trim() === '') {
      continue;
    }

    ids.add(ref.valueTableId);
  }

  return [...ids.values()];
}

function hasUnresolvedProjectValueMapBindings(config: MappingConfigLike): boolean {
  const rules = Array.isArray(config.rules) ? config.rules : [];

  for (const rule of rules) {
    const ref = rule?.valueTableRef;
    if (!ref || ref.scope !== 'project') {
      continue;
    }

    if (!Array.isArray(ref.resolvedEntries)) {
      return true;
    }
  }

  return false;
}

async function evaluateValueMapDependencyGate(input: {
  readonly projectId?: string;
  readonly config: MappingConfigLike;
}): Promise<readonly ValueMapDependencyIssue[]> {
  if (!input.projectId) {
    return [];
  }

  const valueMapIds = extractProjectValueMapIds(input.config);
  if (valueMapIds.length === 0) {
    return [];
  }

  const issues: ValueMapDependencyIssue[] = [];
  for (const valueMapId of valueMapIds) {
    const valueMap = await getItem<ValueTableItem>({
      TableName: getValueTablesTableOrThrow(),
      Key: { valueTableId: valueMapId },
    });

    if (!valueMap) {
      issues.push({
        valueMapId,
        dependencyState: 'invalid',
        reason: 'value-map-missing',
      });
      continue;
    }

    if (valueMap.scope !== 'global') {
      continue;
    }

    const link = await getItem<ValueMapProjectLinkItem>({
      TableName: getValueTableRevisionsTableOrThrow(),
      Key: {
        valueTableId: projectLinkSk(input.projectId, valueMapId),
        revision: 0,
      },
    });

    if (!link) {
      issues.push({
        valueMapId,
        dependencyState: 'invalid',
        reason: 'link-missing',
      });
      continue;
    }

    if (link.dependencyState === 'needs-review' || link.dependencyState === 'invalid') {
      issues.push({
        valueMapId,
        dependencyState: link.dependencyState,
        reason: 'dependency-state',
      });
    }
  }

  return issues;
}

function parseIdempotencyKey(event: APIGatewayProxyEvent): string | null {
  const headers = event.headers;
  if (!headers) {
    return null;
  }

  const key = headers['x-idempotency-key'] ?? headers['X-Idempotency-Key'];
  if (typeof key !== 'string' || key.trim() === '') {
    return null;
  }

  return key.trim();
}

function buildDeterministicOrchestrationId(input: {
  mappingId: string;
  fromEnvironment: DeploymentEnvironment;
  toEnvironment: DeploymentEnvironment;
  idempotencyKey: string;
}): string {
  return ['promote', input.mappingId, input.fromEnvironment, input.toEnvironment, input.idempotencyKey].join(':');
}

function isConditionalCheckFailed(error: unknown): boolean {
  const typed = error as { name?: string; Code?: string } | null | undefined;
  return typed?.name === 'ConditionalCheckFailedException' || typed?.Code === 'ConditionalCheckFailedException';
}

function mapErrorCodeToStatusCode(errorCode: string | undefined): number {
  switch (errorCode) {
    case ERROR_CODES.VALIDATION_ERROR:
    case ERROR_CODES.PROMOTION_REQUIRES_VERSION:
      return 400;
    case ERROR_CODES.SOURCE_NOT_FOUND:
      return 404;
    case ERROR_CODES.CONFLICT:
      return 409;
    case ERROR_CODES.PAYLOAD_TOO_LARGE:
    case ERROR_CODES.DEPLOY_ARTIFACT_TOO_LARGE:
      return 413;
    case ERROR_CODES.SERVICE_UNAVAILABLE:
      return 503;
    case ERROR_CODES.TIMEOUT:
      return 504;
    default:
      return 500;
  }
}

function isSequentialPromotionPath(fromEnvironment: DeploymentEnvironment, toEnvironment: DeploymentEnvironment): boolean {
  return (
    (fromEnvironment === 'DEV' && toEnvironment === 'PREPROD')
    || (fromEnvironment === 'PREPROD' && toEnvironment === 'PROD')
  );
}

function isEnvironment(value: unknown): value is DeploymentEnvironment {
  return value === 'DEV' || value === 'PREPROD' || value === 'PROD';
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

async function createOrchestrationContext(input: {
  mappingId: string;
  fromEnvironment: DeploymentEnvironment;
  toEnvironment: DeploymentEnvironment;
  artifactId: string;
  idempotencyKey?: string | null;
}): Promise<OrchestrationContext> {
  const requestId = generateRequestId();
  const orchestrationId = input.idempotencyKey
    ? buildDeterministicOrchestrationId({
        mappingId: input.mappingId,
        fromEnvironment: input.fromEnvironment,
        toEnvironment: input.toEnvironment,
        idempotencyKey: input.idempotencyKey,
      })
    : undefined;

  const orchestration = await createDeploymentOrchestration({
    ...(orchestrationId ? { orchestrationId } : {}),
    mappingId: input.mappingId,
    operationType: 'promote',
    targetEnvironment: input.toEnvironment,
    sourceEnvironment: input.fromEnvironment,
    artifactId: input.artifactId,
    requestId,
    requestedBy: 'system',
  });

  await updateDeploymentOrchestrationStatus({
    orchestrationId: orchestration.orchestrationId,
    status: 'in_progress',
    attemptCount: 1,
    artifactId: input.artifactId,
    requestId,
  });

  return {
    orchestrationId: orchestration.orchestrationId,
    requestId,
  };
}

async function buildReplayResponse(input: {
  mappingId: string;
  fromEnvironment: DeploymentEnvironment;
  toEnvironment: DeploymentEnvironment;
  orchestration: {
    orchestrationId: string;
    status: string;
    requestId: string;
    artifactId?: string;
    lastErrorCode?: string;
    lastErrorMessage?: string;
  };
}): Promise<APIGatewayProxyResult> {
  const status = input.orchestration.status;

  if (status === 'succeeded') {
    const history = await listDeploymentHistory(input.mappingId, input.toEnvironment, 25);
    const matching = history.find(
      (item) => item.artifactId === input.orchestration.artifactId && item.promotedFrom === input.fromEnvironment,
    );

    if (matching) {
      return jsonResponse(
        200,
        {
          ...matching,
          orchestrationId: input.orchestration.orchestrationId,
          replayed: true,
        },
        input.orchestration.requestId,
      );
    }

    return jsonResponse(
      200,
      {
        orchestrationId: input.orchestration.orchestrationId,
        status,
        replayed: true,
      },
      input.orchestration.requestId,
    );
  }

  if (status === 'failed' || status === 'timed_out') {
    const errorCode = input.orchestration.lastErrorCode ?? ERROR_CODES.INTERNAL_ERROR;
    return errorResponse(
      errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
      input.orchestration.lastErrorMessage ?? 'Previous idempotent promotion attempt failed.',
      mapErrorCodeToStatusCode(input.orchestration.lastErrorCode),
      errorCode === ERROR_CODES.TIMEOUT || errorCode === ERROR_CODES.SERVICE_UNAVAILABLE,
      input.orchestration.requestId,
      {
        orchestrationId: input.orchestration.orchestrationId,
        status,
        replayed: true,
      },
    );
  }

  return jsonResponse(
    202,
    {
      orchestrationId: input.orchestration.orchestrationId,
      status,
      replayed: true,
    },
    input.orchestration.requestId,
  );
}

async function createOrchestrationOrReplay(input: {
  mappingId: string;
  fromEnvironment: DeploymentEnvironment;
  toEnvironment: DeploymentEnvironment;
  artifactId: string;
  idempotencyKey?: string | null;
}): Promise<OrchestrationContext | ReplayResult> {
  try {
    return await createOrchestrationContext(input);
  } catch (error) {
    if (!input.idempotencyKey || !isConditionalCheckFailed(error)) {
      throw error;
    }

    const orchestrationId = buildDeterministicOrchestrationId({
      mappingId: input.mappingId,
      fromEnvironment: input.fromEnvironment,
      toEnvironment: input.toEnvironment,
      idempotencyKey: input.idempotencyKey,
    });

    const existing = await getDeploymentOrchestration(orchestrationId);
    if (!existing) {
      throw error;
    }

    const response = await buildReplayResponse({
      mappingId: input.mappingId,
      fromEnvironment: input.fromEnvironment,
      toEnvironment: input.toEnvironment,
      orchestration: existing,
    });

    return {
      replayed: true,
      response,
    };
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const idempotencyKey = parseIdempotencyKey(event);
  const mappingId = parsePathParam(event, 'mappingId') ?? parsePathParam(event, 'id');
  if (!mappingId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: mappingId', 400, false);
  }

  const request = parsePromoteRequest(parseBody(event));
  if (!request) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid promotion request body. Expected { fromEnvironment: DEV|PREPROD|PROD, toEnvironment: DEV|PREPROD|PROD }',
      400,
      false,
    );
  }

  if (!isSequentialPromotionPath(request.fromEnvironment, request.toEnvironment)) {
    return errorResponse(
      ERROR_CODES.VALIDATION_ERROR,
      'Invalid promotion path. Supported sequential paths are DEV->PREPROD and PREPROD->PROD.',
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

    const cdmGuard = await validateCdmDeployGuard(mapping);
    if (cdmGuard.blocked) {
      const requestId = generateRequestId();
      return jsonResponse(
        409,
        {
          error: {
            code: ERROR_CODES.DEPLOY_BLOCKED_CDM_SCHEMA_STATE,
            message: 'Promotion blocked: referenced CDM schema state is not deployable',
            statusCode: 409,
            retryable: false,
            requestId,
            details: {
              issues: cdmGuard.issues,
            },
          },
        },
        requestId,
      );
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

    if (hasUnresolvedProjectValueMapBindings(config as MappingConfigLike)) {
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        `Promotion blocked: unresolved value-map bindings in source config (${mappingId}:version:${source.sourceNumber})`,
        500,
        false,
      );
    }

    const dependencyIssues = await evaluateValueMapDependencyGate({
      projectId: mapping.projectId,
      config: config as MappingConfigLike,
    });
    if (dependencyIssues.length > 0) {
      const gateRequestId = generateRequestId();
      return jsonResponse(
        409,
        {
          error: {
            code: ERROR_CODES.CONFLICT,
            message: 'Deployment blocked: value-map dependency state requires review or is invalid',
            statusCode: 409,
            retryable: false,
            requestId: gateRequestId,
            details: {
              issues: dependencyIssues,
            },
          },
        },
        gateRequestId,
      );
    }

    const artifact = await buildRuntimeDeployArtifact({
      mappingId,
      sourceType: 'version',
      sourceNumber: source.sourceNumber,
      config,
    });

    const artifactId = source.artifactId ?? artifact.artifactId;
    const artifactHash = source.artifactHash ?? artifact.artifactHash;

    const promoteArtifact = {
      ...artifact,
      artifactId,
      snapshotId: artifactId,
      artifactHash,
      sourceConfigHash: artifactHash,
    };

    const orchestration = await createOrchestrationOrReplay({
      mappingId,
      fromEnvironment: request.fromEnvironment,
      toEnvironment: request.toEnvironment,
      artifactId,
      idempotencyKey,
    });

    if ('replayed' in orchestration) {
      return orchestration.response;
    }

    const payloadCheck = assertArtifactPayloadWithinLimit(promoteArtifact);
    if (!payloadCheck.ok) {
      await updateDeploymentOrchestrationStatus({
        orchestrationId: orchestration.orchestrationId,
        status: 'failed',
        attemptCount: 1,
        artifactId,
        requestId: orchestration.requestId,
        lastErrorCode: ERROR_CODES.PAYLOAD_TOO_LARGE,
        lastErrorMessage: `Payload too large (${payloadCheck.payloadBytes} > ${payloadCheck.limitBytes})`,
      });

      return errorResponse(
        ERROR_CODES.PAYLOAD_TOO_LARGE,
        `Promotion artifact payload is too large (${payloadCheck.payloadBytes} bytes > limit ${payloadCheck.limitBytes} bytes). Reduce artifact size below the 5MB MVP limit.`,
        413,
        false,
        orchestration.requestId,
        {
          orchestrationId: orchestration.orchestrationId,
          artifactId,
          snapshotId: artifactId,
          payloadBytes: payloadCheck.payloadBytes,
          limitBytes: payloadCheck.limitBytes,
        },
      );
    }

    const retryResult = await executeRuntimeOperationWithRetry<void>({
      mappingId,
      environment: request.toEnvironment,
      operationType: 'promote',
      orchestrationId: orchestration.orchestrationId,
      requestId: orchestration.requestId,
      artifactId,
      runtimeApiClient: getRuntimeApiClient(),
      executeAttempt: async () => {
        const relay = await getRuntimeRelayClient().pushArtifact(request.toEnvironment, promoteArtifact, {
          requestId: orchestration.requestId,
          orchestrationId: orchestration.orchestrationId,
          operation: 'promote',
          promotedFrom: request.fromEnvironment,
          triggeredBy: 'system',
        });

        if (relay.ok) {
          return {
            ok: true,
            statusCode: relay.statusCode,
            requestId: relay.requestId,
            data: undefined,
          };
        }

        return {
          ok: false,
          statusCode: mapRelayStatusCodeToHttp(relay.statusCode),
          requestId: relay.requestId,
          errorCode: relay.errorCode,
          message: relay.message,
          retryable: relay.retryable,
        };
      },
    });

    if (!retryResult.ok) {
      return errorResponse(
        retryResult.errorCode as (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
        retryResult.message,
        retryResult.statusCode,
        retryResult.retryable,
        retryResult.requestId,
        {
          orchestrationId: orchestration.orchestrationId,
          environment: request.toEnvironment,
          artifactId,
          snapshotId: artifactId,
          promotedFrom: request.fromEnvironment,
          attemptCount: retryResult.attemptCount,
          finalStatus: retryResult.finalStatus,
        },
      );
    }

    const created = await createDeployment({
      mappingId,
      environment: request.toEnvironment,
      sourceType: 'version',
      sourceNumber: source.sourceNumber,
      deployedBy: 'system',
      artifactId,
      artifactHash,
      ...(cdmGuard.cdmTraceability.length > 0 ? { cdmSchemaTraceability: cdmGuard.cdmTraceability } : {}),
      promotedFrom: request.fromEnvironment,
      config,
    });

    await updateDeploymentOrchestrationStatus({
      orchestrationId: orchestration.orchestrationId,
      status: 'succeeded',
      attemptCount: retryResult.attemptCount,
      artifactId,
      requestId: retryResult.requestId,
    });

    return jsonResponse(201, {
      ...created,
      orchestrationId: orchestration.orchestrationId,
    }, retryResult.requestId);
  } catch (error) {
    const isArtifactIntegrityError =
      (error as { name?: string } | null | undefined)?.name === 'DeploymentArtifactIntegrityError';

    if (isArtifactIntegrityError) {
      const message = (error as { message?: string } | null | undefined)?.message ?? 'Artifact integrity mismatch';
      return errorResponse(
        ERROR_CODES.SNAPSHOT_INTEGRITY_ERROR,
        message,
        500,
        false,
      );
    }

    const err = internalError();
    return errorResponse(err.code, err.message, err.statusCode, err.retryable);
  }
}
