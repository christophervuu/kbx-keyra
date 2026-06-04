import type { MappingConfig } from '../../lib/persistence/types.js';
import { computeConfigHash } from '../../lib/persistence/hash.js';

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
  readonly createdAt: string;
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
  ): Promise<RuntimeRelayResponse>;
}

const MAX_ARTIFACT_PAYLOAD_BYTES_DEFAULT = 1024 * 1024; // 1MB

function nowIso(): string {
  return new Date().toISOString();
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
  const artifactHash = await computeConfigHash(input.config);
  const artifactId = buildArtifactId(input.mappingId, input.sourceType, input.sourceNumber);

  return {
    artifactId,
    artifactHash,
    snapshotId: artifactId,
    mappingId: input.mappingId,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    sourceConfigHash: artifactHash,
    engineVersion: input.config.engineVersion,
    mappingConfig: input.config,
    createdAt: nowIso(),
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

class NoopRuntimeRelayClient implements RuntimeRelayClient {
  async pushArtifact(
    environment: RuntimeDeploymentEnvironment,
    artifact: RuntimeDeployArtifact,
  ): Promise<RuntimeRelayResponse> {
    void environment;
    void artifact;

    return {
      ok: true,
      statusCode: 201,
      requestId: 'runtime-relay-noop',
    };
  }
}

const defaultRelayClient = new NoopRuntimeRelayClient();

export function getRuntimeRelayClient(): RuntimeRelayClient {
  return defaultRelayClient;
}
