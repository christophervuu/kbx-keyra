import type { ChainSource } from './chain-builder-state';
import { decomposeToChain } from './chain-decomposer';
import {
  getSmartBuilderActionParameters,
  type SmartBuilderActionParameterDefinition,
} from './smart-builder-action-catalog';
import { generateSmartBuilderExpression } from './smart-builder-expression-generator';

import { parse, type AstNode } from '@/lib/engine';
import type {
  MappingRule,
  MappingRuleNoMatchBehavior,
  MappingRuleProjectValueTableRef,
  MappingRuleValueTableRef,
  ValueMapMatchMode,
  ValueTableDirectionSupport,
  ValueTableScope,
  ValueTableSideDefinition,
  ValueTableStatus,
} from '@/lib/types/domain';

export type BuilderValueType = MappingRule['type'] | 'unknown';

export type BuilderSourceKind =
  | 'primary'
  | 'enrichment'
  | 'constant'
  | 'static'
  | 'item'
  | 'parent'
  | 'expression';

export type BuilderArgumentValue =
  | { readonly kind: 'static'; readonly value: unknown; readonly transforms?: readonly BuilderInputTransform[] }
  | { readonly kind: 'expression'; readonly expression: string; readonly transforms?: readonly BuilderInputTransform[] }
  | { readonly kind: 'input'; readonly inputId: string; readonly transforms?: readonly BuilderInputTransform[] };

export interface RecipeValue {
  readonly source:
    | { readonly kind: 'input'; readonly inputId: string }
    | { readonly kind: 'fixed'; readonly value: unknown }
    | { readonly kind: 'constant'; readonly constantName: string };
  readonly steps: readonly BuilderInputTransform[];
}

export interface BuilderInputTransform {
  readonly functionName: string;
  readonly args?: readonly BuilderArgumentValue[];
}

export interface BuilderInput {
  readonly id: string;
  readonly sourceKind: BuilderSourceKind;
  readonly label: string;
  readonly path?: string;
  readonly externalName?: string;
  readonly constantName?: string;
  readonly staticValue?: unknown;
  readonly rawExpression?: string;
  readonly valueType: BuilderValueType;
  readonly sampleValue?: unknown;
  readonly nullable?: boolean;
  /**
   * Legacy compatibility only. FS-098 canonical transform ownership is on
   * value usages (`BuilderArgumentValue.transforms`) and final result steps.
   */
  readonly transforms: readonly BuilderInputTransform[];
}

export interface BuilderPredicate {
  readonly left: BuilderArgumentValue;
  readonly operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'isNull'
    | 'isNotNull'
    | 'isTruthy'
    | 'isFalsy';
  readonly right?: BuilderArgumentValue;
}

export interface BuilderConditionClause {
  readonly predicates: readonly BuilderPredicate[];
  readonly thenOutput: BuilderArgumentValue;
}

const SUPPORTED_BINARY_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;
const SUPPORTED_UNARY_OPERATORS = ['isNull'] as const;

export type BuilderConditionMatchMode = 'all' | 'any';

export type BuilderInputUsageLocation =
  | 'direct'
  | 'concat-part'
  | 'coalesce-operand'
  | 'coalesce-fallback'
  | 'default-primary'
  | 'default-fallback'
  | 'math-start'
  | 'math-operand'
  | 'condition-left'
  | 'condition-right'
  | 'then'
  | 'otherwise'
  | 'value-map-lookup'
  | 'value-map-output'
  | 'value-map-fallback'
  | 'array-build-item'
  | 'array-merge-item'
  | 'result-step-arg';

export interface BuilderInputUsage {
  readonly inputId: string;
  readonly location: BuilderInputUsageLocation;
  readonly clauseIndex?: number;
  readonly predicateIndex?: number;
  readonly valueIndex?: number;
  readonly operationIndex?: number;
  readonly mappingIndex?: number;
  readonly stepIndex?: number;
  readonly argIndex?: number;
}

export interface BuilderConditionCompatibilityIssue {
  readonly clauseIndex: number;
  readonly predicateIndex: number;
  readonly message: string;
}

export interface BuilderValueMapEntry {
  readonly whenValue: string;
  readonly output: BuilderArgumentValue;
}

export interface BuilderProjectValueMapSelection {
  readonly ref: MappingRuleProjectValueTableRef;
  readonly matchMode?: ValueMapMatchMode;
  readonly tableName?: string;
  readonly tableStatus?: ValueTableStatus;
  readonly currentRevision?: number;
  readonly sideA?: ValueTableSideDefinition;
  readonly sideB?: ValueTableSideDefinition;
  readonly directionSupport?: ValueTableDirectionSupport;
  readonly usageCount?: number;
}

export type BuilderComposition =
  | {
      readonly kind: 'direct';
      readonly inputId: string;
      readonly value?: BuilderArgumentValue;
      readonly fixedValueExplicitlySet?: boolean;
    }
  | {
      readonly kind: 'concat';
      readonly inputIds?: readonly string[];
      readonly separator?: string;
      readonly parts?: readonly BuilderArgumentValue[];
    }
  | {
      readonly kind: 'coalesce';
      readonly inputIds?: readonly string[];
      readonly values?: readonly BuilderArgumentValue[];
      readonly fallback?: BuilderArgumentValue;
    }
  | {
      readonly kind: 'default';
      readonly inputId: string;
      readonly fallback: BuilderArgumentValue;
    }
  | {
      readonly kind: 'math';
      readonly operator?: 'add' | 'subtract' | 'multiply' | 'divide';
      readonly inputIds?: readonly string[];
      readonly startInputId?: string;
      readonly operations?: readonly {
        readonly operator: 'add' | 'subtract' | 'multiply' | 'divide';
        readonly inputId?: string;
        readonly operand?: BuilderArgumentValue;
      }[];
    }
  | {
      readonly kind: 'condition';
      readonly matchMode?: BuilderConditionMatchMode;
      readonly clauses: readonly BuilderConditionClause[];
      readonly elseOutput: BuilderArgumentValue;
    }
  | {
      readonly kind: 'valueMap';
      readonly inputId: string;
      readonly matchMode?: ValueMapMatchMode;
      readonly scope?: ValueTableScope;
      readonly project?: BuilderProjectValueMapSelection | null;
      readonly mappings: readonly BuilderValueMapEntry[];
      readonly fallback: BuilderArgumentValue;
      readonly noMatchBehavior?: MappingRuleNoMatchBehavior;
    }
  | { readonly kind: 'arrayBuild'; readonly inputIds?: readonly string[] }
  | { readonly kind: 'arrayMerge'; readonly inputIds?: readonly string[] }
  | { readonly kind: 'advancedExpression'; readonly expression: string };

export type DraftValidationState =
  | { readonly status: 'valid' }
  | { readonly status: 'invalid'; readonly errors: readonly string[] }
  | { readonly status: 'pending' };

export type SmartBuilderRecipeStatus =
  | { readonly status: 'valid' }
  | { readonly status: 'incomplete'; readonly reasons: readonly string[] }
  | { readonly status: 'invalid'; readonly diagnostics: readonly string[] };

export interface SmartBuilderSnapshot {
  readonly availableInputs?: readonly BuilderInput[];
  readonly inputs?: readonly BuilderInput[];
  readonly focusedSlotId?: string | null;
  readonly slotScopedInputs?: Readonly<Record<string, BuilderInput>>;
  readonly recipe?: BuilderComposition | null;
  readonly composition?: BuilderComposition | null;
  readonly resultSteps?: readonly BuilderInputTransform[];
  readonly postSteps?: readonly BuilderInputTransform[];
  readonly recipeStatus: SmartBuilderRecipeStatus;
  readonly validation?: DraftValidationState;
  readonly expression: string;
  readonly validExpression: string;
  readonly lastValidExpression: string;
  readonly previousExpressions?: readonly string[];
  readonly pendingActionDraft?: SmartBuilderActionParameterDraft | null;
}

export const SMART_BUILDER_UNDO_HISTORY_LIMIT = 20;

function createSmartBuilderSnapshot(draft: SmartBuilderDraft): SmartBuilderSnapshot {
  const normalized = normalizeSmartBuilderDraft(draft);
  return {
    availableInputs: normalized.availableInputs,
    inputs: normalized.inputs,
    focusedSlotId: normalized.focusedSlotId ?? null,
    slotScopedInputs: normalized.slotScopedInputs,
    recipe: normalized.recipe,
    composition: normalized.composition,
    resultSteps: normalized.resultSteps,
    postSteps: normalized.postSteps,
    recipeStatus: normalized.recipeStatus ?? recipeStatusFromValidation(normalized.validation),
    validation: normalized.validation,
    expression: normalized.expression,
    validExpression: normalized.validExpression ?? '',
    lastValidExpression: normalized.lastValidExpression ?? '',
    previousExpressions: normalized.previousExpressions,
    pendingActionDraft: normalized.pendingActionDraft ?? null,
  };
}

export function pushSmartBuilderSnapshot(input: {
  previousDraft: SmartBuilderDraft;
  nextDraft: SmartBuilderDraft;
  limit?: number;
}): SmartBuilderDraft {
  const previous = normalizeSmartBuilderDraft(input.previousDraft);
  const next = normalizeSmartBuilderDraft(input.nextDraft);
  const limit = input.limit ?? SMART_BUILDER_UNDO_HISTORY_LIMIT;
  const snapshot = createSmartBuilderSnapshot(previous);
  const nextHistory = [...(next.undoHistory ?? []), snapshot].slice(-Math.max(1, limit));
  const nextPreviousExpressions = (() => {
    if (!previous.expression) return next.previousExpressions;
    const current = next.previousExpressions;
    if (current[current.length - 1] === previous.expression) return current;
    return [...current, previous.expression];
  })();

  return normalizeSmartBuilderDraft({
    ...next,
    undoHistory: nextHistory,
    previousExpressions: nextPreviousExpressions,
  });
}

export interface SmartBuilderActionParameterValidationIssue {
  readonly fieldId: string;
  readonly code:
    | 'missing'
    | 'invalid-type'
    | 'invalid-option'
    | 'too-small'
    | 'too-large'
    | 'too-short'
    | 'too-long'
    | 'empty-not-allowed';
  readonly message: string;
}

export interface SmartBuilderActionParameterValidationResult {
  readonly isValid: boolean;
  readonly issues: readonly SmartBuilderActionParameterValidationIssue[];
}

export type SmartBuilderActionParameterValue = string | number | boolean;

export interface SmartBuilderActionParameterDraft {
  readonly actionId: string;
  readonly values: Readonly<Record<string, SmartBuilderActionParameterValue>>;
  readonly validation: SmartBuilderActionParameterValidationResult;
}

export interface SmartBuilderDraft {
  readonly targetPath: string;
  readonly targetType: BuilderValueType;
  readonly isRequired: boolean;

  /** Canonical FS-098 field: tray references available to recipe authoring. */
  readonly availableInputs: readonly BuilderInput[];
  /** Legacy compatibility alias (to be removed after migration): mirrors availableInputs. */
  readonly inputs: readonly BuilderInput[];

  readonly focusedSlotId?: string | null;
  readonly slotScopedInputs?: Readonly<Record<string, BuilderInput>>;

  /** Canonical FS-098 field: active output recipe. */
  readonly recipe: BuilderComposition | null;
  /** Legacy compatibility alias (to be removed after migration): mirrors recipe. */
  readonly composition: BuilderComposition | null;

  /** Canonical FS-098 field: final-result transform steps. */
  readonly resultSteps: readonly BuilderInputTransform[];
  /** Legacy compatibility alias (to be removed after migration): mirrors resultSteps. */
  readonly postSteps: readonly BuilderInputTransform[];

