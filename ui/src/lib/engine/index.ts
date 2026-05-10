/**
 * Engine browser integration layer.
 *
 * This module re-exports the mapping engine's public API for browser consumption.
 * The engine is imported via the `@keyra/engine` Vite path alias pointing to
 * `src/engine/index.ts`. Vite handles TS transpilation and `.js` extension
 * resolution natively — no pre-build step is needed.
 *
 * The engine self-initializes its function registry on first import via
 * `registerAllFunctions(defaultRegistry)` in its entry point.
 *
 * Usage pattern:
 * - Use `validateMapping()` to validate a UI MappingConfig against schemas
 * - Use `executeMapping()` to execute a mapping against source data
 * - Use the raw `validate` and `execute` for advanced usage with engine-native types
 *
 * Schema expectations:
 * - JSON schemas: pass the raw JSON Schema object (not a string, not ParsedSchema)
 * - XSD schemas: pass the raw XML string — the engine uses a permissive stub adapter
 * - The FS-009 ParsedSchema is for UI tree display only; it is NOT passed to the engine
 */

import { validate, execute, parse, defaultRegistry, evaluate, resolvePath } from '@keyra/engine';
import type {
  ValidationResult,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticLocation,
  CoverageResult,
  ExecutionResult,
  TraceEntry,
  ExecutionStats,
  EngineOptions,
  MappingConfig as EngineMappingConfig,
  MappingConfigBlock,
  MappingRule as EngineMappingRule,
  ParseResult,
  AstNode,
  FunctionCallNode,
  StringLiteralNode,
  NumberLiteralNode,
  BooleanLiteralNode,
  NullLiteralNode,
  ObjectTemplateNode,
  ObjectTemplateProperty,
  ParseOptions,
  FunctionSignature,
  FunctionParameter,
  RegisteredFunction,
  EvaluationContext,
  EvaluationResult,
  ValueType,
} from '@keyra/engine';
import { FunctionRegistry } from '@keyra/engine';

import type { MappingConfig, MappingRule } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Type adapter: UI MappingConfig → Engine MappingConfig
// ---------------------------------------------------------------------------

/**
 * Converts a UI MappingConfig to the engine-native MappingConfig format.
 *
 * Key differences handled:
 * - UI config has optional fields in MappingConfigOptions; engine requires all fields in MappingConfigBlock
 * - UI MappingRule.type includes 'null' | 'any'; engine RuleType omits these
 * - UI has extra fields (id, projectId) that the engine ignores
 * - UI sourceSchemaRef/targetSchemaRef may be undefined; engine requires them —
 *   a DEFAULT_SCHEMA_REF with empty schemaId is substituted (engine treats it as "no schema")
 */
function toEngineConfig(config: MappingConfig): EngineMappingConfig {
  const DEFAULT_SCHEMA_REF = { schemaId: '', type: 'local' as const };

  const engineRules: EngineMappingRule[] = config.rules.map((rule) => ({
    target: rule.target,
    type: normalizeRuleType(rule.type),
    expression: rule.expression,
    ...(rule.description !== undefined && { description: rule.description }),
  }));

  const engineConfigBlock: MappingConfigBlock = {
    unmappedTargets: config.config?.unmappedTargets ?? 'omit',
    nullSubtrees: config.config?.nullSubtrees ?? [],
    constants: config.config?.constants ?? {},
    externalSources: config.config?.externalSources ?? [],
  };

  return {
    name: config.name,
    version: config.version,
    engineVersion: config.engineVersion,
    sourceSchemaRef: config.sourceSchemaRef
      ? {
          schemaId: config.sourceSchemaRef.schemaId,
          type: config.sourceSchemaRef.type === 'published' ? 'local' : config.sourceSchemaRef.type,
          ...(config.sourceSchemaRef.commitSha !== undefined && {
            commitSha: config.sourceSchemaRef.commitSha,
          }),
        }
      : DEFAULT_SCHEMA_REF,
    targetSchemaRef: config.targetSchemaRef
      ? {
          schemaId: config.targetSchemaRef.schemaId,
          type: config.targetSchemaRef.type === 'published' ? 'local' : config.targetSchemaRef.type,
          ...(config.targetSchemaRef.commitSha !== undefined && {
            commitSha: config.targetSchemaRef.commitSha,
          }),
        }
      : DEFAULT_SCHEMA_REF,
    config: engineConfigBlock,
    rules: engineRules,
  };
}

