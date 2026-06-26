import { parse, type EvaluationContext } from './dsl/index.js';
import { DIAGNOSTIC_CODES } from './diagnostics/codes.js';
import { formatDiagnosticMessage } from './diagnostics/format.js';
import { evaluate } from './dsl/evaluator.js';
import { AstCache, setAtPath } from './execute/index.js';
import { defaultRegistry } from './registry/function-registry.js';
import { validate } from './validate.js';
import { getOrBuildSchemaTree } from './validate/index.js';
import type {
  Diagnostic,
  EngineOptions,
  ExecutionResult,
  MappingConfig,
  TraceEntry,
} from './types/index.js';

/**
 * Executes a mapping configuration against source data and schemas.
 */
export function execute(
  config: MappingConfig,
  sourceData: unknown,
  sourceSchema: unknown,
  targetSchema: unknown,
  options?: EngineOptions,
): ExecutionResult {
  const startedAt = Date.now();

  if (options?.validateBeforeExecute === true) {
    const validationResult = validate(config, sourceSchema, targetSchema, options);
    if (validationResult.valid === false) {
      return {
        output: null,
        diagnostics: validationResult.diagnostics,
        trace: undefined,
        stats: {
          rulesEvaluated: 0,
          rulesSucceeded: 0,
          rulesFailed: 0,
          durationMs: Date.now() - startedAt,
        },
      };
    }
  }

  const output: Record<string, unknown> = {};
  const diagnostics: Diagnostic[] = [];
  const astCache = new AstCache();
  const scopeStack: unknown[] = [];
  const trace: TraceEntry[] | undefined = options?.trace === true ? [] : undefined;
  const rulesEvaluated = config.rules.length;
  let rulesSucceeded = 0;
  let rulesFailed = 0;

  const evaluationOptions: EngineOptions = {
    ...options,
    externalSources: options?.externalSources ?? {},
  };

  let currentRuleDiagnostics: Diagnostic[] = [];

  const context: EvaluationContext = {
    sourceData,
    scopeStack,
    constants: config.config.constants,
    externalSources: evaluationOptions.externalSources ?? {},
    registry: defaultRegistry,
    options: evaluationOptions,
    currentRule: undefined,
    currentItem: undefined,
    parentItem: undefined,
    evaluate,
    addDiagnostic: (diagnostic: Diagnostic): void => {
      currentRuleDiagnostics.push(diagnostic);
    },
    pushScope: (scope: unknown): void => {
      scopeStack.push(scope);
    },
    popScope: (): unknown => {
      return scopeStack.pop();
    },
  };

  for (let ruleIndex = 0; ruleIndex < config.rules.length; ruleIndex += 1) {
    const ruleStartedAt = Date.now();
    const rule = config.rules[ruleIndex];
    if (rule === undefined) {
      continue;
    }

    let ast = astCache.get(rule.expression);

    if (ast === undefined) {
      const parseResult = parse(rule.expression, {
        registry: defaultRegistry,
      });
      ast = parseResult.ast;
      astCache.set(rule.expression, ast);

      for (const parseDiagnostic of parseResult.diagnostics) {
        diagnostics.push({
          ...parseDiagnostic,
          ruleIndex,
          targetPath: rule.target,
          expression: rule.expression,
        });
      }
    }

    context.currentRule = rule;

    if (ast === null) {
      setAtPath(output, rule.target, null);
      rulesFailed += 1;

      if (trace) {
        const parseDiagnostics = diagnostics.filter((diagnostic) => diagnostic.ruleIndex === ruleIndex);
        trace.push({
          ruleIndex,
          targetPath: rule.target,
          expression: rule.expression,
          inputValue: sourceData,
          outputValue: null,
          diagnostics: parseDiagnostics,
          durationMs: Date.now() - ruleStartedAt,
        });
      }

      context.currentRule = undefined;
      continue;
    }

    scopeStack.length = 0;
    currentRuleDiagnostics = [];

    const evaluationResult = evaluate(ast, context);

    const ruleDiagnostics: Diagnostic[] = [
      ...currentRuleDiagnostics,
      ...evaluationResult.diagnostics,
    ].map((diagnostic) => ({
      ...diagnostic,
      ruleIndex,
      targetPath: rule.target,
      expression: rule.expression,
    }));

    diagnostics.push(...ruleDiagnostics);

    const hasError = ruleDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
    const outputValue = hasError ? null : evaluationResult.value;

    if (hasError) {
      rulesFailed += 1;
    } else {
      rulesSucceeded += 1;
    }

    setAtPath(output, rule.target, outputValue);

    if (trace) {
      trace.push({
        ruleIndex,
        targetPath: rule.target,
        expression: rule.expression,
        inputValue: sourceData,
        outputValue,
        diagnostics: ruleDiagnostics,
        durationMs: Date.now() - ruleStartedAt,
      });
    }

    context.currentRule = undefined;
  }

  applyUnmappedTargets(config, output, targetSchema, diagnostics);
  applyNullSubtrees(config, output);

  diagnostics.sort(compareDiagnostics);
  const durationMs = Date.now() - startedAt;

  return {
    output,
    diagnostics,
    trace,
    stats: {
      rulesEvaluated,
      rulesSucceeded,
      rulesFailed,
      durationMs,
    },
  };
}

