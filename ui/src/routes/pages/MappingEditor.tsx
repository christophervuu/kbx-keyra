import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';


import { Button } from '@/components';
import { useRecentActivity } from '@/features/home/hooks/use-recent-activity';
import { ConfirmDialog } from '@/features/mappings/components';
import {
  AiValidationPanel,
  ArrayBuilder,
  AutoMapWorkspace,
  BuilderEmptyState,
  ConfigurationModal,
  ConfigurationPanel,
  ExpressionBuilderPanel,
  ObjectSummaryPanel,
  RefreshConfirmBanner,
  ScalarFieldBuilder,
  SourceSchemaPanel,
  TargetWorklist,
  IssuesPanel,
  UnsavedChangesOverlay,
  VersionDiffView,
  VersionHistoryDrawer,
  WorkspaceToolbar,
  WorkspaceNoSourceDataCallout,
  type ChildFieldInfo,
  type ExpressionBuilderPanelRef,
  type StagedInputField,
  type TargetFieldStatus,
  type ConsolidatedIssueItem,
} from '@/features/mappings/components';
import { MappingEditorPage } from '@/features/mappings/components';
import { RuleList } from '@/features/mappings/components';
import { usePreviewContext } from '@/features/mappings/context/preview-context';
import { useAutoMapWorkspace, useExpressionBuilder, useMappingEditor, useTargetStatus, useVersionHistory } from '@/features/mappings/hooks';
import {
  type SmartBuilderDraft,
  createActionParameterDraft,
  createEmptySmartBuilderDraft,
  generateSmartBuilderExpression,
  getValidatedActionParameters,
  getPendingAutoMapSession,
  hydrateSmartBuilderFromExpression,
  setSlotScopedInput,
  toSmartBuilderTransformArgsFromParameters,
  updateSmartBuilderExpression,
} from '@/features/mappings/lib';
import { resolveFieldTestValue } from '@/features/mappings/lib/source-field-display';
import type { EditorView } from '@/features/mappings/types';
import { useAdapter } from '@/lib/api';
import { executeMapping } from '@/lib/engine';
import type { SchemaSamplePayloadMetadata, SchemaTreeNode } from '@/lib/types/domain';
import { PATHS } from '@/routes/paths';

const LAST_SELECTED_SAMPLE_STORAGE_PREFIX = 'keyra:mappings:last-selected-sample';

