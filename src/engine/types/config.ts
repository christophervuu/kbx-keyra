export type RuleType = 'string' | 'number' | 'boolean' | 'array' | 'object';

import type { UnmappedTargetStrategy } from './options.js';

export type SchemaRefType = 'local' | 'github';

export interface SchemaRef {
  readonly schemaId: string;
  readonly type: SchemaRefType;
  readonly commitSha?: string;
}

export interface MappingConfigBlock {
  readonly unmappedTargets: UnmappedTargetStrategy;
  readonly nullSubtrees: readonly string[];
  readonly constants: Readonly<Record<string, unknown>>;
  readonly externalSources: readonly string[];
}

export interface MappingRule {
  readonly target: string;
  readonly type: RuleType;
  readonly expression: string;
  readonly description?: string;
}

export interface MappingConfig {
  readonly name: string;
  readonly version: number;
  readonly engineVersion: string;
  readonly sourceSchemaRef: SchemaRef;
  readonly targetSchemaRef: SchemaRef;
  readonly config: MappingConfigBlock;
  readonly rules: readonly MappingRule[];
}
