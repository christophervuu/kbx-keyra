import {
  ERROR_CODES,
  errorResponse,
  internalError,
  jsonResponse,
  parseQueryParam,
  serviceUnavailable,
  validationError,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';
import { CDM_ROOT_PATH, encodeGitHubPath, isWithinCdmRoot, normalizeCdmPath } from './cdm-path.js';

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

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

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

function isRateLimited(response: Response): boolean {
  if (response.status === 429) {
    return true;
  }

  return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestedPath = parseQueryParam(event, 'path');
  const normalizedPath = normalizeCdmPath(requestedPath);

  if (!normalizedPath || !isWithinCdmRoot(normalizedPath)) {
    const err = validationError('Invalid path. Only JSONSchemas/CommonDataModels/* is allowed.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }

  if (!GITHUB_TOKEN) {
    const err = serviceUnavailable('CDM listing is temporarily unavailable. Please retry shortly.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }

  const encodedPath = encodeGitHubPath(normalizedPath);
  const url = `${GITHUB_API_BASE}/repos/${CDM_REPO_OWNER}/${CDM_REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(CDM_REPO_BRANCH)}`;

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
      return errorResponse(ERROR_CODES.SOURCE_NOT_FOUND, `CDM path not found: ${normalizedPath}`, 404, false);
    }

    if (isRateLimited(response)) {
      const err = serviceUnavailable('GitHub rate limit reached. Please retry shortly.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }

    if (!response.ok) {
      if (response.status >= 500) {
        const err = serviceUnavailable('GitHub service is temporarily unavailable. Please retry shortly.');
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
      }

      const err = internalError('Failed to list CDM schemas from GitHub.');
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Requested CDM path is not a directory.', 400, false);
    }

    const files = payload
      .filter((item): item is GitHubContentsItem => {
        if (typeof item !== 'object' || item === null) {
          return false;
        }

        const candidate = item as Record<string, unknown>;
        return (
          typeof candidate.name === 'string'
          && typeof candidate.path === 'string'
          && (candidate.type === 'file' || candidate.type === 'dir')
          && typeof candidate.sha === 'string'
        );
      })
      .map(toGitHubFile);

    return jsonResponse(200, files);
  } catch {
    const err = serviceUnavailable('Unable to reach GitHub right now. Please retry shortly.');
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, err.requestId);
  }
}
