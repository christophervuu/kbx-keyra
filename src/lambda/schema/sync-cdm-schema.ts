import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  parsePathParam,
  putObject,
  serviceUnavailable,
  updateItem,
  validationError,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { CDM_ROOT_PATH, encodeGitHubPath, isWithinCdmRoot } from './cdm-path.js';

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

interface SchemaSyncResult {
  readonly schemaId: string;
  readonly synced: boolean;
  readonly commitSha?: string;
  readonly message: string;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const GITHUB_API_BASE = getEnvValue('GITHUB_API_BASE')?.trim() || 'https://api.github.com';
const GITHUB_TOKEN = getEnvValue('GITHUB_TOKEN')?.trim();

const CDM_REPO_OWNER = getEnvValue('CDM_REPO_OWNER')?.trim() || 'KBXT';
const CDM_REPO_NAME = getEnvValue('CDM_REPO_NAME')?.trim() || 'KBX-Canonicals';

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

function isRateLimited(response: Response): boolean {
  if (response.status === 429) {
    return true;
  }

  return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

async function fetchGitHubFile(path: string, branch: string): Promise<GitHubContentFileResponse | 'not-found' | 'rate-limited' | 'service-unavailable' | 'invalid'> {
  const encodedPath = encodeGitHubPath(path);
  const url = `${GITHUB_API_BASE}/repos/${CDM_REPO_OWNER}/${CDM_REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 404) {
      return 'not-found';
    }
    if (isRateLimited(response)) {
      return 'rate-limited';
    }
    if (!response.ok && response.status >= 500) {
      return 'service-unavailable';
    }
    if (!response.ok) {
      return 'invalid';
    }

    const payload = (await response.json()) as unknown;
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
  } catch {
    return 'service-unavailable';
  }
}

async function markSyncStatus(schemaId: string, syncStatus: SchemaSyncStatus): Promise<void> {
  await updateItem({
    TableName: getSchemasTableOrThrow(),
    Key: { schemaId },
    UpdateExpression: 'SET #syncStatus = :syncStatus, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#syncStatus': 'syncStatus',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':syncStatus': syncStatus,
      ':updatedAt': new Date().toISOString(),
    },
    ReturnValues: 'NONE',
  });
}

async function markSyncedWithCommit(schemaId: string, commitSha: string): Promise<void> {
  await updateItem({
    TableName: getSchemasTableOrThrow(),
    Key: { schemaId },
    UpdateExpression: 'SET #syncStatus = :syncStatus, #updatedAt = :updatedAt, #source.#commitSha = :commitSha',
    ExpressionAttributeNames: {
      '#syncStatus': 'syncStatus',
      '#updatedAt': 'updatedAt',
      '#source': 'source',
      '#commitSha': 'commitSha',
    },
    ExpressionAttributeValues: {
      ':syncStatus': 'synced',
      ':updatedAt': new Date().toISOString(),
      ':commitSha': commitSha,
    },
    ReturnValues: 'NONE',
  });
}

function isReadOnlyStatusMode(event: APIGatewayProxyEvent): boolean {
  return event.httpMethod?.toUpperCase() === 'GET';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const schemaId = parsePathParam(event, 'id');
  if (!schemaId) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required path parameter: id', 400, false);
  }

  if (!GITHUB_TOKEN) {
    const err = serviceUnavailable('CDM sync is temporarily unavailable. Please retry shortly.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }

  const statusOnly = isReadOnlyStatusMode(event);

  try {
    const metadata = await getItem<SchemaMetadataRecord>({
      TableName: getSchemasTableOrThrow(),
      Key: { schemaId },
    });

    if (!metadata) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Schema with id '${schemaId}' not found`, 404, false);
    }

    if (metadata.origin !== 'cdm' || metadata.source.type !== 'github') {
      const err = validationError('Schema is not a CDM-linked GitHub schema.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }

    const source = metadata.source;
    if (!source.branch || !source.path || !source.repo) {
      const err = validationError('CDM source metadata is incomplete. Re-link schema from CDM Library and retry.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }

    if (!isWithinCdmRoot(source.path)) {
      const err = validationError(`Invalid source path. Only ${CDM_ROOT_PATH}/* is allowed.`);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }

    const fetched = await fetchGitHubFile(source.path, source.branch);
    if (fetched === 'not-found') {
      await markSyncStatus(schemaId, 'sync-failed');
      return errorResponse(ERROR_CODES.SOURCE_NOT_FOUND, `CDM source file not found: ${source.path}`, 404, false);
    }
    if (fetched === 'rate-limited') {
      await markSyncStatus(schemaId, 'sync-failed');
      const err = serviceUnavailable('GitHub rate limit reached. Please retry shortly.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }
    if (fetched === 'service-unavailable') {
      await markSyncStatus(schemaId, 'sync-failed');
      const err = serviceUnavailable('Unable to reach GitHub right now. Please retry shortly.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }
    if (fetched === 'invalid' || fetched.type !== 'file') {
      await markSyncStatus(schemaId, 'sync-failed');
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid GitHub response while syncing CDM schema', 400, false);
    }

    const currentCommit = source.commitSha;
    const changed = typeof currentCommit !== 'string' || currentCommit !== fetched.sha;

    if (statusOnly) {
      await markSyncStatus(schemaId, changed ? 'update-available' : 'synced');

      const result: SchemaSyncResult = {
        schemaId,
        synced: !changed,
        ...(typeof currentCommit === 'string' ? { commitSha: currentCommit } : {}),
        message: changed
          ? 'Update available from CDM source.'
          : 'Schema is up to date with CDM source.',
      };
      return jsonResponse(200, result);
    }

    if (!changed) {
      await markSyncStatus(schemaId, 'synced');
      const result: SchemaSyncResult = {
        schemaId,
        synced: true,
        ...(typeof currentCommit === 'string' ? { commitSha: currentCommit } : {}),
        message: 'Schema is already up to date.',
      };
      return jsonResponse(200, result);
    }

    let contentString: string | null = null;
    if (typeof fetched.content === 'string' && fetched.encoding === 'base64') {
      contentString = decodeBase64Content(fetched.content);
    } else if (typeof fetched.download_url === 'string') {
      try {
        const downloadResponse = await fetch(fetched.download_url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
          },
        });

        if (!downloadResponse.ok) {
          await markSyncStatus(schemaId, 'sync-failed');
          const err = serviceUnavailable('Unable to download CDM schema content right now. Please retry shortly.');
          return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
        }

        contentString = await downloadResponse.text();
      } catch {
        await markSyncStatus(schemaId, 'sync-failed');
        const err = serviceUnavailable('Unable to download CDM schema content right now. Please retry shortly.');
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
      }
    }

    if (!contentString) {
      await markSyncStatus(schemaId, 'sync-failed');
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'CDM file content is unavailable from GitHub response', 400, false);
    }

    const normalizedContent = metadata.format === 'json-schema' ? ensureJsonSchema(contentString) : contentString;
    if (!normalizedContent) {
      await markSyncStatus(schemaId, 'sync-failed');
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'CDM JSON schema content is invalid JSON', 400, false);
    }

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: schemaContentKey(schemaId, metadata.format),
      Body: normalizedContent,
      ContentType: metadata.format === 'xsd' ? 'application/xml' : 'application/json',
    });

    await markSyncedWithCommit(schemaId, fetched.sha);

    const result: SchemaSyncResult = {
      schemaId,
      synced: true,
      commitSha: fetched.sha,
      message: 'Schema re-synced from CDM source.',
    };
    return jsonResponse(200, result);
  } catch {
    const err = internalError('Failed to sync CDM schema');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }
}
