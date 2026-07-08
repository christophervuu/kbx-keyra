export type RuntimeEnvironmentKey = 'DEV' | 'PREPROD' | 'PROD';

export interface RuntimeEnvironmentRetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export interface RuntimeEnvironmentConfig {
  readonly key: RuntimeEnvironmentKey;
  readonly accountId?: string;
  readonly assumeRoleArn?: string;
  readonly runtimeRegion?: string;
  readonly authMode: 'AWS_IAM' | 'NONE';
  readonly label: string;
  readonly runtimeApiBaseUrl: string;
  readonly deployApiPath: string;
  readonly rollbackApiPath: string;
  readonly previewApiPath: string;
  readonly statusApiPath: string;
  readonly requestTimeoutMs: number;
  readonly retryPolicy: RuntimeEnvironmentRetryPolicy;
}

type RuntimeEnvironmentConfigInput = Omit<RuntimeEnvironmentConfig, 'retryPolicy' | 'authMode'> & {
  readonly authMode?: 'AWS_IAM' | 'NONE';
  readonly retryPolicy?: Partial<RuntimeEnvironmentRetryPolicy>;
};

export interface DeploymentEnvironmentSettings {
  readonly deploymentEnvironments: readonly RuntimeEnvironmentConfig[];
  readonly promotionPolicy: {
    readonly sequence: readonly RuntimeEnvironmentKey[];
    readonly allowSkip: boolean;
  };
  readonly source: 'persisted-settings' | 'env-json' | 'env-fallback';
}

export interface DeploymentEnvironmentSettingsProvider {
  loadSettings(): Promise<DeploymentEnvironmentSettings | null>;
}

export class DeploymentEnvironmentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentEnvironmentConfigError';
  }
}

const ENV_KEYS: readonly RuntimeEnvironmentKey[] = ['DEV', 'PREPROD', 'PROD'];
const DEFAULT_PROMOTION_SEQUENCE: readonly RuntimeEnvironmentKey[] = ['DEV', 'PREPROD', 'PROD'];

const DEFAULT_RETRY_POLICY: RuntimeEnvironmentRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 5000,
};

const DEFAULT_PATHS = {
  deployApiPath: '/internal/deploy',
  rollbackApiPath: '/internal/rollback',
  previewApiPath: '/internal/preview',
  statusApiPath: '/internal/status/{mappingId}',
} as const;

const DEFAULT_TIMEOUT_MS = 10_000;

class NullSettingsProvider implements DeploymentEnvironmentSettingsProvider {
  async loadSettings(): Promise<DeploymentEnvironmentSettings | null> {
    return null;
  }
}

function readEnv(env: Record<string, string | undefined>, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(
  raw: string | undefined,
  fieldName: string,
  fallback: number,
): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new DeploymentEnvironmentConfigError(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}

function normalizeBaseUrl(value: string, fieldName: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new DeploymentEnvironmentConfigError(`${fieldName} must use http or https.`);
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw new DeploymentEnvironmentConfigError(`${fieldName} must be a valid absolute URL.`);
  }
}

function normalizePath(value: string | undefined, fallback: string, fieldName: string): string {
  const path = (value ?? fallback).trim();
  if (!path.startsWith('/')) {
    throw new DeploymentEnvironmentConfigError(`${fieldName} must start with '/'.`);
  }

  return path;
}

function validateEnvironmentKey(value: unknown, fieldName: string): RuntimeEnvironmentKey {
  if (value === 'DEV' || value === 'PREPROD' || value === 'PROD') {
    return value;
  }

  throw new DeploymentEnvironmentConfigError(`${fieldName} must be one of DEV|PREPROD|PROD.`);
}

function normalizeRuntimeEnvironmentConfig(
  input: RuntimeEnvironmentConfigInput,
): RuntimeEnvironmentConfig {
  const key = validateEnvironmentKey(input.key, 'deploymentEnvironments[].key');
  const authMode = input.authMode === 'AWS_IAM' ? 'AWS_IAM' : 'NONE';

  return {
    key,
    accountId: input.accountId,
    assumeRoleArn: input.assumeRoleArn,
    runtimeRegion: input.runtimeRegion,
    authMode,
    label: input.label,
    runtimeApiBaseUrl: normalizeBaseUrl(input.runtimeApiBaseUrl, `deploymentEnvironments[${key}].runtimeApiBaseUrl`),
    deployApiPath: normalizePath(input.deployApiPath, DEFAULT_PATHS.deployApiPath, `deploymentEnvironments[${key}].deployApiPath`),
    rollbackApiPath: normalizePath(input.rollbackApiPath, DEFAULT_PATHS.rollbackApiPath, `deploymentEnvironments[${key}].rollbackApiPath`),
    previewApiPath: normalizePath(input.previewApiPath, DEFAULT_PATHS.previewApiPath, `deploymentEnvironments[${key}].previewApiPath`),
    statusApiPath: normalizePath(input.statusApiPath, DEFAULT_PATHS.statusApiPath, `deploymentEnvironments[${key}].statusApiPath`),
    requestTimeoutMs:
      Number.isFinite(input.requestTimeoutMs) && input.requestTimeoutMs > 0
        ? input.requestTimeoutMs
        : DEFAULT_TIMEOUT_MS,
    retryPolicy: {
      maxAttempts:
        Number.isFinite(input.retryPolicy?.maxAttempts) && (input.retryPolicy?.maxAttempts ?? 0) > 0
          ? (input.retryPolicy?.maxAttempts as number)
          : DEFAULT_RETRY_POLICY.maxAttempts,
      baseDelayMs:
        Number.isFinite(input.retryPolicy?.baseDelayMs) && (input.retryPolicy?.baseDelayMs ?? 0) > 0
          ? (input.retryPolicy?.baseDelayMs as number)
          : DEFAULT_RETRY_POLICY.baseDelayMs,
      maxDelayMs:
        Number.isFinite(input.retryPolicy?.maxDelayMs) && (input.retryPolicy?.maxDelayMs ?? 0) > 0
          ? (input.retryPolicy?.maxDelayMs as number)
          : DEFAULT_RETRY_POLICY.maxDelayMs,
    },
  };
}

