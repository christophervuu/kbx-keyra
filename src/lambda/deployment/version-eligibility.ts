import { get as getVersion, getConfig as getVersionConfig } from '../../lib/persistence/mapping-versions.js';
import type { MappingConfig } from '../../lib/persistence/types.js';

interface MappingConfigLike {
  readonly rules?: ReadonlyArray<{
    readonly valueTableRef?: {
      readonly scope?: string;
      readonly resolvedEntries?: unknown;
    };
  }>;
}

export type VersionEligibilityReason =
  | 'VERSION_NOT_FOUND'
  | 'VERSION_CONFIG_NOT_FOUND'
  | 'UNRESOLVED_VALUE_MAP_BINDINGS';

export type VersionEligibilityResult =
  | {
      readonly eligible: true;
      readonly mappingConfig: MappingConfig;
      readonly normalizedVersion: number;
    }
  | {
      readonly eligible: false;
      readonly reason: VersionEligibilityReason;
      readonly message: string;
      readonly statusCode: 404 | 409 | 500;
    };

function hasUnresolvedProjectValueMapBindings(config: MappingConfigLike): boolean {
  const rules = Array.isArray(config.rules) ? config.rules : [];

  for (const rule of rules) {
    const ref = rule?.valueTableRef;
    if (!ref || ref.scope !== 'project') {
      continue;
    }

    if (!Array.isArray(ref.resolvedEntries)) {
      return true;
    }
  }

  return false;
}

export async function evaluateVersionEligibility(input: {
  readonly mappingId: string;
  readonly version: number;
}): Promise<VersionEligibilityResult> {
  const versionItem = await getVersion(input.mappingId, input.version);
  if (!versionItem) {
    return {
      eligible: false,
      reason: 'VERSION_NOT_FOUND',
      message: `Version source not found: ${input.mappingId}:${input.version}`,
      statusCode: 404,
    };
  }

  const config = await getVersionConfig(input.mappingId, input.version);
  if (!config) {
    return {
      eligible: false,
      reason: 'VERSION_CONFIG_NOT_FOUND',
      message: `Version config snapshot unavailable: ${input.mappingId}:${input.version}`,
      statusCode: 500,
    };
  }

  if (hasUnresolvedProjectValueMapBindings(config as MappingConfigLike)) {
    return {
      eligible: false,
      reason: 'UNRESOLVED_VALUE_MAP_BINDINGS',
      message: `Deployment blocked: unresolved value-map bindings in source config (${input.mappingId}:version:${input.version})`,
      statusCode: 409,
    };
  }

  return {
    eligible: true,
    mappingConfig: config,
    normalizedVersion: versionItem.version,
  };
}