/**
 * Normalizes UI rule type to engine RuleType.
 * Engine supports: 'string' | 'number' | 'boolean' | 'array' | 'object'
 * UI adds: 'null' | 'any' — these map to 'string' as a safe default for engine consumption.
 */
function normalizeRuleType(type: MappingRule['type']): EngineMappingRule['type'] {
  if (type === 'null' || type === 'any') {
    return 'string';
  }
  return type;
}

// ---------------------------------------------------------------------------
// Public API: Adapted functions for UI consumption
// ---------------------------------------------------------------------------

/**
 * Validates a UI MappingConfig against source and target schemas.
 *
 * @param config - UI MappingConfig (with id, projectId, optional config fields)
 * @param sourceSchema - Raw JSON Schema object or XSD XML string (or null to skip source validation)
 * @param targetSchema - Raw JSON Schema object or XSD XML string (or null to skip target validation)
 * @param options - Optional engine options
 * @returns ValidationResult with diagnostics and coverage
 */
export function validateMapping(
  config: MappingConfig,
  sourceSchema: unknown,
  targetSchema: unknown,
  options?: EngineOptions,
): ValidationResult {
  const engineConfig = toEngineConfig(config);
  return validate(engineConfig, sourceSchema, targetSchema, options);
}

/**
 * Executes a UI MappingConfig against source data.
 *
 * @param config - UI MappingConfig
 * @param sourceData - Source data object to transform
 * @param sourceSchema - Raw JSON Schema object or XSD XML string
 * @param targetSchema - Raw JSON Schema object or XSD XML string
 * @param options - Optional engine options
 * @returns ExecutionResult with transformed output, diagnostics, and optional trace
 */
export function executeMapping(
  config: MappingConfig,
  sourceData: unknown,
  sourceSchema: unknown,
  targetSchema: unknown,
  options?: EngineOptions,
): ExecutionResult {
  const engineConfig = toEngineConfig(config);
  return execute(engineConfig, sourceData, sourceSchema, targetSchema, options);
}

// ---------------------------------------------------------------------------
// Re-exports: Raw engine functions and types for advanced usage
// ---------------------------------------------------------------------------

export { validate, execute, parse, defaultRegistry, FunctionRegistry, evaluate, resolvePath };

/**
 * Convenience helper: parse and evaluate a DSL expression against source data.
 *
 * Wraps the two-step parse → evaluate flow into a single call for UI use cases
 * (e.g. the expression preview panel). Returns `{ value, error }`.
 *
 * @param expression - The DSL expression string to evaluate
 * @param sourceData - Source data object (or null — returns null result immediately)
 * @param constants - Optional mapping constants (key-value pairs)
 * @param externalSources - Optional external sources map
 */
