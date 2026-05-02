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

import { validate, execute } from '@keyra/engine';
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
} from '@keyra/engine';

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
 */
function toEngineConfig(config: MappingConfig): EngineMappingConfig {
  const engineRules: EngineMappingRule[] = config.rules.map((rule) => ({
    target: rule.target,
    type: normalizeRuleType(rule.type),
    expression: rule.expression,
    ...(rule.description !== undefined && { description: rule.description }),
  }));

  const engineConfigBlock: MappingConfigBlock = {
    unmappedTargets: config.config.unmappedTargets ?? 'omit',
    nullSubtrees: config.config.nullSubtrees ?? [],
    constants: config.config.constants ?? {},
    externalSources: config.config.externalSources ?? [],
  };

  return {
    name: config.name,
    version: config.version,
    engineVersion: config.engineVersion,
    sourceSchemaRef: {
      schemaId: config.sourceSchemaRef.schemaId,
      type: config.sourceSchemaRef.type === 'published' ? 'local' : config.sourceSchemaRef.type,
      ...(config.sourceSchemaRef.commitSha !== undefined && {
        commitSha: config.sourceSchemaRef.commitSha,
      }),
    },
    targetSchemaRef: {
      schemaId: config.targetSchemaRef.schemaId,
      type: config.targetSchemaRef.type === 'published' ? 'local' : config.targetSchemaRef.type,
      ...(config.targetSchemaRef.commitSha !== undefined && {
        commitSha: config.targetSchemaRef.commitSha,
      }),
    },
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

export { validate, execute };

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
};
