function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

export const CDM_ROOT_PATH = (getEnvValue('CDM_ROOT_PATH')?.trim() || 'JSONSchemas-bundled/CommonDataModels').replace(/(^\/|\/$)/g, '');

export function normalizeCdmPath(rawPath: string | null): string | null {
  if (rawPath === null) {
    return CDM_ROOT_PATH;
  }

  const trimmed = rawPath.trim();
  if (trimmed === '') {
    return CDM_ROOT_PATH;
  }

  const noLeadingOrTrailing = trimmed.replace(/(^\/|\/$)/g, '');
  if (noLeadingOrTrailing === '') {
    return CDM_ROOT_PATH;
  }

  if (/^\.{1,2}(\/|$)/.test(noLeadingOrTrailing) || /(^|\/)\.\.(\/|$)/.test(noLeadingOrTrailing)) {
    return null;
  }

  if (noLeadingOrTrailing === CDM_ROOT_PATH || noLeadingOrTrailing.startsWith(`${CDM_ROOT_PATH}/`)) {
    return noLeadingOrTrailing;
  }

  return `${CDM_ROOT_PATH}/${noLeadingOrTrailing}`;
}

export function isWithinCdmRoot(path: string): boolean {
  return path === CDM_ROOT_PATH || path.startsWith(`${CDM_ROOT_PATH}/`);
}

export function encodeGitHubPath(path: string): string {
  return path
    .split('/')
    .filter((segment) => segment.trim() !== '')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
