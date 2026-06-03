import {
  errorResponse,
  generateRequestId,
  jsonResponse,
  parseQueryParam,
  serviceUnavailable,
  validationError,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { encodeGitHubPath, isWithinCdmRoot, normalizeCdmPath } from './cdm-path.js';
import {
  executeGitHubReadWithRetry,
  isCdmGitHubReadError,
  toCdmFailureResponse,
} from './cdm-github-read.js';

interface GitHubContentsItem {
  readonly name: string;
  readonly path: string;
  readonly type: 'file' | 'dir';
  readonly sha: string;
  readonly size?: number;
  readonly download_url?: string | null;
  readonly html_url?: string | null;
}

interface GitHubFile {
  readonly path: string;
  readonly name: string;
  readonly type: 'file' | 'dir';
  readonly sha: string;
  readonly size?: number;
  readonly downloadUrl?: string;
  readonly htmlUrl?: string;
}

interface CdmListCacheEntry {
  readonly files: readonly GitHubFile[];
  readonly fetchedAtMs: number;
}

interface CachedResponseMeta {
  readonly source: 'cache';
  readonly degraded: true;
  readonly stale: boolean;
  readonly ageMs: number;
}

const CDM_LISTING_CACHE = new Map<string, CdmListCacheEntry>();

const DEFAULT_TTL_MS: Record<'local' | 'dev' | 'prod', number> = {
  local: 30_000,
  dev: 60_000,
  prod: 300_000,
};

const DEFAULT_STALE_GRACE_MS: Record<'local' | 'dev' | 'prod', number> = {
  local: 0,
  dev: 300_000,
  prod: 900_000,
};

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

function parseEnvMs(key: string): number | null {
  const raw = getEnvValue(key)?.trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}

function resolveRuntimeProfile(): 'local' | 'dev' | 'prod' {
  const stage = getEnvValue('STAGE')?.trim().toLowerCase();
  const nodeEnv = getEnvValue('NODE_ENV')?.trim().toLowerCase();

  if (stage === 'prod' || stage === 'production' || nodeEnv === 'production') {
    return 'prod';
  }

  if (stage === 'dev' || stage === 'development' || nodeEnv === 'development') {
    return 'dev';
  }

  return 'local';
}

const RUNTIME_PROFILE = resolveRuntimeProfile();

function resolveCacheTtlMs(): number {
  const profileKey = `CDM_LIST_CACHE_TTL_${RUNTIME_PROFILE.toUpperCase()}_MS`;
  return parseEnvMs(profileKey) ?? parseEnvMs('CDM_LIST_CACHE_TTL_MS') ?? DEFAULT_TTL_MS[RUNTIME_PROFILE];
}

function resolveStaleGraceMs(): number {
  const profileKey = `CDM_LIST_CACHE_STALE_GRACE_${RUNTIME_PROFILE.toUpperCase()}_MS`;
  return (
    parseEnvMs(profileKey)
    ?? parseEnvMs('CDM_LIST_CACHE_STALE_GRACE_MS')
    ?? DEFAULT_STALE_GRACE_MS[RUNTIME_PROFILE]
  );
}

const LIST_CACHE_TTL_MS = resolveCacheTtlMs();
const LIST_CACHE_STALE_GRACE_MS = resolveStaleGraceMs();

const GITHUB_API_BASE = getEnvValue('GITHUB_API_BASE')?.trim() || 'https://api.github.com';
const GITHUB_TOKEN = getEnvValue('GITHUB_TOKEN')?.trim();

const CDM_REPO_OWNER = getEnvValue('CDM_REPO_OWNER')?.trim() || 'KBXT';
const CDM_REPO_NAME = getEnvValue('CDM_REPO_NAME')?.trim() || 'KBX-Canonicals';
const CDM_REPO_BRANCH = getEnvValue('CDM_REPO_BRANCH')?.trim() || 'main';

function toGitHubFile(item: GitHubContentsItem): GitHubFile {
  return {
    path: item.path,
    name: item.name,
    type: item.type,
    sha: item.sha,
    ...(typeof item.size === 'number' ? { size: item.size } : {}),
    ...(typeof item.download_url === 'string' ? { downloadUrl: item.download_url } : {}),
    ...(typeof item.html_url === 'string' ? { htmlUrl: item.html_url } : {}),
  };
}

function cacheKeyForPath(path: string): string {
  return `${CDM_REPO_OWNER}/${CDM_REPO_NAME}:${CDM_REPO_BRANCH}:${path}`;
}

function getCachedListing(path: string): CdmListCacheEntry | null {
  return CDM_LISTING_CACHE.get(cacheKeyForPath(path)) ?? null;
}

function setCachedListing(path: string, files: readonly GitHubFile[]): void {
  CDM_LISTING_CACHE.set(cacheKeyForPath(path), {
    files,
    fetchedAtMs: Date.now(),
  });
}

function readCachedFallback(path: string): CachedResponseMeta & { readonly files: readonly GitHubFile[] } | null {
  const entry = getCachedListing(path);
  if (!entry) {
    return null;
  }

  const ageMs = Date.now() - entry.fetchedAtMs;
  const staleCutoffMs = LIST_CACHE_TTL_MS + LIST_CACHE_STALE_GRACE_MS;

  if (ageMs > staleCutoffMs) {
    return null;
  }

  return {
    files: entry.files,
    source: 'cache',
    degraded: true,
    stale: ageMs > LIST_CACHE_TTL_MS,
    ageMs,
  };
}

function cacheHeaders(meta: CachedResponseMeta | { readonly source: 'fresh'; readonly degraded: false }): Record<string, string> {
  if (meta.source === 'fresh') {
    return {
      'x-cdm-cache-source': 'fresh',
      'x-cdm-cache-degraded': 'false',
      'x-cdm-cache-stale': 'false',
      'x-cdm-cache-age-ms': '0',
      'x-cdm-cache-ttl-ms': String(LIST_CACHE_TTL_MS),
      'x-cdm-cache-stale-grace-ms': String(LIST_CACHE_STALE_GRACE_MS),
    };
  }

  return {
    'x-cdm-cache-source': 'cache',
    'x-cdm-cache-degraded': 'true',
    'x-cdm-cache-stale': meta.stale ? 'true' : 'false',
    'x-cdm-cache-age-ms': String(Math.max(0, Math.floor(meta.ageMs))),
    'x-cdm-cache-ttl-ms': String(LIST_CACHE_TTL_MS),
    'x-cdm-cache-stale-grace-ms': String(LIST_CACHE_STALE_GRACE_MS),
  };
}

function isGitHubContentItem(value: unknown): value is GitHubContentsItem {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string'
    && typeof candidate.path === 'string'
    && (candidate.type === 'file' || candidate.type === 'dir')
    && typeof candidate.sha === 'string'
  );
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  const correlationId = event.headers?.['x-correlation-id'] ?? event.headers?.['X-Correlation-Id'];
  const requestedPath = parseQueryParam(event, 'path');
  const normalizedPath = normalizeCdmPath(requestedPath);

  if (!normalizedPath || !isWithinCdmRoot(normalizedPath)) {
    const err = validationError('Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (!GITHUB_TOKEN) {
    const err = serviceUnavailable('CDM listing is temporarily unavailable. Please retry shortly.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const encodedPath = encodeGitHubPath(normalizedPath);
  const url = `${GITHUB_API_BASE}/repos/${CDM_REPO_OWNER}/${CDM_REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(CDM_REPO_BRANCH)}`;

  try {
    const { response } = await executeGitHubReadWithRetry({
      url,
      operation: 'browse',
      repo: `${CDM_REPO_OWNER}/${CDM_REPO_NAME}`,
      sourcePath: normalizedPath,
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
      const err = validationError('Requested CDM path is not a directory.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const files = payload
      .filter(isGitHubContentItem)
      .map(toGitHubFile);

    setCachedListing(normalizedPath, files);

    return jsonResponse(200, files, undefined, cacheHeaders({ source: 'fresh', degraded: false }));
  } catch (error) {
    if (isCdmGitHubReadError(error)) {
      if (error.failure.retryable) {
        const cached = readCachedFallback(normalizedPath);
        if (cached) {
          return jsonResponse(200, cached.files, undefined, cacheHeaders(cached));
        }
      }

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

    const err = serviceUnavailable('Unable to reach GitHub right now. Please retry shortly.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}