  readonly recipeStatus?: SmartBuilderRecipeStatus;
  readonly expression: string;
  readonly validExpression?: string;
  readonly lastValidExpression?: string;
  readonly previousExpressions: readonly string[];
  readonly undoHistory?: readonly SmartBuilderSnapshot[];
  readonly validation: DraftValidationState;
  readonly pendingActionDraft?: SmartBuilderActionParameterDraft | null;
}

export type SmartBuilderHydrationResult =
  | { readonly kind: 'guided'; readonly draft: SmartBuilderDraft }
  | {
      readonly kind: 'advanced';
      readonly expression: string;
      readonly reason: 'complex-expression' | 'parse-failed' | 'unsupported-decomposition';
      readonly classification?:
        | 'nested-condition-groups'
        | 'non-lossless-condition-value'
        | 'unsupported-condition-operator';
    };

export function createEmptySmartBuilderDraft(input: {
  targetPath: string;
  targetType: BuilderValueType;
  isRequired: boolean;
}): SmartBuilderDraft {
  return normalizeSmartBuilderDraft({
    targetPath: input.targetPath,
    targetType: input.targetType,
    isRequired: input.isRequired,
    availableInputs: [],
    inputs: [],
    focusedSlotId: null,
    slotScopedInputs: {},
    recipe: null,
    composition: null,
    resultSteps: [],
    postSteps: [],
    recipeStatus: { status: 'incomplete', reasons: [] },
    expression: '',
    validExpression: '',
    lastValidExpression: '',
    previousExpressions: [],
    undoHistory: [],
    validation: { status: 'pending' },
    pendingActionDraft: null,
  });
}

function recipeStatusFromValidation(validation: DraftValidationState): SmartBuilderRecipeStatus {
  switch (validation.status) {
    case 'valid':
      return { status: 'valid' };
    case 'invalid':
      return { status: 'invalid', diagnostics: validation.errors };
    case 'pending':
    default:
      return { status: 'incomplete', reasons: [] };
  }
}

function migrateLegacyTransformsOnArgumentValue(
  value: BuilderArgumentValue,
  transformsByInputId: ReadonlyMap<string, readonly BuilderInputTransform[]>,
): BuilderArgumentValue {
  if (value.kind !== 'input') return value;
  if (value.transforms && value.transforms.length > 0) return value;

  const legacy = transformsByInputId.get(value.inputId) ?? [];
  if (legacy.length === 0) return value;
  return {
    ...value,
    transforms: legacy,
  };
}

function migrateLegacyInputTransformsToComposition(
  composition: BuilderComposition | null,
  transformsByInputId: ReadonlyMap<string, readonly BuilderInputTransform[]>,
): BuilderComposition | null {
  if (!composition) return composition;

  switch (composition.kind) {
    case 'direct': {
      const existingValue = composition.value;
      const migratedValue = existingValue
        ? migrateLegacyTransformsOnArgumentValue(existingValue, transformsByInputId)
        : (() => {
            const legacy = transformsByInputId.get(composition.inputId) ?? [];
            if (legacy.length === 0) return undefined;
            return {
              kind: 'input' as const,
              inputId: composition.inputId,
              transforms: legacy,
            };
          })();

      return {
        ...composition,
        ...(migratedValue ? { value: migratedValue } : {}),
      };
    }
    case 'default':
      return {
        ...composition,
        fallback: migrateLegacyTransformsOnArgumentValue(composition.fallback, transformsByInputId),
      };
    case 'coalesce':
      return {
        ...composition,
        ...(composition.fallback
          ? { fallback: migrateLegacyTransformsOnArgumentValue(composition.fallback, transformsByInputId) }
          : {}),
      };
    case 'condition':
      return {
        ...composition,
        clauses: composition.clauses.map((clause) => ({
          ...clause,
          predicates: clause.predicates.map((predicate) => ({
            ...predicate,
            left: migrateLegacyTransformsOnArgumentValue(predicate.left, transformsByInputId),
            ...(predicate.right
              ? { right: migrateLegacyTransformsOnArgumentValue(predicate.right, transformsByInputId) }
              : {}),
          })),
          thenOutput: migrateLegacyTransformsOnArgumentValue(clause.thenOutput, transformsByInputId),
        })),
        elseOutput: migrateLegacyTransformsOnArgumentValue(composition.elseOutput, transformsByInputId),
      };
    case 'valueMap':
      return {
        ...composition,
        mappings: composition.mappings.map((entry) => ({
          ...entry,
          output: migrateLegacyTransformsOnArgumentValue(entry.output, transformsByInputId),
        })),
        fallback: migrateLegacyTransformsOnArgumentValue(composition.fallback, transformsByInputId),
      };
    default:
      return composition;
  }
}

export function normalizeSmartBuilderDraft(draft: SmartBuilderDraft): SmartBuilderDraft {
  const sourceInputs = draft.inputs ?? draft.availableInputs ?? [];
  const transformsByInputId = new Map<string, readonly BuilderInputTransform[]>(
    sourceInputs
      .filter((input) => input.transforms.length > 0)
      .map((input) => [input.id, input.transforms] as const),
  );

  const availableInputs = sourceInputs.map((input) => ({
    ...input,
    transforms: [],
  }));
  const inputs = sourceInputs;

  const recipePreMigration = draft.recipe ?? draft.composition ?? null;
  const compositionPreMigration = draft.composition ?? draft.recipe ?? null;

  const recipe = migrateLegacyInputTransformsToComposition(recipePreMigration, transformsByInputId);
  const composition = migrateLegacyInputTransformsToComposition(compositionPreMigration, transformsByInputId);

  const resultSteps = draft.resultSteps ?? draft.postSteps ?? [];
  const postSteps = draft.postSteps ?? draft.resultSteps ?? [];

  const hasRecipe = recipe !== null || composition !== null;
  const recipeStatus = (draft.recipeStatus && (
    draft.recipeStatus.status === 'valid'
    || (draft.recipeStatus.status === 'invalid' && draft.recipeStatus.diagnostics.length > 0)
    || (draft.recipeStatus.status === 'incomplete' && draft.recipeStatus.reasons.length > 0)
  ))
    ? draft.recipeStatus
    : recipeStatusFromValidation(draft.validation);
  const validExpression = draft.validExpression
    ?? (recipeStatus.status === 'valid' && hasRecipe ? draft.expression : '');
  const lastValidExpression = draft.lastValidExpression
    ?? draft.validExpression
    ?? (recipeStatus.status === 'valid' && hasRecipe ? draft.expression : '');

  return {
    ...draft,
    availableInputs,
    inputs,
    recipe,
    composition,
    resultSteps,
    postSteps,
    recipeStatus,
    validExpression,
    lastValidExpression,
    undoHistory: draft.undoHistory ?? [],
  };
}

function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

function normalizeSingleParameterValue(
  definition: SmartBuilderActionParameterDefinition,
  raw: unknown,
): SmartBuilderActionParameterValue | undefined {
  if (raw === undefined || raw === null) return undefined;

  switch (definition.kind) {
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'string') {
        const lowered = raw.trim().toLowerCase();
        if (lowered === 'true') return true;
        if (lowered === 'false') return false;
      }
      return undefined;
    }
    case 'number': {
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      if (typeof raw === 'string' && raw.trim() !== '') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
      }
      return undefined;
    }
    case 'integer': {
      if (typeof raw === 'number' && Number.isFinite(raw) && isInteger(raw)) return raw;
      if (typeof raw === 'string' && raw.trim() !== '') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && isInteger(parsed)) return parsed;
      }
      return undefined;
    }
    case 'enum': {
      if (typeof raw !== 'string') return undefined;
      return raw;
    }
    case 'string':
    case 'dsl-expression': {
      if (typeof raw === 'string') return raw;
      if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
      return undefined;
    }
    default:
      return undefined;
  }
}

function defaultParameterValues(
  definitions: readonly SmartBuilderActionParameterDefinition[],
): Readonly<Record<string, SmartBuilderActionParameterValue>> {
  const values: Record<string, SmartBuilderActionParameterValue> = {};
  for (const definition of definitions) {
    if (definition.defaultValue !== undefined) {
      values[definition.id] = definition.defaultValue;
    }
  }
  return values;
}

export function normalizeActionParameterValues(input: {
  actionId: string;
  values?: Readonly<Record<string, unknown>>;
  includeDefaults?: boolean;
}): Readonly<Record<string, SmartBuilderActionParameterValue>> {
  const definitions = getSmartBuilderActionParameters(input.actionId);
  const baseValues = input.includeDefaults === false ? {} : defaultParameterValues(definitions);
  const merged: Record<string, SmartBuilderActionParameterValue> = { ...baseValues };

  const provided = input.values ?? {};
  for (const definition of definitions) {
    if (!(definition.id in provided)) continue;
    const normalized = normalizeSingleParameterValue(definition, provided[definition.id]);
    if (normalized !== undefined) {
      merged[definition.id] = normalized;
    }
  }

  return merged;
}

