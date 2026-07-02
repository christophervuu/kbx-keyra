export type {
  MappingConfig,
  MappingConfigBlock,
  MappingRule,
  MappingRuleNoMatchBehavior,
  MappingRuleProjectValueTableRef,
  MappingRuleValueTableRef,
  RuleType,
  SchemaRef,
  SchemaRefType,
  ValueMapMatchMode,
  ValueTableNoMatchMode,
  ValueTablePrimitiveValue,
  ValueTableResolvedEntry,
  ValueTableValueType,
} from './config.js';

export type {
  CoverageResult,
  Diagnostic,
  DiagnosticLocation,
  DiagnosticSeverity,
  ExecutionStats,
  ExecutionResult,
  TraceEntry,
  ValidationResult,
} from './results.js';

export { Environment } from './options.js';
export type {
  EngineOptions,
  TraceVerbosity,
  UnmappedTargetStrategy,
  ValueType,
} from './options.js';

export type {
  ExecutionContext,
  FunctionImplementation,
  FunctionParameter,
  FunctionSignature,
  RegisteredFunction,
} from './registry.js';
