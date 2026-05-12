import {
  type ArgumentSlotRef,
  type ChainBranch,
  type ChainBuilderState,
  type ChainState,
  type ChainStep,
  type ConditionOperand,
  type ElseIfStep,
  type FS039TransformStep,
  type LogicStep,
  type OperandValue,
  type StaticValueBranch,
} from './chain-builder-state';
import { createEmptyChainState } from './chain-builder-state';
import { generateChainExpression } from './chain-expression-generator';

function staticValueToLiteral(value: StaticValueBranch): string {
  switch (value.type) {
    case 'string':
      return value.value;
    case 'number':
      return String(value.value);
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'null':
      return 'null';
  }
}

function operandToLegacy(operand: OperandValue): ConditionOperand {
  switch (operand.kind) {
    case 'currentValue':
      return { kind: 'currentValue' };
    case 'field':
      return { kind: 'source', path: operand.path };
    case 'static':
      return { kind: 'literal', value: staticValueToLiteral(operand.value) };
    case 'expression':
      return { kind: 'literal', value: operand.dsl };
    default:
      return { kind: 'currentValue' };
  }
}

function isTransformStep(step: ChainStep): step is FS039TransformStep {
  return step.kind === 'transform';
}

function chainToBranch(chain: ChainState): ChainBranch {
  if (chain.steps.length === 0) {
    if (chain.source.kind === 'field') {
      return { kind: 'source', path: chain.source.path, steps: [] };
    }
    if (chain.source.kind === 'static') {
      return { kind: 'static', value: chain.source.value };
    }
  }

  if (chain.source.kind === 'field' && chain.steps.every(isTransformStep)) {
    return {
      kind: 'source',
      path: chain.source.path,
      steps: chain.steps.map((step) => ({
        kind: 'transform',
        functionName: step.functionName,
        args: step.args as readonly ArgumentSlotRef[],
      })),
    };
  }

  return { kind: 'expression', raw: generateChainExpression(chain) };
}

function stepToLegacy(step: ChainStep): LogicStep {
  if (step.kind === 'transform') {
    return {
      kind: 'transform',
      functionName: step.functionName,
      args: step.args,
    };
  }

  if (step.kind === 'valueMap') {
    return {
      kind: 'valueMap',
      mappings: step.mappings.map((entry) => ({
        whenValue: entry.whenValue,
        outputValue: chainToBranch(entry.outputChain),
      })),
      defaultValue: chainToBranch(step.defaultValue),
    };
  }

  const [firstClause, ...restClauses] = step.conditions;
  const basePredicate = firstClause?.predicates[0];

  const elseIfSteps: ElseIfStep[] = restClauses.map((clause) => {
    const predicate = clause.predicates[0];
    if (!predicate) {
      return {
        useCurrentValue: true,
        operator: 'isTruthy',
        rightOperand: { kind: 'currentValue' },
        thenBranch: chainToBranch(clause.thenBranch),
      };
    }

    const left = operandToLegacy(predicate.left);
    return {
      useCurrentValue: left.kind === 'currentValue',
      customLeftOperand: left.kind === 'currentValue' ? undefined : left,
      operator: predicate.operator,
      rightOperand: operandToLegacy(predicate.right),
      thenBranch: chainToBranch(clause.thenBranch),
    };
  });

  if (!basePredicate) {
    return {
      kind: 'condition',
      useCurrentValue: true,
      operator: 'isTruthy',
      rightOperand: { kind: 'currentValue' },
      thenBranch: { kind: 'expression', raw: '' },
      elseBranch: chainToBranch(step.elseBranch),
      elseIfSteps,
    };
  }

  const left = operandToLegacy(basePredicate.left);
  return {
    kind: 'condition',
    useCurrentValue: left.kind === 'currentValue',
    customLeftOperand: left.kind === 'currentValue' ? undefined : left,
    operator: basePredicate.operator,
    rightOperand: operandToLegacy(basePredicate.right),
    thenBranch: chainToBranch(firstClause.thenBranch),
    elseBranch: chainToBranch(step.elseBranch),
    elseIfSteps,
  };
}

export function toLegacyChainBuilderState(chain: ChainState): ChainBuilderState {
  const base = createEmptyChainState();

  if (chain.source.kind === 'field') {
    return {
      ...base,
      entryType: 'source',
      sourcePath: chain.source.path,
      logicSteps: chain.steps.map(stepToLegacy),
    };
  }

  if (chain.source.kind === 'static') {
    return {
      ...base,
      entryType: 'static',
      staticValue: chain.source.value,
      sourcePath: undefined,
      logicSteps: chain.steps.map(stepToLegacy),
    };
  }

  return {
    ...base,
    logicSteps: chain.steps.map(stepToLegacy),
  };
}
