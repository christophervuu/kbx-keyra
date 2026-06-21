import type { MappingConfig } from '../../lib/persistence/types.js';
import { computeConfigHash } from '../../lib/persistence/hash.js';
import { getRuntimeApiClient, toRuntimeRelayClient } from './runtime-api-client.js';
import {
  DeploymentEnvironmentConfigError,
  loadDeploymentEnvironmentSettings,
} from './environment-config.js';

export type RuntimeDeploymentEnvironment = 'DEV' | 'PREPROD' | 'PROD';
export type RuntimeDeploymentSourceType = 'revision' | 'version';

export interface RuntimeDeployArtifact {
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly snapshotId: string;
  readonly mappingId: string;
  readonly sourceType: RuntimeDeploymentSourceType;
  readonly sourceNumber: number;
  readonly sourceConfigHash: string;
  readonly engineVersion: string;
  readonly mappingConfig: MappingConfig;
}

export interface RuntimeRelayResult {
  readonly ok: true;
  readonly statusCode: 200 | 201;
  readonly requestId: string;
}

export interface RuntimeRelayFailure {
  readonly ok: false;
  readonly statusCode: number;
  readonly errorCode: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly requestId: string;
}

export type RuntimeRelayResponse = RuntimeRelayResult | RuntimeRelayFailure;

export interface RuntimeRelayClient {
  pushArtifact(
    environment: RuntimeDeploymentEnvironment,
    artifact: RuntimeDeployArtifact,
    options?: {
      readonly requestId?: string;
      readonly orchestrationId?: string;
      readonly operation?: 'deploy' | 'promote';
      readonly promotedFrom?: RuntimeDeploymentEnvironment;
      readonly triggeredBy?: 'user' | 'system';
    },
  ): Promise<RuntimeRelayResponse>;
}

const MAX_ARTIFACT_PAYLOAD_BYTES_DEFAULT = 5 * 1024 * 1024; // 5MB (FS-083 Rev 2)

function normalizeMappingConfigForArtifact(config: MappingConfig): MappingConfig {
  const sanitizedRules = Array.isArray(config.rules)
    ? config.rules.map((rule) => {
      const noMatch = rule.noMatchBehavior;
      const normalizedNoMatch = noMatch
        ? {
            mode: noMatch.mode,
            ...(noMatch.mode === 'fallback_value' && noMatch.fallbackValue !== undefined
              ? { fallbackValue: noMatch.fallbackValue }
              : {}),
          }
        : undefined;

      return {
        ...rule,
        ...(normalizedNoMatch ? { noMatchBehavior: normalizedNoMatch } : {}),
      };
    })
    : [];

  return {
    ...config,
    rules: sanitizedRules,
  };
}

function parseMaxPayloadBytes(value: string | undefined): number {
  if (!value) {
    return MAX_ARTIFACT_PAYLOAD_BYTES_DEFAULT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return MAX_ARTIFACT_PAYLOAD_BYTES_DEFAULT;
  }

  return parsed;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function maxDeployArtifactPayloadBytes(): number {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return parseMaxPayloadBytes(env?.MAX_DEPLOY_ARTIFACT_PAYLOAD_BYTES);
}

export function buildArtifactId(mappingId: string, sourceType: RuntimeDeploymentSourceType, sourceNumber: number): string {
  return `${mappingId}:${sourceType}:${sourceNumber}`;
}

export async function buildRuntimeDeployArtifact(input: {
  mappingId: string;
  sourceType: RuntimeDeploymentSourceType;
  sourceNumber: number;
  config: MappingConfig;
}): Promise<RuntimeDeployArtifact> {
  const normalizedConfig = normalizeMappingConfigForArtifact(input.config);
  const artifactHash = await computeConfigHash(normalizedConfig);
  const artifactId = buildArtifactId(input.mappingId, input.sourceType, input.sourceNumber);

  return {
    artifactId,
    artifactHash,
    snapshotId: artifactId,
    mappingId: input.mappingId,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    sourceConfigHash: artifactHash,
    engineVersion: normalizedConfig.engineVersion,
    mappingConfig: normalizedConfig,
  };
}

export function assertArtifactPayloadWithinLimit(artifact: RuntimeDeployArtifact): {
  ok: true;
  payloadBytes: number;
  limitBytes: number;
} | {
  ok: false;
  payloadBytes: number;
  limitBytes: number;
} {
  const payloadBytes = byteLength(JSON.stringify(artifact));
  const limitBytes = maxDeployArtifactPayloadBytes();

  if (payloadBytes > limitBytes) {
    return {
      ok: false,
      payloadBytes,
      limitBytes,
    };
  }

  return {
    ok: true,
    payloadBytes,
    limitBytes,
  };
}

let cachedRelayClient: RuntimeRelayClient | null = null;

export function getRuntimeRelayClient(): RuntimeRelayClient {
  if (!cachedRelayClient) {
    cachedRelayClient = toRuntimeRelayClient(getRuntimeApiClient());
  }

  return cachedRelayClient;
}

export async function runtimeEnvironmentSettingsAvailable(): Promise<boolean> {
  const settings = await loadDeploymentEnvironmentSettings();
  return settings !== null;
}

export { DeploymentEnvironmentConfigError };
