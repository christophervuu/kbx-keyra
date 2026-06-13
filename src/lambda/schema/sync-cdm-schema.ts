import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  getItem,
  jsonResponse,
  parsePathParam,
  putObject,
  serviceUnavailable,
  validationError,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { CDM_ROOT_PATH, encodeGitHubPath, isWithinCdmRoot } from './cdm-path.js';
import {
  executeGitHubReadWithRetry,
  isCdmGitHubReadError,
  toCdmFailureResponse,
} from './cdm-github-read.js';
import type { SchemaSyncResult } from '../../lib/persistence/types.js';
import { logSyncActivity } from '../../lib/persistence/index.js';
import {
  batchWriteSchemaNodes,
  computeSchemaDiff,
  getAllSchemaNodes,
  getInlineFieldThreshold,
  parseJsonSchema,
  storeOriginalSchema,
  storeProcessedContent,
  updateSchemaStatus,
  updateSyncMetadata,
} from '../../lib/schema/index.js';

import type { SchemaDiffSummary } from '../../lib/persistence/types.js';

type SchemaFormat = 'json-schema' | 'xsd';

type SchemaSyncStatus = 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';

interface GitHubSourceInfo {
  readonly type: 'github';
  readonly repo: string;
  readonly repoId?: number;
  readonly branch: string;
  readonly path: string;
  readonly commitSha?: string;
}

interface SchemaMetadataRecord {
  readonly schemaId: string;
  readonly name: string;
  readonly format: SchemaFormat;
  readonly origin: 'cdm' | 'published' | 'local';
  readonly syncStatus: SchemaSyncStatus;
  readonly source: GitHubSourceInfo | { readonly type: 'upload' };
  readonly updatedAt: string;
}

interface GitHubContentFileResponse {
  readonly name: string;
  readonly path: string;
  readonly type: 'file' | 'dir';
  readonly sha: string;
  readonly content?: string;
  readonly encoding?: 'base64' | string;
  readonly download_url?: string | null;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const GITHUB_API_BASE = getEnvValue('GITHUB_API_BASE')?.trim() || 'https://api.github.com';
const GITHUB_TOKEN = getEnvValue('GITHUB_TOKEN')?.trim();

const CDM_REPO_OWNER = getEnvValue('CDM_REPO_OWNER')?.trim() || 'KBXT';
const CDM_REPO_NAME = getEnvValue('CDM_REPO_NAME')?.trim() || 'KBX-Canonicals';

const sfnClient = new SFNClient({});

const INGESTION_STATE_MACHINE_ARN = getEnvValue('INGESTION_STATE_MACHINE_ARN');

function getSchemasTableOrThrow(): string {
  const table = getEnvValue('SCHEMAS_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: SCHEMAS_TABLE');
  }

  return table;
}

function getContentBucketOrThrow(): string {
  const bucket = getEnvValue('CONTENT_BUCKET')?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: CONTENT_BUCKET');
  }

  return bucket;
}

function schemaContentKey(schemaId: string, format: SchemaFormat): string {
  return `schemas/${schemaId}/content.${format === 'xsd' ? 'xsd' : 'json'}`;
}

