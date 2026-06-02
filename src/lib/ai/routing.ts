import type { PromptRecord } from './types.js';

export type AITier = 'tier1' | 'tier2';

export type KnownAIFeature =
  | 'explain-rule'
  | 'nl-to-rule'
  | 'smart-fix'
  | 'validate-mappings'
  | 'auto-map';

export type AIInvocationFeature = KnownAIFeature | 'unclassified';

export interface AITierDefaults {
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export interface AIFeatureDefaults {
  readonly promptId: string;
  readonly tier: AITier;
}

export interface AIFeatureOverride {
  readonly tier?: AITier;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
}

export interface AIInvocationProfile {
  readonly feature: AIInvocationFeature;
  readonly promptId: string;
  readonly tier: AITier;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxOutputTokens: number;
}

export const AI_TIER_DEFAULTS: Readonly<Record<AITier, AITierDefaults>> = {
  tier1: {
    model: 'openai/gpt-4.1-mini',
    timeoutMs: 20_000,
    maxOutputTokens: 1_200,
  },
  tier2: {
    model: 'openai/gpt-4.1',
    timeoutMs: 45_000,
    maxOutputTokens: 2_500,
  },
} as const;

export const AI_FEATURE_DEFAULTS: Readonly<Record<KnownAIFeature, AIFeatureDefaults>> = {
  'explain-rule': {
    promptId: 'explain-rule',
    tier: 'tier1',
  },
  'nl-to-rule': {
    promptId: 'nl-to-rule',
    tier: 'tier1',
  },
  'smart-fix': {
    promptId: 'smart-fix',
    tier: 'tier1',
  },
  'validate-mappings': {
    promptId: 'validate-mappings',
    tier: 'tier1',
  },
  'auto-map': {
    promptId: 'auto-map',
    tier: 'tier2',
  },
} as const;

/**
 * Feature-specific overrides are allowed only for keys present in this table.
 * Values are optional and validated at resolution time.
 */
export const AI_FEATURE_OVERRIDE_ALLOWLIST: Readonly<Partial<Record<KnownAIFeature, AIFeatureOverride>>> = {
  'auto-map': {
    tier: 'tier2',
  },
} as const;

function isTier(value: unknown): value is AITier {
  return value === 'tier1' || value === 'tier2';
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function parseModel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toKnownFeature(promptId: string): KnownAIFeature | undefined {
  if (promptId in AI_FEATURE_DEFAULTS) {
    return promptId as KnownAIFeature;
  }

  return undefined;
}

function applyAllowlistedOverride(
  profile: AIInvocationProfile,
  allowlistedOverride: AIFeatureOverride | undefined,
): AIInvocationProfile {
  if (!allowlistedOverride) {
    return profile;
  }

  const tier = isTier(allowlistedOverride.tier) ? allowlistedOverride.tier : profile.tier;
  const tierDefaults = AI_TIER_DEFAULTS[tier];

  const model = parseModel(allowlistedOverride.model) ?? profile.model;
  const timeoutMs = parsePositiveInteger(allowlistedOverride.timeoutMs) ?? profile.timeoutMs;
  const maxOutputTokens = parsePositiveInteger(allowlistedOverride.maxOutputTokens) ?? profile.maxOutputTokens;

  return {
    ...profile,
    tier,
    model: model ?? tierDefaults.model,
    timeoutMs,
    maxOutputTokens,
  };
}

function applyRegistryOverrides(
  profile: AIInvocationProfile,
  promptRecord: PromptRecord | undefined,
): AIInvocationProfile {
  if (!promptRecord) {
    return profile;
  }

  const model = parseModel(promptRecord.model) ?? profile.model;
  const registryMaxTokens = parsePositiveInteger(promptRecord.maxTokens);
  const maxOutputTokens =
    registryMaxTokens !== undefined && registryMaxTokens <= profile.maxOutputTokens
      ? registryMaxTokens
      : profile.maxOutputTokens;

  return {
    ...profile,
    model,
    maxOutputTokens,
  };
}

export function resolveInvocationProfile(
  promptId: string,
  promptRecord?: PromptRecord,
  overrideTable: Readonly<Partial<Record<KnownAIFeature, AIFeatureOverride>>> = AI_FEATURE_OVERRIDE_ALLOWLIST,
): AIInvocationProfile {
  const knownFeature = toKnownFeature(promptId);
  const feature: AIInvocationFeature = knownFeature ?? 'unclassified';

  const defaultTier = knownFeature ? AI_FEATURE_DEFAULTS[knownFeature].tier : 'tier1';
  const defaultTierConfig = AI_TIER_DEFAULTS[defaultTier];

  const baseProfile: AIInvocationProfile = {
    feature,
    promptId,
    tier: defaultTier,
    model: defaultTierConfig.model,
    timeoutMs: defaultTierConfig.timeoutMs,
    maxOutputTokens: defaultTierConfig.maxOutputTokens,
  };

  const allowlistedOverride = knownFeature ? overrideTable[knownFeature] : undefined;
  const withAllowlistedOverrides = applyAllowlistedOverride(baseProfile, allowlistedOverride);

  return applyRegistryOverrides(withAllowlistedOverrides, promptRecord);
}
