import { parse } from './dsl/index.js';
import { defaultRegistry } from './registry/function-registry.js';
import type { ParsedRuleAst } from './validate/source-paths.js';
import {
  computeCoverage,
  detectDuplicateTargets,
  getOrBuildSchemaTree,
  validateArrayContext,
  validateConstantsAndExternals,
  validateSourcePaths,
  validateTargetPaths,
  validateTypeCompatibility,
} from './validate/index.js';
import type { Diagnostic, EngineOptions, MappingConfig, ValidationResult } from './types/index.js';

interface ParsedRuleWithDiagnostics extends ParsedRuleAst {
  readonly parseDiagnostics: readonly Diagnostic[];
}

/**
 * Validates a mapping configuration against source and target schemas.
 *
 * This scaffold implementation is intentionally a no-op validator and always
 * returns a valid result with no diagnostics.
 */
export function validate(
  config: MappingConfig,
  sourceSchema: unknown,
  targetSchema: unknown,
  options?: EngineOptions,
): ValidationResult {
  try {
    void options;

    const diagnostics: Diagnostic[] = [];

    const sourceTree =
      sourceSchema === null || sourceSchema === undefined
        ? null
        : getOrBuildSchemaTree(sourceSchema, detectSchemaFormat(sourceSchema));
    const targetTree =
      targetSchema === null || targetSchema === undefined
        ? null
        : getOrBuildSchemaTree(targetSchema, detectSchemaFormat(targetSchema));

    if (sourceTree) {
      diagnostics.push(...sourceTree.diagnostics);
    }

    if (targetTree) {
      diagnostics.push(...targetTree.diagnostics);
    }

    const parsedRules = parseRules(config);
    diagnostics.push(...collectParseDiagnostics(parsedRules));

    const validAsts = parsedRules.filter((parsedRule) => parsedRule.ast !== null);

    if (sourceTree) {
      diagnostics.push(...validateSourcePaths(validAsts, sourceTree));
    }

    if (targetTree) {
      diagnostics.push(...validateTargetPaths(config.rules, targetTree));
    }

    diagnostics.push(...detectDuplicateTargets(config.rules));

    if (sourceTree && targetTree) {
      diagnostics.push(...validateTypeCompatibility(validAsts, sourceTree, targetTree, defaultRegistry));
    }

    if (sourceTree) {
      diagnostics.push(...validateArrayContext(validAsts, defaultRegistry, sourceTree));
    }

    diagnostics.push(...validateConstantsAndExternals(validAsts, config.config));

    const coverage = targetTree ? computeCoverage(config.rules, targetTree) : undefined;
    const valid = !diagnostics.some((diagnostic) => diagnostic.severity === 'error');

    return {
      valid,
      diagnostics,
      coverage,
    };
  } catch (error) {
    return {
      valid: false,
      diagnostics: [
        {
          code: 'KEYRA-E001',
          severity: 'error',
          message: `Validation pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
}

function detectSchemaFormat(schema: unknown): 'json-schema' | 'xsd' {
  if (typeof schema === 'string') {
    return 'xsd';
  }

  return 'json-schema';
}

function parseRules(config: MappingConfig): ParsedRuleWithDiagnostics[] {
  return config.rules.map((rule, ruleIndex) => {
    const parseResult = parse(rule.expression, {
      registry: defaultRegistry,
    });

    return {
      ruleIndex,
      rule,
      ast: parseResult.ast,
      parseDiagnostics: parseResult.diagnostics,
    };
  });
}

function collectParseDiagnostics(
  parsedRules: readonly ParsedRuleWithDiagnostics[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const parsedRule of parsedRules) {
    for (const parseDiagnostic of parsedRule.parseDiagnostics) {
      diagnostics.push({
        ...parseDiagnostic,
        ruleIndex: parsedRule.ruleIndex,
        targetPath: parsedRule.rule.target,
        expression: parsedRule.rule.expression,
      });
    }
  }

  return diagnostics;
}
