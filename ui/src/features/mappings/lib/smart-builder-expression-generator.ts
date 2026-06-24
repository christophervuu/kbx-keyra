import type {
  BuilderArgumentValue,
  BuilderInput,
  SmartBuilderDraft,
} from './smart-builder-state';

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function literalToDsl(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return quote(JSON.stringify(value));
}

function findInput(draft: SmartBuilderDraft, inputId: string): BuilderInput | undefined {
  return draft.inputs.find((input) => input.id === inputId);
}

function inputBaseExpression(input: BuilderInput): string {
  switch (input.sourceKind) {
    case 'primary':
      return input.path ? `source(${quote(input.path)})` : '';
    case 'enrichment': {
      if (!input.externalName) return '';
      if (!input.path || input.path.trim().length === 0) return `external(${quote(input.externalName)})`;
      return `get(external(${quote(input.externalName)}), ${quote(input.path)})`;
    }
    case 'constant':
      return input.constantName ? `constant(${quote(input.constantName)})` : '';
    case 'static':
      return `static(${literalToDsl(input.staticValue ?? null)})`;
    case 'item':
      return input.path ? `item(${quote(input.path)})` : 'item("")';
    case 'parent':
      return input.path ? `parent(${quote(input.path)})` : 'parent("")';
    case 'expression':
      return input.rawExpression?.trim() ?? '';
  }
}

function argumentValueToExpression(
  draft: SmartBuilderDraft,
  value: BuilderArgumentValue,
): string {
  const baseExpression = (() => {
    switch (value.kind) {
      case 'static':
        return literalToDsl(value.value);
      case 'expression':
        return value.expression;
      case 'input': {
        const input = findInput(draft, value.inputId);
        return input ? inputExpression(input) : '';
      }
    }
  })();

  if (!baseExpression) return baseExpression;
  if (!value.transforms || value.transforms.length === 0) return baseExpression;
  return applyTransformStepsToExpression(baseExpression, value.transforms, draft);
}

function inputExpression(input: BuilderInput): string {
  let expression = inputBaseExpression(input);
  if (!expression) return '';
  // FS-098 canonical transform ownership is per-value usage (argument transforms)
  // and final-result steps, not raw tray inputs.
  return expression;
}

function applyTransformStepsToExpression(
  expression: string,
  steps: readonly { readonly functionName: string; readonly args?: readonly BuilderArgumentValue[] },
  draft: SmartBuilderDraft,
): string {
  let nextExpression = expression;
  for (const step of steps) {
    const argExpressions = (step.args ?? []).map((arg) => argumentValueToExpression(draft, arg));
    nextExpression = `${step.functionName}(${[nextExpression, ...argExpressions].filter(Boolean).join(', ')})`;
  }
  return nextExpression;
}

function resolveInputReferences(
  expression: string,
  draft: SmartBuilderDraft,
): string {
  return expression.replace(/__input_ref__([a-zA-Z0-9_-]+)/g, (_whole, inputId: string) => {
    const input = findInput(draft, inputId);
    return input ? inputExpression(input) : '';
  });
}

function resolveExplicitInputExpressions(
  draft: SmartBuilderDraft,
  explicitInputIds?: readonly string[],
): readonly string[] {
  if (!explicitInputIds || explicitInputIds.length === 0) return [];

  return explicitInputIds
    .map((id) => findInput(draft, id))
    .filter((input): input is BuilderInput => Boolean(input))
    .map((input) => inputExpression(input))
    .filter(Boolean);
}

function noMatchFallbackExpression(
  draft: SmartBuilderDraft,
  sourceExpression: string,
  fallback: BuilderArgumentValue,
): string {
  const valueMapComposition = draft.composition;
  if (!valueMapComposition || valueMapComposition.kind !== 'valueMap') {
    return argumentValueToExpression(draft, fallback);
  }

  const mode = valueMapComposition.noMatchBehavior?.mode;
  if (mode === 'return_null') return 'null';
  if (mode === 'return_input') return sourceExpression;

  if (mode === 'fallback_value') {
    if (valueMapComposition.noMatchBehavior?.fallbackValue !== undefined) {
      return literalToDsl(valueMapComposition.noMatchBehavior.fallbackValue);
    }
    return argumentValueToExpression(draft, fallback);
  }

  return argumentValueToExpression(draft, fallback);
}

function predicateExpression(
  draft: SmartBuilderDraft,
  predicate: {
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
  },
): string {
  const left = argumentValueToExpression(draft, predicate.left);
  const right = predicate.right ? argumentValueToExpression(draft, predicate.right) : '';
  switch (predicate.operator) {
    case 'isTruthy':
      return `not(isNull(${left}))`;
    case 'isFalsy':
      return `isNull(${left})`;
    case 'isNull':
      return `isNull(${left})`;
    case 'isNotNull':
      return `not(isNull(${left}))`;
    default:
      return `${predicate.operator}(${left}, ${right})`;
  }
}

