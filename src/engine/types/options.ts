export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object'
  | 'any';

export type UnmappedTargetStrategy = 'null' | 'omit' | 'error';

export type TraceVerbosity = 'functions' | 'all';

export enum Environment {
  DEV = 'DEV',
  QA = 'QA',
  PROD = 'PROD',
}

export interface EngineOptions {
  readonly trace?: boolean;
  readonly traceVerbosity?: TraceVerbosity;
  readonly maxRecursionDepth?: number;
  readonly environment?: Environment;
}