function decodeBase64Content(encoded: string): string | null {
  try {
    return Buffer.from(encoded.replace(/\n/g, ''), 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function ensureJsonSchema(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

function toGitHubContentFileResponse(payload: unknown): GitHubContentFileResponse | 'invalid' {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return 'invalid';
  }

  const candidate = payload as Record<string, unknown>;
  if (
    typeof candidate.path !== 'string'
    || typeof candidate.name !== 'string'
    || typeof candidate.sha !== 'string'
    || (candidate.type !== 'file' && candidate.type !== 'dir')
  ) {
    return 'invalid';
  }

  return {
    name: candidate.name,
    path: candidate.path,
    sha: candidate.sha,
    type: candidate.type,
    ...(typeof candidate.content === 'string' ? { content: candidate.content } : {}),
    ...(typeof candidate.encoding === 'string' ? { encoding: candidate.encoding } : {}),
    ...(typeof candidate.download_url === 'string' ? { download_url: candidate.download_url } : {}),
  };
}

async function fetchGitHubFile(
  path: string,
  branch: string,
  requestId: string,
  correlationId?: string,
): Promise<GitHubContentFileResponse | 'invalid'> {
  const encodedPath = encodeGitHubPath(path);
  const url = `${GITHUB_API_BASE}/repos/${CDM_REPO_OWNER}/${CDM_REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  const { response } = await executeGitHubReadWithRetry({
    url,
    operation: 'sync',
    repo: `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`,
    sourcePath: path,
    requestId,
    correlationId,
    init: {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  });

  if (!response.ok) {
    return 'invalid';
  }

  const payload = (await response.json()) as unknown;
  return toGitHubContentFileResponse(payload);
}

function reasonForFailureClass(failureClass: 'rate-limited' | 'unauthorized-forbidden' | 'not-found-path-mismatch' | 'timeout-transient'): string {
  if (failureClass === 'rate-limited') {
    return 'GitHub API rate limit';
  }

  if (failureClass === 'unauthorized-forbidden') {
    return 'GitHub unauthorized or forbidden';
  }

  if (failureClass === 'not-found-path-mismatch') {
    return 'CDM source file not found';
  }

  return 'GitHub API unavailable';
}

/**
 * Best-effort activity logging wrapper — never fail the sync operation
 * when activity logging is unavailable.
 */
async function logSyncActivityBestEffort(input: Parameters<typeof logSyncActivity>[0]): Promise<void> {
  try {
    await logSyncActivity(input);
  } catch {
    // Activity logging is best-effort per T-05.
  }
}

/**
 * Best-effort retrieval of pre-sync schema nodes for diff computation.
 * Returns an empty array if the read fails (diff is best-effort per AE-05).
 */
async function getPriorNodes(schemaId: string): Promise<ReadonlyArray<{ path: string; type: string; isArray: boolean; depth: number }>> {
  try {
    return await getAllSchemaNodes(schemaId);
  } catch {
    return [];
  }
}

function isReadOnlyStatusMode(event: APIGatewayProxyEvent): boolean {
  return event.httpMethod?.toUpperCase() === 'GET';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const correlationId = event.headers?.['x-correlation-id'] ?? event.headers?.['X-Correlation-Id'];
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false, requestId);
  }

  if (!GITHUB_TOKEN) {
    const err = serviceUnavailable('CDM sync is temporarily unavailable. Please retry shortly.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const statusOnly = isReadOnlyStatusMode(event);

  try {
    const metadata = await getItem<SchemaMetadataRecord>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (!metadata) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Schema with id '${schemaId}' not found`, 404, false, requestId);
    }

    if (metadata.origin !== 'cdm' || metadata.source.type !== 'github') {
      const err = validationError('Schema is not a CDM-linked GitHub schema.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const source = metadata.source;
    if (!source.branch || !source.path || !source.repo) {
      const err = validationError('CDM source metadata is incomplete. Re-link schema from CDM Library and retry.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    if (!isWithinCdmRoot(source.path)) {
      const err = validationError(`Invalid source path. Only ${CDM_ROOT_PATH}/* is allowed.`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const fetched = await fetchGitHubFile(source.path, source.branch, requestId, correlationId);
    if (fetched === 'invalid' || fetched.type !== 'file') {
      await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: new Date().toISOString(), lastSyncReason: 'Invalid GitHub response' });
      await logSyncActivityBestEffort({ schemaId, outcome: 'failed', reason: 'Invalid GitHub response' });
      const err = validationError('Invalid GitHub response while syncing CDM schema');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const currentCommit = source.commitSha;
    const changed = typeof currentCommit !== 'string' || currentCommit !== fetched.sha;

    if (statusOnly) {
      const now = new Date().toISOString();
      if (changed) {
        await updateSyncMetadata(schemaId, { syncStatus: 'update-available', lastSyncResult: 'no-op', lastSyncTimestamp: now });
      } else {
        await updateSyncMetadata(schemaId, { syncStatus: 'synced', lastSyncResult: 'no-op', lastSyncTimestamp: now });
      }
      await logSyncActivityBestEffort({ schemaId, outcome: 'no-op', previousCommitSha: currentCommit, currentCommitSha: currentCommit });

      const result: SchemaSyncResult = {
        schemaId,
        status: 'no-op',
        synced: !changed,
        currentCommitSha: currentCommit,
        commitSha: currentCommit,
        previousCommitSha: currentCommit,
        message: changed
          ? 'Update available from CDM source. Trigger a full re-sync to apply.'
          : 'Schema is up to date with CDM source.',
      };
      return jsonResponse(200, result);
    }

    if (!changed) {
      const now = new Date().toISOString();
      await updateSyncMetadata(schemaId, { syncStatus: 'synced', lastSyncResult: 'no-op', lastSyncTimestamp: now });
      await logSyncActivityBestEffort({ schemaId, outcome: 'no-op', previousCommitSha: currentCommit, currentCommitSha: currentCommit });
      const result: SchemaSyncResult = {
        schemaId,
        status: 'no-op',
        synced: true,
        currentCommitSha: currentCommit,
        commitSha: currentCommit,
        previousCommitSha: currentCommit,
        message: 'Schema is already up to date.',
      };
      return jsonResponse(200, result);
    }

    let contentString: string | null = null;
    const now = new Date().toISOString();
    if (typeof fetched.content === 'string' && fetched.encoding === 'base64') {
      contentString = decodeBase64Content(fetched.content);
    } else if (typeof fetched.download_url === 'string') {
      try {
        const { response: downloadResponse } = await executeGitHubReadWithRetry({
          url: fetched.download_url,
          operation: 'sync',
          repo: `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`,
          sourcePath: source.path,
          requestId,
          correlationId,
          init: {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
            },
          },
        });

        if (!downloadResponse.ok) {
          await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: 'Failed to download CDM content' });
          await logSyncActivityBestEffort({ schemaId, outcome: 'failed', reason: 'Failed to download CDM content' });
          const err = serviceUnavailable('Unable to download CDM schema content right now. Please retry shortly.');
          return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
        }

        contentString = await downloadResponse.text();
      } catch (error) {
        if (isCdmGitHubReadError(error)) {
          const mapped = toCdmFailureResponse(error);
          await updateSyncMetadata(schemaId, {
            syncStatus: 'sync-failed',
            lastSyncResult: 'failed',
            lastSyncTimestamp: now,
            lastSyncReason: reasonForFailureClass(mapped.details.failureClass),
          });
          await logSyncActivityBestEffort({ schemaId, outcome: 'failed', reason: reasonForFailureClass(mapped.details.failureClass) });

          return errorResponse(
            mapped.code,
            mapped.message,
            mapped.statusCode,
            mapped.retryable,
            requestId,
            mapped.details,
            mapped.headers,
          );
        }

        await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: 'Failed to download CDM content' });
        await logSyncActivityBestEffort({ schemaId, outcome: 'failed', reason: 'Failed to download CDM content' });
        const err = serviceUnavailable('Unable to download CDM schema content right now. Please retry shortly.');
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
      }
    }

    if (!contentString) {
      await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: 'CDM file content unavailable from GitHub' });
      await logSyncActivityBestEffort({ schemaId, outcome: 'failed', reason: 'CDM file content unavailable from GitHub' });
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'CDM file content is unavailable from GitHub response', 400, false, requestId);
    }

    const normalizedContent = metadata.format === 'json-schema' ? ensureJsonSchema(contentString) : contentString;
    if (!normalizedContent) {
      await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: 'Invalid JSON content in CDM schema' });
      await logSyncActivityBestEffort({ schemaId, outcome: 'failed', reason: 'Invalid JSON content in CDM schema' });
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'CDM JSON schema content is invalid JSON', 400, false, requestId);
    }

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: schemaContentKey(schemaId, metadata.format),
      Body: normalizedContent,
      ContentType: metadata.format === 'xsd' ? 'application/xml' : 'application/json',
    });

    // --- Full ingestion pipeline (FS-077) ---
    // Only run full re-ingestion for JSON Schema CDM schemas.
    let executionArn: string | undefined;
    let diffSummary: SchemaDiffSummary | undefined;

    if (metadata.format === 'json-schema') {
      const now = new Date().toISOString();

      // 1. Parse
      const parseResult = parseJsonSchema(normalizedContent, schemaId);
      if (parseResult.errors && parseResult.errors.length > 0 && parseResult.nodes.length === 0 && parseResult.fieldCount === 0) {
        await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: parseResult.errors[0] });
        await updateSchemaStatus(schemaId, 'error');
        await logSyncActivityBestEffort({ schemaId, outcome: 'failed', previousCommitSha: currentCommit, reason: parseResult.errors[0] });

        return jsonResponse(200, {
          schemaId,
          status: 'failed' as const,
          synced: false,
          message: 'Schema re-sync failed: parse error.',
          reason: parseResult.errors[0],
          previousCommitSha: currentCommit,
          commitSha: currentCommit,
        } satisfies SchemaSyncResult);
      }

      // 1b. Best-effort diff computation against pre-sync nodes
      const priorNodes = await getPriorNodes(schemaId);
      diffSummary = computeSchemaDiff(priorNodes, parseResult.nodes);

      const threshold = getInlineFieldThreshold();
      const isLargeIngestion = parseResult.fieldCount >= threshold;

      if (isLargeIngestion) {
        // 2a. Route to Step Functions for large schemas
        const stateMachineArn = INGESTION_STATE_MACHINE_ARN?.trim();
        if (!stateMachineArn) {
          await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: 'INGESTION_STATE_MACHINE_ARN not configured' });
          await updateSchemaStatus(schemaId, 'error');
          await logSyncActivityBestEffort({ schemaId, outcome: 'failed', previousCommitSha: currentCommit, reason: 'INGESTION_STATE_MACHINE_ARN not configured' });

          return jsonResponse(200, {
            schemaId,
            status: 'failed' as const,
            synced: false,
            message: 'Schema re-sync failed: INGESTION_STATE_MACHINE_ARN not configured for large schema.',
            reason: 'Missing INGESTION_STATE_MACHINE_ARN environment variable',
            previousCommitSha: currentCommit,
            commitSha: currentCommit,
          } satisfies SchemaSyncResult);
        }

        // Store original content at the standard original key for the state machine.
        await storeOriginalSchema(schemaId, normalizedContent, 'json-schema');

        const execution = await sfnClient.send(
          new StartExecutionCommand({
            stateMachineArn,
            input: JSON.stringify({
              schemaId,
              s3Key: `schemas/${schemaId}/original.json`,
              format: 'json-schema',
            }),
          }),
        );

        executionArn = execution.executionArn ?? '';
      } else {
        // 2b. Inline ingestion pipeline
        try {
          const writeResult = await batchWriteSchemaNodes(parseResult.nodes);
          if (writeResult.failed > 0) {
            await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: `${writeResult.failed} nodes failed to write` });
            await updateSchemaStatus(schemaId, 'error');
            await logSyncActivityBestEffort({ schemaId, outcome: 'failed', previousCommitSha: currentCommit, currentCommitSha: fetched.sha, reason: `${writeResult.failed} nodes failed to write` });

            return jsonResponse(200, {
              schemaId,
              status: 'failed' as const,
              synced: false,
              message: 'Schema re-sync failed: DynamoDB node write had failures.',
              reason: `${writeResult.failed} nodes failed to write`,
              previousCommitSha: currentCommit,
              commitSha: currentCommit,
            } satisfies SchemaSyncResult);
          }

          await storeProcessedContent(schemaId, {
            nodes: parseResult.nodes,
            fieldCount: parseResult.fieldCount,
            errors: parseResult.errors,
          });

          await updateSchemaStatus(schemaId, 'ready', {
            fieldCount: parseResult.fieldCount,
            format: metadata.format,
            origin: metadata.origin,
            name: metadata.name,
            source: metadata.source,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Unexpected ingestion failure';
          await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: reason });
          await updateSchemaStatus(schemaId, 'error');
          await logSyncActivityBestEffort({ schemaId, outcome: 'failed', previousCommitSha: currentCommit, currentCommitSha: fetched.sha, reason });

          return jsonResponse(200, {
            schemaId,
            status: 'failed' as const,
            synced: false,
            message: 'Schema re-sync failed during re-ingestion.',
            reason,
            previousCommitSha: currentCommit,
            commitSha: currentCommit,
          } satisfies SchemaSyncResult);
        }
      }
    }

    // --- Mark as synced only after successful ingestion (or skipped for xsd) ---
    const syncNow = new Date().toISOString();
    await updateSyncMetadata(schemaId, { syncStatus: 'synced', lastSyncResult: 'updated', lastSyncTimestamp: syncNow, lastSyncCommitSha: fetched.sha, commitSha: fetched.sha });
    await logSyncActivityBestEffort({ schemaId, outcome: 'updated', previousCommitSha: currentCommit, currentCommitSha: fetched.sha, diffSummary });

    const result: SchemaSyncResult = {
      schemaId,
      status: 'updated',
      synced: true,
      currentCommitSha: fetched.sha,
      commitSha: fetched.sha,
      previousCommitSha: currentCommit,
      diffSummary: executionArn ? undefined : diffSummary,
      message: executionArn
        ? 'Schema re-sync initiated via Step Functions for large schema.'
        : 'Schema re-synced from CDM source.',
    };

    if (executionArn) {
      return jsonResponse(202, { ...result, executionArn });
    }

    return jsonResponse(200, result);
  } catch (err) {
    if (isCdmGitHubReadError(err)) {
      const mapped = toCdmFailureResponse(err);
      const now = new Date().toISOString();
      const reason = reasonForFailureClass(mapped.details.failureClass);
      await updateSyncMetadata(schemaId, {
        syncStatus: 'sync-failed',
        lastSyncResult: 'failed',
        lastSyncTimestamp: now,
        lastSyncReason: reason,
      }).catch(() => {});
      await logSyncActivityBestEffort({ schemaId, outcome: 'failed', reason });

      return errorResponse(
        mapped.code,
        mapped.message,
        mapped.statusCode,
        mapped.retryable,
        requestId,
        mapped.details,
        mapped.headers,
      );
    }

    console.error('[sync-cdm-schema] terminal-sync-failure', {
      event: 'cdm-sync-terminal-failure',
      operation: statusOnly ? 'sync-status-read' : 'sync',
      repo: `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`,
      path: schemaId,
      requestId,
      correlationId,
      failureClass: 'timeout-transient',
      statusCode: 500,
      retryCount: 0,
    });

    const now = new Date().toISOString();
    await updateSyncMetadata(schemaId, { syncStatus: 'sync-failed', lastSyncResult: 'failed', lastSyncTimestamp: now, lastSyncReason: err instanceof Error ? err.message : 'Unknown error' }).catch(() => {});
    await updateSchemaStatus(schemaId, 'error').catch(() => {});
    await logSyncActivityBestEffort({ schemaId, outcome: 'failed', reason: err instanceof Error ? err.message : 'Unknown error' });

    return jsonResponse(200, {
      schemaId,
      status: 'failed' as const,
      synced: false,
      message: 'Schema re-sync failed with unexpected error.',
      reason: err instanceof Error ? err.message : 'Unknown error',
    } satisfies SchemaSyncResult);
  }
}
