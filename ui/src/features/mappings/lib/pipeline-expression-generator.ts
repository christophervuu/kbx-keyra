import type {
  BranchValue,
  ComparisonOperator,
  ConditionGroup,
  ConditionRow,
  ExpressionBuilderState,
  FallbackValue,
  Operand,
  PrimitiveValue,
  StaticValue,
  ValueMapEntry,
} from './expression-builder-state';

function quoteString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function literal(value: PrimitiveValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return quoteString(value);
}

function staticLiteral(value: StaticValue): string {
  switch (value.type) {
    case 'string':
      return quoteString(value.value);
    case 'number':
      return String(value.value);
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'null':
      return 'null';
  }
}

function generateOperand(operand: Operand): string {
  switch (operand.kind) {
    case 'source':
      return `source(${quoteString(operand.value)})`;
    case 'expression':
      return operand.value;
    case 'static':
      return quoteString(operand.value);
  }
}

function generateConditionRow(row: ConditionRow): string {
  const left = generateOperand(row.leftOperand);

  if (row.comparison === 'isNull') {
    return `isNull(${left})`;
  }

  if (row.comparison === 'isNotNull') {
    return `not(isNull(${left}))`;
  }

  const right = generateOperand(row.rightOperand);
  return `${comparisonToFunction(row.comparison)}(${left}, ${right})`;
}

function isConditionGroup(value: ConditionRow | ConditionGroup): value is ConditionGroup {
  return 'operator' in value;
}

function generateConditionGroup(group: ConditionGroup): string {
  if (group.conditions.length === 0) {
    return group.operator === 'and' ? 'and()' : 'or()';
  }

  const parts = group.conditions.map((condition) =>
    isConditionGroup(condition) ? generateConditionGroup(condition) : generateConditionRow(condition),
  );

  if (parts.length === 1) {
    return parts[0];
  }

  return `${group.operator}(${parts.join(', ')})`;
}

function generateBranch(branch: BranchValue): string {
  switch (branch.kind) {
    case 'static':
      return quoteString(branch.value);
    case 'source':
      return `source(${quoteString(branch.value)})`;
    case 'expression':
      return branch.value;
    case 'conditional':
      return generateExpressionFromState(branch.value);
  }
}

function generateFallback(fallback: FallbackValue): string {
  if (fallback.kind === 'null') {
    return 'null';
  }
  return quoteString(fallback.value ?? '');
}

function generateValueMapEntries(entries: readonly ValueMapEntry[]): string {
  const validEntries = entries.filter((entry) => entry.whenValue.trim().length > 0);
  if (validEntries.length === 0) {
    return '{}';
  }

  return `{${validEntries
    .map((entry) => `${quoteString(entry.whenValue)}: ${quoteString(entry.mapTo)}`)
    .join(', ')}}`;
}

function comparisonToFunction(operator: Exclude<ComparisonOperator, 'isNotNull'>): string {
  return operator;
}

function generateValueExpression(state: Extract<ExpressionBuilderState, { mode: 'value' }>): string {
  if (state.staticValue) {
    return `static(${staticLiteral(state.staticValue)})`;
  }

  const primarySource = state.sources[0];
  if (!primarySource) {
    return '';
  }

  let expression = `source(${quoteString(primarySource.path)})`;

  for (const transform of state.transforms) {
    const additionalArgs = transform.parameters.map((param) => literal(param.value));
    expression = `${transform.functionName}(${[expression, ...additionalArgs].join(', ')})`;
  }

  return expression;
}

function generateConditionalExpression(
  state: Extract<ExpressionBuilderState, { mode: 'conditional' }>,
): string {
  const condition = generateConditionGroup(state.condition);
  const thenExpr = generateBranch(state.thenBranch);
  const elseExpr = generateBranch(state.elseBranch);
  return `if(${condition}, ${thenExpr}, ${elseExpr})`;
}

function generateValueMapExpression(state: Extract<ExpressionBuilderState, { mode: 'valueMap' }>): string {
  if (!state.inputSource) {
    return '';
  }

  const input = `source(${quoteString(state.inputSource)})`;
  const entries = generateValueMapEntries(state.mappings);
  const fallback = generateFallback(state.fallback);
  return `valueMap(${input}, ${entries}, ${fallback})`;
}

export function generateExpressionFromState(state: ExpressionBuilderState): string {
  switch (state.mode) {
    case 'value':
      return generateValueExpression(state);
    case 'conditional':
      return generateConditionalExpression(state);
    case 'valueMap':
      return generateValueMapExpression(state);
  }
}