function ensureAtLeastOneRuntimeEnvironmentConfigured(settings: DeploymentEnvironmentSettings): void {
  if (settings.deploymentEnvironments.length === 0) {
    throw new DeploymentEnvironmentConfigError('At least one runtime environment configuration must be provided.');
  }
}

function ensureNoDuplicateEnvironmentKeys(settings: DeploymentEnvironmentSettings): void {
  const seen = new Set<RuntimeEnvironmentKey>();
  for (const item of settings.deploymentEnvironments) {
    if (seen.has(item.key)) {
      throw new DeploymentEnvironmentConfigError(`Duplicate runtime environment configuration for '${item.key}'.`);
    }

    seen.add(item.key);
  }
}

function normalizeSettings(input: {
  deploymentEnvironments: readonly RuntimeEnvironmentConfigInput[];
  promotionPolicy?: {
    sequence?: readonly RuntimeEnvironmentKey[];
    allowSkip?: boolean;
  };
  source: DeploymentEnvironmentSettings['source'];
}): DeploymentEnvironmentSettings {
  const settings: DeploymentEnvironmentSettings = {
    deploymentEnvironments: input.deploymentEnvironments.map((env) => normalizeRuntimeEnvironmentConfig(env)),
    promotionPolicy: {
      sequence: input.promotionPolicy?.sequence ?? DEFAULT_PROMOTION_SEQUENCE,
      allowSkip: input.promotionPolicy?.allowSkip ?? false,
    },
    source: input.source,
  };

  ensureNoDuplicateEnvironmentKeys(settings);
  ensureAtLeastOneRuntimeEnvironmentConfigured(settings);

  return settings;
}

export function parseDeploymentEnvironmentSettingsJson(rawJson: string): DeploymentEnvironmentSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new DeploymentEnvironmentConfigError('DEPLOYMENT_ENVIRONMENT_SETTINGS_JSON must be valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new DeploymentEnvironmentConfigError('DEPLOYMENT_ENVIRONMENT_SETTINGS_JSON must be a JSON object.');
  }

  const deploymentEnvironments = (parsed as { deploymentEnvironments?: unknown }).deploymentEnvironments;
  if (!Array.isArray(deploymentEnvironments)) {
    throw new DeploymentEnvironmentConfigError('DEPLOYMENT_ENVIRONMENT_SETTINGS_JSON.deploymentEnvironments must be an array.');
  }

  const promotionPolicy = (parsed as { promotionPolicy?: { sequence?: readonly RuntimeEnvironmentKey[]; allowSkip?: boolean } }).promotionPolicy;

  return normalizeSettings({
    deploymentEnvironments: deploymentEnvironments as Array<
      RuntimeEnvironmentConfigInput
    >,
    promotionPolicy,
    source: 'env-json',
  });
}