function readLastSelectedSampleId(mappingId: string): string | null {
  try {
    const raw = localStorage.getItem(`${LAST_SELECTED_SAMPLE_STORAGE_PREFIX}:${mappingId}`);
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeLastSelectedSampleId(mappingId: string, sampleId: string | null): void {
  try {
    const key = `${LAST_SELECTED_SAMPLE_STORAGE_PREFIX}:${mappingId}`;
    if (sampleId === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, sampleId);
  } catch {
    // ignore storage failures
  }
}

export function resolveInitialSelectedSampleId(params: {
  readonly samples: readonly SchemaSamplePayloadMetadata[];
  readonly lastSelectedSampleId: string | null;
  readonly mappingDefaultSampleId: string | null;
}): string | null {
  const { samples, lastSelectedSampleId, mappingDefaultSampleId } = params;
  const available = new Set(samples.map((sample) => sample.sampleId));

  if (lastSelectedSampleId && available.has(lastSelectedSampleId)) {
    return lastSelectedSampleId;
  }

  if (mappingDefaultSampleId && available.has(mappingDefaultSampleId)) {
    return mappingDefaultSampleId;
  }

  const schemaDefault = samples.find((sample) => sample.usedForInference) ?? null;
  return schemaDefault?.sampleId ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectTargetSchemaPaths(nodes: readonly SchemaTreeNode[]): string[] {
  const paths: string[] = [];
  function walk(current: readonly SchemaTreeNode[]) {
    for (const node of current) {
      paths.push(node.path);
      if (node.children.length > 0) walk(node.children);
    }
  }
  walk(nodes);
  return paths;
}

function WorkspaceNoSourceDataSlot() {
  const { sourceData } = usePreviewContext();
  return sourceData === null ? <WorkspaceNoSourceDataCallout /> : null;
}

function findNodeByPath(
  nodes: readonly SchemaTreeNode[],
  path: string,
): SchemaTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findNodeByPath(node.children, path);
    if (found) return found;
  }
  return undefined;
}

interface NodePathResolution {
  readonly node: SchemaTreeNode;
  readonly nearestArrayAncestor: SchemaTreeNode | null;
}

function findNodePathResolution(
  nodes: readonly SchemaTreeNode[],
  path: string,
  nearestArrayAncestor: SchemaTreeNode | null = null,
): NodePathResolution | undefined {
  for (const node of nodes) {
    const nextArrayAncestor = node.type === 'array' ? node : nearestArrayAncestor;
    if (node.path === path) {
      return { node, nearestArrayAncestor };
    }
    const found = findNodePathResolution(node.children, path, nextArrayAncestor);
    if (found) return found;
  }
  return undefined;
}

export function resolveBuilderTargetPath(
  nodes: readonly SchemaTreeNode[],
  path: string,
): string {
  const resolution = findNodePathResolution(nodes, path);
  if (!resolution) return path;
  if (resolution.node.type === 'array') return resolution.node.path;
  return resolution.nearestArrayAncestor?.path ?? resolution.node.path;
}

function toTargetFieldType(type: SchemaTreeNode['type']): ChildFieldInfo['fieldType'] {
  switch (type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'object':
    case 'array':
    case 'null':
      return type;
    default:
      return 'string';
  }
}

function resolveValueAtPath(sourceData: unknown, fieldPath: string): unknown {
  if (sourceData === null || sourceData === undefined) return undefined;
  const normalized = fieldPath.replace(/\[(\d+)\]/g, '.$1');
  const segments = normalized.split('.').filter((segment) => segment.length > 0);

  let current: unknown = sourceData;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

type SmartSelectionOutcome =
  | 'created-direct-draft'
  | 'appended-to-tray'
  | 'filled-focused-slot';

interface SmartSelectionResult {
  readonly outcome: SmartSelectionOutcome;
  readonly draft: SmartBuilderDraft;
  readonly expression: string;
}

function isSameStagedAsInput(
  input: SmartBuilderDraft['inputs'][number],
  staged: StagedInputField,
): boolean {
  switch (staged.kind) {
    case 'primary':
      return input.sourceKind === 'primary' && input.path === staged.path;
    case 'enrichment':
      return input.sourceKind === 'enrichment' && input.externalName === staged.alias && input.path === staged.path;
    case 'constant':
      return input.sourceKind === 'constant' && input.constantName === staged.constantName;
    case 'static':
      return input.sourceKind === 'static' && JSON.stringify(input.staticValue ?? null) === JSON.stringify(staged.staticValue ?? null);
    case 'item':
      return input.sourceKind === 'item' && input.path === staged.path;
    case 'parent':
      return input.sourceKind === 'parent' && input.path === staged.path;
    case 'expression':
      return input.sourceKind === 'expression' && (input.rawExpression ?? '') === (staged.rawExpression ?? staged.expression);
  }
}

function removeInputFromSmartDraft(
  draft: SmartBuilderDraft,
  inputId: string,
): SmartBuilderDraft {
  const remainingInputs = draft.inputs.filter((input) => input.id !== inputId);

  let composition = draft.composition;
  if (remainingInputs.length === 0) {
    composition = null;
  } else if (composition?.kind === 'direct' && composition.inputId === inputId) {
    composition = { kind: 'direct', inputId: remainingInputs[0]!.id };
  } else if (composition?.kind === 'concat') {
    const nextIds = (composition.inputIds ?? draft.inputs.map((input) => input.id)).filter((id) => id !== inputId);
    composition = nextIds.length <= 1
      ? { kind: 'direct', inputId: nextIds[0] ?? remainingInputs[0]!.id }
      : { ...composition, inputIds: nextIds };
  } else if (composition?.kind === 'default' && composition.inputId === inputId) {
    composition = remainingInputs.length > 0
      ? { kind: 'direct', inputId: remainingInputs[0]!.id }
      : null;
  }

  const nextDraft = {
    ...draft,
    inputs: remainingInputs,
    composition,
  };

  return updateSmartBuilderExpression(nextDraft, generateSmartBuilderExpression(nextDraft));
}

interface SmartActionMeta {
  readonly activeActionId: string | null;
  readonly concatSeparator: string;
  readonly announcement: string | null;
}

function deriveSmartActionMetaFromDraft(draft: SmartBuilderDraft): SmartActionMeta {
  const composition = draft.composition;
  if (!composition) {
    return { activeActionId: null, concatSeparator: ' ', announcement: null };
  }

  if (composition.kind === 'concat') {
    return {
      activeActionId: 'text.concat',
      concatSeparator: composition.separator ?? ' ',
      announcement: null,
    };
  }
  if (composition.kind === 'coalesce') {
    return { activeActionId: 'null.coalesce', concatSeparator: ' ', announcement: null };
  }
  if (composition.kind === 'condition') {
    return { activeActionId: 'condition.if', concatSeparator: ' ', announcement: null };
  }
  if (composition.kind === 'advancedExpression') {
    return { activeActionId: 'advanced.expression', concatSeparator: ' ', announcement: null };
  }

  return { activeActionId: null, concatSeparator: ' ', announcement: null };
}

function toArgumentValueFromDslExpression(raw: string): { kind: 'static'; value: unknown } | { kind: 'expression'; expression: string } {
  const expression = raw.trim();
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

  return { kind: 'expression', expression };
}

export function applySmartActionToDraft(
  draft: SmartBuilderDraft,
  actionId: string,
  options?: {
    readonly calculationInputId?: string;
    readonly setAsStartInputId?: string;
    readonly editingStepIndex?: number;
    readonly editingStepScope?: 'input-transform' | 'output-step';
  },
): SmartBuilderDraft {
  const parameterResolution = getValidatedActionParameters({ draft, actionId });
  if (!parameterResolution.ok) {
    return draft;
  }

  const actionParameters = parameterResolution.values;
  let nextDraft: SmartBuilderDraft = draft;

  const toMathOperator = (id: string): 'add' | 'subtract' | 'multiply' | 'divide' =>
    id === 'number.add'
      ? 'add'
      : id === 'number.subtract'
        ? 'subtract'
        : id === 'number.multiply'
          ? 'multiply'
          : 'divide';

  const normalizeMathComposition = (
    sourceDraft: SmartBuilderDraft,
  ): {
    readonly startInputId: string;
    readonly operations: readonly { readonly operator: 'add' | 'subtract' | 'multiply' | 'divide'; readonly inputId: string }[];
  } | null => {
    const composition = sourceDraft.composition;
    if (composition?.kind === 'math' && composition.startInputId && composition.operations) {
      return {
        startInputId: composition.startInputId,
        operations: composition.operations,
      };
    }

    const orderedIds = sourceDraft.inputs.map((input) => input.id);
    if (orderedIds.length === 0) return null;
    const startInputId = orderedIds[0]!;
    const fallbackOperator = composition?.kind === 'math' ? (composition.operator ?? 'add') : 'add';
    const operations = orderedIds
      .slice(1)
      .map((inputId) => ({ operator: fallbackOperator, inputId }));

    return {
      startInputId,
      operations,
    };
  };

  const applyInputTransform = (
    functionName: string,
    args?: readonly ({ kind: 'static'; value: unknown } | { kind: 'expression'; expression: string })[],
  ): SmartBuilderDraft => {
    if (options?.editingStepScope === 'output-step') {
      return draft;
    }
    const firstInput = draft.inputs[0];
    if (!firstInput) return draft;

    const nextInputs = draft.inputs.map((input) =>
      input.id === firstInput.id
        ? {
            ...input,
            transforms: [...input.transforms, args ? { functionName, args } : { functionName }],
          }
        : input,
    );

    return {
      ...draft,
      inputs: nextInputs,
    };
  };

  const applyOutputStep = (
    functionName: string,
    args?: readonly ({ kind: 'static'; value: unknown } | { kind: 'expression'; expression: string } | { kind: 'input'; inputId: string })[],
  ): SmartBuilderDraft => {
    const nextStep = args ? { functionName, args } : { functionName };
    const editingStepIndex = options?.editingStepIndex;
    if (editingStepIndex !== undefined && editingStepIndex >= 0 && editingStepIndex < draft.postSteps.length) {
      return {
        ...draft,
        postSteps: draft.postSteps.map((step, index) => (index === editingStepIndex ? nextStep : step)),
      };
    }

    return {
      ...draft,
      postSteps: [...draft.postSteps, nextStep],
    };
  };

  const applyInputTransformAction = (id: string): SmartBuilderDraft | null => {
    switch (id) {
      case 'text.upper':
        return applyInputTransform('upper');
      case 'text.lower':
        return applyInputTransform('lower');
      case 'text.trim':
        return applyInputTransform('trim');
      case 'text.substring':
        return applyInputTransform('substring', toSmartBuilderTransformArgsFromParameters({ actionId: id, values: actionParameters }));
      case 'text.replace': {
        const mode = actionParameters.mode === 'first' ? 'replace' : 'replaceAll';
        return applyInputTransform(mode, toSmartBuilderTransformArgsFromParameters({ actionId: id, values: actionParameters }));
      }
      case 'text.length':
        return applyInputTransform('length');
      case 'text.split':
        return applyInputTransform('split', toSmartBuilderTransformArgsFromParameters({ actionId: id, values: actionParameters }));
      case 'number.round':
        return applyOutputStep('round', toSmartBuilderTransformArgsFromParameters({ actionId: id, values: actionParameters }));
      case 'number.abs':
        return applyOutputStep('abs');
      case 'date.format':
        return applyInputTransform('formatDate', toSmartBuilderTransformArgsFromParameters({ actionId: id, values: actionParameters }));
      case 'array.flatten':
        return applyInputTransform('flatten');
      case 'array.first':
        return applyInputTransform('first');
      case 'array.nth':
        return applyInputTransform('nth', toSmartBuilderTransformArgsFromParameters({ actionId: id, values: actionParameters }));
      case 'array.join':
        return applyInputTransform('join', toSmartBuilderTransformArgsFromParameters({ actionId: id, values: actionParameters }));
      case 'array.count':
        return applyInputTransform('count');
      case 'array.get':
        return applyInputTransform('get', [{ kind: 'static', value: 'field' }]);
      case 'null.isNull':
        return applyInputTransform('isNull');
      case 'convert.cast':
        return applyOutputStep('cast', toSmartBuilderTransformArgsFromParameters({ actionId: id, values: actionParameters }));
      default:
        return null;
    }
  };

  switch (actionId) {
    case 'base.calculation': {
      if (draft.inputs.length < 2) return draft;
      const orderedIds = draft.inputs.map((input) => input.id);
      const startInputId = orderedIds[0]!;
      const operations = orderedIds.slice(1).map((inputId) => ({
        operator: 'add' as const,
        inputId,
      }));
      nextDraft = {
        ...draft,
        composition: {
          kind: 'math',
          startInputId,
          operations,
        },
      };
      break;
    }
    case 'base.direct': {
      const first = draft.inputs[0];
      if (!first) return draft;
      nextDraft = {
        ...draft,
        composition: { kind: 'direct', inputId: first.id },
      };
      break;
    }
    case 'text.concat': {
      if (draft.inputs.length === 0) return draft;
      const inputIds = draft.inputs.map((input) => input.id);
      nextDraft = {
        ...draft,
        composition: {
          kind: 'concat',
          inputIds,
          separator: ' ',
        },
      };
      break;
    }
    case 'null.coalesce': {
      if (draft.inputs.length === 0) return draft;
      const inputIds = draft.inputs.map((input) => input.id);
      nextDraft = {
        ...draft,
        composition: {
          kind: 'coalesce',
          inputIds,
        },
      };
      break;
    }
    case 'number.add':
    case 'number.subtract':
    case 'number.multiply':
    case 'number.divide': {
      if (draft.inputs.length === 0) return draft;
      const operator = toMathOperator(actionId);

      const normalizedMath = normalizeMathComposition(draft);
      if (!normalizedMath) return draft;

      const setAsStartInputId = options?.setAsStartInputId;
      if (setAsStartInputId) {
        const isKnownInput = draft.inputs.some((input) => input.id === setAsStartInputId);
        if (!isKnownInput) return draft;

        const existingWithoutStart = normalizedMath.operations.filter((entry) => entry.inputId !== setAsStartInputId);
        const updatedOperations = [
          ...existingWithoutStart,
          ...(normalizedMath.startInputId !== setAsStartInputId
            ? [{ operator: 'add' as const, inputId: normalizedMath.startInputId }]
            : []),
        ];

        nextDraft = {
          ...draft,
          composition: {
            kind: 'math',
            startInputId: setAsStartInputId,
            operations: updatedOperations,
          },
        };
        break;
      }

      const explicitInputId = options?.calculationInputId;
      const unusedInputId = explicitInputId
        ?? draft.inputs.find((input) =>
          input.id !== normalizedMath.startInputId
          && !normalizedMath.operations.some((entry) => entry.inputId === input.id))?.id;

      if (!unusedInputId) {
        const updatedOperations = normalizedMath.operations.length > 0
          ? normalizedMath.operations.map((entry, index, arr) =>
            index === arr.length - 1 ? { ...entry, operator } : entry)
          : normalizedMath.operations;

        nextDraft = {
          ...draft,
          composition: {
            kind: 'math',
            startInputId: normalizedMath.startInputId,
            operations: updatedOperations,
          },
        };
        break;
      }

      const existingOperationIndex = normalizedMath.operations.findIndex((entry) => entry.inputId === unusedInputId);
      const updatedOperations = existingOperationIndex >= 0
        ? normalizedMath.operations.map((entry, index) =>
          index === existingOperationIndex ? { ...entry, operator } : entry)
        : [...normalizedMath.operations, { operator, inputId: unusedInputId }];

      nextDraft = {
        ...draft,
        composition: {
          kind: 'math',
          startInputId: normalizedMath.startInputId,
          operations: updatedOperations,
        },
      };
      break;
    }
    case 'null.default': {
      const primaryInput = draft.inputs[0];
      if (!primaryInput) return draft;
      const fallbackRaw = typeof actionParameters.fallbackExpression === 'string'
        ? actionParameters.fallbackExpression
        : '""';
      const fallbackArgument = toArgumentValueFromDslExpression(fallbackRaw);
      nextDraft = {
        ...draft,
        composition: {
          kind: 'default',
          inputId: primaryInput.id,
          fallback: fallbackArgument,
        },
      };
      break;
    }
    case 'lookup.valueMap': {
      const first = draft.inputs[0];
      if (!first) return draft;
      nextDraft = {
        ...draft,
        composition: {
          kind: 'valueMap',
          inputId: first.id,
          mappings: [],
          fallback: { kind: 'static', value: '' },
        },
      };
      break;
    }
    case 'condition.compare':
    case 'condition.if': {
      const left = draft.inputs[0];
      const right = draft.inputs[1];
      if (!left) return draft;
      nextDraft = {
        ...draft,
        composition: {
          kind: 'condition',
          clauses: [{
            predicates: [{
              left: { kind: 'input', inputId: left.id },
              operator: 'eq',
              right: right ? { kind: 'input', inputId: right.id } : { kind: 'static', value: '' },
            }],
            thenOutput: { kind: 'static', value: '' },
          }],
          elseOutput: { kind: 'static', value: '' },
        },
      };
      break;
    }
    case 'condition.truthy': {
      const first = draft.inputs[0];
      if (!first) return draft;
      nextDraft = {
        ...draft,
        composition: {
          kind: 'condition',
          clauses: [{
            predicates: [{
              left: { kind: 'input', inputId: first.id },
              operator: 'isTruthy',
            }],
            thenOutput: { kind: 'static', value: '' },
          }],
          elseOutput: { kind: 'static', value: '' },
        },
      };
      break;
    }
    case 'text.upper': {
      nextDraft = applyInputTransform('upper');
      break;
    }
    case 'text.phoneDigits': {
      const firstInput = draft.inputs[0];
      if (!firstInput) return draft;

      const nextInputs = draft.inputs.map((input) =>
        input.id === firstInput.id
          ? {
              ...input,
              transforms: [
                ...input.transforms,
                { functionName: 'trim' },
                { functionName: 'replaceAll', args: [{ kind: 'static', value: '(' }, { kind: 'static', value: '' }] },
                { functionName: 'replaceAll', args: [{ kind: 'static', value: ')' }, { kind: 'static', value: '' }] },
                { functionName: 'replaceAll', args: [{ kind: 'static', value: '-' }, { kind: 'static', value: '' }] },
                { functionName: 'replaceAll', args: [{ kind: 'static', value: ' ' }, { kind: 'static', value: '' }] },
              ],
            }
          : input,
      );

      nextDraft = {
        ...draft,
        inputs: nextInputs,
      };
      break;
    }
    case 'text.lower':
    case 'text.trim':
    case 'text.substring':
    case 'text.replace':
    case 'text.length':
    case 'text.split':
    case 'number.round':
    case 'number.abs':
    case 'date.format':
    case 'array.flatten':
    case 'array.first':
    case 'array.nth':
    case 'array.join':
    case 'array.count':
    case 'array.get':
    case 'null.isNull':
    case 'convert.cast': {
      const transformed = applyInputTransformAction(actionId);
      if (transformed === null) return draft;
      nextDraft = transformed;
      break;
    }
    case 'array.array': {
      nextDraft = {
        ...draft,
        composition: {
          kind: 'arrayBuild',
          inputIds: draft.inputs.map((input) => input.id),
        },
      };
      break;
    }
    case 'array.merge': {
      nextDraft = {
        ...draft,
        composition: {
          kind: 'arrayMerge',
          inputIds: draft.inputs.map((input) => input.id),
        },
      };
      break;
    }
    case 'advanced.expression': {
      nextDraft = {
        ...draft,
        composition: {
          kind: 'advancedExpression',
          expression: draft.expression,
        },
      };
      break;
    }
    default:
      return draft;
  }

  return updateSmartBuilderExpression(nextDraft, generateSmartBuilderExpression(nextDraft));
}

function createBuilderInputId(existingIds: readonly string[]): string {
  let next = existingIds.length + 1;
  let candidate = `input-${next}`;
  const seen = new Set(existingIds);
  while (seen.has(candidate)) {
    next += 1;
    candidate = `input-${next}`;
  }
  return candidate;
}

function mapStagedToBuilderInput(
  staged: StagedInputField,
  inputId: string,
): ReturnType<typeof createEmptySmartBuilderDraft>['inputs'][number] {
  if (staged.kind === 'constant') {
    return {
      id: inputId,
      sourceKind: 'constant',
      label: staged.label ?? staged.constantName ?? 'Constant',
      constantName: staged.constantName,
      valueType: staged.valueType ?? 'unknown',
      sampleValue: staged.sampleValue,
      transforms: [],
    };
  }

  if (staged.kind === 'static') {
    return {
      id: inputId,
      sourceKind: 'static',
      label: staged.label ?? 'Fixed value',
      staticValue: staged.staticValue,
      valueType: staged.valueType ?? 'unknown',
      sampleValue: staged.sampleValue,
      transforms: [],
    };
  }

  if (staged.kind === 'item' || staged.kind === 'parent') {
    return {
      id: inputId,
      sourceKind: staged.kind,
      label: staged.label ?? staged.path,
      path: staged.path,
      valueType: staged.valueType ?? 'unknown',
      sampleValue: staged.sampleValue,
      transforms: [],
    };
  }

  if (staged.kind === 'expression') {
    return {
      id: inputId,
      sourceKind: 'expression',
      label: staged.label ?? 'Expression input',
      rawExpression: staged.rawExpression ?? staged.expression,
      valueType: staged.valueType ?? 'unknown',
      sampleValue: staged.sampleValue,
      transforms: [],
    };
  }

  if (staged.kind === 'enrichment') {
    return {
      id: inputId,
      sourceKind: 'enrichment',
      label: staged.alias ? `${staged.alias}.${staged.path}` : staged.path,
      externalName: staged.alias,
      path: staged.path,
      valueType: staged.valueType ?? 'unknown',
      sampleValue: staged.sampleValue,
      transforms: [],
    };
  }

  return {
    id: inputId,
    sourceKind: 'primary',
    label: staged.path,
    path: staged.path,
    valueType: staged.valueType ?? 'unknown',
    sampleValue: staged.sampleValue,
    transforms: [],
  };
}

export function applyStagedInputToSmartDraft(params: {
  readonly draft: SmartBuilderDraft;
  readonly staged: StagedInputField;
}): SmartSelectionResult {
  const { draft, staged } = params;

  const existingMatch = draft.inputs.find((input) => isSameStagedAsInput(input, staged));
  if (existingMatch && !draft.focusedSlotId) {
    const toggled = removeInputFromSmartDraft(draft, existingMatch.id);
    return {
      outcome: 'appended-to-tray',
      draft: toggled,
      expression: toggled.expression,
    };
  }

  const nextInput = mapStagedToBuilderInput(
    staged,
    createBuilderInputId(draft.inputs.map((input) => input.id)),
  );

  if (draft.focusedSlotId && draft.focusedSlotId.trim().length > 0) {
    const focusedSlotId = draft.focusedSlotId;
    let nextDraft: SmartBuilderDraft = setSlotScopedInput(draft, focusedSlotId, nextInput);

    const argumentFromFocusedInput = {
      kind: 'expression' as const,
      expression: staged.expression,
    };

    if (focusedSlotId.startsWith('condition:')) {
      const composition = nextDraft.composition?.kind === 'condition'
        ? nextDraft.composition
        : {
            kind: 'condition' as const,
            clauses: [{
              predicates: [{
                left: { kind: 'static' as const, value: '' },
                operator: 'eq' as const,
                right: { kind: 'static' as const, value: '' },
              }],
              thenOutput: { kind: 'static' as const, value: '' },
            }],
            elseOutput: { kind: 'static' as const, value: '' },
          };

      const [firstClause, ...remainingClauses] = composition.clauses;
      const [firstPredicate, ...remainingPredicates] = firstClause.predicates;

      const updatedPredicate =
        focusedSlotId === 'condition:left'
          ? { ...firstPredicate, left: argumentFromFocusedInput }
          : focusedSlotId === 'condition:right'
            ? { ...firstPredicate, right: argumentFromFocusedInput }
            : firstPredicate;

      const updatedClause = {
        ...firstClause,
        predicates: [updatedPredicate, ...remainingPredicates],
        thenOutput: focusedSlotId === 'condition:then'
          ? argumentFromFocusedInput
          : firstClause.thenOutput,
      };

      nextDraft = {
        ...nextDraft,
        composition: {
          ...composition,
          clauses: [updatedClause, ...remainingClauses],
          elseOutput: focusedSlotId === 'condition:else'
            ? argumentFromFocusedInput
            : composition.elseOutput,
        },
      };
    } else if (focusedSlotId === 'fallback:default') {
      const primaryInputId = nextDraft.composition?.kind === 'default'
        ? nextDraft.composition.inputId
        : nextDraft.inputs[0]?.id;
      if (primaryInputId) {
        nextDraft = {
          ...nextDraft,
          composition: {
            kind: 'default',
            inputId: primaryInputId,
            fallback: argumentFromFocusedInput,
          },
        };
      }
    }

    const expression = generateSmartBuilderExpression(nextDraft);
    const withExpression = updateSmartBuilderExpression(nextDraft, expression);
    return {
      outcome: 'filled-focused-slot',
      draft: withExpression,
      expression: withExpression.expression,
    };
  }

  if (draft.inputs.length === 0) {
    const directDraft = {
      ...draft,
      inputs: [nextInput],
      composition: { kind: 'direct' as const, inputId: nextInput.id },
    };
    const expression = generateSmartBuilderExpression(directDraft);
    const withExpression = updateSmartBuilderExpression(directDraft, expression);
    return {
      outcome: 'created-direct-draft',
      draft: withExpression,
      expression: withExpression.expression,
    };
  }

  const appended = {
    ...draft,
    inputs: [...draft.inputs, nextInput],
    composition: draft.composition?.kind === 'direct' ? null : draft.composition,
  };
  const expression = generateSmartBuilderExpression(appended);
  const withExpression = updateSmartBuilderExpression(appended, expression);
  return {
    outcome: 'appended-to-tray',
    draft: withExpression,
    expression: withExpression.expression,
  };
}

export function shouldUseArrayBuilderForSmartDraft(
  draft: SmartBuilderDraft,
): boolean {
  const hasArraySourceKind = draft.inputs.some((input) =>
    input.sourceKind === 'item' || input.sourceKind === 'parent',
  );
  const hasArrayTypeInput = draft.inputs.some((input) => input.valueType === 'array');
  const compositionKind = draft.composition?.kind;
  const hasArrayComposition = compositionKind === 'arrayBuild' || compositionKind === 'arrayMerge';

  return draft.targetType === 'array' || hasArraySourceKind || hasArrayTypeInput || hasArrayComposition;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div
      className="flex h-[calc(100vh-7rem)] flex-col items-center justify-center gap-4"
      data-testid="editor-loading"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      <p className="text-sm text-slate-400">Loading mapping editor…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex h-[calc(100vh-7rem)] flex-col items-center justify-center gap-4"
      data-testid="editor-load-error"
    >
      <p className="text-sm text-red-400">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry} data-testid="retry-button">
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route Page
// ---------------------------------------------------------------------------

export default function MappingEditor() {
  const { projectId = '', mappingId = '' } = useParams<{
    projectId: string;
    mappingId: string;
  }>();
  const location = useLocation();
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // Inline preview strip state
  // ---------------------------------------------------------------------------

  const editor = useMappingEditor(mappingId);
  const history = useVersionHistory(mappingId, editor.config);
  // ---------------------------------------------------------------------------
  // Project name (lightweight fetch — display only)
  // ---------------------------------------------------------------------------
  const adapter = useAdapter();
  const [isSamplePickerOpen, setIsSamplePickerOpen] = useState(false);
  const [isAddSampleOpen, setIsAddSampleOpen] = useState(false);
  const [sampleNameInput, setSampleNameInput] = useState('');
  const [sampleContentInput, setSampleContentInput] = useState('');
  const [sampleActionError, setSampleActionError] = useState<string | null>(null);
  const [isSampleActionLoading, setIsSampleActionLoading] = useState(false);
  const [isIssuesOpen, setIsIssuesOpen] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null | undefined>(undefined);
  const [samplePayloadCache, setSamplePayloadCache] = useState<Record<string, { raw: string; parsed: unknown | null }>>({});
  const [localSamplePayloadsBySchema, setLocalSamplePayloadsBySchema] = useState<Record<string, readonly SchemaSamplePayloadMetadata[]>>({});
  const [projectName, setProjectName] = useState<string>('Project');

  const sourceSchemaMetadata = editor.sourceSchemaDetail?.metadata ?? null;
  const sourceSchemaId = sourceSchemaMetadata?.schemaId ?? null;
  const sourceSchemaDataFormat = sourceSchemaMetadata?.dataFormat ?? 'json';

  const sourceSamples = useMemo(() => {
    const base = sourceSchemaMetadata?.samplePayloads ?? [];
    const localForSchema = sourceSchemaId ? (localSamplePayloadsBySchema[sourceSchemaId] ?? []) : [];
    if (localForSchema.length === 0) {
      return base;
    }

    const known = new Set(base.map((sample) => sample.sampleId));
    const extras = localForSchema.filter((sample) => !known.has(sample.sampleId));
    return [...base, ...extras];
  }, [localSamplePayloadsBySchema, sourceSchemaId, sourceSchemaMetadata?.samplePayloads]);

  const mappingDefaultSampleId = editor.configOptions.editorPreferences?.defaultSelectedSampleId ?? null;
  const resolvedSelectedSampleId = useMemo(() => {
    const resolvedFromPrecedence = resolveInitialSelectedSampleId({
      samples: sourceSamples,
      lastSelectedSampleId: readLastSelectedSampleId(mappingId),
      mappingDefaultSampleId,
    });

    if (selectedSampleId === undefined) {
      return resolvedFromPrecedence;
    }
    if (selectedSampleId === null) {
      return null;
    }

    if (sourceSamples.some((sample) => sample.sampleId === selectedSampleId)) {
      return selectedSampleId;
    }

    return resolvedFromPrecedence;
  }, [mappingDefaultSampleId, mappingId, selectedSampleId, sourceSamples]);

  const selectedSample = useMemo(
    () => sourceSamples.find((sample) => sample.sampleId === resolvedSelectedSampleId) ?? null,
    [resolvedSelectedSampleId, sourceSamples],
  );
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    adapter.getProject(projectId).then((detail) => {
      if (!cancelled) setProjectName(detail.name);
    }).catch(() => { /* silently fall back to 'Project' */ });
    return () => { cancelled = true; };
  }, [adapter, projectId]);

  const selectedSamplePayload = useMemo(() => {
    if (!resolvedSelectedSampleId) return null;
    return samplePayloadCache[resolvedSelectedSampleId] ?? null;
  }, [resolvedSelectedSampleId, samplePayloadCache]);
  const selectedSampleParsed = selectedSamplePayload?.parsed ?? null;

  const loadSamplePayload = useCallback(async (sample: SchemaSamplePayloadMetadata) => {
    const canLoad = typeof adapter.getSchemaSamplePayload === 'function';
    if (canLoad) {
      const response = await adapter.getSchemaSamplePayload(sample.schemaId, sample.sampleId);
      return {
        raw: response.raw,
        parsed: response.parsed,
      };
    }

    if (sample.source === 'initial_upload' && editor.sourceSchemaDetail) {
      const raw = typeof editor.sourceSchemaDetail.content === 'string'
        ? editor.sourceSchemaDetail.content
        : JSON.stringify(editor.sourceSchemaDetail.content);
      const parsed = typeof editor.sourceSchemaDetail.content === 'string'
        ? null
        : editor.sourceSchemaDetail.content;
      return { raw, parsed };
    }

    throw new Error('Sample payload retrieval is not available in this mode.');
  }, [adapter, editor.sourceSchemaDetail]);

  useEffect(() => {
    if (!resolvedSelectedSampleId) {
      return;
    }

    if (samplePayloadCache[resolvedSelectedSampleId]) {
      return;
    }

    const selected = sourceSamples.find((sample) => sample.sampleId === resolvedSelectedSampleId) ?? null;
    if (selected === null) {
      return;
    }

    let active = true;
    void loadSamplePayload(selected)
      .then((payload) => {
        if (!active) return;
        setSamplePayloadCache((prev) => {
          if (prev[selected.sampleId]) return prev;
          return { ...prev, [selected.sampleId]: payload };
        });
      })
      .catch((err) => {
        if (!active) return;
        setSampleActionError(err instanceof Error ? err.message : 'Failed to load selected sample payload.');
      });

    return () => {
      active = false;
    };
  }, [loadSamplePayload, resolvedSelectedSampleId, samplePayloadCache, sourceSamples]);

  const updateMappingDefaultSample = useCallback((sampleId: string | null) => {
    const currentPrefs = editor.configOptions.editorPreferences ?? {};

    if (sampleId === null) {
      const { defaultSelectedSampleId, ...rest } = currentPrefs;
      void defaultSelectedSampleId;
      editor.actions.updateConfig({
        editorPreferences: rest,
      });
      return;
    }

    editor.actions.updateConfig({
      editorPreferences: {
        ...currentPrefs,
        defaultSelectedSampleId: sampleId,
      },
    });
  }, [editor.actions, editor.configOptions.editorPreferences]);

  const selectSample = useCallback(async (
    sampleId: string | null,
    options?: {
      readonly persistLastSelected?: boolean;
      readonly persistMappingDefault?: boolean;
      readonly payloadHint?: { raw: string; parsed: unknown | null };
    },
  ) => {
    setSampleActionError(null);

    if (sampleId === null) {
      setSelectedSampleId(null);
      if (options?.persistLastSelected) {
        writeLastSelectedSampleId(mappingId, null);
      }
      if (options?.persistMappingDefault) {
        updateMappingDefaultSample(null);
      }
      return;
    }

    const sample = sourceSamples.find((entry) => entry.sampleId === sampleId) ?? null;
    if (!sample) {
      return;
    }

    if (options?.persistLastSelected) {
      writeLastSelectedSampleId(mappingId, sample.sampleId);
    }
    if (options?.persistMappingDefault) {
      updateMappingDefaultSample(sample.sampleId);
    }

    if (options?.payloadHint) {
      setSamplePayloadCache((prev) => ({ ...prev, [sample.sampleId]: options.payloadHint! }));
      setSelectedSampleId(sample.sampleId);
      return;
    }

    try {
      const payload = await loadSamplePayload(sample);
      setSamplePayloadCache((prev) => ({ ...prev, [sample.sampleId]: payload }));
      setSelectedSampleId(sample.sampleId);
    } catch (err) {
      setSampleActionError(err instanceof Error ? err.message : 'Failed to load selected sample payload.');
    }
  }, [loadSamplePayload, mappingId, sourceSamples, updateMappingDefaultSample]);

  const handleAddSample = useCallback(async () => {
    if (!sourceSchemaId) {
      setSampleActionError('Source schema is not available for adding samples.');
      return;
    }

    if (typeof adapter.addSchemaSample !== 'function') {
      setSampleActionError('Adding schema samples is not available in this mode.');
      return;
    }

    const trimmedContent = sampleContentInput.trim();
    if (!trimmedContent) {
      setSampleActionError('Sample payload content is required.');
      return;
    }

    let parsedForSubmit: unknown;
    let parsedForContext: unknown | null;
    if (sourceSchemaDataFormat === 'xml') {
      parsedForSubmit = trimmedContent;
      parsedForContext = null;
    } else {
      try {
        parsedForSubmit = JSON.parse(trimmedContent);
        parsedForContext = parsedForSubmit;
      } catch {
        setSampleActionError('Sample payload must be valid JSON.');
        return;
      }
    }

    setIsSampleActionLoading(true);
    setSampleActionError(null);

    try {
      const result = await adapter.addSchemaSample(sourceSchemaId, {
        sampleName: sampleNameInput.trim() || undefined,
        sampleContent: parsedForSubmit,
        applySuggestedUpdates: false,
      });

      setLocalSamplePayloadsBySchema((prev) => {
        if (!sourceSchemaId) {
          return prev;
        }

        const existing = prev[sourceSchemaId] ?? [];
        if (existing.some((sample) => sample.sampleId === result.sample.sampleId)) {
          return prev;
        }

        return {
          ...prev,
          [sourceSchemaId]: [...existing, result.sample],
        };
      });
      setIsAddSampleOpen(false);
      setSampleNameInput('');
      setSampleContentInput('');

      const payloadHint = {
        raw: trimmedContent,
        parsed: parsedForContext,
      };
      await selectSample(result.sample.sampleId, {
        persistLastSelected: true,
        persistMappingDefault: true,
        payloadHint,
      });
    } catch (err) {
      setSampleActionError(err instanceof Error ? err.message : 'Failed to add sample payload.');
    } finally {
      setIsSampleActionLoading(false);
    }
  }, [adapter, sampleContentInput, sampleNameInput, selectSample, sourceSchemaDataFormat, sourceSchemaId]);

  const sampleOutputByTargetPath = useMemo(() => {
    if (
      selectedSampleParsed === null
      || editor.config === null
      || editor.sourceSchemaDetail === null
      || editor.targetSchemaDetail === null
      || editor.parsedTargetSchema === null
    ) {
      return undefined;
    }

    try {
      const execution = executeMapping(
        editor.config,
        selectedSampleParsed,
        editor.sourceSchemaDetail.content,
        editor.targetSchemaDetail.content,
      );

      const next: Record<string, string | null> = {};
      for (const node of editor.parsedTargetSchema.nodes) {
        next[node.path] = resolveFieldTestValue(execution.output, node.path) ?? null;
      }
      return next;
    } catch {
      return undefined;
    }
  }, [
    editor.config,
    editor.parsedTargetSchema,
    editor.sourceSchemaDetail,
    editor.targetSchemaDetail,
    selectedSampleParsed,
  ]);

  const sampleArrayItemCountByTargetPath = useMemo(() => {
    if (selectedSampleParsed === null || editor.parsedTargetSchema === null) {
      return undefined;
    }

    const next: Record<string, number | null> = {};
    for (const node of editor.parsedTargetSchema.nodes) {
      if (node.type !== 'array') continue;
      const value = resolveValueAtPath(selectedSampleParsed, node.path);
      next[node.path] = Array.isArray(value) ? value.length : null;
    }
    return next;
  }, [editor.parsedTargetSchema, selectedSampleParsed]);

  const sampleSelectorSlot = (
    <div className="relative" data-testid="sample-picker-slot">
      <button
        type="button"
        onClick={() => setIsSamplePickerOpen((prev) => !prev)}
        data-testid="sample-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={isSamplePickerOpen}
        className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
      >
        Sample: {selectedSample?.name ?? 'None'}
      </button>

      {isSamplePickerOpen && (
        <div
          role="dialog"
          aria-label="Select source sample payload"
          data-testid="sample-picker-popover"
          className="absolute right-0 z-50 mt-1 w-80 rounded border border-slate-700 bg-slate-900 p-2 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-200">Source samples</p>
            <button
              type="button"
              onClick={() => setIsSamplePickerOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Close
            </button>
          </div>

          <div className="max-h-56 space-y-1 overflow-auto" data-testid="sample-picker-list">
            <button
              type="button"
              onClick={() => {
                void selectSample(null, {
                  persistLastSelected: true,
                  persistMappingDefault: true,
                });
                setIsSamplePickerOpen(false);
              }}
              data-testid="sample-picker-option-none"
              className="w-full rounded border border-slate-700 px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
            >
              No sample
            </button>

            {sourceSamples.map((sample) => (
              <button
                key={sample.sampleId}
                type="button"
                onClick={() => {
                  void selectSample(sample.sampleId, {
                    persistLastSelected: true,
                    persistMappingDefault: true,
                  });
                  setIsSamplePickerOpen(false);
                }}
                data-testid={`sample-picker-option-${sample.sampleId}`}
                className={[
                  'w-full rounded border px-2 py-1.5 text-left text-xs transition-colors',
                  resolvedSelectedSampleId === sample.sampleId
                    ? 'border-blue-600 bg-blue-900/30 text-blue-200'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800',
                ].join(' ')}
              >
                <p className="truncate font-medium">{sample.name}</p>
                <p className="text-[10px] text-slate-500">{sample.dataFormat.toUpperCase()}</p>
              </button>
            ))}

            {sourceSamples.length === 0 && (
              <p className="rounded border border-slate-700 bg-slate-800/40 px-2 py-2 text-xs text-slate-500" data-testid="sample-picker-empty">
                No samples available for this source schema.
              </p>
            )}
          </div>

          <div className="mt-2 border-t border-slate-800 pt-2">
            <button
              type="button"
              data-testid="sample-picker-add-sample"
              onClick={() => {
                setSampleActionError(null);
                setIsAddSampleOpen(true);
              }}
              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 transition-colors hover:bg-slate-700"
            >
              Add sample payload
            </button>
          </div>

          {sampleActionError && (
            <p className="mt-2 text-xs text-red-300" role="alert" data-testid="sample-picker-error">
              {sampleActionError}
            </p>
          )}
        </div>
      )}

      {isAddSampleOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" data-testid="sample-add-dialog">
          <div role="dialog" aria-modal="true" aria-label="Add sample payload" className="w-full max-w-lg rounded border border-slate-700 bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-slate-100">Add sample payload</h2>
            <p className="mt-1 text-xs text-slate-500">Expected format: {sourceSchemaDataFormat.toUpperCase()}</p>

            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={sampleNameInput}
                onChange={(e) => setSampleNameInput(e.target.value)}
                placeholder="Sample name (optional)"
                data-testid="sample-add-name"
                className="h-8 w-full rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <textarea
                value={sampleContentInput}
                onChange={(e) => setSampleContentInput(e.target.value)}
                rows={8}
                placeholder={sourceSchemaDataFormat === 'xml' ? '<root />' : '{ "example": true }'}
                data-testid="sample-add-content"
                className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {sampleActionError && (
              <p className="mt-2 text-xs text-red-300" role="alert" data-testid="sample-add-error">
                {sampleActionError}
              </p>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddSampleOpen(false)}
                disabled={isSampleActionLoading}
                data-testid="sample-add-cancel"
                className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleAddSample(); }}
                disabled={isSampleActionLoading || sampleContentInput.trim().length === 0}
                data-testid="sample-add-submit"
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {isSampleActionLoading ? 'Saving…' : 'Save sample'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Record recent activity when the mapping loads successfully (FS-049 T-03)
  const { recordActivity } = useRecentActivity();
  useEffect(() => {
    if (editor.loadState === 'loaded' && editor.mappingName) {
      recordActivity({ type: 'mapping', id: mappingId, projectId, name: editor.mappingName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on successful load
  }, [editor.loadState]);

  // ---------------------------------------------------------------------------
  // History drawer state
  // ---------------------------------------------------------------------------
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isChangesOverlayOpen, setIsChangesOverlayOpen] = useState(false);

  const navigationAutoMapCreateNotice = useMemo(() => {
    const navState = location.state as Record<string, unknown> | null;
    return navState && typeof navState.autoMapCreateNotice === 'string'
      ? navState.autoMapCreateNotice
      : null;
  }, [location.state]);
  const [dismissedAutoMapCreateNotice, setDismissedAutoMapCreateNotice] = useState<string | null>(null);
  const autoMapCreateNotice =
    navigationAutoMapCreateNotice !== null && navigationAutoMapCreateNotice !== dismissedAutoMapCreateNotice
      ? navigationAutoMapCreateNotice
      : null;

  const pendingAutoMapSession = useMemo(() => getPendingAutoMapSession(mappingId), [mappingId]);
  const initialPendingSectionPath =
    pendingAutoMapSession.pendingCount > 0
      ? (pendingAutoMapSession.primarySectionPath ?? '')
      : null;

  // ---------------------------------------------------------------------------
  // View state (must be before handleAutoMapTrigger)
  // ---------------------------------------------------------------------------
  const [view, setView] = useState<EditorView>(() => (initialPendingSectionPath !== null ? 'automap' : 'target'));

  // ---------------------------------------------------------------------------
  // Auto-Map workspace mode state (FS-048 T-02)
  // ---------------------------------------------------------------------------
  /** The section path currently loaded in the Auto-Map workspace (preserved across exits). */
  const [autoMapSectionPath, setAutoMapSectionPath] = useState<string | null>(initialPendingSectionPath);
  const [visibleAutoMapScope, setVisibleAutoMapScope] = useState<{ visibleTargetPaths: string[]; count: number }>({
    visibleTargetPaths: [],
    count: 0,
  });

  // ---------------------------------------------------------------------------
  // Auto-Map workspace hook (FS-048 T-10) — canonical review path
  // ---------------------------------------------------------------------------
  const autoMapWorkspace = useAutoMapWorkspace({
    adapter,
    mappingId,
    projectId,
    rules: editor.rules,
    updateDraft: editor.actions.updateDraft,
    setSelectedTargetPath: (path: string) => setSelectedTargetPath(resolveSelectedTargetPath(path)),
    exitWorkspace: () => setView('target'),
    parsedSourceSchema: editor.parsedSourceSchema,
    parsedTargetSchema: editor.parsedTargetSchema,
  });

  const hydratedPendingSessionForMappingIdRef = useRef<string | null>(null);

  /** Enter the Auto-Map workspace for a given section path. */
  const enterAutoMapWorkspace = useCallback((sectionPath: string) => {
    setAutoMapSectionPath(sectionPath);
    setView('automap');
  }, []);

  /** Exit the Auto-Map workspace and return to Target view. Preserves selectedTargetPath and autoMapSectionPath. */
  const exitAutoMapWorkspace = useCallback(() => {
    setView('target');
    // selectedTargetPath is intentionally preserved (spec AE-06)
    // autoMapSectionPath is intentionally preserved for re-entry (spec note)
  }, []);

  // Mutual exclusion: close history drawer when auto-map workspace opens
  const handleOpenHistory = useCallback(() => {
    setIsHistoryOpen(true);
  }, []);

  const handleAutoMapTrigger = useCallback(
    (sectionPath: string, visibleTargetPaths?: readonly string[]) => {
      setIsHistoryOpen(false);
      enterAutoMapWorkspace(sectionPath);
      autoMapWorkspace.triggerAutoMap(sectionPath, visibleTargetPaths);
    },
    [enterAutoMapWorkspace, autoMapWorkspace],
  );

  const handleAutoMapAll = useCallback(() => {
    setIsHistoryOpen(false);
    // T-10: header-level "Auto-map" triggers workspace for the root section
    enterAutoMapWorkspace('');
    void autoMapWorkspace.triggerAutoMap('', visibleAutoMapScope.visibleTargetPaths);
  }, [enterAutoMapWorkspace, autoMapWorkspace, visibleAutoMapScope.visibleTargetPaths]);

  // Create-time and re-entry-safe auto-map pending session hydration.
  useEffect(() => {
    if (initialPendingSectionPath === null) {
      return;
    }

    if (hydratedPendingSessionForMappingIdRef.current === mappingId) {
      return;
    }

    hydratedPendingSessionForMappingIdRef.current = mappingId;
    autoMapWorkspace.triggerAutoMap(initialPendingSectionPath);
  }, [mappingId, initialPendingSectionPath, autoMapWorkspace]);

  // ---------------------------------------------------------------------------
  // Restore handler
  // ---------------------------------------------------------------------------
  const handleRestore = useCallback(
    (version: number) => {
      const restoreConfig = history.getRestoreConfig(version);
      if (restoreConfig) {
        editor.actions.restore(restoreConfig);
        setIsHistoryOpen(false);
        setTimeout(() => history.refresh(), 500);
      }
    },
    [history, editor.actions],
  );

  /** Whether the Refresh All confirmation banner is showing */
  const [showRefreshAllConfirm, setShowRefreshAllConfirm] = useState(false);

  // ---------------------------------------------------------------------------
  // Target View selection state
  // ---------------------------------------------------------------------------
  const [selectedTargetPath, setSelectedTargetPath] = useState<string | null>(null);

  const resolveSelectedTargetPath = useCallback(
    (path: string) => {
      if (!editor.parsedTargetSchema) return path;
      return resolveBuilderTargetPath(editor.parsedTargetSchema.nodes, path);
    },
    [editor.parsedTargetSchema],
  );

  // Consume jump-to-rule route state from TestLabPage (FS-036 T-07)
  useEffect(() => {
    const incomingPath = (location.state as Record<string, unknown> | null)?.selectedTargetPath;
    if (incomingPath && typeof incomingPath === 'string') {
      setSelectedTargetPath(resolveSelectedTargetPath(incomingPath));
      // Clear the state to prevent stale re-application on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, resolveSelectedTargetPath]);

  // ---------------------------------------------------------------------------
  // Rules View selection state
  // ---------------------------------------------------------------------------
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null);
  const [stagedInputField, setStagedInputField] = useState<StagedInputField | null>(null);
  const smartDraftByTargetRef = useRef(new Map<string, ReturnType<typeof createEmptySmartBuilderDraft>>());
  const [smartDraftByTargetState, setSmartDraftByTargetState] = useState<Record<string, SmartBuilderDraft>>({});
  const [smartActionMetaByTarget, setSmartActionMetaByTarget] = useState<Record<string, SmartActionMeta>>({});

  const setSmartDraftForTarget = useCallback((targetPath: string, draft: SmartBuilderDraft) => {
    smartDraftByTargetRef.current.set(targetPath, draft);
    setSmartDraftByTargetState((prev) => ({ ...prev, [targetPath]: draft }));
    setSmartActionMetaByTarget((prev) => {
      const derived = deriveSmartActionMetaFromDraft(draft);
      return {
        ...prev,
        [targetPath]: {
          ...(prev[targetPath] ?? { activeActionId: null, concatSeparator: ' ', announcement: null }),
          activeActionId: derived.activeActionId,
          concatSeparator: derived.concatSeparator,
        },
      };
    });
  }, []);

  const handleSmartFocusedSlotChange = useCallback((targetPath: string, slotId: string | null) => {
    const existing = smartDraftByTargetRef.current.get(targetPath);
    if (!existing) return;
    const nextDraft = { ...existing, focusedSlotId: slotId };
    setSmartDraftForTarget(targetPath, nextDraft);
  }, [setSmartDraftForTarget]);
  const [isSourceBrowseOpen, setIsSourceBrowseOpen] = useState(false);
  const [isSourcePanelHidden, setIsSourcePanelHidden] = useState(false);
  const [isBuilderPanelHidden, setIsBuilderPanelHidden] = useState(false);

  // Expression builder for Rules View (existing pattern)
  const builderResult = useExpressionBuilder({
    selectedRuleIndex,
    rules: editor.rules,
    updateRule: editor.actions.updateRule,
    parsedSourceSchema: editor.parsedSourceSchema,
  });
  const expressionBuilderRef = useRef<ExpressionBuilderPanelRef>(null);

  // ---------------------------------------------------------------------------
  // View toggle with selection persistence
  // ---------------------------------------------------------------------------
  const handleViewToggle = useCallback(
    (nextView: EditorView) => {
      if (nextView === view) return;
      // 'automap' is entered via enterAutoMapWorkspace only — not via the toggle
      if (nextView === 'automap') return;

      if (nextView === 'rules') {
        // Target → Rules: find rule matching selected target path
        if (selectedTargetPath !== null) {
          const idx = editor.rules.findIndex((r) => r.target === selectedTargetPath);
          setSelectedRuleIndex(idx >= 0 ? idx : null);
        }
      } else {
        // Rules → Target: resolve selected rule's target path
        if (selectedRuleIndex !== null) {
          const rule = editor.rules[selectedRuleIndex];
          setSelectedTargetPath(rule ? resolveSelectedTargetPath(rule.target) : null);
        }
      }

      setView(nextView);
    },
    [view, selectedTargetPath, selectedRuleIndex, editor.rules, resolveSelectedTargetPath],
  );

  // ---------------------------------------------------------------------------
  // Target node selection — auto-draft model.
  // Field-to-field navigation auto-commits the current field's draft (no dialog).
  // ---------------------------------------------------------------------------

  const handleSelectTargetNode = useCallback(
    (path: string) => {
      // Auto-commit the outgoing field's draft before hydrating the new field.
      // The draft is already stored via updateDraft on every keystroke; this
      // call is a semantic commit that makes the intent explicit.
      if (selectedTargetPath !== null) {
        const currentDraft = editor.actions.getDraftExpression(selectedTargetPath);
        if (currentDraft !== null) {
          editor.actions.commitDraft(selectedTargetPath, currentDraft);
        }
      }
      setStagedInputField(null);
      setIsBuilderPanelHidden(false);
      setIsSourcePanelHidden(false);
      setSelectedTargetPath(resolveSelectedTargetPath(path));
    },
    [selectedTargetPath, editor.actions, resolveSelectedTargetPath],
  );

  const effectiveRules = useMemo(
    () => editor.config?.rules ?? editor.rules,
    [editor.config, editor.rules],
  );

  const effectiveRulesByTarget = useMemo(() => {
    const map = new Map<string, typeof effectiveRules[number][]>();
    for (const rule of effectiveRules) {
      const bucket = map.get(rule.target) ?? [];
      bucket.push(rule);
      map.set(rule.target, bucket);
    }
    return map;
  }, [effectiveRules]);

  // ---------------------------------------------------------------------------
  // Derived: target status map (for ObjectSummaryPanel child info)
  // ---------------------------------------------------------------------------
  const targetMappingStatus = useMemo<Map<string, TargetFieldStatus> | undefined>(() => {
    if (!editor.parsedTargetSchema) return undefined;
    const statusMap = new Map<string, TargetFieldStatus>();
    const targetPaths = collectTargetSchemaPaths(editor.parsedTargetSchema.nodes);
    for (const path of targetPaths) statusMap.set(path, 'unmapped');

    const ruleIndexesByTarget = new Map<string, number[]>();
    effectiveRules.forEach((rule, index) => {
      const bucket = ruleIndexesByTarget.get(rule.target) ?? [];
      bucket.push(index);
      ruleIndexesByTarget.set(rule.target, bucket);
    });

    for (const [path, indexes] of ruleIndexesByTarget.entries()) {
      if (!statusMap.has(path)) continue;

      const rulesAtPath = effectiveRulesByTarget.get(path) ?? [];
      const hasNonEmptyExpression = rulesAtPath.some((rule) => rule.expression.trim().length > 0);
      if (!hasNonEmptyExpression) {
        statusMap.set(path, 'unmapped');
        continue;
      }

      let hasErrorDiagnostics = false;
      let hasWarningDiagnostics = false;
      for (const ruleIndex of indexes) {
        const diagnostics = editor.validation.diagnosticsForRule(ruleIndex);
        if (diagnostics.some((d) => d.severity === 'error')) {
          hasErrorDiagnostics = true;
          break;
        }
        if (diagnostics.some((d) => d.severity === 'warning')) {
          hasWarningDiagnostics = true;
        }
      }

      if (hasErrorDiagnostics) {
        statusMap.set(path, 'error');
      } else if (hasWarningDiagnostics) {
        statusMap.set(path, 'warning');
      } else {
        statusMap.set(path, 'mapped');
      }
    }
    return statusMap;
  }, [editor.parsedTargetSchema, effectiveRules, effectiveRulesByTarget, editor.validation]);

  // Leaf-field coverage map — used by ObjectSummaryPanel for accurate x/y ratio
  const { coverageMap: leafCoverageMap } = useTargetStatus(
    effectiveRules,
    editor.validation.result ?? null,
    editor.parsedTargetSchema?.nodes ?? [],
  );

  // ---------------------------------------------------------------------------
  // Sync the "clean" baseline expression when the selected target field changes.
  // We update a ref (not state) so this does not trigger an extra render.
  // The baseline is the expression already applied for this field (or "" if
  // ---------------------------------------------------------------------------
  // "Start with required fields" CTA from BuilderEmptyState
  // ---------------------------------------------------------------------------
  const handleFilterRequired = useCallback(() => {
    // No-op: filter chips now live inside TargetWorklist
  }, []);

  // ---------------------------------------------------------------------------
  // Derived: selected node info (for right panel)
  // ---------------------------------------------------------------------------
  const selectedNode = useMemo(() => {
    if (!selectedTargetPath || !editor.parsedTargetSchema) return null;
    return findNodeByPath(editor.parsedTargetSchema.nodes, selectedTargetPath) ?? null;
  }, [selectedTargetPath, editor.parsedTargetSchema]);

  const selectedNodeStatus = useMemo((): TargetFieldStatus => {
    if (!selectedTargetPath || !targetMappingStatus) return 'unmapped';
    return targetMappingStatus.get(selectedTargetPath) ?? 'unmapped';
  }, [selectedTargetPath, targetMappingStatus]);

  const selectedNodeExpression = useMemo(() => {
    if (!selectedTargetPath) return '';
    return editor.rules.find((r) => r.target === selectedTargetPath)?.expression ?? '';
  }, [selectedTargetPath, editor.rules]);

  const selectedRuleIndexForSmartFix = useMemo(() => {
    if (!selectedTargetPath) return null;
    const idx = editor.rules.findIndex((r) => r.target === selectedTargetPath);
    return idx >= 0 ? idx : null;
  }, [selectedTargetPath, editor.rules]);

  const selectedRuleDiagnosticsForSmartFix = useMemo(() => {
    if (selectedRuleIndexForSmartFix === null) return [];
    return editor.validation.diagnosticsForRule(selectedRuleIndexForSmartFix);
  }, [editor.validation, selectedRuleIndexForSmartFix]);

  const resolveSmartDraftForTarget = useCallback((targetPath: string) => {
    const existing = smartDraftByTargetRef.current.get(targetPath);
    if (existing) return { draft: existing, guided: true as const };

    const node = editor.parsedTargetSchema
      ? findNodeByPath(editor.parsedTargetSchema.nodes, targetPath)
      : undefined;

    const targetType = node ? toTargetFieldType(node.type) : 'string';
    const isRequired = node?.isRequired ?? false;
    const effectiveExpression = editor.actions.getDraftExpression(targetPath)
      ?? editor.rules.find((rule) => rule.target === targetPath)?.expression
      ?? '';

    const hydrated = hydrateSmartBuilderFromExpression({
      expression: effectiveExpression,
      targetPath,
      targetType,
      isRequired,
      sourceValueTypeByPath: Object.fromEntries(
        (editor.parsedSourceSchema?.nodes ?? []).map((sourceNode) => [
          sourceNode.path,
          toTargetFieldType(sourceNode.type),
        ]),
      ),
    });

    if (hydrated.kind === 'advanced') {
      return { draft: null, guided: false as const };
    }

    setSmartDraftForTarget(targetPath, hydrated.draft);
    return { draft: hydrated.draft, guided: true as const };
  }, [editor.actions, editor.parsedSourceSchema?.nodes, editor.parsedTargetSchema, editor.rules, setSmartDraftForTarget]);

  const selectedNodeSmartHydration = useMemo(() => {
    if (!selectedNode) return null;
    const existing = smartDraftByTargetState[selectedNode.path];
    if (!existing) return null;
    return { kind: 'guided' as const, draft: existing };
  }, [selectedNode, smartDraftByTargetState]);

  const clearSmartParameterDraftForTarget = useCallback((targetPath: string) => {
    const existing = smartDraftByTargetRef.current.get(targetPath);
    if (!existing || existing.pendingActionDraft === null) return;
    const nextDraft = {
      ...existing,
      pendingActionDraft: null,
    };
    setSmartDraftForTarget(targetPath, nextDraft);
  }, [setSmartDraftForTarget]);

  const beginSmartParameterEditForTarget = useCallback((input: {
    targetPath: string;
    actionId: string;
    values?: Readonly<Record<string, string | number | boolean>>;
  }) => {
    const resolved = resolveSmartDraftForTarget(input.targetPath);
    if (!resolved.guided || resolved.draft === null) return;

    const pendingActionDraft = createActionParameterDraft({
      actionId: input.actionId,
      values: input.values,
    });

    const nextDraft = {
      ...resolved.draft,
      pendingActionDraft,
    };
    setSmartDraftForTarget(input.targetPath, nextDraft);
  }, [resolveSmartDraftForTarget, setSmartDraftForTarget]);

  const updateSmartParameterDraftValueForTarget = useCallback((input: {
    targetPath: string;
    actionId: string;
    fieldId: string;
    value: string | number | boolean | '';
  }) => {
    const resolved = resolveSmartDraftForTarget(input.targetPath);
    if (!resolved.guided || resolved.draft === null) return;

    const current = resolved.draft.pendingActionDraft;
    if (!current || current.actionId !== input.actionId) return;

    const nextValues: Record<string, string | number | boolean> = {
      ...current.values,
    };

    if (input.value === '') {
      delete nextValues[input.fieldId];
    } else {
      nextValues[input.fieldId] = input.value;
    }

    const pendingActionDraft = createActionParameterDraft({
      actionId: input.actionId,
      values: nextValues,
    });

    const nextDraft = {
      ...resolved.draft,
      pendingActionDraft,
    };
    setSmartDraftForTarget(input.targetPath, nextDraft);
  }, [resolveSmartDraftForTarget, setSmartDraftForTarget]);

  const resetSmartParameterDraftForTarget = useCallback((targetPath: string, actionId: string) => {
    beginSmartParameterEditForTarget({
      targetPath,
      actionId,
    });
  }, [beginSmartParameterEditForTarget]);

  const selectedInputsForSourcePanel = useMemo(() => {
    if (!selectedTargetPath) return [] as { kind: 'primary' | 'enrichment' | 'constant' | 'static' | 'item' | 'parent' | 'expression'; path: string; alias?: string }[];
    const draft = smartDraftByTargetState[selectedTargetPath];
    if (!draft) return [] as { kind: 'primary' | 'enrichment' | 'constant' | 'static' | 'item' | 'parent' | 'expression'; path: string; alias?: string }[];

    return draft.inputs
      .filter((input) => input.path)
      .map((input) => ({
        kind: input.sourceKind,
        path: input.path ?? '',
        alias: input.externalName,
      }));
  }, [selectedTargetPath, smartDraftByTargetState]);

  const autoMapSuggestionStatusByPath = useMemo(() => {
    const statusMap: Record<string, 'suggested' | 'accepted' | 'edited' | 'dismissed' | 'stale'> = {};
    for (const item of autoMapWorkspace.items) {
      statusMap[item.targetPath] = item.status;
    }
    return statusMap;
  }, [autoMapWorkspace.items]);

  const consolidatedIssues = useMemo<readonly ConsolidatedIssueItem[]>(() => {
    if (!editor.validation.result) return [];
    return editor.validation.result.diagnostics
      .filter((diag) => diag.severity === 'error' || diag.severity === 'warning')
      .filter((diag) => typeof diag.targetPath === 'string' && diag.targetPath.length > 0)
      .map((diag, index) => ({
        id: `${diag.code}:${diag.targetPath}:${index}`,
        targetPath: diag.targetPath!,
        severity: diag.severity,
        message: diag.message,
      }));
  }, [editor.validation.result]);

  const issueCount = consolidatedIssues.length;

  const { requiredFieldCount, requiredMappedCount, warningCount, errorCount } = useMemo(() => {
    const nodes = editor.parsedTargetSchema?.nodes ?? [];
    const requiredLeaves = nodes.filter((node) => node.childCount === 0 && node.isRequired);

    const mappedTargets = new Set(
      effectiveRules
        .filter((rule) => rule.expression.trim().length > 0)
        .map((rule) => rule.target),
    );
    const requiredMapped = requiredLeaves.filter((node) => mappedTargets.has(node.path)).length;

    let warnings = 0;
    let errors = 0;
    for (const diag of editor.validation.result?.diagnostics ?? []) {
      if (diag.severity === 'warning') warnings += 1;
      if (diag.severity === 'error') errors += 1;
    }

    return {
      requiredFieldCount: requiredLeaves.length,
      requiredMappedCount: requiredMapped,
      warningCount: warnings,
      errorCount: errors,
    };
  }, [editor.parsedTargetSchema?.nodes, effectiveRules, editor.validation.result]);

  const testLabPath = useMemo(
    () => PATHS.MAPPING_TEST.replace(':projectId', projectId).replace(':mappingId', mappingId),
    [mappingId, projectId],
  );
  const deploymentPath = useMemo(
    () => PATHS.MAPPING_DEPLOYMENT.replace(':projectId', projectId).replace(':mappingId', mappingId),
    [mappingId, projectId],
  );

  // ---------------------------------------------------------------------------
  // Route-level navigation guard (unsaved changes)
  // useBlocker must be called unconditionally (Rules of Hooks)
  // ---------------------------------------------------------------------------
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname &&
      editor.hasUnsavedChanges,
  );

  // "Discard & Leave" — clear all drafts then proceed
  const handleBlockerDiscard = useCallback(() => {
    editor.actions.revertAllDrafts();
    blocker.proceed?.();
  }, [editor.actions, blocker]);

  // "Cancel" — stay and preserve drafts
  const handleBlockerCancel = useCallback(() => {
    blocker.reset?.();
  }, [blocker]);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------
  if (editor.loadState === 'loading') return <LoadingSkeleton />;
  if (editor.loadState === 'error') {
    return (
      <LoadError
        message={editor.loadError ?? 'Failed to load mapping'}
        onRetry={editor.actions.retry}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Slot content
  // ---------------------------------------------------------------------------

  // Source panel (left column)
  const sourceContent = editor.parsedSourceSchema ? (
    <SourceSchemaPanel
      parsedSourceSchema={editor.parsedSourceSchema}
      enrichmentInputGroups={editor.enrichmentInputSchemas}
      sourceSchemaName={editor.sourceSchemaName}
      selectedInputs={selectedInputsForSourcePanel}
      onStageField={(field) => {
        if (view === 'rules') {
          expressionBuilderRef.current?.insertSourceField(field);
          return;
        }

        if (!selectedTargetPath) {
          setStagedInputField(field);
          return;
        }

        const resolved = resolveSmartDraftForTarget(selectedTargetPath);
        if (!resolved.guided || resolved.draft === null) {
          setStagedInputField(field);
          return;
        }

        const nextSelection = applyStagedInputToSmartDraft({ draft: resolved.draft, staged: field });
        setSmartDraftForTarget(selectedTargetPath, nextSelection.draft);
        editor.actions.updateDraft(selectedTargetPath, nextSelection.expression);
        setStagedInputField(null);
      }}
      className="h-full"
    />
  ) : undefined;

  // Right column: Target Worklist (target view) or RuleList (rules view)
  const targetWorklistContent =
    view === 'rules' ? (
      <div className="flex h-full min-h-0 flex-col" data-testid="rules-view-panel">
        <AiValidationPanel
          status={editor.aiValidation.status}
          report={editor.aiValidation.report}
          error={editor.aiValidation.error}
          rules={editor.rules}
          onRun={() => {
            editor.actions.runAiValidation();
          }}
          onRetry={() => {
            editor.actions.retryAiValidation();
          }}
          onReset={() => {
            editor.actions.resetAiValidation();
          }}
          onNavigateToRule={(ruleIndex) => {
            setSelectedRuleIndex(ruleIndex);
          }}
        />

        <div className="min-h-0 flex-1">
          <RuleList
            rules={editor.rules}
            schemasLoaded={editor.schemasLoaded}
            summary={editor.validation.summary}
            coveragePercent={editor.validation.coveragePercent}
            isValidating={editor.validation.isValidating}
            diagnosticsForRule={editor.validation.diagnosticsForRule}
            selectedRuleIndex={selectedRuleIndex}
            onRuleSelect={setSelectedRuleIndex}
            view={view}
            onViewToggle={handleViewToggle}
            onAddRule={editor.actions.addRule}
            onEditRule={editor.actions.updateRule}
            onDeleteRule={editor.actions.deleteRule}
            onReorderRule={editor.actions.reorderRules}
            onBulkDelete={editor.actions.bulkDelete}
            onBulkDuplicate={editor.actions.bulkDuplicate}
            onPasteRules={editor.actions.pasteRules}
          />
        </div>
      </div>
    ) : (
      <TargetWorklist
        nodes={editor.parsedTargetSchema?.nodes ?? []}
        rules={effectiveRules}
        validationResult={editor.validation.result ?? null}
        selectedPath={selectedTargetPath}
        condensed={selectedNode !== null && !isBuilderPanelHidden}
        groupingMode="schema"
        onSelectNode={handleSelectTargetNode}
        onClearSelection={() => setSelectedTargetPath(null)}
        onVisibleScopeChange={setVisibleAutoMapScope}
        autoMapSuggestionStatusByPath={autoMapSuggestionStatusByPath}
        targetSchemaName={editor.targetSchemaName}
        sampleOutputByTargetPath={sampleOutputByTargetPath}
        sampleArrayItemCountByTargetPath={sampleArrayItemCountByTargetPath}
        className="h-full"
      />
    );

  const autoMapWorkspaceContent = (
    <AutoMapWorkspace
      status={autoMapWorkspace.status}
      error={autoMapWorkspace.error}
      items={autoMapWorkspace.items}
      filteredItems={autoMapWorkspace.filteredItems}
      summary={autoMapWorkspace.summary}
      sectionPath={autoMapSectionPath}
      onRetry={() => {
        if (autoMapSectionPath !== null) {
          autoMapWorkspace.triggerAutoMap(autoMapSectionPath);
        }
      }}
      onRefreshAll={autoMapWorkspace.refreshAll}
      onRefreshUnmapped={autoMapWorkspace.refreshUnmapped}
      onAcceptAllValid={autoMapWorkspace.bulkAcceptAllValid}
      batchAcceptResult={autoMapWorkspace.lastBatchAcceptResult}
      onClearBatchAcceptResult={autoMapWorkspace.clearBatchAcceptResult}
      onExitWorkspace={exitAutoMapWorkspace}
      onAccept={autoMapWorkspace.acceptSuggestion}
      onEdit={autoMapWorkspace.editSuggestion}
      onDismiss={autoMapWorkspace.dismissSuggestion}
      onUndoDismiss={autoMapWorkspace.undoDismiss}
      previousSuggestionsAvailable={autoMapWorkspace.previousSuggestionsAvailable}
      onRestorePrevious={autoMapWorkspace.restorePreviousSuggestions}
      generatedAt={autoMapWorkspace.generatedAt}
      className="h-full"
      toolbarSlot={() => (
        <WorkspaceToolbar
          activeFilters={autoMapWorkspace.activeFilters}
          onToggleFilter={autoMapWorkspace.toggleFilter}
          onClearFilters={autoMapWorkspace.clearFilters}
          summary={autoMapWorkspace.summary}
          items={autoMapWorkspace.items}
          onRefreshStale={autoMapWorkspace.refreshStale}
          isRefreshing={autoMapWorkspace.status === 'loading'}
        />
      )}
      confirmationSlot={
        showRefreshAllConfirm ? (
          <RefreshConfirmBanner
            refreshCount={autoMapWorkspace.items.length}
            preservedCount={
              autoMapWorkspace.items.filter(
                (i) => i.status === 'accepted' || i.status === 'edited',
              ).length
            }
            onConfirm={() => {
              setShowRefreshAllConfirm(false);
              autoMapWorkspace.refreshAll();
            }}
            onCancel={() => setShowRefreshAllConfirm(false)}
          />
        ) : null
      }
      noSourceDataSlot={<WorkspaceNoSourceDataSlot />}
    />
  );

  // Center panel: node-type-specific builder (target view) or expression builder (rules view)
  const builderContentInner =
    view === 'rules' ? (
      <div
        className="h-full min-h-0"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            builderResult.flushCommit();
          }
        }}
        data-testid="expression-builder-container"
      >
        <ExpressionBuilderPanel
          ref={expressionBuilderRef}
          builderState={builderResult}
          parsedSourceSchema={editor.parsedSourceSchema}
          enrichmentInputGroups={editor.enrichmentInputSchemas}
          sampleSourceData={null}
        />
      </div>
    ) : selectedNode === null ? (
      <BuilderEmptyState onFilterRequired={handleFilterRequired} />
    ) : selectedNode.type === 'object' ? (
      (() => {
        const children: ChildFieldInfo[] = selectedNode.children.map((child) => ({
          path: child.path,
          fieldName: child.fieldName,
          fieldType: toTargetFieldType(child.type),
          status: (targetMappingStatus?.get(child.path) as 'unmapped' | 'mapped' | 'warning' | 'error') ?? 'unmapped',
          required: child.isRequired,
        }));
        const leafCoverage = leafCoverageMap.get(selectedNode.path) ?? { mapped: 0, total: children.length };
        return (
          <ObjectSummaryPanel
            objectPath={selectedNode.path}
            childFields={children}
            coverage={leafCoverage}
            onAutoMapSection={handleAutoMapTrigger}
            isAutoMapLoading={autoMapWorkspace.status === 'loading'}
            hasPersistedSuggestions={autoMapWorkspace.hasPersistedSuggestions}
            pendingSuggestionCount={autoMapWorkspace.summary.pending}
            onFilterRequired={handleSelectTargetNode}
            onValidateSection={() => {/* no-op placeholder */}}
            onNavigateToChild={handleSelectTargetNode}
            className="h-full"
          />
        );
      })()
    ) : selectedNode.type === 'array' ? (
      <ArrayBuilder
        key={selectedNode.path}
        selectedTargetPath={selectedNode.path}
        selectedTargetRequired={selectedNode.isRequired}
        currentStatus={selectedNodeStatus}
        currentExpression={selectedNodeExpression}
        parsedSourceSchema={editor.parsedSourceSchema}
        parsedTargetSchema={editor.parsedTargetSchema ?? null}
        updateDraft={editor.actions.updateDraft}
        getDraftExpression={editor.actions.getDraftExpression}
        savedRules={editor.rules}
        className="h-full"
      />
    ) : (
      <ScalarFieldBuilder
        key={selectedNode.path}
        mappingId={mappingId}
        preferSmartBuilder
        selectedTargetPath={selectedNode.path}
        selectedTargetType={toTargetFieldType(selectedNode.type)}
        selectedTargetRequired={selectedNode.isRequired}
        currentStatus={selectedNodeStatus}
        currentExpression={selectedNodeExpression}
        parsedSourceSchema={editor.parsedSourceSchema}
        stagedSourcePath={stagedInputField?.expression ?? null}
        updateDraft={editor.actions.updateDraft}
        revertDraft={editor.actions.revertDraft}
        getDraftExpression={editor.actions.getDraftExpression}
        unsavedChangeCount={editor.unsavedChangeCount}
        onViewUnsavedChanges={() => { setIsChangesOverlayOpen(true); }}
        onClearMapping={(targetPath) => { editor.actions.deleteRuleByTarget(targetPath); }}
        currentRuleIndex={selectedRuleIndexForSmartFix}
        currentRuleDiagnostics={selectedRuleDiagnosticsForSmartFix}
        currentRuleVersion={editor.currentRevision}
        onSmartFocusedSlotChange={handleSmartFocusedSlotChange}
        onSmartStageField={(field) => {
          if (!selectedTargetPath) {
            setStagedInputField(field);
            return;
          }

          const resolved = resolveSmartDraftForTarget(selectedTargetPath);
          if (!resolved.guided || resolved.draft === null) {
            setStagedInputField(field);
            return;
          }

          const nextSelection = applyStagedInputToSmartDraft({ draft: resolved.draft, staged: field });
          setSmartDraftForTarget(selectedTargetPath, nextSelection.draft);
          editor.actions.updateDraft(selectedTargetPath, nextSelection.expression);
          setStagedInputField(null);
        }}
        onSmartInputToggle={(input) => {
          if (!selectedTargetPath) return;
          const resolved = resolveSmartDraftForTarget(selectedTargetPath);
          if (!resolved.guided || resolved.draft === null) return;

          const nextDraft = removeInputFromSmartDraft(resolved.draft, input.id);
          setSmartDraftForTarget(selectedTargetPath, nextDraft);
          editor.actions.updateDraft(selectedTargetPath, nextDraft.expression);
        }}
        onSmartInputRemove={(inputId) => {
          if (!selectedTargetPath) return;
          const resolved = resolveSmartDraftForTarget(selectedTargetPath);
          if (!resolved.guided || resolved.draft === null) return;

          const nextDraft = removeInputFromSmartDraft(resolved.draft, inputId);
          setSmartDraftForTarget(selectedTargetPath, nextDraft);
          editor.actions.updateDraft(selectedTargetPath, nextDraft.expression);
        }}
        onSmartApplyAction={(actionId, options) => {
          if (!selectedTargetPath) return;
          const resolved = resolveSmartDraftForTarget(selectedTargetPath);
          if (!resolved.guided || resolved.draft === null) return;

          const nextDraftApplied = applySmartActionToDraft(resolved.draft, actionId, options);
          const editingStepIndex = options?.editingStepIndex ?? null;
          const editingStepScope = options?.editingStepScope ?? null;

          let nextDraft = nextDraftApplied;
          if (editingStepScope !== 'output-step' && editingStepIndex !== null && editingStepIndex >= 0) {
            const previousTransforms = resolved.draft.inputs[0]?.transforms ?? [];
            const appliedTransforms = nextDraftApplied.inputs[0]?.transforms ?? [];
            const replacementStep = appliedTransforms[appliedTransforms.length - 1];
            if (replacementStep) {
              const updatedTransforms = previousTransforms.map((step, index) => (
                index === editingStepIndex ? replacementStep : step
              ));
              const nextInputs = nextDraftApplied.inputs.map((input, inputIndex) => (
                inputIndex === 0 ? { ...input, transforms: updatedTransforms } : input
              ));
              const replacedDraft = {
                ...nextDraftApplied,
                inputs: nextInputs,
                pendingActionDraft: null,
              };
              nextDraft = updateSmartBuilderExpression(replacedDraft, generateSmartBuilderExpression(replacedDraft));
            }
          }

          if (nextDraft === resolved.draft) {
            return;
          }

          const nextDraftCleared = {
            ...nextDraft,
            pendingActionDraft: null,
          };
          setSmartDraftForTarget(selectedTargetPath, nextDraftCleared);
          editor.actions.updateDraft(selectedTargetPath, nextDraftCleared.expression);

          const actionLabel =
            actionId === 'text.concat'
              ? 'Combine text'
              : actionId === 'base.calculation'
                ? 'Calculation'
                : actionId === 'text.upper'
                  ? 'Uppercase'
                  : actionId === 'text.lower'
                    ? 'Lowercase'
                    : actionId === 'text.trim'
                      ? 'Trim spaces'
                      : actionId === 'text.phoneDigits'
                        ? 'Normalize phone digits'
                        : actionId;

          setSmartActionMetaByTarget((prev) => ({
            ...prev,
            [selectedTargetPath]: {
              ...(prev[selectedTargetPath] ?? { activeActionId: null, concatSeparator: ' ' }),
              activeActionId: actionId,
              announcement: `Applied ${actionLabel}. Draft saved.`,
            },
          }));
        }}
        onSmartBeginActionParameterEdit={(actionId, values) => {
          if (!selectedTargetPath) return;
          beginSmartParameterEditForTarget({
            targetPath: selectedTargetPath,
            actionId,
            values,
          });
        }}
        onSmartUpdateActionParameterDraft={(actionId, fieldId, value) => {
          if (!selectedTargetPath) return;
          updateSmartParameterDraftValueForTarget({
            targetPath: selectedTargetPath,
            actionId,
            fieldId,
            value,
          });
        }}
        onSmartResetActionParameterDraft={(actionId) => {
          if (!selectedTargetPath) return;
          resetSmartParameterDraftForTarget(selectedTargetPath, actionId);
        }}
        onSmartCancelActionParameterDraft={() => {
          if (!selectedTargetPath) return;
          clearSmartParameterDraftForTarget(selectedTargetPath);
        }}
        smartActiveActionId={smartActionMetaByTarget[selectedNode.path]?.activeActionId ?? null}
        smartActionAnnouncement={smartActionMetaByTarget[selectedNode.path]?.announcement ?? null}
        smartConcatSeparator={smartActionMetaByTarget[selectedNode.path]?.concatSeparator ?? ' '}
        onSmartConcatSeparatorChange={(separator) => {
          if (!selectedTargetPath) return;
          const resolved = resolveSmartDraftForTarget(selectedTargetPath);
          if (!resolved.guided || resolved.draft === null) return;

          if (resolved.draft.composition?.kind !== 'concat') return;

          const nextDraft = updateSmartBuilderExpression(
            {
              ...resolved.draft,
              composition: {
                ...resolved.draft.composition,
                separator,
              },
            },
            generateSmartBuilderExpression({
              ...resolved.draft,
              composition: {
                ...resolved.draft.composition,
                separator,
              },
            }),
          );
          setSmartDraftForTarget(selectedTargetPath, nextDraft);
          editor.actions.updateDraft(selectedTargetPath, nextDraft.expression);
          setSmartActionMetaByTarget((prev) => ({
            ...prev,
            [selectedTargetPath]: {
              ...(prev[selectedTargetPath] ?? { activeActionId: 'text.concat', concatSeparator: ' ' }),
              activeActionId: 'text.concat',
              concatSeparator: separator,
              announcement: 'Updated separator. Draft saved.',
            },
          }));
        }}
        onRequestArrayBuilderHandoff={() => {
          const currentTargetPath = selectedNode?.path ?? selectedTargetPath;
          if (!currentTargetPath || !editor.parsedTargetSchema) {
            return;
          }

          const nextPath = resolveBuilderTargetPath(editor.parsedTargetSchema.nodes, currentTargetPath);
          setSelectedTargetPath(nextPath);
        }}
        smartHydrationOverride={selectedNodeSmartHydration}
        savedRules={editor.rules}
        className="h-full"
      />
    );

  const builderContent = view === 'automap' ? autoMapWorkspaceContent : builderContentInner;

  const panelMode: 'overview' | 'source-browse' | 'row-editing' =
    view === 'automap' || view === 'rules' || selectedNode !== null
      ? 'row-editing'
      : isSourceBrowseOpen
        ? 'source-browse'
        : 'overview';

  const handleToggleBrowseSource = () => {
    if (selectedNode !== null) {
      setIsSourceBrowseOpen(true);
      setIsSourcePanelHidden(false);
      return;
    }
    setIsSourcePanelHidden(false);
    setIsSourceBrowseOpen((prev) => !prev);
  };

  const handleHideSourcePanel = () => {
    setIsSourcePanelHidden(true);
    if (selectedNode === null) {
      setIsSourceBrowseOpen(false);
    }
  };

  const handleHideBuilderPanel = () => {
    setIsBuilderPanelHidden(true);
  };

  const issueOverlay = isIssuesOpen
    ? (
      <div
        className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60"
        data-testid="issues-panel-overlay"
      >
        <IssuesPanel
          issues={consolidatedIssues}
          onClose={() => setIsIssuesOpen(false)}
          onOpenRow={(targetPath) => {
            setIsIssuesOpen(false);
            handleSelectTargetNode(targetPath);
          }}
        />
      </div>
    )
    : null;

  return (
    <>
      <MappingEditorPage
        projectId={projectId}
        mappingId={mappingId}
        projectName={projectName}
        mappingName={editor.mappingName}
        version={editor.version}
        saveStatus={editor.saveStatus}
        deployStatus={null}
        unsavedChangeCount={editor.unsavedChangeCount}
        onSave={editor.actions.save}
        sourceSchemaName={editor.sourceSchemaName}
        targetSchemaName={editor.targetSchemaName}
        sourceContent={sourceContent}
        targetWorklistContent={targetWorklistContent}
        builderContent={builderContent}
        panelMode={panelMode}
        onConfigToggle={() => setIsConfigOpen((prev) => !prev)}
        onHistoryToggle={handleOpenHistory}
        onViewIssues={() => setIsIssuesOpen(true)}
        issueCount={issueCount}
        requiredMappedCount={requiredMappedCount}
        requiredFieldCount={requiredFieldCount}
        warningCount={warningCount}
        errorCount={errorCount}
        onOpenTestLab={() => navigate(testLabPath)}
        onOpenRulesView={() => handleViewToggle('rules')}
        onOpenTargetView={() => handleViewToggle('target')}
        isRulesViewActive={view === 'rules'}
        onOpenDeploymentPage={() => navigate(deploymentPath)}
        onExportMapping={() => {}}
        onImportMapping={() => {}}
        onAutoMap={handleAutoMapAll}
        isAutoMapLoading={autoMapWorkspace.status === 'loading'}
        isAutoMapMode={view === 'automap'}
        autoMapPendingCount={autoMapWorkspace.summary.pending}
        autoMapSectionPath={autoMapWorkspace.sectionPath}
        onReturnToAutoMap={() => {
          if (autoMapWorkspace.sectionPath !== null) {
            enterAutoMapWorkspace(autoMapWorkspace.sectionPath);
          }
        }}
        autoMapScopeCount={visibleAutoMapScope.count}
        showDeployControls={false}
        sampleSelectorSlot={sampleSelectorSlot}
        selectedSampleSourceData={selectedSampleParsed}
        onToggleBrowseSource={handleToggleBrowseSource}
        isBrowseSourceActive={panelMode !== 'overview'}
        hideSourcePanel={isSourcePanelHidden}
        hideBuilderPanel={isBuilderPanelHidden}
        targetPanelCondensed={selectedNode !== null && !isBuilderPanelHidden}
        onHideSourcePanel={panelMode === 'overview' ? undefined : handleHideSourcePanel}
        onHideBuilderPanel={panelMode !== 'row-editing' ? undefined : handleHideBuilderPanel}
      />

      {issueOverlay}

      <ConfigurationModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      >
        <ConfigurationPanel
          configOptions={editor.configOptions}
          onUpdateConfig={editor.actions.updateConfig}
          parsedTargetSchema={editor.parsedTargetSchema}
        />
      </ConfigurationModal>

      <VersionHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        versions={history.versions}
        isLoading={history.isLoading}
        isEmpty={history.isEmpty}
        selectedVersion={history.selectedVersion}
        onSelectVersion={history.selectVersion}
        currentVersion={editor.version}
      >
        {history.selectedDiff && history.selectedVersion !== null && (
          <VersionDiffView
            diff={history.selectedDiff}
            selectedVersion={history.selectedVersion}
            currentVersion={editor.version}
            hasUnsavedChanges={editor.hasUnsavedChanges}
            onRestore={handleRestore}
            onBack={() => history.selectVersion(null)}
          />
        )}
      </VersionHistoryDrawer>

      {/* Unsaved changes overlay */}
      {isChangesOverlayOpen && (
        <UnsavedChangesOverlay
          changes={editor.actions.getUnsavedChangeSummary()}
          onRevert={(targetPath) => { editor.actions.revertDraft(targetPath); }}
          onNavigate={(targetPath) => { setSelectedTargetPath(resolveSelectedTargetPath(targetPath)); }}
          onClose={() => { setIsChangesOverlayOpen(false); }}
        />
      )}

      {autoMapCreateNotice && (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-md rounded-md border border-amber-700/60 bg-slate-900/95 px-4 py-3 text-sm text-amber-200 shadow-lg"
          role="status"
          data-testid="automap-create-notice"
        >
          <div className="flex items-start justify-between gap-3">
            <p>{autoMapCreateNotice}</p>
            <button
              type="button"
              onClick={() => setDismissedAutoMapCreateNotice(navigationAutoMapCreateNotice)}
              className="text-xs text-amber-300 hover:text-amber-100"
              aria-label="Dismiss auto-map notice"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Route-level unsaved-changes guard dialog */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Unsaved changes"
        message={`You have unsaved changes to ${editor.unsavedChangeCount} field(s). Discard and leave?`}
        confirmLabel="Discard & Leave"
        cancelLabel="Cancel"
        onConfirm={handleBlockerDiscard}
        onCancel={handleBlockerCancel}
      />
    </>
  );
}
