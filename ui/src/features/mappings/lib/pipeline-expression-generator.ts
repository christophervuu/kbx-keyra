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

function typedValueLiteral(value: string | undefined, type: StaticValue['type'] | undefined): string {
  const effectiveType = type ?? 'string';
  if (effectiveType === 'null') return 'null';
  if (effectiveType === 'boolean') return value === 'true' ? 'true' : 'false';
  if (effectiveType === 'number') {
    const parsed = Number(value ?? '');
    return Number.isFinite(parsed) ? String(parsed) : '0';
  }
  return quoteString(value ?? '');
}

function generateOperand(operand: Operand): string {
  switch (operand.kind) {
    case 'source':
      return `source(${quoteString(operand.value)})`;
    case 'expression':
      return operand.value;
    case 'static':
      return quoteString(operand.value);
    case 'pipeline': {
      // Generate from structured pipeline state (T-03)
      if (operand.pipelineState) {
        return generateValueExpression(operand.pipelineState);
      }
      return operand.value;
    }
  }
}

function generateConditionRow(row: ConditionRow): string {
  const left = generateOperand(row.leftOperand);

  if (row.comparison === 'isTruthy') {
    return left;
  }

  if (row.comparison === 'isFalsy') {
    return `not(${left})`;
  }

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
      return typedValueLiteral(branch.value, branch.valueType);
    case 'source':
      return `source(${quoteString(branch.value)})`;
    case 'expression':
      return branch.value;
    case 'pipeline':
      // Generate from structured pipeline state (T-03)
      return generateValueExpression(branch.state);
    case 'conditional':
      return generateExpressionFromState(branch.value);
  }
}

function generateFallback(fallback: FallbackValue): string {
  if (fallback.kind === 'null') {
    return 'null';
  }
  return typedValueLiteral(fallback.value, fallback.valueType);
}

function generateValueMapEntries(entries: readonly ValueMapEntry[]): string {
  const validEntries = entries.filter((entry) => entry.whenValue.trim().length > 0);
  if (validEntries.length === 0) {
    return '{}';
  }

  return `{${validEntries
    .map((entry) => `${quoteString(entry.whenValue)}: ${typedValueLiteral(entry.mapTo, entry.mapToType)}`)
    .join(', ')}}`;
}

function comparisonToFunction(operator: Exclude<ComparisonOperator, 'isNotNull' | 'isTruthy' | 'isFalsy'>): string {
  return operator;
}

export function generateValueExpression(state: Extract<ExpressionBuilderState, { mode: 'value' }>): string {
  if (state.inputType === 'static' && state.staticValue !== undefined) {
    // Emit bare DSL literal (no static() wrapper)
    const baseLiteral = staticLiteral(state.staticValue);

    // Transforms can still be applied on top of a static literal
    let expression = baseLiteral;
    for (const transform of state.transforms) {
      const additionalArgs = transform.parameters.map((param) => literal(param.value));
      expression = `${transform.functionName}(${[expression, ...additionalArgs].join(', ')})`;
    }
    return expression;
  }

  // Legacy: staticValue present without explicit inputType (backward compat)
  if (state.staticValue && state.inputType !== 'source') {
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