export function parseDeploymentEnvironmentSettingsFromEnv(
  env: Record<string, string | undefined>,
): DeploymentEnvironmentSettings | null {
  const settingsJson = readEnv(env, 'DEPLOYMENT_ENVIRONMENT_SETTINGS_JSON');
  if (settingsJson) {
    return parseDeploymentEnvironmentSettingsJson(settingsJson);
  }

  const configuredKeys = ENV_KEYS.filter((key) => Boolean(readEnv(env, `RUNTIME_API_BASE_URL_${key}`)));
  if (configuredKeys.length === 0) {
    return null;
  }

  const maxAttempts = parsePositiveInt(
    readEnv(env, 'RUNTIME_RETRY_MAX_ATTEMPTS'),
    'RUNTIME_RETRY_MAX_ATTEMPTS',
    DEFAULT_RETRY_POLICY.maxAttempts,
  );
  const baseDelayMs = parsePositiveInt(
    readEnv(env, 'RUNTIME_RETRY_BASE_DELAY_MS'),
    'RUNTIME_RETRY_BASE_DELAY_MS',
    DEFAULT_RETRY_POLICY.baseDelayMs,
  );
  const maxDelayMs = parsePositiveInt(
    readEnv(env, 'RUNTIME_RETRY_MAX_DELAY_MS'),
    'RUNTIME_RETRY_MAX_DELAY_MS',
    DEFAULT_RETRY_POLICY.maxDelayMs,
  );

  const deploymentEnvironments = configuredKeys.map((key): Omit<RuntimeEnvironmentConfig, 'retryPolicy'> & {
    retryPolicy?: Partial<RuntimeEnvironmentRetryPolicy>;
    authMode?: 'AWS_IAM' | 'NONE';
  } => {
    const runtimeApiBaseUrl = readEnv(env, `RUNTIME_API_BASE_URL_${key}`);
    if (!runtimeApiBaseUrl) {
      throw new DeploymentEnvironmentConfigError(
        `Missing required environment variable: RUNTIME_API_BASE_URL_${key}.`,
      );
    }

    const timeoutMs = parsePositiveInt(
      readEnv(env, `RUNTIME_REQUEST_TIMEOUT_MS_${key}`) ?? readEnv(env, 'RUNTIME_REQUEST_TIMEOUT_MS'),
      `RUNTIME_REQUEST_TIMEOUT_MS_${key}`,
      DEFAULT_TIMEOUT_MS,
    );

    return {
      key,
      accountId: readEnv(env, `RUNTIME_ACCOUNT_ID_${key}`),
      assumeRoleArn: readEnv(env, `RUNTIME_ASSUME_ROLE_ARN_${key}`),
      runtimeRegion: readEnv(env, `RUNTIME_REGION_${key}`) ?? readEnv(env, 'AWS_REGION') ?? readEnv(env, 'AWS_DEFAULT_REGION'),
      authMode: readEnv(env, `RUNTIME_API_AUTH_MODE_${key}`) === 'AWS_IAM' ? 'AWS_IAM' : 'NONE',
      label: readEnv(env, `RUNTIME_LABEL_${key}`) ?? key,
      runtimeApiBaseUrl,
      deployApiPath: readEnv(env, `RUNTIME_DEPLOY_API_PATH_${key}`) ?? DEFAULT_PATHS.deployApiPath,
      rollbackApiPath: readEnv(env, `RUNTIME_ROLLBACK_API_PATH_${key}`) ?? DEFAULT_PATHS.rollbackApiPath,
      previewApiPath: readEnv(env, `RUNTIME_PREVIEW_API_PATH_${key}`) ?? DEFAULT_PATHS.previewApiPath,
      statusApiPath: readEnv(env, `RUNTIME_STATUS_API_PATH_${key}`) ?? DEFAULT_PATHS.statusApiPath,
      requestTimeoutMs: timeoutMs,
      retryPolicy: {
        maxAttempts,
        baseDelayMs,
        maxDelayMs,
      },
    };
  });

  return normalizeSettings({
    deploymentEnvironments,
    promotionPolicy: {
      sequence: DEFAULT_PROMOTION_SEQUENCE,
      allowSkip: false,
    },
    source: 'env-fallback',
  });
}

function getProcessEnv(): Record<string, string | undefined> {
  const processRef = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processRef?.env ?? {};
}

export async function loadDeploymentEnvironmentSettingsOrThrow(options?: {
  readonly provider?: DeploymentEnvironmentSettingsProvider;
  readonly env?: Record<string, string | undefined>;
}): Promise<DeploymentEnvironmentSettings> {
  const provider = options?.provider ?? new NullSettingsProvider();
  const persisted = await provider.loadSettings();

  if (persisted) {
    return normalizeSettings({
      deploymentEnvironments: persisted.deploymentEnvironments,
      promotionPolicy: persisted.promotionPolicy,
      source: 'persisted-settings',
    });
  }

  const envSettings = parseDeploymentEnvironmentSettingsFromEnv(options?.env ?? getProcessEnv());
  if (envSettings) {
    return envSettings;
  }

  throw new DeploymentEnvironmentConfigError(
    'Deployment environment settings are not configured. ' +
      'Provide persisted admin settings or env fallback (DEPLOYMENT_ENVIRONMENT_SETTINGS_JSON or RUNTIME_API_BASE_URL_<ENV>).',
  );
}

export async function loadDeploymentEnvironmentSettings(options?: {
  readonly provider?: DeploymentEnvironmentSettingsProvider;
  readonly env?: Record<string, string | undefined>;
}): Promise<DeploymentEnvironmentSettings | null> {
  try {
    return await loadDeploymentEnvironmentSettingsOrThrow(options);
  } catch (error) {
    if (error instanceof DeploymentEnvironmentConfigError) {
      return null;
    }

    throw error;
  }
}

export function getRuntimeEnvironmentConfig(
  settings: DeploymentEnvironmentSettings,
  environment: RuntimeEnvironmentKey,
): RuntimeEnvironmentConfig {
  const match = settings.deploymentEnvironments.find((item) => item.key === environment);
  if (!match) {
    throw new DeploymentEnvironmentConfigError(`No runtime environment config found for '${environment}'.`);
  }

  return match;
}
