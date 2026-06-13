import {
  errorResponse,
  generateRequestId,
  getItem,
  jsonResponse,
  putItem,
  putObject,
  scan,
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

type SchemaFormat = 'json-schema' | 'xsd';

interface GitHubContentsItem {
  readonly name: string;
  readonly path: string;
  readonly type: 'file' | 'dir';
  readonly sha: string;
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
  readonly origin: 'cdm' | 'uploaded' | 'inferred' | 'published' | 'local';
  readonly status: 'ingesting' | 'ready' | 'error';
  readonly scope?: 'global' | 'project';
  readonly inferred?: boolean;
  readonly syncStatus: 'synced' | 'update-available' | 'sync-failed' | 'not-synced' | 'local-changes';
  readonly source: GitHubSourceInfo | { readonly type: 'upload' };
  readonly sourceRepoId?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CdmBulkSyncError {
  readonly path: string;
  readonly reason: string;
}

interface CdmBulkSyncResult {
  readonly rootPath: string;
  readonly scannedFiles: number;
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly excludedSchemaIds: readonly string[];
  readonly errors: readonly CdmBulkSyncError[];
  readonly message: string;
}

const EXCLUDED_SCHEMA_IDS = new Set<string>([
  'c0f95533-4965-45cc-8b35-5adbd44630f5',
]);

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const GITHUB_API_BASE = getEnvValue('GITHUB_API_BASE')?.trim() || 'https://api.github.com';
const GITHUB_TOKEN = getEnvValue('GITHUB_TOKEN')?.trim();

const CDM_REPO_OWNER = getEnvValue('CDM_REPO_OWNER')?.trim() || 'KBXT';
const CDM_REPO_NAME = getEnvValue('CDM_REPO_NAME')?.trim() || 'KBX-Canonicals';
const CDM_REPO_ID = Number.parseInt(getEnvValue('CDM_REPO_ID')?.trim() || '1052821334', 10);
const CDM_REPO_BRANCH = getEnvValue('CDM_REPO_BRANCH')?.trim() || 'main';

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

function sanitizeName(path: string): string {
  const lastSegment = path.split('/').filter(Boolean).pop() ?? path;
  return lastSegment.replace(/\.(json|xsd|xml)$/i, '') || lastSegment;
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

function toGitHubContentsItem(value: unknown): GitHubContentsItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.name !== 'string'
    || typeof candidate.path !== 'string'
    || (candidate.type !== 'file' && candidate.type !== 'dir')
    || typeof candidate.sha !== 'string'
  ) {
    return null;
  }

  return {
    name: candidate.name,
    path: candidate.path,
    type: candidate.type,
    sha: candidate.sha,
  };
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

async function fetchDirectory(path: string, requestId: string, correlationId?: string): Promise<readonly GitHubContentsItem[]> {
  const encodedPath = encodeGitHubPath(path);
  const url = `${GITHUB_API_BASE}/repos/${CDM_REPO_OWNER}/${CDM_REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(CDM_REPO_BRANCH)}`;

  const { response } = await executeGitHubReadWithRetry({
    url,
    operation: 'browse',
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

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.map(toGitHubContentsItem).filter((item): item is GitHubContentsItem => item !== null);
}

async function listFilesRecursively(rootPath: string, requestId: string, correlationId?: string): Promise<readonly GitHubContentsItem[]> {
  const queue: string[] = [rootPath];
  const files: GitHubContentsItem[] = [];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) continue;

    const entries = await fetchDirectory(currentPath, requestId, correlationId);
    for (const entry of entries) {
      if (entry.type === 'dir') {
        queue.push(entry.path);
      } else {
        files.push(entry);
      }
    }
  }

  return files;
}

async function fetchGitHubFile(path: string, requestId: string, correlationId?: string): Promise<GitHubContentFileResponse | 'invalid'> {
  const encodedPath = encodeGitHubPath(path);
  const url = `${GITHUB_API_BASE}/repos/${CDM_REPO_OWNER}/${CDM_REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(CDM_REPO_BRANCH)}`;

  const { response } = await executeGitHubReadWithRetry({
    url,
    operation: 'link',
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

  const payload = (await response.json()) as unknown;
  return toGitHubContentFileResponse(payload);
}

async function readContent(file: GitHubContentFileResponse, requestId: string, correlationId?: string): Promise<string | null> {
  if (typeof file.content === 'string' && file.encoding === 'base64') {
    return decodeBase64Content(file.content);
  }

  if (typeof file.download_url !== 'string') {
    return null;
  }

  const { response } = await executeGitHubReadWithRetry({
    url: file.download_url,
    operation: 'link',
    repo: `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`,
    sourcePath: file.path,
    requestId,
    correlationId,
    init: {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
      },
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.text();
}

function generateSchemaId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  return `schema-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const correlationId = event.headers?.['x-correlation-id'] ?? event.headers?.['X-Correlation-Id'];

  if (!GITHUB_TOKEN) {
    const err = serviceUnavailable('CDM sync is temporarily unavailable. Please retry shortly.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (!isWithinCdmRoot(CDM_ROOT_PATH)) {
    const err = validationError(`Invalid CDM root path. Only ${CDM_ROOT_PATH}/* is allowed.`);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  try {
    const allSchemas = await scan<SchemaMetadataRecord>({
      TableName: getSchemasTableOrThrow(),
    });

    const filteredSchemas = allSchemas.filter((schema) => !EXCLUDED_SCHEMA_IDS.has(schema.schemaId));
    const existingByRepoPath = new Map<string, SchemaMetadataRecord>();
    for (const schema of filteredSchemas) {
      if (schema.origin !== 'cdm') continue;
      if (schema.source.type !== 'github') continue;
      if (schema.source.repo !== `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`) continue;
      const key = `${schema.source.branch}:${schema.source.path}`;
      existingByRepoPath.set(key, schema);
    }

    const discoveredFiles = await listFilesRecursively(CDM_ROOT_PATH, requestId, correlationId);
    const candidateFiles = discoveredFiles.filter((item) => inferFormat(item.path) !== null);

    let imported = 0;
    let skipped = 0;
    const errors: CdmBulkSyncError[] = [];

    for (const candidate of candidateFiles) {
      const format = inferFormat(candidate.path);
      if (!format) {
        skipped += 1;
        continue;
      }

      const existing = existingByRepoPath.get(`${CDM_REPO_BRANCH}:${candidate.path}`);
      if (existing) {
        skipped += 1;
        continue;
      }

      try {
        const file = await fetchGitHubFile(candidate.path, requestId, correlationId);
        if (file === 'invalid' || file.type !== 'file') {
          errors.push({ path: candidate.path, reason: 'Invalid GitHub file payload' });
          continue;
        }

        const rawContent = await readContent(file, requestId, correlationId);
        if (!rawContent) {
          errors.push({ path: candidate.path, reason: 'Unable to read file content' });
          continue;
        }

        const normalizedContent = format === 'json-schema' ? ensureJsonSchema(rawContent) : rawContent;
        if (!normalizedContent) {
          errors.push({ path: candidate.path, reason: 'Invalid JSON schema payload' });
          continue;
        }

        const schemaId = generateSchemaId();
        if (EXCLUDED_SCHEMA_IDS.has(schemaId)) {
          errors.push({ path: candidate.path, reason: 'Generated schema ID is excluded by policy' });
          continue;
        }

        const now = new Date().toISOString();
        const metadata: SchemaMetadataRecord = {
          schemaId,
          name: sanitizeName(candidate.path),
          format,
          fieldCount: 0,
          origin: 'cdm',
          status: 'ready',
          scope: 'global',
          inferred: false,
          syncStatus: 'synced',
          source: {
            type: 'github',
            repo: `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`,
            repoId: Number.isFinite(CDM_REPO_ID) ? CDM_REPO_ID : undefined,
            branch: CDM_REPO_BRANCH,
            path: candidate.path,
            commitSha: file.sha,
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

        imported += 1;
      } catch (error) {
        if (isCdmGitHubReadError(error)) {
          const mapped = toCdmFailureResponse(error);
          errors.push({
            path: candidate.path,
            reason: mapped.message,
          });
          continue;
        }

        errors.push({
          path: candidate.path,
          reason: error instanceof Error ? error.message : 'Unexpected failure',
        });
      }
    }

    // Best-effort hard exclusion cleanup for specific invalid legacy record.
    for (const excludedSchemaId of EXCLUDED_SCHEMA_IDS) {
      const excluded = await getItem<SchemaMetadataRecord>({
        TableName: getSchemasTableOrThrow(),
        Key: { schemaId: excludedSchemaId },
      });

      if (excluded) {
        errors.push({
          path: excluded.source.type === 'github' ? excluded.source.path : excluded.schemaId,
          reason: `Excluded schemaId remains present and must be removed manually: ${excludedSchemaId}`,
        });
      }
    }

    const result: CdmBulkSyncResult = {
      rootPath: CDM_ROOT_PATH,
      scannedFiles: candidateFiles.length,
      imported,
      skipped,
      failed: errors.length,
      excludedSchemaIds: Array.from(EXCLUDED_SCHEMA_IDS),
      errors,
      message: errors.length > 0
        ? 'CDM sync completed with partial failures.'
        : 'CDM sync completed.',
    };

    return jsonResponse(200, result, requestId);
  } catch (error) {
    if (isCdmGitHubReadError(error)) {
      const mapped = toCdmFailureResponse(error);
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

    const err = serviceUnavailable(
      error instanceof Error ? error.message : 'Unable to sync CDM schemas right now.',
    );
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}
