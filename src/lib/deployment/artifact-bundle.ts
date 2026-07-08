import { computeStableJsonSha256 } from '../persistence/hash.js';
import type { MappingConfig } from '../persistence/types.js';

export const ARTIFACT_BUNDLE_FORMAT_VERSION = 1;

export interface DeploymentArtifactManifest {
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly engineVersion: string;
  readonly dslVersion: string;
  readonly bundleFormatVersion: number;
  readonly sourceSchemaRefs: readonly {
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly schemaVersionId: string;
    readonly contentHash: string;
  }[];
  readonly targetSchemaRef: {
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly schemaVersionId: string;
    readonly contentHash: string;
  } | null;
  readonly enrichmentSchemaRefs: readonly {
    readonly alias: string;
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly schemaVersionId: string;
    readonly contentHash: string;
  }[];
  readonly valueMapRefs: readonly {
    readonly scope: 'project' | 'global';
    readonly valueTableId: string;
    readonly revision?: number;
  }[];
  readonly constantsHash: string;
  readonly compiledDslHash: string;
}

export interface DeploymentArtifactBundle {
  readonly bundleFormatVersion: number;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly mappingId: string;
  readonly sourceType: 'revision' | 'version';
  readonly sourceNumber: number;
  readonly engineVersion: string;
  readonly mappingConfig: MappingConfig;
  readonly manifest: DeploymentArtifactManifest;
}

interface ArtifactManifestCore {
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly engineVersion: string;
  readonly dslVersion: string;
  readonly bundleFormatVersion: number;
  readonly sourceSchemaRefs: readonly {
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly schemaVersionId: string;
    readonly contentHash: string;
  }[];
  readonly targetSchemaRef: {
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly schemaVersionId: string;
    readonly contentHash: string;
  } | null;
  readonly enrichmentSchemaRefs: readonly {
    readonly alias: string;
    readonly schemaId: string;
    readonly schemaVersion: number;
    readonly schemaVersionId: string;
    readonly contentHash: string;
  }[];
  readonly valueMapRefs: readonly {
    readonly scope: 'project' | 'global';
    readonly valueTableId: string;
    readonly revision?: number;
  }[];
  readonly constantsHash: string;
  readonly compiledDslHash: string;
}

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

function toSchemaRef(ref: MappingConfig['sourceSchemaRef']): ArtifactManifestCore['targetSchemaRef'] {
  if (!ref || typeof ref.schemaId !== 'string' || typeof ref.contentHash !== 'string') {
    return null;
  }

  if (typeof ref.schemaVersion !== 'number' || typeof ref.schemaVersionId !== 'string') {
    return null;
  }

  return {
    schemaId: ref.schemaId,
    schemaVersion: ref.schemaVersion,
    schemaVersionId: ref.schemaVersionId,
    contentHash: ref.contentHash,
  };
}

function toEnrichmentRefs(config: MappingConfig): ArtifactManifestCore['enrichmentSchemaRefs'] {
  if (!Array.isArray(config.enrichmentSources)) {
    return [];
  }

  return config.enrichmentSources
    .filter((item) => (
      typeof item.alias === 'string'
      && typeof item.schemaId === 'string'
      && typeof item.schemaVersion === 'number'
      && typeof item.schemaVersionId === 'string'
      && typeof item.contentHash === 'string'
    ))
    .map((item) => ({
      alias: item.alias,
      schemaId: item.schemaId as string,
      schemaVersion: item.schemaVersion as number,
      schemaVersionId: item.schemaVersionId as string,
      contentHash: item.contentHash as string,
    }));
}

function toValueMapRefs(config: MappingConfig): ArtifactManifestCore['valueMapRefs'] {
  const refs = new Map<string, { scope: 'project' | 'global'; valueTableId: string; revision?: number }>();

  for (const rule of config.rules) {
    const ref = rule.valueTableRef;
    if (!ref || (ref.scope !== 'project' && ref.scope !== 'global')) {
      continue;
    }

    const id = ref.valueTableId;
    if (typeof id !== 'string' || id.trim() === '') {
      continue;
    }

    refs.set(`${ref.scope}:${id}`, {
      scope: ref.scope,
      valueTableId: id,
      ...(typeof ref.revision === 'number' ? { revision: ref.revision } : {}),
    });
  }

  return [...refs.values()];
}

