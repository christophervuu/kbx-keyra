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
  type ValueMapProjectUiState,
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
  type BuilderArgumentValue,
  type BuilderInput,
  type SmartBuilderDraft,
  createActionParameterDraft,
  createEmptySmartBuilderDraft,
  generateSmartBuilderExpression,
  getBuilderInputUsages,
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
import type {
  MappingRuleProjectValueTableRef,
  MappingRuleValueTableRef,
  ProjectValueTable,
  ProjectValueTableRevision,
  SchemaSamplePayloadMetadata,
  SchemaTreeNode,
  ValueTableDirection,
  ValueTableDirectionSupport,
  ValueTableNoMatchMode,
  ValueTablePrimitiveValue,
  ValueTableScope,
  ValueTableStatus,
} from '@/lib/types/domain';
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
  const seen = new Set<string>();
  function walk(current: readonly SchemaTreeNode[]) {
    for (const node of current) {
      if (seen.has(node.path)) {
        continue;
      }

      seen.add(node.path);
      paths.push(node.path);
      if (node.children.length > 0) walk(node.children);
    }
  }
  walk(nodes);
  return paths;
}

export function buildSampleOutputByTargetPath(
  nodes: readonly SchemaTreeNode[],
  executionOutput: unknown,
): Record<string, string | null> {
  const next: Record<string, string | null> = {};
  const targetPaths = collectTargetSchemaPaths(nodes);

  for (const path of targetPaths) {
    next[path] = resolveFieldTestValue(executionOutput, path) ?? null;
  }

  return next;
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

function tryParseEnrichmentSourceData(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
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

export function buildSmartTargetSessionKey(mappingId: string, targetPath: string): string {
  return `${mappingId}::${targetPath}`;
}

export function normalizeLegacySmartSlotId(slotId: string | null | undefined): string | null {
  if (!slotId) return null;
  switch (slotId) {
    case 'condition-left':
      return 'condition:left';
    case 'condition-right':
      return 'condition:right';
    case 'condition-then':
      return 'condition:then';
    case 'condition-else':
      return 'condition:else';
    case 'fallback-default':
      return 'fallback:default';
    default:
      return slotId;
  }
}

function normalizeLegacySlotScopedInputs(
  slotScopedInputs: SmartBuilderDraft['slotScopedInputs'],
): SmartBuilderDraft['slotScopedInputs'] {
  if (!slotScopedInputs) return slotScopedInputs;
  const entries = Object.entries(slotScopedInputs);
  if (entries.length === 0) return slotScopedInputs;

  const normalized: Record<string, BuilderInput> = {};
  for (const [key, value] of entries) {
    const normalizedKey = normalizeLegacySmartSlotId(key) ?? key;
    normalized[normalizedKey] = value;
  }
  return normalized;
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

  const sanitizeArgument = (value: BuilderArgumentValue) => {
    if (value.kind !== 'input') return value;
    if (value.inputId !== inputId) return value;
    return { kind: 'static', value: '' } as const;
  };

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
  } else if (composition?.kind === 'coalesce') {
    const nextIds = (composition.inputIds ?? draft.inputs.map((input) => input.id)).filter((id) => id !== inputId);
    composition = nextIds.length <= 1
      ? { kind: 'direct', inputId: nextIds[0] ?? remainingInputs[0]!.id }
      : {
          ...composition,
          inputIds: nextIds,
          ...(composition.fallback ? { fallback: sanitizeArgument(composition.fallback) } : {}),
        };
  } else if (composition?.kind === 'math') {
    const nextOperations = (composition.operations ?? []).filter((operation) => operation.inputId !== inputId);
    const nextStartInputId = composition.startInputId === inputId
      ? (nextOperations[0]?.inputId ?? remainingInputs[0]!.id)
      : composition.startInputId;

    if (nextOperations.length === 0) {
      composition = {
        kind: 'direct',
        inputId: nextStartInputId ?? remainingInputs[0]!.id,
      };
    } else {
      composition = {
        ...composition,
        startInputId: nextStartInputId,
        operations: nextOperations,
      };
    }
  } else if (composition?.kind === 'valueMap' && composition.inputId === inputId) {
    composition = {
      kind: 'direct',
      inputId: remainingInputs[0]!.id,
    };
  } else if (composition?.kind === 'arrayBuild' || composition?.kind === 'arrayMerge') {
    const nextIds = (composition.inputIds ?? draft.inputs.map((input) => input.id)).filter((id) => id !== inputId);
    composition = {
      ...composition,
      inputIds: nextIds,
    };
  }

  const nextDraft = {
    ...draft,
    inputs: remainingInputs,
    composition,
  };

  return updateSmartBuilderExpression(nextDraft, generateSmartBuilderExpression(nextDraft));
}

export function removeInputFromSmartDraftWithUsageCleanup(
  draft: SmartBuilderDraft,
  inputId: string,
): SmartBuilderDraft {
  const usages = getBuilderInputUsages(draft).filter((usage) => usage.inputId === inputId);
  if (usages.length === 0) {
    return removeInputFromSmartDraft(draft, inputId);
  }

  const sanitizeArgument = (value: { readonly kind: 'static'; readonly value: unknown } | { readonly kind: 'expression'; readonly expression: string } | { readonly kind: 'input'; readonly inputId: string }) => {
    if (value.kind !== 'input') return value;
    if (value.inputId !== inputId) return value;
    return { kind: 'static', value: '' } as const;
  };

  const rewriteCondition = (condition: Extract<NonNullable<SmartBuilderDraft['composition']>, { kind: 'condition' }>): SmartBuilderDraft['composition'] => ({
    ...condition,
    clauses: condition.clauses.map((clause) => ({
      ...clause,
      predicates: clause.predicates.map((predicate) => ({
        ...predicate,
        left: sanitizeArgument(predicate.left),
        ...(predicate.right ? { right: sanitizeArgument(predicate.right) } : {}),
      })),
      thenOutput: sanitizeArgument(clause.thenOutput),
    })),
    elseOutput: sanitizeArgument(condition.elseOutput),
  });

  let nextDraft = draft;
  if (nextDraft.composition?.kind === 'condition') {
    nextDraft = {
      ...nextDraft,
      composition: rewriteCondition(nextDraft.composition),
    };
    nextDraft = updateSmartBuilderExpression(nextDraft, generateSmartBuilderExpression(nextDraft));
  }

  return removeInputFromSmartDraft(nextDraft, inputId);
}

interface SmartActionMeta {
  readonly activeActionId: string | null;
  readonly concatSeparator: string;
  readonly announcement: string | null;
}

interface ProjectValueMapCatalogEntry {
  readonly table: ProjectValueTable;
  readonly revision: ProjectValueTableRevision;
  readonly usageCount: number;
}

interface ValueTableDirectionOption {
  readonly direction: ValueTableDirection;
  readonly inputSideKey: string;
  readonly outputSideKey: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason?: string;
}

type ValueMapProjectSelectionState = ValueMapProjectUiState;

interface ValueMapConversionPromptState {
  readonly targetPath: string;
  readonly selectedTableId: string;
  readonly selectedDirection: ValueTableDirection;
}

interface ValueMapAdoptionPromptState {
  readonly targetPath: string;
  readonly tableId: string;
  readonly fromRevision: number;
  readonly toRevision: number;
}

interface SmartMethodSwitchPromptState {
  readonly targetPath: string;
  readonly actionId: string;
  readonly options?: Parameters<typeof applySmartActionToDraft>[2];
}

function inferDirectionSupportFromRevision(revision: ProjectValueTableRevision): ValueTableDirectionSupport {
  if (revision.directionSupport) return revision.directionSupport;

  const seenA = new Set<string>();
  const seenB = new Set<string>();
  let aToB = true;
  let bToA = true;

  for (const row of revision.rows) {
    const aKey = JSON.stringify(row.sideAValue);
    const bKey = JSON.stringify(row.sideBValue);
    if (seenA.has(aKey)) aToB = false;
    if (seenB.has(bKey)) bToA = false;
    seenA.add(aKey);
    seenB.add(bKey);
  }

  return { aToB, bToA };
}

function normalizeValueMapFallback(mode: ValueTableNoMatchMode, fallback: ValueTablePrimitiveValue): {
  readonly fallbackArgument: { kind: 'static'; value: ValueTablePrimitiveValue | null };
  readonly noMatchBehavior: { mode: ValueTableNoMatchMode; fallbackValue?: ValueTablePrimitiveValue };
} {
  if (mode === 'return_null') {
    return {
      fallbackArgument: { kind: 'static', value: null },
      noMatchBehavior: { mode: 'return_null' },
    };
  }
  if (mode === 'return_input') {
    return {
      fallbackArgument: { kind: 'static', value: '' },
      noMatchBehavior: { mode: 'return_input' },
    };
  }
  return {
    fallbackArgument: { kind: 'static', value: fallback },
    noMatchBehavior: { mode: 'fallback_value', fallbackValue: fallback },
  };
}

function deriveNoMatchModeFromDraft(draft: SmartBuilderDraft): ValueTableNoMatchMode {
  const composition = draft.composition;
  if (!composition || composition.kind !== 'valueMap') return 'fallback_value';
  return composition.noMatchBehavior?.mode ?? 'fallback_value';
}

function deriveFallbackValueFromDraft(draft: SmartBuilderDraft): ValueTablePrimitiveValue {
  const composition = draft.composition;
  if (!composition || composition.kind !== 'valueMap') return '';
  if (composition.noMatchBehavior?.mode === 'fallback_value' && composition.noMatchBehavior.fallbackValue !== undefined) {
    return composition.noMatchBehavior.fallbackValue;
  }
  if (composition.fallback.kind === 'static' && (
    typeof composition.fallback.value === 'string'
    || typeof composition.fallback.value === 'number'
    || typeof composition.fallback.value === 'boolean'
  )) {
    return composition.fallback.value;
  }
  return '';
}

function toDirectionLabel(direction: ValueTableDirection, revision: ProjectValueTableRevision): string {
  if (direction === 'a_to_b') {
    return `${revision.sideA.label} → ${revision.sideB.label}`;
  }
  return `${revision.sideB.label} → ${revision.sideA.label}`;
}

function toDirectionReason(direction: ValueTableDirection, support: ValueTableDirectionSupport): string | undefined {
  const enabled = direction === 'a_to_b' ? support.aToB : support.bToA;
  if (enabled) return undefined;
  return direction === 'a_to_b'
    ? 'Unavailable: duplicate input keys on Side A.'
    : 'Unavailable: duplicate input keys on Side B.';
}

function buildDirectionOptions(revision: ProjectValueTableRevision): readonly ValueTableDirectionOption[] {
  const support = inferDirectionSupportFromRevision(revision);
  return [
    {
      direction: 'a_to_b',
      inputSideKey: revision.sideA.key,
      outputSideKey: revision.sideB.key,
      label: toDirectionLabel('a_to_b', revision),
      enabled: support.aToB,
      reason: toDirectionReason('a_to_b', support),
    },
    {
      direction: 'b_to_a',
      inputSideKey: revision.sideB.key,
      outputSideKey: revision.sideA.key,
      label: toDirectionLabel('b_to_a', revision),
      enabled: support.bToA,
      reason: toDirectionReason('b_to_a', support),
    },
  ];
}

function inferDirectionFromRevisionAndRef(
  revision: ProjectValueTableRevision,
  ref: MappingRuleProjectValueTableRef,
): ValueTableDirection | null {
  if (ref.inputSideKey === revision.sideA.key && ref.outputSideKey === revision.sideB.key) {
    return 'a_to_b';
  }
  if (ref.inputSideKey === revision.sideB.key && ref.outputSideKey === revision.sideA.key) {
    return 'b_to_a';
  }
  return null;
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
    readonly valueMapScope?: ValueTableScope;
    readonly valueMapProjectSelection?: {
      readonly ref: MappingRuleProjectValueTableRef;
      readonly tableName?: string;
      readonly tableStatus?: ValueTableStatus;
      readonly currentRevision?: number;
      readonly sideA?: ProjectValueTableRevision['sideA'];
      readonly sideB?: ProjectValueTableRevision['sideB'];
      readonly directionSupport?: ValueTableDirectionSupport;
      readonly usageCount?: number;
    };
    readonly valueMapNoMatchMode?: ValueTableNoMatchMode;
    readonly valueMapFallbackValue?: ValueTablePrimitiveValue;
  },
): SmartBuilderDraft {
  const parameterResolution = getValidatedActionParameters({ draft, actionId });
  if (!parameterResolution.ok) {
    return draft;
  }

  const actionParameters = parameterResolution.values;
  let nextDraft: SmartBuilderDraft = draft;

  const resolveValueMapFallback = () => {
    const fallbackMode = options?.valueMapNoMatchMode ?? deriveNoMatchModeFromDraft(draft);
    const fallbackValue = options?.valueMapFallbackValue ?? deriveFallbackValueFromDraft(draft);
    return normalizeValueMapFallback(fallbackMode, fallbackValue);
  };

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
      const fallback = resolveValueMapFallback();
      const scope = options?.valueMapScope
        ?? (draft.composition?.kind === 'valueMap' ? (draft.composition.scope ?? 'inline') : 'inline');
      nextDraft = {
        ...draft,
        composition: {
          kind: 'valueMap',
          inputId: first.id,
          scope,
          project: scope === 'project' ? (options?.valueMapProjectSelection ?? (draft.composition?.kind === 'valueMap' ? (draft.composition.project ?? null) : null)) : null,
          mappings: draft.composition?.kind === 'valueMap' ? draft.composition.mappings : [],
          fallback: fallback.fallbackArgument,
          noMatchBehavior: fallback.noMatchBehavior,
        },
      };
      break;
    }
    case 'condition.compare':
    case 'condition.if': {
      if (draft.composition?.kind === 'condition') {
        return draft;
      }

      const directSeedInputId =
        draft.composition?.kind === 'direct'
          ? draft.composition.inputId
          : draft.composition?.kind === 'default'
            ? draft.composition.inputId
            : undefined;
      const left = directSeedInputId
        ? draft.inputs.find((input) => input.id === directSeedInputId) ?? draft.inputs[0]
        : draft.inputs[0];
      nextDraft = {
        ...draft,
        composition: {
          kind: 'condition',
          matchMode: 'all',
          clauses: [{
            predicates: [{
              left: left ? { kind: 'input', inputId: left.id } : { kind: 'static', value: '' },
              operator: 'eq',
              right: { kind: 'static', value: '' },
            }],
            thenOutput: { kind: 'static', value: '' },
          }],
          elseOutput: { kind: 'static', value: '' },
        },
      };
      break;
    }
    case 'condition.truthy': {
      if (draft.composition?.kind === 'condition') {
        return draft;
      }

      const first = draft.inputs[0];
      if (!first) return draft;
      nextDraft = {
        ...draft,
        composition: {
          kind: 'condition',
          matchMode: 'all',
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

export function shouldConfirmConditionalMethodSwitch(
  draft: SmartBuilderDraft,
  actionId: string,
  options?: Parameters<typeof applySmartActionToDraft>[2],
): boolean {
  if (draft.composition?.kind !== 'condition') {
    return false;
  }

  if (actionId === 'condition.compare' || actionId === 'condition.if' || actionId === 'condition.truthy') {
    return false;
  }

  const nextDraft = applySmartActionToDraft(draft, actionId, options);
  if (nextDraft === draft) {
    return false;
  }

  return nextDraft.composition?.kind !== 'condition';
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
  readonly selectionBehavior?: 'toggle-on-existing' | 'ignore-existing';
}): SmartSelectionResult {
  const { draft, staged, selectionBehavior = 'toggle-on-existing' } = params;

  const existingMatch = draft.inputs.find((input) => isSameStagedAsInput(input, staged));
  if (existingMatch && !draft.focusedSlotId) {
    if (selectionBehavior === 'ignore-existing') {
      return {
        outcome: 'appended-to-tray',
        draft,
        expression: draft.expression,
      };
    }

    const toggled = removeInputFromSmartDraft(draft, existingMatch.id);
    return {
      outcome: 'appended-to-tray',
      draft: toggled,
      expression: toggled.expression,
    };
  }

  const nextInput = existingMatch
    ?? mapStagedToBuilderInput(
      staged,
      createBuilderInputId(draft.inputs.map((input) => input.id)),
    );

  const focusedSlotId = normalizeLegacySmartSlotId(draft.focusedSlotId);
  if (focusedSlotId && focusedSlotId.trim().length > 0) {
    const draftWithFilledInput = existingMatch
      ? draft
      : {
          ...draft,
          inputs: [...draft.inputs, nextInput],
        };
    let nextDraft: SmartBuilderDraft = setSlotScopedInput(draftWithFilledInput, focusedSlotId, nextInput);

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
          ? {
            ...firstPredicate,
            left: {
              ...argumentFromFocusedInput,
              transforms: firstPredicate.left.transforms,
            },
          }
          : focusedSlotId === 'condition:right'
            ? {
              ...firstPredicate,
              right: {
                ...argumentFromFocusedInput,
                transforms: firstPredicate.right?.transforms,
              },
            }
            : firstPredicate;

      const updatedClause = {
        ...firstClause,
        predicates: [updatedPredicate, ...remainingPredicates],
        thenOutput: focusedSlotId === 'condition:then'
          ? {
            ...argumentFromFocusedInput,
            transforms: firstClause.thenOutput.transforms,
          }
          : firstClause.thenOutput,
      };

      nextDraft = {
        ...nextDraft,
        composition: {
          ...composition,
          clauses: [updatedClause, ...remainingClauses],
          elseOutput: focusedSlotId === 'condition:else'
            ? {
              ...argumentFromFocusedInput,
              transforms: composition.elseOutput.transforms,
            }
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
    composition: draft.composition,
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
  const routeEnrichmentSourceData = useMemo<Record<string, unknown>>(() => {
    const navState = location.state as Record<string, unknown> | null;
    const incomingExternalSourcesRaw = navState?.externalSourcesRaw;
    if (typeof incomingExternalSourcesRaw !== 'string') {
      return {};
    }
    return tryParseEnrichmentSourceData(incomingExternalSourcesRaw) ?? {};
  }, [location.state]);

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

      return buildSampleOutputByTargetPath(editor.parsedTargetSchema.nodes, execution.output);
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
    const navState = location.state as Record<string, unknown> | null;
    const incomingPath = navState?.selectedTargetPath;

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
  const [projectValueTableCatalog, setProjectValueTableCatalog] = useState<readonly ProjectValueMapCatalogEntry[]>([]);
  const [valueMapProjectSelectionByTarget, setValueMapProjectSelectionByTarget] = useState<Record<string, ValueMapProjectSelectionState>>({});
  const [valueMapConversionPrompt, setValueMapConversionPrompt] = useState<ValueMapConversionPromptState | null>(null);
  const [valueMapAdoptionPrompt, setValueMapAdoptionPrompt] = useState<ValueMapAdoptionPromptState | null>(null);
  const [smartMethodSwitchPrompt, setSmartMethodSwitchPrompt] = useState<SmartMethodSwitchPromptState | null>(null);

  const setSmartDraftForTarget = useCallback((targetPath: string, draft: SmartBuilderDraft) => {
    const targetSessionKey = buildSmartTargetSessionKey(mappingId, targetPath);
    const normalizedDraft: SmartBuilderDraft = {
      ...draft,
      focusedSlotId: normalizeLegacySmartSlotId(draft.focusedSlotId),
      slotScopedInputs: normalizeLegacySlotScopedInputs(draft.slotScopedInputs),
    };

    smartDraftByTargetRef.current.set(targetSessionKey, normalizedDraft);
    setSmartDraftByTargetState((prev) => ({ ...prev, [targetSessionKey]: normalizedDraft }));
    setSmartActionMetaByTarget((prev) => {
      const derived = deriveSmartActionMetaFromDraft(normalizedDraft);
      return {
        ...prev,
        [targetSessionKey]: {
          ...(prev[targetSessionKey] ?? { activeActionId: null, concatSeparator: ' ', announcement: null }),
          activeActionId: derived.activeActionId,
          concatSeparator: derived.concatSeparator,
        },
      };
    });
  }, [mappingId]);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    void (async () => {
      try {
        const tables = await adapter.listProjectValueTables(projectId, {
          status: 'active',
          sortBy: 'updatedAt',
          sortDirection: 'desc',
        });

        const details = await Promise.all(
          tables.map(async (table) => {
            const [revision, usage] = await Promise.all([
              adapter.getProjectValueTableRevision(table.id, table.currentRevision),
              adapter.listProjectValueTableUsage(table.id),
            ]);
            return { table, revision, usageCount: usage.length } as ProjectValueMapCatalogEntry;
          }),
        );

        if (cancelled) return;
        setProjectValueTableCatalog(details);
      } catch (error) {
        if (cancelled) return;
        void error;
        setProjectValueTableCatalog([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adapter, projectId]);

  const handleSmartFocusedSlotChange = useCallback((targetPath: string, slotId: string | null) => {
    const targetSessionKey = buildSmartTargetSessionKey(mappingId, targetPath);
    const existing = smartDraftByTargetRef.current.get(targetSessionKey);
    if (!existing) return;
    const nextDraft = { ...existing, focusedSlotId: slotId };
    setSmartDraftForTarget(targetPath, nextDraft);
  }, [mappingId, setSmartDraftForTarget]);
  const [isSourceBrowseOpen, setIsSourceBrowseOpen] = useState(false);
  const [sourceSelectionModeOverride, setSourceSelectionModeOverride] = useState<'add-to-tray' | 'fill-current-value' | null>(null);
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
      setSourceSelectionModeOverride(null);
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

  const hydrateSmartDraftForTarget = useCallback((targetPath: string) => {
    const node = editor.parsedTargetSchema
      ? findNodeByPath(editor.parsedTargetSchema.nodes, targetPath)
      : undefined;

    const targetType = node ? toTargetFieldType(node.type) : 'string';
    const isRequired = node?.isRequired ?? false;
    const effectiveExpression = editor.actions.getDraftExpression(targetPath)
      ?? editor.rules.find((rule) => rule.target === targetPath)?.expression
      ?? '';
    const existingRule = editor.rules.find((rule) => rule.target === targetPath);

    return hydrateSmartBuilderFromExpression({
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
      ruleValueTableRef: existingRule?.valueTableRef,
      ruleNoMatchBehavior: existingRule?.noMatchBehavior,
    });
  }, [editor.actions, editor.parsedSourceSchema?.nodes, editor.parsedTargetSchema, editor.rules]);

  const resolveSmartDraftForTarget = useCallback((targetPath: string) => {
    const targetSessionKey = buildSmartTargetSessionKey(mappingId, targetPath);
    const existing = smartDraftByTargetRef.current.get(targetSessionKey);
    if (existing) return { draft: existing, guided: true as const };

    const hydrated = hydrateSmartDraftForTarget(targetPath);

    if (hydrated.kind === 'advanced') {
      return { draft: null, guided: false as const };
    }

    setSmartDraftForTarget(targetPath, hydrated.draft);
    return { draft: hydrated.draft, guided: true as const };
  }, [hydrateSmartDraftForTarget, mappingId, setSmartDraftForTarget]);

  const selectedNodeSmartHydration = useMemo(() => {
    if (!selectedNode) return null;
    const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedNode.path);
    const existing = smartDraftByTargetState[targetSessionKey];
    if (!existing) return null;
    return { kind: 'guided' as const, draft: existing };
  }, [mappingId, selectedNode, smartDraftByTargetState]);

  const syncRuleValueMapMetadataForTarget = useCallback((targetPath: string, draft: SmartBuilderDraft) => {
    const composition = draft.composition;
    if (!composition || composition.kind !== 'valueMap') {
      editor.actions.updateRuleByTarget(targetPath, {
        expression: draft.expression,
        valueTableRef: undefined,
        noMatchBehavior: undefined,
      });
      return;
    }

    const noMatchBehavior = composition.noMatchBehavior ?? {
      mode: 'fallback_value' as const,
      ...(composition.fallback.kind === 'static' && (
        typeof composition.fallback.value === 'string'
        || typeof composition.fallback.value === 'number'
        || typeof composition.fallback.value === 'boolean'
      )
        ? { fallbackValue: composition.fallback.value }
        : {}),
    };

    const scope = composition.scope ?? 'inline';
    const valueTableRef: MappingRuleValueTableRef = scope === 'project' && composition.project
      ? composition.project.ref
      : { scope: 'inline' };

    editor.actions.updateRuleByTarget(targetPath, {
      expression: draft.expression,
      valueTableRef,
      noMatchBehavior,
    });
  }, [editor.actions]);

  const deriveValueMapProjectSelectionState = useCallback((targetPath: string, draft: SmartBuilderDraft): ValueMapProjectSelectionState | null => {
    const composition = draft.composition;
    if (!composition || composition.kind !== 'valueMap') return null;

    const scope = composition.scope ?? 'inline';
    const availableTables = projectValueTableCatalog.map((entry) => ({
      tableId: entry.table.id,
      label: entry.table.name,
      revision: entry.table.currentRevision,
      status: entry.table.status,
      usageCount: entry.usageCount,
      rowCount: entry.revision.rowCount,
    }));

    const selectedTableId = scope === 'project' ? (composition.project?.ref.valueTableId ?? null) : null;
    const selectedEntry = selectedTableId
      ? projectValueTableCatalog.find((entry) => entry.table.id === selectedTableId) ?? null
      : null;

    const directionOptions = selectedEntry ? buildDirectionOptions(selectedEntry.revision) : [];
    const direction = selectedEntry && composition.project
      ? inferDirectionFromRevisionAndRef(selectedEntry.revision, composition.project.ref)
      : null;
    const selectedDirectionOption = direction
      ? directionOptions.find((option) => option.direction === direction)
      : undefined;

    const noMatchMode = composition.noMatchBehavior?.mode ?? 'fallback_value';
    const fallbackValue = composition.noMatchBehavior?.fallbackValue
      ?? (composition.fallback.kind === 'static' && (
        typeof composition.fallback.value === 'string'
        || typeof composition.fallback.value === 'number'
        || typeof composition.fallback.value === 'boolean'
      )
        ? composition.fallback.value
        : '');

    return {
      scope,
      tableId: selectedTableId,
      direction,
      pinnedRevision: composition.project?.ref.revision ?? null,
      currentRevision: selectedEntry?.table.currentRevision ?? null,
      tableStatus: selectedEntry?.table.status ?? composition.project?.tableStatus ?? null,
      directionOptions,
      availableTables,
      selectedTableName: selectedEntry?.table.name ?? composition.project?.tableName,
      usageCount: selectedEntry?.usageCount ?? composition.project?.usageCount,
      newerRevisionAvailable:
        (composition.project?.ref.revision ?? 0) > 0
        && (selectedEntry?.table.currentRevision ?? 0) > (composition.project?.ref.revision ?? 0),
      selectedDirectionInvalidReason:
        selectedDirectionOption && !selectedDirectionOption.enabled
          ? selectedDirectionOption.reason
          : undefined,
      noMatchMode,
      fallbackValue,
      projectSelection: composition.project ?? null,
    };
  }, [projectValueTableCatalog]);

  const upsertValueMapSelectionStateForTarget = useCallback((targetPath: string, state: ValueMapProjectSelectionState | null) => {
    const targetSessionKey = buildSmartTargetSessionKey(mappingId, targetPath);
    setValueMapProjectSelectionByTarget((prev) => {
      if (state === null) {
        if (!(targetSessionKey in prev)) return prev;
        const next = { ...prev };
        delete next[targetSessionKey];
        return next;
      }
      return {
        ...prev,
        [targetSessionKey]: state,
      };
    });
  }, [mappingId]);

  const applyValueMapSelectionToDraft = useCallback(async (input: {
    targetPath: string;
    tableId: string;
    direction: ValueTableDirection;
    noMatchMode?: ValueTableNoMatchMode;
    fallbackValue?: ValueTablePrimitiveValue;
    preserveInlineMappings?: boolean;
  }) => {
    const resolved = resolveSmartDraftForTarget(input.targetPath);
    if (!resolved.guided || resolved.draft === null) return;

    const selected = projectValueTableCatalog.find((entry) => entry.table.id === input.tableId);
    if (!selected) return;

    const directionOptions = buildDirectionOptions(selected.revision);
    const directionOption = directionOptions.find((option) => option.direction === input.direction);
    if (!directionOption || !directionOption.enabled) return;

    const resolvedRef = await adapter.resolveProjectValueTableReference({
      projectId,
      valueTableId: selected.table.id,
      tableKey: selected.table.key,
      revision: selected.revision.revision,
      inputSideKey: directionOption.inputSideKey,
      outputSideKey: directionOption.outputSideKey,
    });

    const fallback = normalizeValueMapFallback(
      input.noMatchMode ?? deriveNoMatchModeFromDraft(resolved.draft),
      input.fallbackValue ?? deriveFallbackValueFromDraft(resolved.draft),
    );

    const projectSelection = {
      ref: resolvedRef.ref,
      tableName: selected.table.name,
      tableStatus: selected.table.status,
      currentRevision: selected.table.currentRevision,
      sideA: selected.revision.sideA,
      sideB: selected.revision.sideB,
      directionSupport: inferDirectionSupportFromRevision(selected.revision),
      usageCount: selected.usageCount,
    };

    const nextDraft = applySmartActionToDraft(resolved.draft, 'lookup.valueMap', {
      valueMapScope: 'project',
      valueMapProjectSelection: projectSelection,
      valueMapNoMatchMode: fallback.noMatchBehavior.mode,
      valueMapFallbackValue:
        fallback.noMatchBehavior.mode === 'fallback_value'
          ? (fallback.noMatchBehavior.fallbackValue ?? '')
          : '',
    });

    const composed = nextDraft.composition;
    const finalDraft = composed && composed.kind === 'valueMap'
      ? updateSmartBuilderExpression({
        ...nextDraft,
        composition: {
          ...composed,
          scope: 'project',
          project: projectSelection,
          mappings: input.preserveInlineMappings ? composed.mappings : [],
          fallback: fallback.fallbackArgument,
          noMatchBehavior: fallback.noMatchBehavior,
        },
      }, generateSmartBuilderExpression({
        ...nextDraft,
        composition: {
          ...composed,
          scope: 'project',
          project: projectSelection,
          mappings: input.preserveInlineMappings ? composed.mappings : [],
          fallback: fallback.fallbackArgument,
          noMatchBehavior: fallback.noMatchBehavior,
        },
      }))
      : nextDraft;

    setSmartDraftForTarget(input.targetPath, finalDraft);
    upsertValueMapSelectionStateForTarget(input.targetPath, deriveValueMapProjectSelectionState(input.targetPath, finalDraft));
    editor.actions.updateDraft(input.targetPath, finalDraft.expression);
    syncRuleValueMapMetadataForTarget(input.targetPath, finalDraft);
  }, [
    adapter,
    deriveValueMapProjectSelectionState,
    editor.actions,
    projectId,
    projectValueTableCatalog,
    resolveSmartDraftForTarget,
    setSmartDraftForTarget,
    syncRuleValueMapMetadataForTarget,
    upsertValueMapSelectionStateForTarget,
  ]);

  const updateValueMapCompositionForTarget = useCallback((input: {
    targetPath: string;
    patch: (composition: NonNullable<SmartBuilderDraft['composition']> & { kind: 'valueMap' }) => NonNullable<SmartBuilderDraft['composition']> & { kind: 'valueMap' };
  }) => {
    const resolved = resolveSmartDraftForTarget(input.targetPath);
    if (!resolved.guided || resolved.draft === null) return;
    const composition = resolved.draft.composition;
    if (!composition || composition.kind !== 'valueMap') return;

    const nextComposition = input.patch(composition);
    const nextDraft = updateSmartBuilderExpression(
      {
        ...resolved.draft,
        composition: nextComposition,
      },
      generateSmartBuilderExpression({
        ...resolved.draft,
        composition: nextComposition,
      }),
    );

    setSmartDraftForTarget(input.targetPath, nextDraft);
    upsertValueMapSelectionStateForTarget(input.targetPath, deriveValueMapProjectSelectionState(input.targetPath, nextDraft));
    editor.actions.updateDraft(input.targetPath, nextDraft.expression);
    syncRuleValueMapMetadataForTarget(input.targetPath, nextDraft);
  }, [
    deriveValueMapProjectSelectionState,
    editor.actions,
    resolveSmartDraftForTarget,
    setSmartDraftForTarget,
    syncRuleValueMapMetadataForTarget,
    upsertValueMapSelectionStateForTarget,
  ]);

  const handleConfirmValueMapConversion = useCallback(() => {
    const prompt = valueMapConversionPrompt;
    if (!prompt) return;

    setValueMapConversionPrompt(null);
    void applyValueMapSelectionToDraft({
      targetPath: prompt.targetPath,
      tableId: prompt.selectedTableId,
      direction: prompt.selectedDirection,
      preserveInlineMappings: true,
    });
  }, [applyValueMapSelectionToDraft, valueMapConversionPrompt]);

  const handleConfirmValueMapAdoption = useCallback(() => {
    const prompt = valueMapAdoptionPrompt;
    if (!prompt) return;

    const targetSessionKey = buildSmartTargetSessionKey(mappingId, prompt.targetPath);
    const selectionState = valueMapProjectSelectionByTarget[targetSessionKey];
    if (!selectionState?.tableId || !selectionState.direction) {
      setValueMapAdoptionPrompt(null);
      return;
    }

    setValueMapAdoptionPrompt(null);
    void applyValueMapSelectionToDraft({
      targetPath: prompt.targetPath,
      tableId: selectionState.tableId,
      direction: selectionState.direction,
      preserveInlineMappings: true,
    });
  }, [
    applyValueMapSelectionToDraft,
    mappingId,
    valueMapAdoptionPrompt,
    valueMapProjectSelectionByTarget,
  ]);

  const applySmartActionForTarget = useCallback((input: {
    targetPath: string;
    actionId: string;
    options?: Parameters<typeof applySmartActionToDraft>[2];
  }) => {
    const resolved = resolveSmartDraftForTarget(input.targetPath);
    if (!resolved.guided || resolved.draft === null) return;

    const nextDraft = applySmartActionToDraft(resolved.draft, input.actionId, input.options);
    if (nextDraft === resolved.draft) return;

    const nextDraftCleared = {
      ...nextDraft,
      pendingActionDraft: null,
    };
    setSmartDraftForTarget(input.targetPath, nextDraftCleared);
    upsertValueMapSelectionStateForTarget(
      input.targetPath,
      deriveValueMapProjectSelectionState(input.targetPath, nextDraftCleared),
    );
    editor.actions.updateDraft(input.targetPath, nextDraftCleared.expression);
    syncRuleValueMapMetadataForTarget(input.targetPath, nextDraftCleared);

    const actionLabel =
      input.actionId === 'text.concat'
        ? 'Combine text'
        : input.actionId === 'base.calculation'
          ? 'Calculation'
          : input.actionId === 'lookup.valueMap'
            ? 'Value Mapping'
            : input.actionId === 'text.upper'
              ? 'Uppercase'
              : input.actionId === 'text.lower'
                ? 'Lowercase'
                : input.actionId === 'text.trim'
                  ? 'Trim spaces'
                  : input.actionId === 'text.phoneDigits'
                    ? 'Normalize phone digits'
                    : input.actionId;

    const targetSessionKey = buildSmartTargetSessionKey(mappingId, input.targetPath);
    setSmartActionMetaByTarget((prev) => ({
      ...prev,
      [targetSessionKey]: {
        ...(prev[targetSessionKey] ?? { activeActionId: null, concatSeparator: ' ' }),
        activeActionId: input.actionId,
        announcement: `Applied ${actionLabel}. Draft saved.`,
      },
    }));
  }, [
    deriveValueMapProjectSelectionState,
    editor.actions,
    mappingId,
    resolveSmartDraftForTarget,
    setSmartDraftForTarget,
    syncRuleValueMapMetadataForTarget,
    upsertValueMapSelectionStateForTarget,
  ]);

  const handleConfirmSmartMethodSwitch = useCallback(() => {
    const prompt = smartMethodSwitchPrompt;
    if (!prompt) return;
    setSmartMethodSwitchPrompt(null);
    applySmartActionForTarget({
      targetPath: prompt.targetPath,
      actionId: prompt.actionId,
      options: prompt.options,
    });
  }, [applySmartActionForTarget, smartMethodSwitchPrompt]);

  const clearSmartParameterDraftForTarget = useCallback((targetPath: string) => {
    const targetSessionKey = buildSmartTargetSessionKey(mappingId, targetPath);
    const existing = smartDraftByTargetRef.current.get(targetSessionKey);
    if (!existing || existing.pendingActionDraft === null) return;
    const nextDraft = {
      ...existing,
      pendingActionDraft: null,
    };
    setSmartDraftForTarget(targetPath, nextDraft);
  }, [mappingId, setSmartDraftForTarget]);

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
    const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedTargetPath);
    const draft = smartDraftByTargetState[targetSessionKey];
    if (!draft) return [] as { kind: 'primary' | 'enrichment' | 'constant' | 'static' | 'item' | 'parent' | 'expression'; path: string; alias?: string }[];

    return draft.inputs
      .filter((input) => input.path)
      .map((input) => ({
        kind: input.sourceKind,
        path: input.path ?? '',
        alias: input.externalName,
      }));
  }, [mappingId, selectedTargetPath, smartDraftByTargetState]);

  const focusedSlotIdForSelectedTarget = useMemo(() => {
    if (!selectedTargetPath) return null;
    const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedTargetPath);
    return smartDraftByTargetState[targetSessionKey]?.focusedSlotId ?? null;
  }, [mappingId, selectedTargetPath, smartDraftByTargetState]);

  const canFillCurrentValue = Boolean(
    selectedTargetPath
    && focusedSlotIdForSelectedTarget
    && focusedSlotIdForSelectedTarget.trim().length > 0,
  );

  const normalizedSourceSelectionModeOverride =
    sourceSelectionModeOverride === 'fill-current-value' && !canFillCurrentValue
      ? null
      : sourceSelectionModeOverride;

  const sourceSelectionMode = normalizedSourceSelectionModeOverride
    ?? (canFillCurrentValue ? 'fill-current-value' : 'add-to-tray');

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
      enrichmentSourceData={routeEnrichmentSourceData}
      sourceSchemaName={editor.sourceSchemaName}
      selectedInputs={selectedInputsForSourcePanel}
      selectionMode={sourceSelectionMode}
      canFillCurrentValue={canFillCurrentValue}
      onSelectionModeChange={(mode) => {
        if (mode === 'fill-current-value' && !canFillCurrentValue) return;
        setSourceSelectionModeOverride(mode);
      }}
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

        const shouldFillCurrentValue = sourceSelectionMode === 'fill-current-value' && canFillCurrentValue;
        const nextSelection = applyStagedInputToSmartDraft({
          draft: resolved.draft,
          staged: field,
          selectionBehavior: 'ignore-existing',
        });
        setSmartDraftForTarget(selectedTargetPath, nextSelection.draft);
        editor.actions.updateDraft(selectedTargetPath, nextSelection.expression);
        setStagedInputField(null);

        if (shouldFillCurrentValue && nextSelection.outcome === 'filled-focused-slot') {
          setIsSourcePanelHidden(true);
          setIsSourceBrowseOpen(false);
          setSourceSelectionModeOverride(null);
        }
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
        sourceSampleData={selectedSampleParsed}
        enrichmentSampleData={routeEnrichmentSourceData}
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

          const nextDraft = removeInputFromSmartDraftWithUsageCleanup(resolved.draft, input.id);
          setSmartDraftForTarget(selectedTargetPath, nextDraft);
          editor.actions.updateDraft(selectedTargetPath, nextDraft.expression);
        }}
        onSmartInputRemove={(inputId) => {
          if (!selectedTargetPath) return;
          const resolved = resolveSmartDraftForTarget(selectedTargetPath);
          if (!resolved.guided || resolved.draft === null) return;

          const nextDraft = removeInputFromSmartDraftWithUsageCleanup(resolved.draft, inputId);
          setSmartDraftForTarget(selectedTargetPath, nextDraft);
          editor.actions.updateDraft(selectedTargetPath, nextDraft.expression);
        }}
        onSmartUpdateConditionComposition={(composition) => {
          if (!selectedTargetPath) return;
          const resolved = resolveSmartDraftForTarget(selectedTargetPath);
          if (!resolved.guided || resolved.draft === null) return;
          if (resolved.draft.composition?.kind !== 'condition') return;

          const nextDraft = updateSmartBuilderExpression(
            {
              ...resolved.draft,
              composition,
            },
            generateSmartBuilderExpression({
              ...resolved.draft,
              composition,
            }),
          );

          setSmartDraftForTarget(selectedTargetPath, nextDraft);
          editor.actions.updateDraft(selectedTargetPath, nextDraft.expression);
        }}
        onSmartApplyAction={(actionId, options) => {
          if (!selectedTargetPath) return;
          const resolved = resolveSmartDraftForTarget(selectedTargetPath);
          if (!resolved.guided || resolved.draft === null) return;

          const editingStepIndex = options?.editingStepIndex ?? null;
          const editingStepScope = options?.editingStepScope ?? null;

          if (shouldConfirmConditionalMethodSwitch(resolved.draft, actionId, options)) {
            setSmartMethodSwitchPrompt({
              targetPath: selectedTargetPath,
              actionId,
              options,
            });
            return;
          }

          const nextDraftApplied = applySmartActionToDraft(resolved.draft, actionId, options);

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
          upsertValueMapSelectionStateForTarget(
            selectedTargetPath,
            deriveValueMapProjectSelectionState(selectedTargetPath, nextDraftCleared),
          );
          editor.actions.updateDraft(selectedTargetPath, nextDraftCleared.expression);
          syncRuleValueMapMetadataForTarget(selectedTargetPath, nextDraftCleared);

          const actionLabel =
            actionId === 'text.concat'
              ? 'Combine text'
              : actionId === 'base.calculation'
                ? 'Calculation'
                : actionId === 'lookup.valueMap'
                  ? 'Value Mapping'
                  : actionId === 'text.upper'
                    ? 'Uppercase'
                    : actionId === 'text.lower'
                      ? 'Lowercase'
                      : actionId === 'text.trim'
                        ? 'Trim spaces'
                        : actionId === 'text.phoneDigits'
                          ? 'Normalize phone digits'
                          : actionId;

          const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedTargetPath);
          setSmartActionMetaByTarget((prev) => ({
            ...prev,
            [targetSessionKey]: {
              ...(prev[targetSessionKey] ?? { activeActionId: null, concatSeparator: ' ' }),
              activeActionId: actionId,
              announcement: `Applied ${actionLabel}. Draft saved.`,
            },
          }));
        }}
        valueMapProjectState={(() => {
          const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedNode.path);
          const cached = valueMapProjectSelectionByTarget[targetSessionKey];
          if (cached) return cached as ValueMapProjectUiState;
          const existingDraft = smartDraftByTargetState[targetSessionKey];
          if (existingDraft) {
            return deriveValueMapProjectSelectionState(selectedNode.path, existingDraft) as ValueMapProjectUiState | null | undefined;
          }
          const hydrated = hydrateSmartDraftForTarget(selectedNode.path);
          if (hydrated.kind === 'advanced') return undefined;
          return deriveValueMapProjectSelectionState(selectedNode.path, hydrated.draft) as ValueMapProjectUiState | null | undefined;
        })() ?? undefined}
        onValueMapScopeChange={(scope) => {
          if (!selectedTargetPath) return;
          if (scope === 'inline') {
            updateValueMapCompositionForTarget({
              targetPath: selectedTargetPath,
              patch: (composition) => ({
                ...composition,
                scope: 'inline',
                project: null,
              }),
            });
            return;
          }

          const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedTargetPath);
          const state = valueMapProjectSelectionByTarget[targetSessionKey];
          const candidateTableId = state?.tableId ?? projectValueTableCatalog[0]?.table.id;
          if (!candidateTableId) return;
          const candidateEntry = projectValueTableCatalog.find((entry) => entry.table.id === candidateTableId);
          if (!candidateEntry) return;
          const firstEnabledDirection = buildDirectionOptions(candidateEntry.revision).find((option) => option.enabled);
          if (!firstEnabledDirection) return;

          void applyValueMapSelectionToDraft({
            targetPath: selectedTargetPath,
            tableId: candidateTableId,
            direction: firstEnabledDirection.direction,
            preserveInlineMappings: true,
          });
        }}
        onValueMapProjectTableSelect={(tableId) => {
          if (!selectedTargetPath) return;
          const selectedEntry = projectValueTableCatalog.find((entry) => entry.table.id === tableId);
          if (!selectedEntry) return;
          const enabledDirection = buildDirectionOptions(selectedEntry.revision).find((option) => option.enabled);
          if (!enabledDirection) return;

          void applyValueMapSelectionToDraft({
            targetPath: selectedTargetPath,
            tableId,
            direction: enabledDirection.direction,
            preserveInlineMappings: false,
          });
        }}
        onValueMapDirectionSelect={(direction) => {
          if (!selectedTargetPath) return;
          const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedTargetPath);
          const state = valueMapProjectSelectionByTarget[targetSessionKey];
          if (!state?.tableId) return;
          void applyValueMapSelectionToDraft({
            targetPath: selectedTargetPath,
            tableId: state.tableId,
            direction,
            preserveInlineMappings: true,
          });
        }}
        onValueMapNoMatchModeChange={(mode) => {
          if (!selectedTargetPath) return;
          updateValueMapCompositionForTarget({
            targetPath: selectedTargetPath,
            patch: (composition) => {
              const currentFallback = composition.noMatchBehavior?.fallbackValue
                ?? (composition.fallback.kind === 'static' && (
                  typeof composition.fallback.value === 'string'
                  || typeof composition.fallback.value === 'number'
                  || typeof composition.fallback.value === 'boolean'
                )
                  ? composition.fallback.value
                  : '');
              const normalized = normalizeValueMapFallback(
                mode,
                currentFallback,
              );
              return {
                ...composition,
                fallback: normalized.fallbackArgument,
                noMatchBehavior: normalized.noMatchBehavior,
              };
            },
          });
        }}
        onValueMapInlineMappingAdd={() => {
          if (!selectedTargetPath) return;
          updateValueMapCompositionForTarget({
            targetPath: selectedTargetPath,
            patch: (composition) => ({
              ...composition,
              scope: 'inline',
              project: null,
              mappings: [
                ...composition.mappings,
                {
                  whenValue: '',
                  output: { kind: 'static', value: '' },
                },
              ],
            }),
          });
        }}
        onValueMapInlineMappingUpdate={(index, patch) => {
          if (!selectedTargetPath) return;
          updateValueMapCompositionForTarget({
            targetPath: selectedTargetPath,
            patch: (composition) => ({
              ...composition,
              scope: 'inline',
              project: null,
              mappings: composition.mappings.map((entry, rowIndex) => {
                if (rowIndex !== index) return entry;
                return {
                  ...entry,
                  ...(patch.whenValue !== undefined ? { whenValue: patch.whenValue } : {}),
                  ...(patch.outputValue !== undefined
                    ? { output: { kind: 'static' as const, value: patch.outputValue } }
                    : {}),
                };
              }),
            }),
          });
        }}
        onValueMapInlineMappingRemove={(index) => {
          if (!selectedTargetPath) return;
          updateValueMapCompositionForTarget({
            targetPath: selectedTargetPath,
            patch: (composition) => ({
              ...composition,
              scope: 'inline',
              project: null,
              mappings: composition.mappings.filter((_, rowIndex) => rowIndex !== index),
            }),
          });
        }}
        onValueMapFallbackValueChange={(fallbackText) => {
          if (!selectedTargetPath) return;
          updateValueMapCompositionForTarget({
            targetPath: selectedTargetPath,
            patch: (composition) => {
              const normalized = normalizeValueMapFallback('fallback_value', fallbackText);
              return {
                ...composition,
                fallback: normalized.fallbackArgument,
                noMatchBehavior: normalized.noMatchBehavior,
              };
            },
          });
        }}
        onValueMapConvertInlineToProject={() => {
          if (!selectedTargetPath) return;
          const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedTargetPath);
          const state = valueMapProjectSelectionByTarget[targetSessionKey];
          const fallbackTableId = projectValueTableCatalog[0]?.table.id;
          const fallbackDirection = projectValueTableCatalog[0]
            ? (buildDirectionOptions(projectValueTableCatalog[0].revision).find((option) => option.enabled)?.direction ?? null)
            : null;
          if (!state?.tableId && (!fallbackTableId || !fallbackDirection)) return;
          setValueMapConversionPrompt({
            targetPath: selectedTargetPath,
            selectedTableId: state?.tableId ?? fallbackTableId!,
            selectedDirection: state?.direction ?? fallbackDirection!,
          });
        }}
        onValueMapAdoptLatestRevision={() => {
          if (!selectedTargetPath) return;
          const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedTargetPath);
          const state = valueMapProjectSelectionByTarget[targetSessionKey];
          if (!state?.tableId || !state.pinnedRevision || !state.currentRevision) return;
          if (state.currentRevision <= state.pinnedRevision) return;
          setValueMapAdoptionPrompt({
            targetPath: selectedTargetPath,
            tableId: state.tableId,
            fromRevision: state.pinnedRevision,
            toRevision: state.currentRevision,
          });
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
        smartActiveActionId={smartActionMetaByTarget[buildSmartTargetSessionKey(mappingId, selectedNode.path)]?.activeActionId ?? null}
        smartActionAnnouncement={smartActionMetaByTarget[buildSmartTargetSessionKey(mappingId, selectedNode.path)]?.announcement ?? null}
        smartConcatSeparator={smartActionMetaByTarget[buildSmartTargetSessionKey(mappingId, selectedNode.path)]?.concatSeparator ?? ' '}
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
          const targetSessionKey = buildSmartTargetSessionKey(mappingId, selectedTargetPath);
          setSmartActionMetaByTarget((prev) => ({
            ...prev,
            [targetSessionKey]: {
              ...(prev[targetSessionKey] ?? { activeActionId: 'text.concat', concatSeparator: ' ' }),
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
      if (canFillCurrentValue) {
        setSourceSelectionModeOverride('fill-current-value');
      }
      return;
    }
    setIsSourcePanelHidden(false);
    setSourceSelectionModeOverride(null);
    setIsSourceBrowseOpen((prev) => !prev);
  };

  const handleHideSourcePanel = () => {
    setIsSourcePanelHidden(true);
    setSourceSelectionModeOverride(null);
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

      <ConfirmDialog
        open={smartMethodSwitchPrompt !== null}
        title="Change mapping method?"
        message={(() => {
          if (!smartMethodSwitchPrompt) return '';
          const targetSessionKey = buildSmartTargetSessionKey(mappingId, smartMethodSwitchPrompt.targetPath);
          const promptDraft = smartDraftByTargetState[targetSessionKey] ?? null;
          const clauseCount = promptDraft?.composition?.kind === 'condition'
            ? promptDraft.composition.clauses.length
            : 0;
          const predicateCount = promptDraft?.composition?.kind === 'condition'
            ? promptDraft.composition.clauses.reduce((total, clause) => total + clause.predicates.length, 0)
            : 0;

          return (
            <div className="space-y-2" data-testid="smart-method-switch-confirm-message">
              <p>
                Switching away from <strong>Conditional</strong> will discard conditional-specific configuration for this field.
              </p>
              <ul className="list-disc space-y-1 pl-5" data-testid="smart-method-switch-discard-list">
                <li>IF predicates ({predicateCount})</li>
                <li>Condition clauses ({clauseCount})</li>
                <li>THEN / OTHERWISE branch values</li>
              </ul>
              <p data-testid="smart-method-switch-preserve-tray">
                Input Tray rows are preserved on both cancel and confirm.
              </p>
            </div>
          );
        })()}
        confirmLabel="Discard conditional settings"
        cancelLabel="Keep conditional"
        onConfirm={handleConfirmSmartMethodSwitch}
        onCancel={() => setSmartMethodSwitchPrompt(null)}
      />

      <ConfirmDialog
        open={valueMapConversionPrompt !== null}
        title="Convert inline map to project table"
        message="Use the selected project value table and direction for this field? Existing inline entries will be replaced by project-table lookup behavior and this mapping will be marked unsaved."
        confirmLabel="Convert"
        cancelLabel="Cancel"
        onConfirm={handleConfirmValueMapConversion}
        onCancel={() => setValueMapConversionPrompt(null)}
      />

      <ConfirmDialog
        open={valueMapAdoptionPrompt !== null}
        title="Adopt newer table revision"
        message={valueMapAdoptionPrompt
          ? `Adopt ${valueMapAdoptionPrompt.tableId} revision r${valueMapAdoptionPrompt.toRevision} (currently pinned to r${valueMapAdoptionPrompt.fromRevision})? This will update the pinned revision and mark the mapping unsaved.`
          : ''}
        confirmLabel="Adopt revision"
        cancelLabel="Keep current"
        onConfirm={handleConfirmValueMapAdoption}
        onCancel={() => setValueMapAdoptionPrompt(null)}
      />
    </>
  );
}