export function evaluateExpression(
  expression: string,
  sourceData: unknown,
  constants: Record<string, unknown> = {},
  externalSources: Record<string, unknown> = {},
): { value: unknown; error: string | null } {
  if (expression === '' || expression.trim() === '') {
    return { value: null, error: null };
  }
  if (sourceData === null || sourceData === undefined) {
    return { value: null, error: null };
  }

  try {
    const parseResult = parse(expression, { registry: defaultRegistry });
    if (!parseResult.success || parseResult.ast === null) {
      const msg = parseResult.diagnostics[0]?.message ?? 'Syntax error in expression';
      return { value: null, error: msg };
    }

    const scopeStack: unknown[] = [];
    const diagnostics: Diagnostic[] = [];

    const ctx: EvaluationContext = {
      sourceData,
      scopeStack,
      constants,
      externalSources,
      registry: defaultRegistry,
      options: {},
      evaluate: (node, c) => evaluate(node, c),
      addDiagnostic: (d) => { diagnostics.push(d); },
      pushScope: (s) => { scopeStack.push(s); },
      popScope: () => scopeStack.pop() as unknown,
    };

    const result = evaluate(parseResult.ast, ctx);

    // Check for evaluation diagnostics (e.g. unknown function, arity error)
    const evalDiagnostics = [...diagnostics, ...result.diagnostics];
    const errorDiagnostic = evalDiagnostics.find((d) => d.severity === 'error');
    if (errorDiagnostic !== undefined) {
      return { value: result.value, error: errorDiagnostic.message };
    }

    return { value: result.value, error: null };
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export type {
  ValidationResult,
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticLocation,
  CoverageResult,
  ExecutionResult,
  TraceEntry,
  ExecutionStats,
  EngineOptions,
  EngineMappingConfig,
  MappingConfigBlock,
  ParseResult,
  AstNode,
  FunctionCallNode,
  // Additional AST node types (T-08)
  StringLiteralNode,
  NumberLiteralNode,
  BooleanLiteralNode,
  NullLiteralNode,
  ObjectTemplateNode,
  ObjectTemplateProperty,
  ParseOptions,
  FunctionSignature,
  FunctionParameter,
  RegisteredFunction,
  // Evaluation types (T-10)
  EvaluationContext,
  EvaluationResult,
  // FS-040 T-01
  ValueType,
};

// ---------------------------------------------------------------------------
// inferExpressionType — lightweight output type inference for UI validation
// (FS-040 T-01)
//
// Infers the output ValueType of a parsed AST node using only the public
// engine API (defaultRegistry for function return types). Source-dependent
// inference (source(), item(), parent()) returns 'any' since no SchemaTree
// is available at the UI validation layer.
//
// Returns undefined when inference is uncertain — callers must treat this
// as "no mismatch" (cannot prove incompatibility → skip).
// ---------------------------------------------------------------------------

/**
 * Infers the output type of a parsed DSL AST node.
 *
 * Uses the engine's function registry for return type lookup.
 * Source-path-dependent inference (source/item/parent) returns 'any'
 * since no schema is available at the UI validation boundary.
 *
 * @param ast - The root AST node from a successful parse result
 * @returns The inferred ValueType, or undefined if inference is uncertain
 */
export function inferExpressionType(ast: AstNode): ValueType | undefined {
  return inferAstNodeType(ast);
}

function inferAstNodeType(node: AstNode): ValueType | undefined {
  switch (node.type) {
    case 'StringLiteral':
      return 'string';
    case 'NumberLiteral':
      return 'number';
    case 'BooleanLiteral':
      return 'boolean';
    case 'NullLiteral':
      return 'null';
    case 'ObjectTemplate':
      return 'object';
    case 'FunctionCall':
      return inferFunctionCallNodeType(node);
    default:
      return undefined;
  }
}

function inferFunctionCallNodeType(
  node: Extract<AstNode, { type: 'FunctionCall' }>,
): ValueType | undefined {
  switch (node.name) {
    // Source-access functions — type depends on schema, return 'any'
    case 'source':
    case 'item':
    case 'parent':
      return 'any';

    case 'cast': {
      const targetTypeArg = node.arguments[1];
      if (!targetTypeArg || targetTypeArg.type !== 'StringLiteral') {
        return undefined;
      }
      return isValueType(targetTypeArg.value) ? targetTypeArg.value : undefined;
    }

    case 'map':
    case 'filter':
      return 'array';

    case 'find':
      return 'any';

    case 'if': {
      const thenArg = node.arguments[1];
      const elseArg = node.arguments[2];
      if (!thenArg || !elseArg) return undefined;
      const thenType = inferAstNodeType(thenArg);
      const elseType = inferAstNodeType(elseArg);
      if (!thenType || !elseType) return undefined;
      return thenType === elseType ? thenType : 'any';
    }

    case 'static': {
      const valueArg = node.arguments[0];
      if (!valueArg) return undefined;
      return inferAstNodeType(valueArg);
    }

    default: {
      const registered = defaultRegistry.getFunction(node.name);
      if (!registered) return undefined;
      if (registered.signature.returnType === 'any') return undefined;
      return registered.signature.returnType as ValueType;
    }
  }
}

const VALUE_TYPES: readonly string[] = [
  'string', 'number', 'boolean', 'null', 'array', 'object', 'any',
];

function isValueType(value: string): value is ValueType {
  return VALUE_TYPES.includes(value);
}
