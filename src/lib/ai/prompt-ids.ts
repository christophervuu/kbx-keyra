export const PROMPT_IDS = {
  EXPLAIN_RULE: 'explain-rule',
  NATURAL_LANGUAGE_TO_DSL: 'natural-language-to-dsl',
  SMART_FIX: 'smart-fix',
  AI_VALIDATION: 'ai-validation',
  AUTO_MAP: 'auto-map',
  FIELD_DESCRIPTION: 'field-description',
} as const;

export type CanonicalPromptId = (typeof PROMPT_IDS)[keyof typeof PROMPT_IDS];

export const PROMPT_ID_ALIASES = {
  'nl-to-rule': PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL,
} as const;

export type PromptIdAlias = keyof typeof PROMPT_ID_ALIASES;

export const PROMPT_ID_ALIAS_POLICY: Readonly<
  Record<PromptIdAlias, { canonicalPromptId: CanonicalPromptId; sunset: 'one-release-cycle' }>
> = {
  'nl-to-rule': {
    canonicalPromptId: PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL,
    sunset: 'one-release-cycle',
  },
} as const;

export interface PromptIdResolution {
  readonly requestedPromptId: string;
  readonly canonicalPromptId: CanonicalPromptId;
  readonly aliasApplied: boolean;
  readonly aliasPromptId?: PromptIdAlias;
}

const CANONICAL_PROMPT_ID_SET = new Set<CanonicalPromptId>(Object.values(PROMPT_IDS));

const LEGACY_ALIASES_BY_CANONICAL: Readonly<Record<CanonicalPromptId, readonly PromptIdAlias[]>> =
  Object.values(PROMPT_IDS).reduce<Record<CanonicalPromptId, PromptIdAlias[]>>((acc, canonicalPromptId) => {
    acc[canonicalPromptId] = Object.entries(PROMPT_ID_ALIASES)
      .filter(([, canonical]) => canonical === canonicalPromptId)
      .map(([alias]) => alias as PromptIdAlias);
    return acc;
  }, {
    [PROMPT_IDS.EXPLAIN_RULE]: [],
    [PROMPT_IDS.NATURAL_LANGUAGE_TO_DSL]: [],
    [PROMPT_IDS.SMART_FIX]: [],
    [PROMPT_IDS.AI_VALIDATION]: [],
    [PROMPT_IDS.AUTO_MAP]: [],
    [PROMPT_IDS.FIELD_DESCRIPTION]: [],
  });

export function isCanonicalPromptId(value: string): value is CanonicalPromptId {
  return CANONICAL_PROMPT_ID_SET.has(value as CanonicalPromptId);
}

export function isSupportedPromptId(value: string): value is CanonicalPromptId | PromptIdAlias {
  return isCanonicalPromptId(value) || value in PROMPT_ID_ALIASES;
}

export function getLegacyAliasesForCanonicalPromptId(canonicalPromptId: CanonicalPromptId): readonly PromptIdAlias[] {
  return LEGACY_ALIASES_BY_CANONICAL[canonicalPromptId] ?? [];
}

export function resolvePromptId(requestedPromptId: string): PromptIdResolution | null {
  if (isCanonicalPromptId(requestedPromptId)) {
    return {
      requestedPromptId,
      canonicalPromptId: requestedPromptId,
      aliasApplied: false,
    };
  }

  if (requestedPromptId in PROMPT_ID_ALIASES) {
    const aliasPromptId = requestedPromptId as PromptIdAlias;

    return {
      requestedPromptId,
      canonicalPromptId: PROMPT_ID_ALIASES[aliasPromptId],
      aliasApplied: true,
      aliasPromptId,
    };
  }

  return null;
}
