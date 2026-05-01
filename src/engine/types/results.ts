export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface DiagnosticLocation {
  readonly function?: string;
  readonly argumentIndex?: number;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly ruleIndex?: number;
  readonly targetPath?: string;
  readonly expression?: string;
  readonly location?: DiagnosticLocation;
}

export interface TraceEntry {
  readonly ruleIndex: number;
  readonly targetPath: string;
  readonly expression: string;
  readonly inputValue: unknown;
  readonly outputValue: unknown;
  readonly diagnostics?: readonly Diagnostic[];
  readonly durationMs?: number;
}

export interface ExecutionStats {
  readonly rulesEvaluated: number;
  readonly rulesSucceeded: number;
  readonly rulesFailed: number;
  readonly durationMs: number;
}

export interface CoverageResult {
  readonly total: number;
  readonly mapped: number;
  readonly percentage: number;
  readonly unmappedFields?: readonly string[];
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly coverage?: CoverageResult;
}

export interface ExecutionResult {
  readonly output: unknown;
  readonly diagnostics: readonly Diagnostic[];
  readonly trace?: readonly TraceEntry[];
  readonly stats?: ExecutionStats;
}