function buildManifestCore(input: {
  mappingId: string;
  sourceNumber: number;
  mappingConfig: MappingConfig;
}): ArtifactManifestCore {
  const constantsHash = computeStableJsonSha256(input.mappingConfig.config.constants ?? {});
  const compiledDslHash = computeStableJsonSha256(input.mappingConfig.rules.map((rule) => rule.expression));

  const sourceSchema = toSchemaRef(input.mappingConfig.sourceSchemaRef);
  const targetSchema = toSchemaRef(input.mappingConfig.targetSchemaRef);

  return {
    mappingId: input.mappingId,
    mappingVersion: input.sourceNumber,
    engineVersion: input.mappingConfig.engineVersion,
    dslVersion: '1',
    bundleFormatVersion: ARTIFACT_BUNDLE_FORMAT_VERSION,
    sourceSchemaRefs: sourceSchema ? [sourceSchema] : [],
    targetSchemaRef: targetSchema,
    enrichmentSchemaRefs: toEnrichmentRefs(input.mappingConfig),
    valueMapRefs: toValueMapRefs(input.mappingConfig),
    constantsHash,
    compiledDslHash,
  };
}

function buildHashInput(input: {
  bundleFormatVersion: number;
  mappingId: string;
  sourceType: 'revision' | 'version';
  sourceNumber: number;
  mappingConfig: MappingConfig;
  manifestCore: ArtifactManifestCore;
}): Record<string, unknown> {
  return {
    bundleFormatVersion: input.bundleFormatVersion,
    mappingId: input.mappingId,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    mappingConfig: input.mappingConfig,
    manifest: input.manifestCore,
  };
}

function extractManifestCore(bundlePayload: Record<string, unknown>): ArtifactManifestCore {
  const manifest = { ...((bundlePayload.manifest ?? {}) as Record<string, unknown>) };
  delete manifest.artifactId;
  delete manifest.artifactHash;
  delete manifest.createdAt;
  delete manifest.createdByActor;
  delete manifest.actorType;
  delete manifest.actorId;
  delete manifest.actorDisplayName;
  delete manifest.actorEmail;
  delete manifest.reason;
  delete manifest.environment;

  return manifest as ArtifactManifestCore;
}

export function computeArtifactHashFromBundlePayload(payload: unknown): string {
  const bundle = payload as Record<string, unknown>;
  const manifestCore = extractManifestCore(bundle);
  const hashInput = buildHashInput({
    bundleFormatVersion: Number(bundle.bundleFormatVersion ?? ARTIFACT_BUNDLE_FORMAT_VERSION),
    mappingId: String(bundle.mappingId ?? ''),
    sourceType: (bundle.sourceType === 'revision' ? 'revision' : 'version'),
    sourceNumber: Number(bundle.sourceNumber ?? 0),
    mappingConfig: bundle.mappingConfig as MappingConfig,
    manifestCore,
  });

  return computeStableJsonSha256(hashInput);
}

export function buildDeploymentArtifactBundle(input: {
  mappingId: string;
  sourceType: 'revision' | 'version';
  sourceNumber: number;
  mappingConfig: MappingConfig;
}): DeploymentArtifactBundle {
  const normalizedConfig = normalizeMappingConfigForArtifact(input.mappingConfig);
  const manifestCore = buildManifestCore({
    mappingId: input.mappingId,
    sourceNumber: input.sourceNumber,
    mappingConfig: normalizedConfig,
  });

  const artifactHash = computeStableJsonSha256(buildHashInput({
    bundleFormatVersion: ARTIFACT_BUNDLE_FORMAT_VERSION,
    mappingId: input.mappingId,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    mappingConfig: normalizedConfig,
    manifestCore,
  }));
  const artifactId = `artifact:${artifactHash}`;

  return {
    bundleFormatVersion: ARTIFACT_BUNDLE_FORMAT_VERSION,
    artifactId,
    artifactHash,
    mappingId: input.mappingId,
    sourceType: input.sourceType,
    sourceNumber: input.sourceNumber,
    engineVersion: normalizedConfig.engineVersion,
    mappingConfig: normalizedConfig,
    manifest: {
      artifactId,
      artifactHash,
      ...manifestCore,
    },
  };
}
