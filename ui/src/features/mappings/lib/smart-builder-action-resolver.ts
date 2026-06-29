import {
  ALL_REGISTERED_DSL_FUNCTIONS,
  SMART_BUILDER_ACTION_CATALOG,
  type SmartBuilderActionCatalogEntry,
} from './smart-builder-action-catalog';
import type { BuilderInput, BuilderValueType, SmartBuilderDraft } from './smart-builder-state';

export interface SmartBuilderActionContext {
  readonly targetType: BuilderValueType;
  readonly isRequired: boolean;
  readonly inputs: readonly BuilderInput[];
  readonly hasArrayScope?: boolean;
  readonly pendingActionDraft?: SmartBuilderDraft['pendingActionDraft'];
}

export interface SmartBuilderActionAvailability {
  readonly enabled: boolean;
  readonly reason?: string;
}

export interface ResolvedSmartBuilderAction {
  readonly action: SmartBuilderActionCatalogEntry;
  readonly availability: SmartBuilderActionAvailability;
}

export interface ChangeLogicOption {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason?: string;
  readonly sortOrder: number;
}


function classifyInputType(input: BuilderInput): BuilderValueType {
  return input.valueType;
}

function hasNumberInputs(inputs: readonly BuilderInput[]): boolean {
  return inputs.some((input) => classifyInputType(input) === 'number');
}

function hasStringInputs(inputs: readonly BuilderInput[]): boolean {
  return inputs.some((input) => classifyInputType(input) === 'string');
}

function hasArrayInputs(inputs: readonly BuilderInput[]): boolean {
  return inputs.some((input) => classifyInputType(input) === 'array');
}

function hasDateLikeInputs(inputs: readonly BuilderInput[]): boolean {
  return inputs.some((input) => {
    const label = `${input.label ?? ''} ${input.path ?? ''}`.toLowerCase();
    return label.includes('date') || label.includes('time') || label.includes('at');
  });
}

function hasDateFormattingCompatibleInputs(inputs: readonly BuilderInput[]): boolean {
  return inputs.some((input) => input.valueType === 'string') || hasDateLikeInputs(inputs);
}

function invalidRegistrationReason(action: SmartBuilderActionCatalogEntry): string | null {
  const invalid = action.dslFunctions.filter((fn) => !ALL_REGISTERED_DSL_FUNCTIONS.has(fn));
  if (invalid.length === 0) return null;
  return `Unavailable: action references unregistered DSL function(s): ${invalid.join(', ')}`;
}

