import {
  ERROR_CODES,
  errorResponse,
  getItem,
  internalError,
  jsonResponse,
  parseBody,
  putItem,
  putObject,
  scan,
  serviceUnavailable,
  updateItem,
  validationError,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { CDM_ROOT_PATH, encodeGitHubPath, isWithinCdmRoot, normalizeCdmPath } from './cdm-path.js';

type SchemaFormat = 'json-schema' | 'xsd';

type SchemaSyncStatus = 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';

interface LinkCdmSchemaRequest {
  readonly projectId: string;
  readonly path: string;
  readonly branch?: string;
  readonly name?: string;
}

interface ProjectSchemaRef {
  readonly schemaId: string;
  readonly type: 'github' | 'local' | 'published';
  readonly commitSha?: string;
}

interface ProjectRecord {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly schemaRefs: readonly ProjectSchemaRef[];
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

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
  readonly fieldCount: number;
  readonly origin: 'cdm' | 'published' | 'local';
  readonly status: 'ingesting' | 'ready' | 'error';
  readonly scope: 'global' | 'project';
  readonly description?: string;
  readonly inferred?: boolean;
  readonly syncStatus: SchemaSyncStatus;
  readonly source: GitHubSourceInfo | { readonly type: 'upload' };
  readonly sourceRepoId?: number;
  readonly createdAt: string;
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
const CDM_REPO_ID = Number.parseInt(getEnvValue('CDM_REPO_ID')?.trim() || '1052821334', 10);
const CDM_DEFAULT_BRANCH = getEnvValue('CDM_REPO_BRANCH')?.trim() || 'main';

function getProjectsTableOrThrow(): string {
  const table = getEnvValue('PROJECTS_TABLE')?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: PROJECTS_TABLE');
  }

  return table;
}

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

function inferFormat(path: string): SchemaFormat | null {
  const lowered = path.toLowerCase();
  if (lowered.endsWith('.json')) {
    return 'json-schema';
  }
  if (lowered.endsWith('.xsd') || lowered.endsWith('.xml')) {
    return 'xsd';
  }

  return null;
}

function ensureJsonSchema(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

function decodeBase64Content(encoded: string): string | null {
  try {
    return Buffer.from(encoded.replace(/\n/g, ''), 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function sanitizeName(path: string): string {
  const lastSegment = path.split('/').filter(Boolean).pop() ?? path;
  return lastSegment.replace(/\.(json|xsd|xml)$/i, '') || lastSegment;
}

function isRateLimited(response: Response): boolean {
  if (response.status === 429) {
    return true;
  }

  return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

function isProjectSchemaRef(ref: ProjectSchemaRef, schemaId: string): boolean {
  return ref.schemaId === schemaId;
}

function generateSchemaId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  return `schema-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = parseBody(event) as LinkCdmSchemaRequest | null;
  if (!body || typeof body.projectId !== 'string' || body.projectId.trim() === '' || typeof body.path !== 'string' || body.path.trim() === '') {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Missing required fields: projectId, path', 400, false);
  }

  const normalizedPath = normalizeCdmPath(body.path);
  if (!normalizedPath || !isWithinCdmRoot(normalizedPath)) {
    const err = validationError(`Invalid path. Only ${CDM_ROOT_PATH}/* is allowed.`);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }

  const format = inferFormat(normalizedPath);
  if (!format) {
    return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Unsupported CDM file format. Expected .json, .xsd, or .xml', 400, false);
  }

  if (!GITHUB_TOKEN) {
    const err = serviceUnavailable('CDM linking is temporarily unavailable. Please retry shortly.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }

  const branch = typeof body.branch === 'string' && body.branch.trim() !== '' ? body.branch.trim() : CDM_DEFAULT_BRANCH;
  const projectId = body.projectId.trim();

  try {
    const project = await getItem<ProjectRecord>({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId },
    });

    if (!project) {
      return errorResponse(ERROR_CODES.RESOURCE_NOT_FOUND, `Project with id '${projectId}' not found`, 404, false);
    }

    const allSchemas = await scan<SchemaMetadataRecord>({ TableName: getSchemasTableOrThrow() });

    const existing = allSchemas.find((schema) => {
      if (schema.origin !== 'cdm') {
        return false;
      }

      if (schema.source.type !== 'github') {
        return false;
      }

      return schema.source.repo === `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`
        && schema.source.branch === branch
        && schema.source.path === normalizedPath;
    });

    if (existing) {
      const existingSource = existing.source.type === 'github' ? existing.source : null;
      const existingRefs = project.schemaRefs ?? [];
      const alreadyLinked = existingRefs.some((ref) => isProjectSchemaRef(ref, existing.schemaId));
      if (!alreadyLinked) {
        const updatedRefs: ProjectSchemaRef[] = [
          ...existingRefs,
          {
            schemaId: existing.schemaId,
            type: 'github',
            ...(typeof existingSource?.commitSha === 'string' ? { commitSha: existingSource.commitSha } : {}),
          },
        ];

        await updateItem({
          TableName: getProjectsTableOrThrow(),
          Key: { projectId },
          UpdateExpression: 'SET #schemaRefs = :schemaRefs, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#schemaRefs': 'schemaRefs',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':schemaRefs': updatedRefs,
            ':updatedAt': new Date().toISOString(),
          },
          ReturnValues: 'ALL_NEW',
        });
      }

      return jsonResponse(200, existing);
    }

    const fetched = await fetchGitHubFile(normalizedPath, branch);
    if (fetched === 'not-found') {
      return errorResponse(ERROR_CODES.SOURCE_NOT_FOUND, `CDM file not found: ${normalizedPath}`, 404, false);
    }
    if (fetched === 'rate-limited') {
      const err = serviceUnavailable('GitHub rate limit reached. Please retry shortly.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }
    if (fetched === 'service-unavailable') {
      const err = serviceUnavailable('Unable to reach GitHub right now. Please retry shortly.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }
    if (fetched === 'invalid') {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid GitHub response while linking CDM schema', 400, false);
    }

    if (fetched.type !== 'file') {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Selected CDM path must be a file.', 400, false);
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
          return errorResponse(ERROR_CODES.SERVICE_UNAVAILABLE, 'Failed to download CDM file content from GitHub', 503, true);
        }

        contentString = await downloadResponse.text();
      } catch {
        const err = serviceUnavailable('Unable to download CDM schema content right now. Please retry shortly.');
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
      }
    }

    if (!contentString) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'CDM file content is unavailable from GitHub response', 400, false);
    }

    const normalizedContent = format === 'json-schema' ? ensureJsonSchema(contentString) : contentString;
    if (!normalizedContent) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'CDM JSON schema content is invalid JSON', 400, false);
    }

    const schemaId = generateSchemaId();
    const now = new Date().toISOString();

    const metadata: SchemaMetadataRecord = {
      schemaId,
      name: typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : sanitizeName(normalizedPath),
      format,
      fieldCount: 0,
      origin: 'cdm',
      status: 'ready',
      scope: 'project',
      inferred: false,
      syncStatus: 'synced',
      source: {
        type: 'github',
        repo: `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`,
        repoId: Number.isFinite(CDM_REPO_ID) ? CDM_REPO_ID : undefined,
        branch,
        path: normalizedPath,
        commitSha: fetched.sha,
      },
      sourceRepoId: Number.isFinite(CDM_REPO_ID) ? CDM_REPO_ID : undefined,
      createdAt: now,
      updatedAt: now,
    };

    await putObject({
      Bucket: getContentBucketOrThrow(),
      Key: schemaContentKey(schemaId, format),
      Body: normalizedContent,
      ContentType: format === 'xsd' ? 'application/xml' : 'application/json',
    });

    await putItem({
      TableName: getSchemasTableOrThrow(),
      Item: metadata,
    });

    const updatedRefs: ProjectSchemaRef[] = [
      ...(project.schemaRefs ?? []),
      {
        schemaId,
        type: 'github',
        commitSha: fetched.sha,
      },
    ];

    await updateItem({
      TableName: getProjectsTableOrThrow(),
      Key: { projectId },
      UpdateExpression: 'SET #schemaRefs = :schemaRefs, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#schemaRefs': 'schemaRefs',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':schemaRefs': updatedRefs,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    });

    return jsonResponse(201, metadata);
  } catch {
    const err = internalError('Failed to link CDM schema');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }
}