export function generateSmartBuilderExpression(draft: SmartBuilderDraft): string {
  const composition = draft.composition;
  if (!composition) return '';

  let baseExpression = '';

  switch (composition.kind) {
    case 'advancedExpression':
      baseExpression = composition.expression;
      break;
    case 'direct': {
      if (composition.value) {
        baseExpression = argumentValueToExpression(draft, composition.value);
        break;
      }
      const input = findInput(draft, composition.inputId);
      baseExpression = input ? inputExpression(input) : '';
      break;
    }
    case 'concat': {
      const hasExplicitParts = Boolean(composition.parts && composition.parts.length > 0);
      const expressions = hasExplicitParts
        ? (composition.parts ?? []).map((part) => argumentValueToExpression(draft, part)).filter(Boolean)
        : resolveExplicitInputExpressions(draft, composition.inputIds);
      if (expressions.length === 0) {
        baseExpression = '';
        break;
      }
      if (hasExplicitParts) {
        baseExpression = `concat(${expressions.join(', ')})`;
        break;
      }
      if (!composition.separator) {
        baseExpression = `concat(${expressions.join(', ')})`;
        break;
      }
      const withSeparators = expressions.flatMap((expr, index) =>
        index === expressions.length - 1 ? [expr] : [expr, quote(composition.separator)],
      );
      baseExpression = `concat(${withSeparators.join(', ')})`;
      break;
    }
    case 'coalesce': {
      const expressions = composition.values && composition.values.length > 0
        ? composition.values.map((value) => argumentValueToExpression(draft, value)).filter(Boolean)
        : resolveExplicitInputExpressions(draft, composition.inputIds);
      const withFallback = composition.fallback
        ? [...expressions, argumentValueToExpression(draft, composition.fallback)]
        : expressions;
      baseExpression = withFallback.length > 0 ? `coalesce(${withFallback.join(', ')})` : '';
      break;
    }
    case 'default': {
      const primary = findInput(draft, composition.inputId);
      if (!primary) {
        baseExpression = '';
        break;
      }
      const primaryExpr = inputExpression(primary);
      if (!primaryExpr) {
        baseExpression = '';
        break;
      }
      const fallbackExpr = argumentValueToExpression(draft, composition.fallback);
      baseExpression = `default(${primaryExpr}, ${fallbackExpr})`;
      break;
    }
    case 'math': {
      if (composition.startInputId && composition.operations && composition.operations.length > 0) {
        const startInput = findInput(draft, composition.startInputId);
        if (!startInput) {
          baseExpression = '';
          break;
        }
        let acc = inputExpression(startInput);
        if (!acc) {
          baseExpression = '';
          break;
        }

        for (const operation of composition.operations) {
          const operandExpression = (() => {
            if (operation.operand) {
              return argumentValueToExpression(draft, operation.operand);
            }
            if (!operation.inputId) return '';
            const operandInput = findInput(draft, operation.inputId);
            if (!operandInput) return '';
            return inputExpression(operandInput);
          })();
          if (!operandExpression) continue;
          acc = `${operation.operator}(${acc}, ${operandExpression})`;
        }

        baseExpression = acc;
        break;
      }

      const expressions = resolveExplicitInputExpressions(draft, composition.inputIds);
      if (expressions.length === 0) {
        baseExpression = '';
        break;
      }
      if (expressions.length === 1) {
        baseExpression = expressions[0] ?? '';
        break;
      }
      const [first, ...rest] = expressions;
      const operator = composition.operator ?? 'add';
      baseExpression = rest.reduce(
        (acc, current) => `${operator}(${acc}, ${current})`,
        first,
      );
      break;
    }
    case 'condition': {
      if (composition.clauses.length === 0) {
        baseExpression = '';
        break;
      }

      const joiner = composition.matchMode === 'any' ? 'or' : 'and';

      const elseExpression = argumentValueToExpression(draft, composition.elseOutput);
      const folded = [...composition.clauses].reverse().reduce((elseExpr, clause) => {
        const predicates = clause.predicates.map((predicate) => predicateExpression(draft, predicate));
        const predicateExpr = predicates.length === 1 ? predicates[0] : `${joiner}(${predicates.join(', ')})`;
        const thenExpr = argumentValueToExpression(draft, clause.thenOutput);
        return `if(${predicateExpr}, ${thenExpr}, ${elseExpr})`;
      }, elseExpression);

      baseExpression = resolveInputReferences(folded, draft);
      break;
    }
    case 'valueMap': {
      const source = findInput(draft, composition.inputId);
      if (!source) {
        baseExpression = '';
        break;
      }
      const sourceExpr = inputExpression(source);
      const mappingExpr = composition.scope === 'project' && composition.project
        ? `valueTable(${quote(composition.project.ref.tableKey)}, ${quote(composition.project.ref.inputSideKey)}, ${quote(composition.project.ref.outputSideKey)})`
        : `{${composition.mappings
          .filter((entry) => entry.whenValue.trim().length > 0)
          .map((entry) => `${quote(entry.whenValue)}: ${argumentValueToExpression(draft, entry.output)}`)
          .join(', ')}}`;
      const fallbackExpr = noMatchFallbackExpression(draft, sourceExpr, composition.fallback);
      baseExpression = `valueMap(${sourceExpr}, ${mappingExpr}, ${fallbackExpr})`;
      break;
    }
    case 'arrayBuild': {
      const expressions = resolveExplicitInputExpressions(draft, composition.inputIds);
      if (expressions.length === 0) {
        baseExpression = '';
        break;
      }
      baseExpression = `array(${expressions.join(', ')})`;
      break;
    }
    case 'arrayMerge': {
      const expressions = resolveExplicitInputExpressions(draft, composition.inputIds);
      if (expressions.length === 0) {
        baseExpression = '';
        break;
      }
      baseExpression = `merge(${expressions.join(', ')})`;
      break;
    }
  }

  if (!baseExpression) return baseExpression;
  if (draft.postSteps.length === 0) return baseExpression;
  return applyTransformStepsToExpression(baseExpression, draft.postSteps, draft);
}