function availabilityForAction(
  action: SmartBuilderActionCatalogEntry,
  context: SmartBuilderActionContext,
): SmartBuilderActionAvailability {
  const registrationReason = invalidRegistrationReason(action);
  if (registrationReason) {
    return { enabled: false, reason: registrationReason };
  }

  const inputCount = context.inputs.length;
  const effectiveInputCount = action.role === 'outputStep'
    ? (inputCount > 0 ? 1 : 0)
    : inputCount;
  const constraints = action.constraints;

  if (
    context.pendingActionDraft
    && context.pendingActionDraft.actionId === action.id
    && !context.pendingActionDraft.validation.isValid
  ) {
    const firstIssue = context.pendingActionDraft.validation.issues[0];
    return {
      enabled: false,
      reason: firstIssue ? `Unavailable: ${firstIssue.message}` : 'Unavailable: action parameters are invalid.',
    };
  }

  if (constraints?.requiresArrayContext && !context.hasArrayScope) {
    return {
      enabled: false,
      reason: 'Unavailable: only available in array scope.',
    };
  }

  if (constraints?.requiresSourceKinds && constraints.requiresSourceKinds.length > 0) {
    const hasRequiredKind = context.inputs.some((input) =>
      constraints.requiresSourceKinds?.includes(input.sourceKind),
    );
    if (!hasRequiredKind) {
      return {
        enabled: false,
        reason: `Unavailable: requires ${constraints.requiresSourceKinds.join(' or ')} input.`,
      };
    }
  }

  // Category heuristics for actionable guidance
  switch (action.category) {
    case 'number':
      if (action.role === 'outputStep') {
        if (context.targetType !== 'number') {
          return {
            enabled: false,
            reason: 'Unavailable: output step requires number target.',
          };
        }
        break;
      }
      if (inputCount > 0 && !hasNumberInputs(context.inputs)) {
        const first = context.inputs[0];
        return {
          enabled: false,
          reason: `Unavailable: ${first ? `\`${first.label}\` is ${first.valueType}. Convert to number first.` : 'numeric input required.'}`,
        };
      }
      break;
    case 'text':
      if (inputCount > 0 && !hasStringInputs(context.inputs)) {
        return {
          enabled: false,
          reason: 'Unavailable: requires string input(s).',
        };
      }
      break;
    case 'date':
      if (action.id === 'date.format') {
        if (inputCount > 0 && !hasDateFormattingCompatibleInputs(context.inputs)) {
          return {
            enabled: false,
            reason: 'Unavailable: requires string input(s) to format date/time text.',
          };
        }
        break;
      }

      if (inputCount > 0 && !hasDateLikeInputs(context.inputs)) {
        return {
          enabled: false,
          reason: 'Unavailable: expected date-like input.',
        };
      }
      break;
    case 'array':
      if (action.appliesTo === 'array-scope' && context.hasArrayScope) {
        break;
      }
      if (inputCount > 0 && !hasArrayInputs(context.inputs)) {
        return {
          enabled: false,
          reason: 'Unavailable: none of the selected inputs are arrays.',
        };
      }
      break;
    default:
      break;
  }

  if (constraints?.minInputs !== undefined && effectiveInputCount < constraints.minInputs) {
    return {
      enabled: false,
      reason: `Unavailable: requires at least ${constraints.minInputs} input${constraints.minInputs > 1 ? 's' : ''}.`,
    };
  }
  if (constraints?.maxInputs !== undefined && effectiveInputCount > constraints.maxInputs) {
    return {
      enabled: false,
      reason: `Unavailable: supports at most ${constraints.maxInputs} input${constraints.maxInputs > 1 ? 's' : ''}.`,
    };
  }

  switch (action.category) {
    case 'convert':
      if (
        constraints?.allowedTargetTypes &&
        !constraints.allowedTargetTypes.includes(context.targetType)
      ) {
        return {
          enabled: false,
          reason: `Unavailable: conversion action supports targets ${constraints.allowedTargetTypes.join(', ')}.`,
        };
      }
      break;
    default:
      break;
  }

  return { enabled: true };
}

export function resolveSmartBuilderActions(
  context: SmartBuilderActionContext,
): readonly ResolvedSmartBuilderAction[] {
  const resolved = SMART_BUILDER_ACTION_CATALOG.map((action) => ({
    action,
    availability: availabilityForAction(action, context),
  }));

  // Enabled actions first, then disabled; stable secondary sort by label
  return resolved.sort((a, b) => {
    if (a.availability.enabled !== b.availability.enabled) {
      return a.availability.enabled ? -1 : 1;
    }
    return a.action.label.localeCompare(b.action.label);
  });
}

export function resolveSmartBuilderActionsFromDraft(
  draft: SmartBuilderDraft,
): readonly ResolvedSmartBuilderAction[] {
  const hasArrayScope =
    draft.inputs.some((input) => input.sourceKind === 'item' || input.sourceKind === 'parent')
    || draft.targetType === 'array';

  return resolveSmartBuilderActions({
    targetType: draft.targetType,
    isRequired: draft.isRequired,
    inputs: draft.inputs,
    hasArrayScope,
    pendingActionDraft: draft.pendingActionDraft,
  });
}

export function resolveChangeLogicOptionsFromDraft(
  draft: SmartBuilderDraft,
): readonly ChangeLogicOption[] {
  const resolved = resolveSmartBuilderActionsFromDraft(draft);
  const byActionId = new Map(resolved.map((entry) => [entry.action.id, entry] as const));

  const numberAddAvailability = byActionId.get('number.add')?.availability;

  const options: ChangeLogicOption[] = [
    {
      id: 'base.direct',
      label: 'Use one value',
      enabled: draft.inputs.length > 0,
      reason: draft.inputs.length > 0 ? undefined : 'Unavailable: add at least one input.',
      sortOrder: 10,
    },
    {
      id: 'base.fixed',
      label: 'Fixed value',
      enabled: true,
      sortOrder: 15,
    },
    {
      id: 'text.concat',
      label: 'Combine values',
      enabled: byActionId.get('text.concat')?.availability.enabled ?? false,
      reason: byActionId.get('text.concat')?.availability.reason,
      sortOrder: 20,
    },
    {
      id: 'null.coalesce',
      label: 'Use first available',
      enabled: byActionId.get('null.coalesce')?.availability.enabled ?? false,
      reason: byActionId.get('null.coalesce')?.availability.reason,
      sortOrder: 30,
    },
    {
      id: 'base.calculation',
      label: 'Calculate',
      enabled: numberAddAvailability?.enabled ?? false,
      reason: numberAddAvailability?.reason,
      sortOrder: 40,
    },
    {
      id: 'condition.compare',
      label: 'Conditional',
      enabled: byActionId.get('condition.compare')?.availability.enabled ?? false,
      reason: byActionId.get('condition.compare')?.availability.reason,
      sortOrder: 50,
    },
    {
      id: 'lookup.valueMap',
      label: 'Value Mapping',
      enabled: byActionId.get('lookup.valueMap')?.availability.enabled ?? false,
      reason: byActionId.get('lookup.valueMap')?.availability.reason,
      sortOrder: 60,
    },
  ];

  return options.sort((a, b) => a.sortOrder - b.sortOrder);
}
