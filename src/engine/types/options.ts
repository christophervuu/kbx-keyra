export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object';

export type UnmappedTargetStrategy = 'null' | 'omit' | 'error';

export enum Environment {
  DEV = 'DEV',
  QA = 'QA',
  PROD = 'PROD',
}

export interface EngineOptions {
  readonly trace?: boolean;
  readonly maxRecursionDepth?: number;
  readonly environment?: Environment;
}