function applyUnmappedTargets(
  config: MappingConfig,
  output: Record<string, unknown>,
  targetSchema: unknown,
  diagnostics: Diagnostic[],
): void {
  const strategy = config.config.unmappedTargets;

  if (strategy === 'omit') {
    return;
  }

  if (targetSchema === null || targetSchema === undefined) {
    return;
  }

  const schemaTree = getOrBuildSchemaTree(targetSchema, detectSchemaFormat(targetSchema));
  diagnostics.push(...schemaTree.diagnostics);

  const requiredLeafPaths = schemaTree.getRequiredLeafPaths();
  const mappedTargets = new Set(config.rules.map((rule) => rule.target));
  const unmappedRequiredPaths = requiredLeafPaths.filter((path) => !mappedTargets.has(path));

  if (strategy === 'null') {
    for (const path of unmappedRequiredPaths) {
      setAtPath(output, path, null);
    }
    return;
  }

  for (const path of unmappedRequiredPaths) {
    diagnostics.push({
      code: DIAGNOSTIC_CODES['KEYRA-W005'].code,
      severity: DIAGNOSTIC_CODES['KEYRA-W005'].severity,
      message: formatDiagnosticMessage('KEYRA-W005', { path }),
      targetPath: path,
    });
  }
}

function applyNullSubtrees(config: MappingConfig, output: Record<string, unknown>): void {
  const nullSubtreesCandidate = (config as { config?: { nullSubtrees?: unknown } }).config?.nullSubtrees;
  if (!Array.isArray(nullSubtreesCandidate)) {
    return;
  }

  for (const path of nullSubtreesCandidate) {
    if (typeof path !== 'string' || path.trim().length === 0) {
      continue;
    }

    setAtPath(output, path, null);
  }
}

function detectSchemaFormat(schema: unknown): 'json-schema' | 'xsd' {
  if (typeof schema === 'string') {
    return 'xsd';
  }

  return 'json-schema';
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  const leftRuleIndex = left.ruleIndex ?? Number.POSITIVE_INFINITY;
  const rightRuleIndex = right.ruleIndex ?? Number.POSITIVE_INFINITY;

  if (leftRuleIndex !== rightRuleIndex) {
    return leftRuleIndex - rightRuleIndex;
  }

  const severityRank = (severity: Diagnostic['severity']): number => {
    if (severity === 'error') {
      return 0;
    }

    if (severity === 'warning') {
      return 1;
    }

    return 2;
  };

  return severityRank(left.severity) - severityRank(right.severity);
}