export function validateActionParameterDraft(input: {
  actionId: string;
  values?: Readonly<Record<string, unknown>>;
  includeDefaults?: boolean;
}): SmartBuilderActionParameterValidationResult {
  const definitions = getSmartBuilderActionParameters(input.actionId);
  const normalized = normalizeActionParameterValues(input);
  const issues: SmartBuilderActionParameterValidationIssue[] = [];

  for (const definition of definitions) {
    const value = normalized[definition.id];
    if (value === undefined) {
      if (definition.required) {
        issues.push({
          fieldId: definition.id,
          code: 'missing',
          message: `${definition.label} is required.`,
        });
      }
      continue;
    }

    if (definition.kind === 'enum') {
      const optionValues = definition.options?.map((option) => option.value) ?? [];
      if (optionValues.length > 0 && !optionValues.includes(String(value))) {
        issues.push({
          fieldId: definition.id,
          code: 'invalid-option',
          message: `${definition.label} must be one of: ${optionValues.join(', ')}.`,
        });
      }
    }

    if ((definition.kind === 'number' || definition.kind === 'integer') && typeof value !== 'number') {
      issues.push({
        fieldId: definition.id,
        code: 'invalid-type',
        message: `${definition.label} must be a ${definition.kind}.`,
      });
      continue;
    }

    if (definition.kind === 'integer' && typeof value === 'number' && !isInteger(value)) {
      issues.push({
        fieldId: definition.id,
        code: 'invalid-type',
        message: `${definition.label} must be an integer.`,
      });
      continue;
    }

    if ((definition.kind === 'string' || definition.kind === 'dsl-expression' || definition.kind === 'enum')
      && typeof value !== 'string') {
      issues.push({
        fieldId: definition.id,
        code: 'invalid-type',
        message: `${definition.label} must be text.`,
      });
      continue;
    }

    if (definition.kind === 'boolean' && typeof value !== 'boolean') {
      issues.push({
        fieldId: definition.id,
        code: 'invalid-type',
        message: `${definition.label} must be true or false.`,
      });
      continue;
    }

    if (typeof value === 'number') {
      if (definition.constraints?.min !== undefined && value < definition.constraints.min) {
        issues.push({
          fieldId: definition.id,
          code: 'too-small',
          message: `${definition.label} must be >= ${definition.constraints.min}.`,
        });
      }
      if (definition.constraints?.max !== undefined && value > definition.constraints.max) {
        issues.push({
          fieldId: definition.id,
          code: 'too-large',
          message: `${definition.label} must be <= ${definition.constraints.max}.`,
        });
      }
    }

    if (typeof value === 'string') {
      const allowEmpty = definition.constraints?.allowEmpty === true;
      if (!allowEmpty && value.length === 0) {
        issues.push({
          fieldId: definition.id,
          code: 'empty-not-allowed',
          message: `${definition.label} cannot be empty.`,
        });
      }
      if (definition.constraints?.minLength !== undefined && value.length < definition.constraints.minLength) {
        issues.push({
          fieldId: definition.id,
          code: 'too-short',
          message: `${definition.label} must be at least ${definition.constraints.minLength} characters.`,
        });
      }
      if (definition.constraints?.maxLength !== undefined && value.length > definition.constraints.maxLength) {
        issues.push({
          fieldId: definition.id,
          code: 'too-long',
          message: `${definition.label} must be at most ${definition.constraints.maxLength} characters.`,
        });
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

export function createActionParameterDraft(input: {
  actionId: string;
  values?: Readonly<Record<string, unknown>>;
}): SmartBuilderActionParameterDraft {
  const values = normalizeActionParameterValues({
    actionId: input.actionId,
    values: input.values,
  });
  const validation = validateActionParameterDraft({
    actionId: input.actionId,
    values,
  });
  return {
    actionId: input.actionId,
    values,
    validation,
  };
}

export function serializeActionParameterDraft(
  draft: SmartBuilderActionParameterDraft,
): Readonly<Record<string, SmartBuilderActionParameterValue>> {
  return normalizeActionParameterValues({
    actionId: draft.actionId,
    values: draft.values,
  });
}

function toArgumentValueFromDslExpression(raw: string): BuilderArgumentValue {
  const expression = raw.trim();
  const quoted = expression.match(/^"([\s\S]*)"$/);
  if (quoted) {
    return {
      kind: 'static',
      value: quoted[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\') ?? '',
    };
  }

  if (expression === 'null') {
    return { kind: 'static', value: null };
  }
  if (expression === 'true') {
    return { kind: 'static', value: true };
  }
  if (expression === 'false') {
    return { kind: 'static', value: false };
  }
  if (expression.length > 0 && Number.isFinite(Number(expression))) {
    return { kind: 'static', value: Number(expression) };
  }

  return {
    kind: 'expression',
    expression,
  };
}

function resolveParameterDraftByActionId(
  draft: SmartBuilderDraft,
  actionId: string,
): SmartBuilderActionParameterDraft | null {
  const pending = draft.pendingActionDraft;
  if (!pending || pending.actionId !== actionId) return null;
  return pending;
}

export function getValidatedActionParameters(input: {
  draft: SmartBuilderDraft;
  actionId: string;
}): {
  readonly ok: true;
  readonly values: Readonly<Record<string, SmartBuilderActionParameterValue>>;
} | {
  readonly ok: false;
  readonly issues: readonly SmartBuilderActionParameterValidationIssue[];
} {
  const pending = resolveParameterDraftByActionId(input.draft, input.actionId);
  if (pending) {
    if (!pending.validation.isValid) {
      return {
        ok: false,
        issues: pending.validation.issues,
      };
    }

    return {
      ok: true,
      values: serializeActionParameterDraft(pending),
    };
  }

  const validation = validateActionParameterDraft({
    actionId: input.actionId,
    values: {},
  });

  if (!validation.isValid) {
    return {
      ok: false,
      issues: validation.issues,
    };
  }

  return {
    ok: true,
    values: normalizeActionParameterValues({
      actionId: input.actionId,
      values: {},
    }),
  };
}

export function toSmartBuilderTransformArgsFromParameters(input: {
  actionId: string;
  values: Readonly<Record<string, SmartBuilderActionParameterValue>>;
}): readonly BuilderArgumentValue[] | undefined {
  const values = input.values;

  switch (input.actionId) {
    case 'text.substring': {
      const start = typeof values.start === 'number' ? values.start : 0;
      const length = typeof values.length === 'number' ? values.length : undefined;
      return length === undefined
        ? [{ kind: 'static', value: start }]
        : [{ kind: 'static', value: start }, { kind: 'static', value: length }];
    }
    case 'text.replace': {
      const match = typeof values.match === 'string' ? values.match : '';
      const replacement = typeof values.replacement === 'string' ? values.replacement : '';
      return [{ kind: 'static', value: match }, { kind: 'static', value: replacement }];
    }
    case 'text.split': {
      const delimiter = typeof values.delimiter === 'string' ? values.delimiter : ' ';
      const limit = typeof values.limit === 'number' ? values.limit : undefined;
      return limit === undefined
        ? [{ kind: 'static', value: delimiter }]
        : [{ kind: 'static', value: delimiter }, { kind: 'static', value: limit }];
    }
    case 'date.format': {
      const inputFormat = typeof values.inputFormat === 'string' ? values.inputFormat : 'ISO8601';
      const outputFormat = typeof values.outputFormat === 'string' ? values.outputFormat : 'YYYY-MM-DD';
      return [{ kind: 'static', value: inputFormat }, { kind: 'static', value: outputFormat }];
    }
    case 'number.round': {
      const decimals = typeof values.decimals === 'number' ? values.decimals : 0;
      return [{ kind: 'static', value: decimals }];
    }
    case 'array.nth': {
      const index = typeof values.index === 'number' ? values.index : 0;
      return [{ kind: 'static', value: index }];
    }
    case 'array.join': {
      const separator = typeof values.separator === 'string' ? values.separator : ',';
      return [{ kind: 'static', value: separator }];
    }
    case 'convert.cast': {
      const targetType = typeof values.targetType === 'string' ? values.targetType : 'string';
      return [{ kind: 'static', value: targetType }];
    }
    default:
      return undefined;
  }
}

export function toSmartBuilderCompositionPatchFromParameters(input: {
  actionId: string;
  values: Readonly<Record<string, SmartBuilderActionParameterValue>>;
  firstInputId?: string;
}): BuilderComposition | null {
  const values = input.values;

  switch (input.actionId) {
    case 'null.default': {
      if (!input.firstInputId) return null;
      const fallbackRaw = typeof values.fallbackExpression === 'string'
        ? values.fallbackExpression
        : null;
      const fallbackMode = typeof values.fallbackMode === 'string'
        ? values.fallbackMode
        : 'fixed';
      const fallbackFromMode = (() => {
        if (fallbackMode === 'null') return 'null';
        if (fallbackMode === 'constant') {
          const constantName = typeof values.fallbackConstantName === 'string' && values.fallbackConstantName.trim().length > 0
            ? values.fallbackConstantName.trim()
            : 'DEFAULT_CONSTANT';
          return `constant("${constantName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
        }
        if (fallbackMode === 'input') {
          const inputId = typeof values.fallbackInputId === 'string' ? values.fallbackInputId.trim() : '';
          if (inputId.length > 0) {
            return `source("${inputId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
          }
          return '""';
        }

        if (typeof values.fallbackFixedNumber === 'number') {
          return String(values.fallbackFixedNumber);
        }
        if (typeof values.fallbackFixedBoolean === 'boolean') {
          return values.fallbackFixedBoolean ? 'true' : 'false';
        }
        if (typeof values.fallbackFixedString === 'string') {
          return `"${values.fallbackFixedString.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
        return '""';
      })();
      const resolvedFallbackRaw = fallbackRaw ?? fallbackFromMode;
      return {
        kind: 'default',
        inputId: input.firstInputId,
        fallback: toArgumentValueFromDslExpression(resolvedFallbackRaw),
      };
    }
    default:
      return null;
  }
}

export function updateSmartBuilderExpression(
  draft: SmartBuilderDraft,
  expression: string,
): SmartBuilderDraft {
  const normalized = normalizeSmartBuilderDraft(draft);
  const evaluatedStatus = evaluateSmartBuilderRecipeStatus({
    draft: normalized,
    expression,
  });

  const shouldPreserveLastValidExpression =
    evaluatedStatus.status === 'incomplete' && evaluatedStatus.reasons.length > 0;

  const activeExpression = shouldPreserveLastValidExpression
    ? (normalized.lastValidExpression
      ?? normalized.validExpression
      ?? normalized.expression
      ?? '')
    : expression;

  const previousExpressions = activeExpression !== normalized.expression && normalized.expression
    ? [...normalized.previousExpressions, normalized.expression]
    : normalized.previousExpressions;

  const next: SmartBuilderDraft = {
    ...normalized,
    previousExpressions,
    recipeStatus: evaluatedStatus,
    expression: activeExpression,
    validExpression: evaluatedStatus.status === 'valid'
      ? activeExpression
      : (normalized.validExpression ?? ''),
    lastValidExpression: evaluatedStatus.status === 'valid'
      ? activeExpression
      : (normalized.lastValidExpression ?? normalized.validExpression ?? ''),
  };

  return normalizeSmartBuilderDraft(next);
}

function isArgumentMissing(
  draft: SmartBuilderDraft,
  value: BuilderArgumentValue | undefined,
  options?: { treatEmptyStaticStringAsMissing?: boolean },
): boolean {
  if (!value) return true;

  if (value.kind === 'input') {
    if (!value.inputId || value.inputId.trim().length === 0) return true;
    return !draft.inputs.some((input) => input.id === value.inputId);
  }

  if (value.kind === 'expression') {
    return value.expression.trim().length === 0;
  }

  if (typeof value.value === 'string' && options?.treatEmptyStaticStringAsMissing) {
    return value.value.trim().length === 0;
  }

  return false;
}

function isConfiguredStaticValue(value: unknown, explicitlySet = false): boolean {
  if (typeof value === 'string') return value.length > 0 || explicitlySet;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (value === null) return explicitlySet;
  return false;
}

function evaluateSmartBuilderRecipeStatus(input: {
  draft: SmartBuilderDraft;
  expression: string;
}): SmartBuilderRecipeStatus {
  const composition = input.draft.composition;
  if (!composition) {
    return { status: 'incomplete', reasons: [] };
  }

  const reasons: string[] = [];

  switch (composition.kind) {
    case 'advancedExpression': {
      if (composition.expression.trim().length === 0) {
        reasons.push('Expression is required.');
      }
      break;
    }
    case 'direct': {
      if (composition.value) {
        if (composition.value.kind === 'static') {
          if (!isConfiguredStaticValue(composition.value.value, composition.fixedValueExplicitlySet === true)) {
            reasons.push('Select a fixed value.');
          }
          break;
        }

        if (isArgumentMissing(input.draft, composition.value)) {
          reasons.push('Select a value for direct mapping.');
        }
      } else {
        const hasInput = input.draft.inputs.some((entry) => entry.id === composition.inputId);
        if (!hasInput) {
          reasons.push('Select a source input.');
        }
      }
      break;
    }
    case 'concat': {
      const hasParts = (composition.parts?.length ?? 0) > 0;
      const hasInputIds = (composition.inputIds?.length ?? 0) > 0;
      if (!hasParts && !hasInputIds) {
        reasons.push('Add at least one value to combine.');
      }
      break;
    }
    case 'coalesce': {
      const hasValues = (composition.values?.length ?? 0) > 0;
      const hasInputIds = (composition.inputIds?.length ?? 0) > 0;
      if (!hasValues && !hasInputIds) {
        reasons.push('Add at least one value to Use first available.');
      }
      break;
    }
    case 'default': {
      const hasInput = input.draft.inputs.some((entry) => entry.id === composition.inputId);
      if (!hasInput) {
        reasons.push('Select a primary input.');
      }
      if (isArgumentMissing(input.draft, composition.fallback)) {
        reasons.push('Fallback value is required.');
      }
      break;
    }
    case 'math': {
      const hasOps = (composition.operations?.length ?? 0) > 0 || (composition.inputIds?.length ?? 0) > 1;
      if (!hasOps) {
        reasons.push('Add at least one calculation operation.');
      }
      if (composition.startInputId && !input.draft.inputs.some((entry) => entry.id === composition.startInputId)) {
        reasons.push('Select a starting value for calculation.');
      }
      if (composition.operations?.some((operation) => !operation.inputId && !operation.operand)) {
        reasons.push('Each calculation operation needs an operand.');
      }
      break;
    }
    case 'condition': {
      if (composition.clauses.length === 0) {
        reasons.push('Add at least one condition.');
        break;
      }

      for (const clause of composition.clauses) {
        if (clause.predicates.length === 0) {
          reasons.push('Add at least one predicate.');
          continue;
        }

        for (const predicate of clause.predicates) {
          if (isArgumentMissing(input.draft, predicate.left, { treatEmptyStaticStringAsMissing: true })) {
            reasons.push('IF left value is required.');
          }
          if (
            predicate.operator !== 'isNull'
            && predicate.operator !== 'isNotNull'
            && predicate.operator !== 'isTruthy'
            && predicate.operator !== 'isFalsy'
            && isArgumentMissing(input.draft, predicate.right, { treatEmptyStaticStringAsMissing: true })
          ) {
            reasons.push('IF comparison value is required.');
          }
        }

        if (isArgumentMissing(input.draft, clause.thenOutput, { treatEmptyStaticStringAsMissing: true })) {
          reasons.push('THEN value is required.');
        }
      }

      if (isArgumentMissing(input.draft, composition.elseOutput, { treatEmptyStaticStringAsMissing: true })) {
        reasons.push('OTHERWISE value is required.');
      }
      break;
    }
    case 'valueMap': {
      const hasLookupInput = input.draft.inputs.some((entry) => entry.id === composition.inputId);
      if (!hasLookupInput) {
        reasons.push('Select a lookup value.');
      }
      if (composition.scope === 'project' && !composition.project) {
        reasons.push('Select a project value table.');
      }
      break;
    }
    case 'arrayBuild':
    case 'arrayMerge': {
      if ((composition.inputIds?.length ?? 0) === 0) {
        reasons.push('Select at least one array input.');
      }
      break;
    }
  }

  if (reasons.length > 0) {
    return {
      status: 'incomplete',
      reasons: [...new Set(reasons)],
    };
  }

  if (input.expression.trim().length === 0) {
    return {
      status: 'incomplete',
      reasons: ['Finish required values to generate an expression.'],
    };
  }

  return { status: 'valid' };
}

export function isSmartBuilderDraftSaveBlocked(draft: SmartBuilderDraft): boolean {
  const normalized = normalizeSmartBuilderDraft(draft);
  const status = normalized.recipeStatus;
  return status.status === 'incomplete' && status.reasons.length > 0;
}

export function undoSmartBuilderExpression(draft: SmartBuilderDraft): SmartBuilderDraft {
  const normalized = normalizeSmartBuilderDraft(draft);
  if ((normalized.undoHistory ?? []).length > 0) {
    const history = normalized.undoHistory ?? [];
    const snapshot = history[history.length - 1];
    const remainingHistory = history.slice(0, -1);
    if (!snapshot) return normalized;

    const restored: SmartBuilderDraft = {
      ...normalized,
      availableInputs: snapshot.availableInputs ?? snapshot.inputs ?? normalized.availableInputs,
      inputs: snapshot.inputs ?? snapshot.availableInputs ?? normalized.inputs,
      focusedSlotId: snapshot.focusedSlotId ?? null,
      slotScopedInputs: snapshot.slotScopedInputs ?? {},
      recipe: snapshot.recipe ?? snapshot.composition ?? null,
      composition: snapshot.composition ?? snapshot.recipe ?? null,
      resultSteps: snapshot.resultSteps ?? snapshot.postSteps ?? [],
      postSteps: snapshot.postSteps ?? snapshot.resultSteps ?? [],
      recipeStatus: snapshot.recipeStatus,
      validation: snapshot.validation ?? normalized.validation,
      expression: snapshot.expression,
      validExpression: snapshot.validExpression,
      lastValidExpression: snapshot.lastValidExpression,
      previousExpressions: snapshot.previousExpressions ?? normalized.previousExpressions.slice(0, -1),
      pendingActionDraft: snapshot.pendingActionDraft ?? null,
      undoHistory: remainingHistory,
    };

    return normalizeSmartBuilderDraft(restored);
  }

  if (normalized.previousExpressions.length === 0) return normalized;
  const nextHistory = normalized.previousExpressions.slice(0, -1);
  const restored = normalized.previousExpressions[normalized.previousExpressions.length - 1] ?? '';
  return normalizeSmartBuilderDraft({
    ...normalized,
    previousExpressions: nextHistory,
    expression: restored,
  });
}

export function resolveOrderedInputIds(
  draft: SmartBuilderDraft,
  explicitInputIds?: readonly string[],
): readonly string[] {
  if (explicitInputIds && explicitInputIds.length > 0) return explicitInputIds;
  return draft.inputs.map((input) => input.id);
}

export function setSlotScopedInput(
  draft: SmartBuilderDraft,
  slotId: string,
  input: BuilderInput,
): SmartBuilderDraft {
  return {
    ...draft,
    slotScopedInputs: {
      ...(draft.slotScopedInputs ?? {}),
      [slotId]: input,
    },
  };
}

/**
 * Supported hydration scope (Rev 1):
 * - direct `source("path")`
 * - direct `external("alias")`
 * - direct `get(external("alias"), "path")`
 * - direct `static(...)`
 * - transform chains whose base is one of the above and whose steps are simple function wraps
 */
export function hydrateSmartBuilderFromExpression(input: {
  expression: string;
  targetPath: string;
  targetType: BuilderValueType;
  isRequired: boolean;
  sourceValueTypeByPath?: Readonly<Record<string, BuilderValueType>>;
  ruleValueTableRef?: MappingRuleValueTableRef;
  ruleNoMatchBehavior?: MappingRuleNoMatchBehavior;
}): SmartBuilderHydrationResult {
  const expression = input.expression.trim();
  if (!expression) {
    return { kind: 'guided', draft: createEmptySmartBuilderDraft(input) };
  }

  const parsed = parse(expression);
  if (!parsed.success || !parsed.ast) {
    return { kind: 'advanced', expression, reason: 'parse-failed' };
  }

  const resolveSourceValueType = (path: string): BuilderValueType => input.sourceValueTypeByPath?.[path] ?? 'unknown';

  const hydratedValueMap = hydrateValueMapCompositionFromExpression(expression, {
    resolveSourceValueType,
    ruleValueTableRef: input.ruleValueTableRef,
    ruleNoMatchBehavior: input.ruleNoMatchBehavior,
  });
  if (hydratedValueMap) {
    const draft: SmartBuilderDraft = {
      ...createEmptySmartBuilderDraft(input),
      inputs: [hydratedValueMap.primaryInput],
      composition: {
        kind: 'valueMap',
        inputId: hydratedValueMap.primaryInput.id,
        matchMode: hydratedValueMap.matchMode,
        scope: hydratedValueMap.scope,
        project: hydratedValueMap.project,
        mappings: hydratedValueMap.mappings,
        fallback: hydratedValueMap.fallback,
        ...(hydratedValueMap.noMatchBehavior ? { noMatchBehavior: hydratedValueMap.noMatchBehavior } : {}),
      },
    };
    const draftForGeneration = normalizeSmartBuilderDraft(draft);
    const generated = generateSmartBuilderExpression(draftForGeneration);

    return {
      kind: 'guided',
      draft: {
        ...draftForGeneration,
        expression: generated,
        validation: generated ? { status: 'valid' } : { status: 'pending' },
      },
    };
  }

  const hydratedCondition = hydrateConditionCompositionFromAst(parsed.ast, {
    resolveSourceValueType,
  });
  if (hydratedCondition) {
    const draft: SmartBuilderDraft = {
      ...createEmptySmartBuilderDraft(input),
      inputs: hydratedCondition.inputs,
      composition: hydratedCondition.composition,
    };
    const draftForGeneration = normalizeSmartBuilderDraft(draft);
    const generated = generateSmartBuilderExpression(draftForGeneration);

    return {
      kind: 'guided',
      draft: {
        ...draftForGeneration,
        expression: generated,
        validation: generated ? { status: 'valid' } : { status: 'pending' },
      },
    };
  }

  const hydratedRecipe = hydrateRepresentableRecipeCompositionFromAst(parsed.ast, expression, {
    resolveSourceValueType,
  });
  if (hydratedRecipe) {
    const draft: SmartBuilderDraft = {
      ...createEmptySmartBuilderDraft(input),
      inputs: hydratedRecipe.inputs,
      composition: hydratedRecipe.composition,
    };
    const draftForGeneration = normalizeSmartBuilderDraft(draft);
    const generated = generateSmartBuilderExpression(draftForGeneration);

    return {
      kind: 'guided',
      draft: {
        ...draftForGeneration,
        expression: generated,
        validation: generated ? { status: 'valid' } : { status: 'pending' },
      },
    };
  }

  const hydratedDefault = hydrateDefaultCompositionFromExpression(expression, {
    resolveSourceValueType,
  });

  const hydrated = hydratedDefault
    ? hydratedDefault.primaryInput
    : hydrateFromSupportedExpression(expression, { resolveSourceValueType });
  if (!hydrated) {
    const conditionClassification = classifyUnsupportedConditional(parsed.ast);
    return {
      kind: 'advanced',
      expression,
      reason: conditionClassification ? 'complex-expression' : 'unsupported-decomposition',
      ...(conditionClassification ? { classification: conditionClassification } : {}),
    };
  }

  const draft: SmartBuilderDraft = {
    ...createEmptySmartBuilderDraft(input),
    inputs: [hydrated],
    composition: hydratedDefault
      ? {
          kind: 'default',
          inputId: hydrated.id,
          fallback: hydratedDefault.fallback,
        }
      : { kind: 'direct', inputId: hydrated.id },
  };
  const draftForGeneration = normalizeSmartBuilderDraft(draft);
  const generated = generateSmartBuilderExpression(draftForGeneration);

  return {
    kind: 'guided',
    draft: {
      ...draftForGeneration,
      expression: generated,
      validation: generated ? { status: 'valid' } : { status: 'pending' },
    },
  };
}

type RecipeHydrationContext = {
  resolveSourceValueType: (path: string) => BuilderValueType;
};

type RecipeHydrationResult = {
  readonly inputs: readonly BuilderInput[];
  readonly composition: BuilderComposition;
};

type RecipeInputRegistry = {
  readonly bySignature: Map<string, BuilderInput>;
  readonly ordered: BuilderInput[];
};

function createRecipeInputRegistry(): RecipeInputRegistry {
  return {
    bySignature: new Map(),
    ordered: [],
  };
}

function astNodeToStaticValue(node: AstNode): unknown | undefined {
  switch (node.type) {
    case 'StringLiteral':
      return node.value;
    case 'NumberLiteral':
      return node.value;
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'ObjectTemplate': {
      const output: Record<string, unknown> = {};
      for (const property of node.properties) {
        const value = astNodeToStaticValue(property.value);
        if (value === undefined) return undefined;
        output[property.key] = value;
      }
      return output;
    }
    default:
      return undefined;
  }
}

function registerRecipeInput(
  registry: RecipeInputRegistry,
  signature: string,
  builder: () => Omit<BuilderInput, 'id' | 'transforms'>,
): BuilderInput {
  const existing = registry.bySignature.get(signature);
  if (existing) return existing;

  const next: BuilderInput = {
    id: `input-${registry.ordered.length + 1}`,
    ...builder(),
    transforms: [],
  };
  registry.bySignature.set(signature, next);
  registry.ordered.push(next);
  return next;
}

function tryHydrateRecipeInputFromAstNode(
  node: AstNode,
  registry: RecipeInputRegistry,
  context: RecipeHydrationContext,
): BuilderInput | null {
  if (node.type !== 'FunctionCall') return null;

  if (node.name === 'source') {
    const [pathArg] = node.arguments;
    if (!pathArg || pathArg.type !== 'StringLiteral') return null;
    const path = pathArg.value;
    return registerRecipeInput(registry, `primary:${path}`, () => ({
      sourceKind: 'primary',
      label: path,
      path,
      valueType: context.resolveSourceValueType(path),
    }));
  }

  if (node.name === 'external') {
    const [aliasArg] = node.arguments;
    if (!aliasArg || aliasArg.type !== 'StringLiteral') return null;
    const alias = aliasArg.value;
    return registerRecipeInput(registry, `enrichment:${alias}:`, () => ({
      sourceKind: 'enrichment',
      label: alias,
      externalName: alias,
      valueType: 'unknown',
    }));
  }

  if (node.name === 'get') {
    const [externalArg, pathArg] = node.arguments;
    if (!externalArg || !pathArg) return null;
    if (externalArg.type !== 'FunctionCall' || externalArg.name !== 'external') return null;
    const [aliasArg] = externalArg.arguments;
    if (!aliasArg || aliasArg.type !== 'StringLiteral' || pathArg.type !== 'StringLiteral') return null;
    const alias = aliasArg.value;
    const path = pathArg.value;
    return registerRecipeInput(registry, `enrichment:${alias}:${path}`, () => ({
      sourceKind: 'enrichment',
      label: `${alias}.${path}`,
      externalName: alias,
      path,
      valueType: 'unknown',
    }));
  }

  if (node.name === 'constant') {
    const [constantArg] = node.arguments;
    if (!constantArg || constantArg.type !== 'StringLiteral') return null;
    const constantName = constantArg.value;
    return registerRecipeInput(registry, `constant:${constantName}`, () => ({
      sourceKind: 'constant',
      label: constantName,
      constantName,
      valueType: 'unknown',
    }));
  }

  if (node.name === 'item') {
    const [pathArg] = node.arguments;
    const path = pathArg?.type === 'StringLiteral' ? pathArg.value : '';
    return registerRecipeInput(registry, `item:${path}`, () => ({
      sourceKind: 'item',
      label: path || 'item',
      ...(path ? { path } : {}),
      valueType: 'unknown',
    }));
  }

  if (node.name === 'parent') {
    const [pathArg] = node.arguments;
    const path = pathArg?.type === 'StringLiteral' ? pathArg.value : '';
    return registerRecipeInput(registry, `parent:${path}`, () => ({
      sourceKind: 'parent',
      label: path || 'parent',
      ...(path ? { path } : {}),
      valueType: 'unknown',
    }));
  }

  if (node.name === 'static') {
    const [staticArg] = node.arguments;
    if (!staticArg) return null;
    const staticValue = astNodeToStaticValue(staticArg);
    if (staticValue === undefined) return null;
    const serialized = JSON.stringify(staticValue);
    const valueType: BuilderValueType = staticValue === null
      ? 'null'
      : typeof staticValue === 'string'
        ? 'string'
        : typeof staticValue === 'number'
          ? 'number'
          : typeof staticValue === 'boolean'
            ? 'boolean'
            : Array.isArray(staticValue)
              ? 'array'
              : typeof staticValue === 'object'
                ? 'object'
                : 'unknown';
    return registerRecipeInput(registry, `static:${serialized}`, () => ({
      sourceKind: 'static',
      label: 'Fixed value',
      staticValue,
      valueType,
    }));
  }

  return null;
}

function tryHydrateRepresentableMathComposition(
  node: AstNode,
  registry: RecipeInputRegistry,
  context: RecipeHydrationContext,
): Extract<BuilderComposition, { kind: 'math' }> | null {
  if (node.type !== 'FunctionCall') return null;
  if (node.name !== 'add' && node.name !== 'subtract' && node.name !== 'multiply' && node.name !== 'divide') {
    return null;
  }

  type MathOperation = { readonly operator: 'add' | 'subtract' | 'multiply' | 'divide'; readonly inputId: string };

  const collect = (current: AstNode): { readonly startInputId: string; readonly operations: readonly MathOperation[] } | null => {
    if (
      current.type === 'FunctionCall'
      && (current.name === 'add' || current.name === 'subtract' || current.name === 'multiply' || current.name === 'divide')
    ) {
      if (current.arguments.length !== 2) return null;
      const [leftNode, rightNode] = current.arguments;
      if (!leftNode || !rightNode) return null;

      const leftCollected = collect(leftNode);
      if (!leftCollected) return null;

      const rightInput = tryHydrateRecipeInputFromAstNode(rightNode, registry, context);
      if (!rightInput) return null;

      return {
        startInputId: leftCollected.startInputId,
        operations: [
          ...leftCollected.operations,
          { operator: current.name, inputId: rightInput.id },
        ],
      };
    }

    const input = tryHydrateRecipeInputFromAstNode(current, registry, context);
    if (!input) return null;
    return {
      startInputId: input.id,
      operations: [],
    };
  };

  const collected = collect(node);
  if (!collected || collected.operations.length === 0) return null;

  return {
    kind: 'math',
    startInputId: collected.startInputId,
    operations: collected.operations,
  };
}

function hydrateRepresentableRecipeCompositionFromAst(
  ast: AstNode | null,
  expression: string,
  context: RecipeHydrationContext,
): RecipeHydrationResult | null {
  if (!ast || ast.type !== 'FunctionCall') return null;

  const registry = createRecipeInputRegistry();

  if (ast.name === 'concat') {
    const argumentsList = [...ast.arguments];
    if (argumentsList.length === 0) return null;

    const parts = argumentsList.map((argument) => {
      const staticValue = astNodeToStaticValue(argument);
      if (staticValue !== undefined) {
        return { kind: 'static' as const, value: staticValue };
      }

      const input = tryHydrateRecipeInputFromAstNode(argument, registry, context);
      if (input) {
        return { kind: 'input' as const, inputId: input.id };
      }

      return null;
    });

    if (parts.some((part) => part === null)) return null;

    const explicitInputIds = parts
      .filter((part): part is Extract<BuilderArgumentValue, { kind: 'input' }> => Boolean(part) && part.kind === 'input')
      .map((part) => part.inputId);

    return {
      inputs: registry.ordered,
      composition: {
        kind: 'concat',
        inputIds: explicitInputIds,
        parts: parts.filter((part): part is BuilderArgumentValue => Boolean(part)),
      },
    };
  }

  if (ast.name === 'coalesce') {
    const argumentsList = [...ast.arguments];
    if (argumentsList.length === 0) return null;

    const toArgumentValue = (node: AstNode): BuilderArgumentValue | null => {
      const input = tryHydrateRecipeInputFromAstNode(node, registry, context);
      if (input) return { kind: 'input', inputId: input.id };

      const staticValue = astNodeToStaticValue(node);
      if (staticValue !== undefined) {
        return { kind: 'static', value: staticValue };
      }

      return null;
    };

    const valuesRaw = argumentsList.map((argument) => toArgumentValue(argument));
    if (valuesRaw.some((value) => value === null)) return null;

    const valuesAll = valuesRaw.filter((value): value is BuilderArgumentValue => Boolean(value));
    const values = valuesAll.length > 1 ? valuesAll.slice(0, -1) : valuesAll;
    const fallbackCandidate = valuesAll.length > 1 ? valuesAll[valuesAll.length - 1] : undefined;
    const fallback = fallbackCandidate?.kind === 'input' ? undefined : fallbackCandidate;

    const explicitInputIds = values
      .filter((value): value is Extract<BuilderArgumentValue, { kind: 'input' }> => value.kind === 'input')
      .map((value) => value.inputId);

    return {
      inputs: registry.ordered,
      composition: {
        kind: 'coalesce',
        inputIds: explicitInputIds,
        values,
        ...(fallback ? { fallback } : {}),
      },
    };
  }

  if (ast.name === 'array') {
    const inputIds = ast.arguments
      .map((argument) => tryHydrateRecipeInputFromAstNode(argument, registry, context)?.id ?? null);
    if (inputIds.length === 0 || !inputIds.every((id): id is string => Boolean(id))) return null;
    return {
      inputs: registry.ordered,
      composition: {
        kind: 'arrayBuild',
        inputIds,
      },
    };
  }

  if (ast.name === 'merge') {
    const inputIds = ast.arguments
      .map((argument) => tryHydrateRecipeInputFromAstNode(argument, registry, context)?.id ?? null);
    if (inputIds.length === 0 || !inputIds.every((id): id is string => Boolean(id))) return null;
    return {
      inputs: registry.ordered,
      composition: {
        kind: 'arrayMerge',
        inputIds,
      },
    };
  }

  const hydratedMath = tryHydrateRepresentableMathComposition(ast, registry, context);
  if (hydratedMath) {
    return {
      inputs: registry.ordered,
      composition: hydratedMath,
    };
  }

  return null;
}

function classifyUnsupportedConditional(
  ast: AstNode | null,
): SmartBuilderHydrationResult extends { readonly kind: 'advanced'; readonly classification?: infer T }
  ? T | undefined
  : undefined {
  /**
   * Deterministic fallback contract for legacy/advanced conditional hydration:
   * - classify nested logical groups (`and(..., or(...))`) as nested-condition-groups
   * - classify unsupported predicate operators as unsupported-condition-operator
   * - classify any non-lossless value shape (including transformed per-usage operands/branches)
   *   as non-lossless-condition-value
   *
   * In all classified cases, hydration must preserve original DSL unchanged and route
   * authoring to Advanced mode (guided reconstruction is intentionally skipped).
   */
  if (!ast || ast.type !== 'FunctionCall' || ast.name !== 'if') return undefined;

  const [predicateArg] = ast.arguments;
  const predicateClassification = classifyPredicateNode(predicateArg);
  if (predicateClassification) return predicateClassification;

  if (!expressionHasLosslessConditionValues(ast)) {
    return 'non-lossless-condition-value';
  }

  return undefined;
}

function expressionHasLosslessConditionValues(ast: AstNode | null): boolean {
  if (!ast || ast.type !== 'FunctionCall' || ast.name !== 'if') return true;

  const [predicate, thenArg, elseArg] = ast.arguments;
  if (!predicate || !thenArg || !elseArg) return false;

  const isLosslessArg = (node: typeof predicate): boolean => {
    if (!node) return false;
    if (
      node.type === 'StringLiteral'
      || node.type === 'NumberLiteral'
      || node.type === 'BooleanLiteral'
      || node.type === 'NullLiteral'
    ) {
      return true;
    }

    if (node.type === 'FunctionCall') {
      if (node.name === 'source') {
        return node.arguments.length === 1 && node.arguments[0]?.type === 'StringLiteral';
      }

      if (node.name === 'external') {
        return node.arguments.length === 1 && node.arguments[0]?.type === 'StringLiteral';
      }

      if (node.name === 'get') {
        return node.arguments.length === 2
          && node.arguments[0]?.type === 'FunctionCall'
          && node.arguments[0].name === 'external'
          && node.arguments[0].arguments[0]?.type === 'StringLiteral'
          && node.arguments[1]?.type === 'StringLiteral';
      }
    }

    return false;
  };

  if (!isLosslessArg(thenArg) || !isLosslessArg(elseArg)) {
    return false;
  }

  const validatePredicate = (node: typeof predicate): boolean => {
    if (!node || node.type !== 'FunctionCall') return false;

    if (node.name === 'and' || node.name === 'or') {
      return node.arguments.every((argument) => validatePredicate(argument));
    }

    if (node.name === 'not') {
      const [first] = node.arguments;
      return Boolean(first && first.type === 'FunctionCall' && first.name === 'isNull' && validatePredicate(first));
    }

    if (node.name === 'isNull') {
      return node.arguments.length === 1 && isLosslessArg(node.arguments[0]);
    }

    if (!SUPPORTED_BINARY_OPERATORS.includes(node.name as (typeof SUPPORTED_BINARY_OPERATORS)[number])) {
      return false;
    }

    return node.arguments.length === 2
      && isLosslessArg(node.arguments[0])
      && isLosslessArg(node.arguments[1]);
  };

  return validatePredicate(predicate);
}

function classifyPredicateNode(
  node: AstNode | undefined,
): 'nested-condition-groups' | 'unsupported-condition-operator' | undefined {
  if (!node || node.type !== 'FunctionCall') return undefined;

  if (node.name === 'and' || node.name === 'or') {
    const hasNestedGroup = node.arguments.some((argument) =>
      argument.type === 'FunctionCall' && (argument.name === 'and' || argument.name === 'or'),
    );
    if (hasNestedGroup) return 'nested-condition-groups';

    for (const argument of node.arguments) {
      const nested = classifyPredicateNode(argument);
      if (nested) return nested;
    }
    return undefined;
  }

  if (
    SUPPORTED_BINARY_OPERATORS.includes(node.name as (typeof SUPPORTED_BINARY_OPERATORS)[number])
    || SUPPORTED_UNARY_OPERATORS.includes(node.name as (typeof SUPPORTED_UNARY_OPERATORS)[number])
  ) {
    return undefined;
  }

  if (node.name === 'not') {
    const [first] = node.arguments;
    if (first?.type === 'FunctionCall' && first.name === 'isNull') {
      return undefined;
    }
    return 'unsupported-condition-operator';
  }

  return 'unsupported-condition-operator';
}

export function getBuilderInputUsages(draft: SmartBuilderDraft): readonly BuilderInputUsage[] {
  const composition = draft.composition;
  if (!composition) return [];

  const usages: BuilderInputUsage[] = [];

  const pushUsage = (usage: BuilderInputUsage) => {
    usages.push(usage);
  };

  const collectFromTransformStepArgs = (
    steps: readonly BuilderInputTransform[] | undefined,
    location: BuilderInputUsageLocation,
    meta?: Omit<BuilderInputUsage, 'inputId' | 'location'>,
  ) => {
    for (let stepIndex = 0; stepIndex < (steps?.length ?? 0); stepIndex += 1) {
      const step = steps?.[stepIndex];
      if (!step) continue;
      const args = step.args ?? [];
      for (let argIndex = 0; argIndex < args.length; argIndex += 1) {
        const arg = args[argIndex];
        if (!arg) continue;
        collectFromArgument(arg, location, {
          ...meta,
          stepIndex,
          argIndex,
        });
      }
    }
  };

  const collectFromArgument = (
    value: BuilderArgumentValue,
    location: BuilderInputUsageLocation,
    meta?: Omit<BuilderInputUsage, 'inputId' | 'location'>,
  ) => {
    if (value.kind === 'input') {
      pushUsage({
        inputId: value.inputId,
        location,
        ...(meta ?? {}),
      });
    }

    collectFromTransformStepArgs(value.transforms, location, meta);
  };

  switch (composition.kind) {
    case 'direct': {
      if (composition.value) {
        collectFromArgument(composition.value, 'direct');
      } else {
        pushUsage({ inputId: composition.inputId, location: 'direct' });
      }
      break;
    }
    case 'concat': {
      if (composition.parts && composition.parts.length > 0) {
        composition.parts.forEach((part, valueIndex) => {
          collectFromArgument(part, 'concat-part', { valueIndex });
        });
      } else {
        (composition.inputIds ?? []).forEach((inputId, valueIndex) => {
          pushUsage({ inputId, location: 'concat-part', valueIndex });
        });
      }
      break;
    }
    case 'coalesce': {
      if (composition.values && composition.values.length > 0) {
        composition.values.forEach((value, valueIndex) => {
          collectFromArgument(value, 'coalesce-operand', { valueIndex });
        });
      } else {
        (composition.inputIds ?? []).forEach((inputId, valueIndex) => {
          pushUsage({ inputId, location: 'coalesce-operand', valueIndex });
        });
      }
      if (composition.fallback) {
        collectFromArgument(composition.fallback, 'coalesce-fallback');
      }
      break;
    }
    case 'default': {
      pushUsage({ inputId: composition.inputId, location: 'default-primary' });
      collectFromArgument(composition.fallback, 'default-fallback');
      break;
    }
    case 'math': {
      if (composition.startInputId && composition.operations) {
        pushUsage({ inputId: composition.startInputId, location: 'math-start' });
        composition.operations.forEach((operation, operationIndex) => {
          if (operation.inputId) {
            pushUsage({
              inputId: operation.inputId,
              location: 'math-operand',
              operationIndex,
            });
          }
          if (operation.operand) {
            collectFromArgument(operation.operand, 'math-operand', { operationIndex });
          }
        });
      } else {
        const ordered = composition.inputIds ?? [];
        ordered.forEach((inputId, valueIndex) => {
          pushUsage({
            inputId,
            location: valueIndex === 0 ? 'math-start' : 'math-operand',
            ...(valueIndex > 0 ? { operationIndex: valueIndex - 1 } : {}),
          });
        });
      }
      break;
    }
    case 'condition': {
      composition.clauses.forEach((clause, clauseIndex) => {
        clause.predicates.forEach((predicate, predicateIndex) => {
          collectFromArgument(predicate.left, 'condition-left', { clauseIndex, predicateIndex });
          if (predicate.right) {
            collectFromArgument(predicate.right, 'condition-right', { clauseIndex, predicateIndex });
          }
        });

        collectFromArgument(clause.thenOutput, 'then', { clauseIndex });
      });

      collectFromArgument(composition.elseOutput, 'otherwise');
      break;
    }
    case 'valueMap': {
      pushUsage({ inputId: composition.inputId, location: 'value-map-lookup' });
      composition.mappings.forEach((entry, mappingIndex) => {
        collectFromArgument(entry.output, 'value-map-output', { mappingIndex });
      });
      collectFromArgument(composition.fallback, 'value-map-fallback');
      break;
    }
    case 'arrayBuild': {
      (composition.inputIds ?? []).forEach((inputId, valueIndex) => {
        pushUsage({ inputId, location: 'array-build-item', valueIndex });
      });
      break;
    }
    case 'arrayMerge': {
      (composition.inputIds ?? []).forEach((inputId, valueIndex) => {
        pushUsage({ inputId, location: 'array-merge-item', valueIndex });
      });
      break;
    }
    case 'advancedExpression': {
      break;
    }
  }

  collectFromTransformStepArgs(draft.resultSteps ?? draft.postSteps, 'result-step-arg');

  return usages;
}

function normalizeComparableType(type: BuilderValueType): BuilderValueType {
  return type;
}

export function resolveBuilderArgumentValueType(
  draft: SmartBuilderDraft,
  value: BuilderArgumentValue,
): BuilderValueType {
  if (value.kind === 'input') {
    return draft.inputs.find((input) => input.id === value.inputId)?.valueType ?? 'unknown';
  }
  if (value.kind === 'expression') {
    return 'unknown';
  }
  if (value.value === null) return 'null';
  if (typeof value.value === 'number') return 'number';
  if (typeof value.value === 'boolean') return 'boolean';
  if (typeof value.value === 'string') return 'string';
  if (Array.isArray(value.value)) return 'array';
  if (typeof value.value === 'object') return 'object';
  return 'unknown';
}

export function getAllowedConditionOperatorsForLeftType(
  leftType: BuilderValueType,
): readonly BuilderPredicate['operator'][] {
  const unary: BuilderPredicate['operator'][] = ['isNull', 'isNotNull', 'isTruthy', 'isFalsy'];
  const normalized = normalizeComparableType(leftType);

  if (normalized === 'number') {
    return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', ...unary];
  }
  if (normalized === 'boolean') {
    return ['eq', 'neq', ...unary];
  }
  if (normalized === 'string') {
    return ['eq', 'neq', 'contains', ...unary];
  }

  return ['eq', 'neq', ...unary];
}

export function getConditionCompatibilityIssues(
  draft: SmartBuilderDraft,
  composition: Extract<BuilderComposition, { kind: 'condition' }>,
): readonly BuilderConditionCompatibilityIssue[] {
  const issues: BuilderConditionCompatibilityIssue[] = [];
  const unaryOperators = new Set<BuilderPredicate['operator']>(['isNull', 'isNotNull', 'isTruthy', 'isFalsy']);

  composition.clauses.forEach((clause, clauseIndex) => {
    clause.predicates.forEach((predicate, predicateIndex) => {
      const leftType = normalizeComparableType(resolveBuilderArgumentValueType(draft, predicate.left));
      const allowed = getAllowedConditionOperatorsForLeftType(leftType);
      if (!allowed.includes(predicate.operator)) {
        issues.push({
          clauseIndex,
          predicateIndex,
          message: `Operator ${predicate.operator} is not compatible with left value type ${leftType}.`,
        });
        return;
      }

      if (unaryOperators.has(predicate.operator)) {
        return;
      }

      const right = predicate.right;
      if (!right) {
        issues.push({
          clauseIndex,
          predicateIndex,
          message: 'Comparison value is required for this operator.',
        });
        return;
      }

      const rightType = normalizeComparableType(resolveBuilderArgumentValueType(draft, right));
      if (rightType === 'unknown' || leftType === 'unknown') {
        return;
      }

      if (predicate.operator === 'contains') {
        if (leftType !== 'string' || rightType !== 'string') {
          issues.push({
            clauseIndex,
            predicateIndex,
            message: 'Contains requires both left and comparison value to be text.',
          });
        }
        return;
      }

      if (predicate.operator === 'gt'
        || predicate.operator === 'gte'
        || predicate.operator === 'lt'
        || predicate.operator === 'lte') {
        if (leftType !== 'number' || rightType !== 'number') {
          issues.push({
            clauseIndex,
            predicateIndex,
            message: `${predicate.operator} requires numeric left and comparison values.`,
          });
        }
        return;
      }

      if ((predicate.operator === 'eq' || predicate.operator === 'neq') && leftType !== rightType) {
        issues.push({
          clauseIndex,
          predicateIndex,
          message: `Left type ${leftType} and comparison type ${rightType} are incompatible without an explicit transform.`,
        });
      }
    });
  });

  return issues;
}

type ConditionHydrationContext = {
  resolveSourceValueType: (path: string) => BuilderValueType;
};

type ConditionHydrationResult = {
  inputs: BuilderInput[];
  composition: {
    kind: 'condition';
    matchMode: BuilderConditionMatchMode;
    clauses: BuilderConditionClause[];
    elseOutput: BuilderArgumentValue;
  };
};

function hydrateConditionCompositionFromAst(
  ast: AstNode | null,
  context: ConditionHydrationContext,
): ConditionHydrationResult | null {
  if (!ast || ast.type !== 'FunctionCall' || ast.name !== 'if') return null;

  const inputRegistry = new Map<string, BuilderInput>();

  const registerInput = (input: BuilderInput): BuilderArgumentValue => {
    const existing = inputRegistry.get(input.id);
    if (existing) {
      return { kind: 'input', inputId: existing.id };
    }

    inputRegistry.set(input.id, input);
    return { kind: 'input', inputId: input.id };
  };

  const toInputId = (sourceKind: string, label: string, path?: string, externalName?: string, constantName?: string) => {
    const pathPart = path ?? '';
    const externalPart = externalName ?? '';
    const constantPart = constantName ?? '';
    return `${sourceKind}:${externalPart}:${constantPart}:${pathPart || label}`;
  };

  const convertNodeToValue = (node: AstNode): BuilderArgumentValue | null => {
    if (node.type === 'StringLiteral') return { kind: 'static', value: node.value };
    if (node.type === 'NumberLiteral') return { kind: 'static', value: node.value };
    if (node.type === 'BooleanLiteral') return { kind: 'static', value: node.value };
    if (node.type === 'NullLiteral') return { kind: 'static', value: null };

    if (node.type !== 'FunctionCall') return null;

    if (node.name === 'source') {
      const [pathArg] = node.arguments;
      if (!pathArg || pathArg.type !== 'StringLiteral') return null;
      const id = toInputId('primary', pathArg.value, pathArg.value);
      return registerInput({
        id,
        sourceKind: 'primary',
        label: pathArg.value,
        path: pathArg.value,
        valueType: context.resolveSourceValueType(pathArg.value),
        transforms: [],
      });
    }

    if (node.name === 'external') {
      const [aliasArg] = node.arguments;
      if (!aliasArg || aliasArg.type !== 'StringLiteral') return null;
      const id = toInputId('enrichment', aliasArg.value, undefined, aliasArg.value);
      return registerInput({
        id,
        sourceKind: 'enrichment',
        label: aliasArg.value,
        externalName: aliasArg.value,
        valueType: 'unknown',
        transforms: [],
      });
    }

    if (node.name === 'get') {
      const [externalArg, pathArg] = node.arguments;
      if (!externalArg || !pathArg) return null;
      if (externalArg.type !== 'FunctionCall' || externalArg.name !== 'external') return null;
      const [aliasArg] = externalArg.arguments;
      if (!aliasArg || aliasArg.type !== 'StringLiteral' || pathArg.type !== 'StringLiteral') return null;

      const id = toInputId('enrichment', `${aliasArg.value}.${pathArg.value}`, pathArg.value, aliasArg.value);
      return registerInput({
        id,
        sourceKind: 'enrichment',
        label: `${aliasArg.value}.${pathArg.value}`,
        externalName: aliasArg.value,
        path: pathArg.value,
        valueType: 'unknown',
        transforms: [],
      });
    }

    if (node.name === 'constant') {
      const [constantArg] = node.arguments;
      if (!constantArg || constantArg.type !== 'StringLiteral') return null;
      const id = toInputId('constant', constantArg.value, undefined, undefined, constantArg.value);
      return registerInput({
        id,
        sourceKind: 'constant',
        label: constantArg.value,
        constantName: constantArg.value,
        valueType: 'unknown',
        transforms: [],
      });
    }

    if (node.name === 'item') {
      const [pathArg] = node.arguments;
      const path = pathArg?.type === 'StringLiteral' ? pathArg.value : '';
      const id = toInputId('item', path || 'item', path);
      return registerInput({
        id,
        sourceKind: 'item',
        label: path || 'item',
        ...(path ? { path } : {}),
        valueType: 'unknown',
        transforms: [],
      });
    }

    if (node.name === 'parent') {
      const [pathArg] = node.arguments;
      const path = pathArg?.type === 'StringLiteral' ? pathArg.value : '';
      const id = toInputId('parent', path || 'parent', path);
      return registerInput({
        id,
        sourceKind: 'parent',
        label: path || 'parent',
        ...(path ? { path } : {}),
        valueType: 'unknown',
        transforms: [],
      });
    }

    return null;
  };

  const parsePredicate = (
    node: AstNode,
  ): { readonly predicate: BuilderPredicate } | null => {
    if (node.type !== 'FunctionCall') return null;

    if (node.name === 'not') {
      const [first] = node.arguments;
      if (!first || first.type !== 'FunctionCall' || first.name !== 'isNull') return null;
      const left = first.arguments[0];
      if (!left) return null;
      const convertedLeft = convertNodeToValue(left);
      if (!convertedLeft) return null;
      return {
        predicate: {
          left: convertedLeft,
          operator: 'isNotNull',
        },
      };
    }

    if (node.name === 'isNull') {
      const [leftArg] = node.arguments;
      if (!leftArg) return null;
      const left = convertNodeToValue(leftArg);
      if (!left) return null;
      return {
        predicate: {
          left,
          operator: 'isNull',
        },
      };
    }

    const operatorMap: Record<string, BuilderPredicate['operator']> = {
      eq: 'eq',
      neq: 'neq',
      gt: 'gt',
      gte: 'gte',
      lt: 'lt',
      lte: 'lte',
      contains: 'contains',
    };

    const mappedOperator = operatorMap[node.name];
    if (!mappedOperator) return null;

    const leftArg = node.arguments[0];
    const rightArg = node.arguments[1];
    if (!leftArg || !rightArg) return null;
    const left = convertNodeToValue(leftArg);
    const right = convertNodeToValue(rightArg);
    if (!left || !right) return null;

    return {
      predicate: {
        left,
        operator: mappedOperator,
        right,
      },
    };
  };

  const parsePredicateGroup = (
    node: AstNode,
  ): { readonly predicates: BuilderPredicate[]; readonly matchMode: BuilderConditionMatchMode } | null => {
    if (node.type === 'FunctionCall' && (node.name === 'and' || node.name === 'or')) {
      const matchMode: BuilderConditionMatchMode = node.name === 'or' ? 'any' : 'all';
      const predicates: BuilderPredicate[] = [];

      for (const argument of node.arguments) {
        if (argument.type === 'FunctionCall' && (argument.name === 'and' || argument.name === 'or')) {
          return null;
        }

        const parsedPredicate = parsePredicate(argument);
        if (!parsedPredicate) return null;
        predicates.push(parsedPredicate.predicate);
      }

      return { predicates, matchMode };
    }

    const single = parsePredicate(node);
    if (!single) return null;
    return {
      predicates: [single.predicate],
      matchMode: 'all',
    };
  };

  const collectIfClauses = (
    node: AstNode,
    expectedMatchMode?: BuilderConditionMatchMode,
  ): { readonly clauses: BuilderConditionClause[]; readonly elseOutput: BuilderArgumentValue; readonly matchMode: BuilderConditionMatchMode } | null => {
    if (node.type !== 'FunctionCall' || node.name !== 'if') return null;

    const [predicateNode, thenNode, elseNode] = node.arguments;
    if (!predicateNode || !thenNode || !elseNode) return null;

    const parsedGroup = parsePredicateGroup(predicateNode);
    if (!parsedGroup) return null;

    if (expectedMatchMode && parsedGroup.matchMode !== expectedMatchMode) {
      return null;
    }

    const activeMatchMode = expectedMatchMode ?? parsedGroup.matchMode;

    const thenOutput = convertNodeToValue(thenNode);
    if (!thenOutput) return null;

    const clause: BuilderConditionClause = {
      predicates: parsedGroup.predicates,
      thenOutput,
    };

    if (elseNode.type === 'FunctionCall' && elseNode.name === 'if') {
      const nested = collectIfClauses(elseNode, activeMatchMode);
      if (!nested) return null;
      return {
        clauses: [clause, ...nested.clauses],
        elseOutput: nested.elseOutput,
        matchMode: activeMatchMode,
      };
    }

    const elseOutput = convertNodeToValue(elseNode);
    if (!elseOutput) return null;

    return {
      clauses: [clause],
      elseOutput,
      matchMode: activeMatchMode,
    };
  };

  const parsed = collectIfClauses(ast);
  if (!parsed) return null;

  return {
    inputs: [...inputRegistry.values()],
    composition: {
      kind: 'condition',
      matchMode: parsed.matchMode,
      clauses: parsed.clauses,
      elseOutput: parsed.elseOutput,
    },
  };
}

function hydrateValueMapCompositionFromExpression(
  expression: string,
  options?: {
    resolveSourceValueType?: (path: string) => BuilderValueType;
    ruleValueTableRef?: MappingRuleValueTableRef;
    ruleNoMatchBehavior?: MappingRuleNoMatchBehavior;
  },
): {
  readonly primaryInput: BuilderInput;
  readonly matchMode: ValueMapMatchMode;
  readonly scope: ValueTableScope;
  readonly project: BuilderProjectValueMapSelection | null;
  readonly mappings: readonly BuilderValueMapEntry[];
  readonly fallback: BuilderArgumentValue;
  readonly noMatchBehavior?: MappingRuleNoMatchBehavior;
} | null {
  const parsed = parseValueMapExpression(expression);
  if (!parsed) return null;

  const sourceExpression = parsed.sourceExpression;
  const fallbackExpression = parsed.fallbackExpression;
  if (!sourceExpression || !fallbackExpression) return null;

  const hydratedPrimaryInput = hydrateFromSupportedExpression(sourceExpression, {
    resolveSourceValueType: options?.resolveSourceValueType,
  });
  const primaryInput: BuilderInput = hydratedPrimaryInput ?? {
    id: 'input-1',
    sourceKind: 'expression',
    label: 'Expression input',
    rawExpression: sourceExpression,
    valueType: 'unknown',
    transforms: [],
  };

  const fallback = toArgumentValueFromHydratedExpression(fallbackExpression);
  const derivedNoMatchBehavior = deriveNoMatchBehaviorFromFallback({
    sourceExpression,
    fallbackExpression,
  });
  const noMatchBehavior = options?.ruleNoMatchBehavior ?? derivedNoMatchBehavior;

  if (parsed.mapping.kind === 'inline') {
    return {
      primaryInput,
      matchMode: parsed.matchMode ?? 'exact',
      scope: 'inline',
      project: null,
      mappings: parsed.mapping.entries,
      fallback,
      noMatchBehavior,
    };
  }

  const tableKey = parsed.mapping.tableKey;
  const inputSideKey = parsed.mapping.inputSideKey;
  const outputSideKey = parsed.mapping.outputSideKey;
  if (!tableKey || !inputSideKey || !outputSideKey) return null;

  const ruleRef = options?.ruleValueTableRef?.scope === 'project'
    ? options.ruleValueTableRef
    : null;
  const projectRef: MappingRuleProjectValueTableRef =
    ruleRef
    && ruleRef.tableKey === tableKey
    && ruleRef.inputSideKey === inputSideKey
    && ruleRef.outputSideKey === outputSideKey
      ? ruleRef
      : {
        scope: 'project',
        valueTableId: `unknown:${tableKey}`,
        tableKey,
        revision: 0,
        inputSideKey,
        outputSideKey,
        inputType: 'string',
        outputType: 'string',
        resolvedEntries: [],
      };

  const matchMode: ValueMapMatchMode = projectRef.matchMode ?? 'exact';

  return {
    primaryInput,
    matchMode,
    scope: 'project',
    project: {
      ref: projectRef,
      matchMode,
      ...(projectRef.valueTableId.startsWith('unknown:') ? { tableName: tableKey } : {}),
    },
    mappings: projectRef.resolvedEntries.map((entry) => ({
      whenValue: String(entry.in),
      output: { kind: 'static', value: entry.out },
    })),
    fallback,
    noMatchBehavior,
  };
}

function parseValueMapExpression(expression: string): {
  readonly sourceExpression: string;
  readonly mapping:
    | {
        readonly kind: 'project';
        readonly tableKey: string;
        readonly inputSideKey: string;
        readonly outputSideKey: string;
      }
    | {
        readonly kind: 'inline';
        readonly entries: readonly BuilderValueMapEntry[];
      };
  readonly fallbackExpression: string;
  readonly matchMode?: ValueMapMatchMode;
} | null {
  const trimmed = expression.trim();
  const valueMapMatch = trimmed.match(/^valueMap\((?<args>[\s\S]*)\)$/);
  if (!valueMapMatch?.groups?.args) return null;

  const topLevelArgs = splitTopLevelDslArgs(valueMapMatch.groups.args);
  if (topLevelArgs.length < 3 || topLevelArgs.length > 4) return null;

  const sourceExpression = topLevelArgs[0]?.trim() ?? '';
  const mappingExpression = topLevelArgs[1]?.trim() ?? '';
  const fallbackExpression = topLevelArgs[2]?.trim() ?? '';
  const matchModeExpression = topLevelArgs[3]?.trim();
  if (!sourceExpression || !mappingExpression || !fallbackExpression) return null;

  const matchMode = parseValueMapMatchModeExpression(matchModeExpression);
  if (matchModeExpression !== undefined && !matchMode) return null;

  const projectMapping = parseProjectValueTableReference(mappingExpression);
  const inlineMapping = projectMapping ? null : parseInlineValueMapEntries(mappingExpression);
  if (!projectMapping && !inlineMapping) return null;

  return {
    sourceExpression,
    mapping: projectMapping ?? { kind: 'inline', entries: inlineMapping ?? [] },
    fallbackExpression,
    ...(matchMode ? { matchMode } : {}),
  };
}

function parseValueMapMatchModeExpression(
  matchModeExpression: string | undefined,
): ValueMapMatchMode | null {
  if (matchModeExpression === undefined) return null;
  const value = readQuotedDslString(matchModeExpression);
  if (!value) return null;
  if (value === 'exact' || value === 'ignore-case') return value;
  return null;
}

function parseProjectValueTableReference(mappingExpression: string): {
  readonly kind: 'project';
  readonly tableKey: string;
  readonly inputSideKey: string;
  readonly outputSideKey: string;
} | null {
  const valueTableMatch = mappingExpression.match(/^valueTable\((?<args>[\s\S]*)\)$/);
  if (!valueTableMatch?.groups?.args) return null;

  const valueTableArgs = splitTopLevelDslArgs(valueTableMatch.groups.args);
  if (valueTableArgs.length !== 3) return null;

  const tableKey = readQuotedDslString(valueTableArgs[0] ?? '');
  const inputSideKey = readQuotedDslString(valueTableArgs[1] ?? '');
  const outputSideKey = readQuotedDslString(valueTableArgs[2] ?? '');
  if (!tableKey || !inputSideKey || !outputSideKey) return null;

  return {
    kind: 'project',
    tableKey,
    inputSideKey,
    outputSideKey,
  };
}

function parseInlineValueMapEntries(mappingExpression: string): readonly BuilderValueMapEntry[] | null {
  const trimmed = mappingExpression.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (!inner) return [];

  const rawEntries = splitTopLevelDslArgs(inner);
  const entries: BuilderValueMapEntry[] = [];

  for (const rawEntry of rawEntries) {
    const separatorIndex = findTopLevelDslDelimiter(rawEntry, ':');
    if (separatorIndex === -1) return null;

    const rawKey = rawEntry.slice(0, separatorIndex).trim();
    const rawValue = rawEntry.slice(separatorIndex + 1).trim();
    const key = readQuotedDslString(rawKey);
    if (!key || !rawValue) return null;

    entries.push({
      whenValue: key,
      output: toArgumentValueFromHydratedExpression(rawValue),
    });
  }

  return entries;
}

function deriveNoMatchBehaviorFromFallback(input: {
  sourceExpression: string;
  fallbackExpression: string;
}): MappingRuleNoMatchBehavior | undefined {
  const fallback = input.fallbackExpression.trim();
  if (!fallback) return undefined;
  if (fallback === input.sourceExpression.trim()) {
    return { mode: 'return_input' };
  }
  if (fallback === 'null') {
    return { mode: 'return_null' };
  }

  const argument = toArgumentValueFromHydratedExpression(fallback);
  if (argument.kind === 'static' && (
    typeof argument.value === 'string'
    || typeof argument.value === 'number'
    || typeof argument.value === 'boolean'
  )) {
    return { mode: 'fallback_value', fallbackValue: argument.value };
  }

  return undefined;
}

function splitTopLevelDslArgs(argsText: string): readonly string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < argsText.length; i += 1) {
    const ch = argsText[i] ?? '';

    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (ch === '\\') {
      current += ch;
      if (inString) escaping = true;
      continue;
    }

    if (ch === '"') {
      current += ch;
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1;
        current += ch;
        continue;
      }

      if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1;
        current += ch;
        continue;
      }

      if (ch === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
    }

    current += ch;
  }

  if (current.trim().length > 0) {
    args.push(current.trim());
  }

  return args;
}

function findTopLevelDslDelimiter(text: string, delimiter: ':' | ','): number {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? '';

    if (escaping) {
      escaping = false;
      continue;
    }
    if (ch === '\\') {
      if (inString) escaping = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1;
        continue;
      }
      if (ch === delimiter && depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function readQuotedDslString(input: string): string | null {
  const match = input.trim().match(/^"([\s\S]*)"$/);
  if (!match) return null;
  return match[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\') ?? null;
}

function hydrateDefaultCompositionFromExpression(
  expression: string,
  options?: {
    resolveSourceValueType?: (path: string) => BuilderValueType;
  },
): { readonly primaryInput: BuilderInput; readonly fallback: BuilderArgumentValue } | null {
  const defaultMatch = expression.match(/^default\((source\("[\s\S]+"\)|external\("[\s\S]+"\)|get\(external\("[\s\S]+"\),\s*"[\s\S]+"\)),\s*([\s\S]+)\)$/);
  if (!defaultMatch) return null;

  const primaryExpression = defaultMatch[1]?.trim() ?? '';
  const fallbackExpression = defaultMatch[2]?.trim() ?? '';
  if (!primaryExpression || !fallbackExpression) return null;

  const primaryInput = hydrateFromSupportedExpression(primaryExpression, options);
  if (!primaryInput) return null;

  return {
    primaryInput,
    fallback: toArgumentValueFromHydratedExpression(fallbackExpression),
  };
}

function toArgumentValueFromHydratedExpression(rawExpression: string): BuilderArgumentValue {
  const expression = rawExpression.trim();
  const quoted = expression.match(/^"([\s\S]*)"$/);
  if (quoted) {
    return {
      kind: 'static',
      value: quoted[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\') ?? '',
    };
  }

  if (expression === 'null') return { kind: 'static', value: null };
  if (expression === 'true') return { kind: 'static', value: true };
  if (expression === 'false') return { kind: 'static', value: false };
  if (expression.length > 0 && Number.isFinite(Number(expression))) {
    return { kind: 'static', value: Number(expression) };
  }

  const fallbackInput = hydrateFromSupportedExpression(expression);
  if (fallbackInput) {
    return { kind: 'expression', expression: inputExpressionFromBuilderInput(fallbackInput) };
  }

  return { kind: 'expression', expression };
}

function inputExpressionFromBuilderInput(input: BuilderInput): string {
  if (input.sourceKind === 'primary' && input.path) {
    return `source("${input.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  }
  if (input.sourceKind === 'enrichment' && input.externalName && input.path) {
    return `get(external("${input.externalName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"), "${input.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  }
  if (input.sourceKind === 'enrichment' && input.externalName) {
    return `external("${input.externalName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  }
  if (input.sourceKind === 'constant' && input.constantName) {
    return `constant("${input.constantName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  }
  if (input.sourceKind === 'item' && input.path) {
    return `item("${input.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  }
  if (input.sourceKind === 'parent' && input.path) {
    return `parent("${input.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  }
  if (input.sourceKind === 'expression' && input.rawExpression) {
    return input.rawExpression;
  }
  if (input.sourceKind === 'static') {
    if (input.staticValue === null) return 'static(null)';
    if (typeof input.staticValue === 'string') {
      return `static("${input.staticValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
    }
    if (typeof input.staticValue === 'number' || typeof input.staticValue === 'boolean') {
      return `static(${String(input.staticValue)})`;
    }
  }
  return '';
}

function hydrateFromSupportedExpression(
  expression: string,
  options?: {
    resolveSourceValueType?: (path: string) => BuilderValueType;
  },
): BuilderInput | null {
  const directSource = expression.match(/^source\("([^"]+)"\)$/);
  if (directSource) {
    const sourcePath = directSource[1] ?? '';
    return {
      id: 'input-1',
      sourceKind: 'primary',
      label: sourcePath,
      path: sourcePath,
      valueType: options?.resolveSourceValueType?.(sourcePath) ?? 'unknown',
      transforms: [],
    };
  }

  const directExternal = expression.match(/^external\("([^"]+)"\)$/);
  if (directExternal) {
    return {
      id: 'input-1',
      sourceKind: 'enrichment',
      label: directExternal[1] ?? '',
      externalName: directExternal[1],
      valueType: 'unknown',
      transforms: [],
    };
  }

  const externalPath = expression.match(/^get\(external\("([^"]+)"\),\s*"([^"]+)"\)$/);
  if (externalPath) {
    return {
      id: 'input-1',
      sourceKind: 'enrichment',
      label: `${externalPath[1]}.${externalPath[2]}`,
      externalName: externalPath[1],
      path: externalPath[2],
      valueType: 'unknown',
      transforms: [],
    };
  }

  const staticCall = expression.match(/^static\((.*)\)$/);
  if (staticCall) {
    const arg = staticCall[1]?.trim() ?? '';
    if (arg === 'null') {
      return {
        id: 'input-1',
        sourceKind: 'static',
        label: 'Fixed value',
        staticValue: null,
        valueType: 'null',
        transforms: [],
      };
    }

    const quoted = arg.match(/^"([\s\S]*)"$/);
    if (quoted) {
      return {
        id: 'input-1',
        sourceKind: 'static',
        label: 'Fixed value',
        staticValue: quoted[1]?.replace(/\\"/g, '"').replace(/\\\\/g, '\\') ?? '',
        valueType: 'string',
        transforms: [],
      };
    }

    if (arg === 'true' || arg === 'false') {
      return {
        id: 'input-1',
        sourceKind: 'static',
        label: 'Fixed value',
        staticValue: arg === 'true',
        valueType: 'boolean',
        transforms: [],
      };
    }

    if (arg.length > 0 && Number.isFinite(Number(arg))) {
      return {
        id: 'input-1',
        sourceKind: 'static',
        label: 'Fixed value',
        staticValue: Number(arg),
        valueType: 'number',
        transforms: [],
      };
    }

    return {
      id: 'input-1',
      sourceKind: 'expression',
      label: 'Expression input',
      rawExpression: expression,
      valueType: 'unknown',
      transforms: [],
    };
  }

  // transform-chain hydration from source()/external()/get(external(), ...)
  const chain = decomposeToChain(expression);
  if ('error' in chain) return null;
  if (chain.chain.steps.some((step) => step.kind !== 'transform')) return null;
  const disallowedDirectHydrationFunctions = new Set([
    'concat',
    'coalesce',
    'add',
    'subtract',
    'multiply',
    'divide',
    'array',
    'merge',
    'valueMap',
    'default',
    'if',
  ]);
  if (chain.chain.steps.some((step) => disallowedDirectHydrationFunctions.has(step.functionName))) {
    return null;
  }

  const sourceExpr = generateSourceExprFromChainSource(chain.chain.source);
  if (!sourceExpr) return null;

  const base = hydrateFromSupportedExpression(sourceExpr, options);
  if (!base) return null;

  return {
    ...base,
    transforms: chain.chain.steps.map((step) => ({
      functionName: step.functionName,
      args: (step.args ?? []).map((arg) =>
        arg.mode === 'literal'
          ? { kind: 'static' as const, value: parseLiteralArg(arg.value) }
          : arg.mode === 'source'
            ? {
                kind: 'expression' as const,
                expression: `source("${arg.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`,
              }
            : {
                kind: 'expression' as const,
                expression: evaluateNodeExpression(arg.node),
              },
      ),
    })),
  };
}

function parseLiteralArg(value: string): unknown {
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
}

function evaluateNodeExpression(node: { functionName: string; slots: readonly unknown[] }): string {
  // fallback lightweight serializer for nested expression slots in transform args
  const serializeSlot = (slot: unknown): string => {
    if (!slot || typeof slot !== 'object') return '""';
    const s = slot as {
      mode?: string;
      value?: string;
      path?: string;
      node?: { functionName: string; slots: readonly unknown[] };
    };
    if (s.mode === 'literal') {
      const literal = s.value ?? '';
      if (literal === 'null' || literal === 'true' || literal === 'false') return literal;
      if (literal.trim() !== '' && Number.isFinite(Number(literal))) return String(Number(literal));
      return `"${literal.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    if (s.mode === 'source') {
      return `source("${(s.path ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
    }
    if (s.mode === 'expression' && s.node) {
      return evaluateNodeExpression(s.node);
    }
    return '""';
  };

  return `${node.functionName}(${node.slots.map(serializeSlot).join(', ')})`;
}

function generateSourceExprFromChainSource(source: ChainSource): string {
  if (source.kind === 'field') {
    return source.path ? `source("${source.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")` : '';
  }

  if (source.kind === 'static') {
    return source.value === undefined ? '' : `static(${toStaticArg(source.value)})`;
  }

  return '';
}

function toStaticArg(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `"${JSON.stringify(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
