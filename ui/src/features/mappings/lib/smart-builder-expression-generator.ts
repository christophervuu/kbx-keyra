import type {
  BuilderArgumentValue,
  BuilderInput,
  SmartBuilderDraft,
} from './smart-builder-state';
import { resolveOrderedInputIds } from './smart-builder-state';

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
}

function inputExpression(input: BuilderInput): string {
  let expression = inputBaseExpression(input);
  if (!expression) return '';

  for (const transform of input.transforms) {
    const argExpressions = (transform.args ?? []).map((arg) => {
      if (arg.kind === 'static') return literalToDsl(arg.value);
      if (arg.kind === 'expression') return arg.expression;
      if (arg.kind === 'input') return `__input_ref__${arg.inputId}`;
      return '';
    });
    expression = `${transform.functionName}(${[expression, ...argExpressions].filter(Boolean).join(', ')})`;
  }

  return expression;
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

function resolveInputExpressions(
  draft: SmartBuilderDraft,
  explicitInputIds?: readonly string[],
): readonly string[] {
  const orderedIds = resolveOrderedInputIds(draft, explicitInputIds);
  return orderedIds
    .map((id) => findInput(draft, id))
    .filter((input): input is BuilderInput => Boolean(input))
    .map((input) => inputExpression(input))
    .filter(Boolean);
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

  switch (composition.kind) {
    case 'advancedExpression':
      return composition.expression;
    case 'direct': {
      const input = findInput(draft, composition.inputId);
      return input ? inputExpression(input) : '';
    }
    case 'concat': {
      const expressions = resolveInputExpressions(draft, composition.inputIds);
      if (expressions.length === 0) return '';
      if (!composition.separator) return `concat(${expressions.join(', ')})`;
      const withSeparators = expressions.flatMap((expr, index) =>
        index === expressions.length - 1 ? [expr] : [expr, quote(composition.separator)],
      );
      return `concat(${withSeparators.join(', ')})`;
    }
    case 'coalesce': {
      const expressions = resolveInputExpressions(draft, composition.inputIds);
      const withFallback = composition.fallback
        ? [...expressions, argumentValueToExpression(draft, composition.fallback)]
        : expressions;
      return withFallback.length > 0 ? `coalesce(${withFallback.join(', ')})` : '';
    }
    case 'math': {
      const expressions = resolveInputExpressions(draft, composition.inputIds);
      if (expressions.length === 0) return '';
      if (expressions.length === 1) return expressions[0];
      const [first, ...rest] = expressions;
      return rest.reduce(
        (acc, current) => `${composition.operator}(${acc}, ${current})`,
        first,
      );
    }
    case 'condition': {
      if (composition.clauses.length === 0) return '';

      const elseExpression = argumentValueToExpression(draft, composition.elseOutput);
      const folded = [...composition.clauses].reverse().reduce((elseExpr, clause) => {
        const predicates = clause.predicates.map((predicate) => predicateExpression(draft, predicate));
        const predicateExpr = predicates.length === 1 ? predicates[0] : `and(${predicates.join(', ')})`;
        const thenExpr = argumentValueToExpression(draft, clause.thenOutput);
        return `if(${predicateExpr}, ${thenExpr}, ${elseExpr})`;
      }, elseExpression);

      return resolveInputReferences(folded, draft);
    }
    case 'valueMap': {
      const source = findInput(draft, composition.inputId);
      if (!source) return '';
      const sourceExpr = inputExpression(source);
      const mappings = composition.mappings
        .filter((entry) => entry.whenValue.trim().length > 0)
        .map(
          (entry) => `${quote(entry.whenValue)}: ${argumentValueToExpression(draft, entry.output)}`,
        );
      const mappingExpr = `{${mappings.join(', ')}}`;
      const fallbackExpr = argumentValueToExpression(draft, composition.fallback);
      return `valueMap(${sourceExpr}, ${mappingExpr}, ${fallbackExpr})`;
    }
    case 'arrayBuild': {
      const expressions = resolveInputExpressions(draft, composition.inputIds);
      return `array(${expressions.join(', ')})`;
    }
    case 'arrayMerge': {
      const expressions = resolveInputExpressions(draft, composition.inputIds);
      return `merge(${expressions.join(', ')})`;
    }
  }
}
