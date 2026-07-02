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

export type ValueTableValueType = 'string' | 'number' | 'boolean';

export type ValueMapMatchMode = 'exact' | 'ignore-case';

export type ValueTablePrimitiveValue = string | number | boolean;

export interface ValueTableResolvedEntry {
  readonly in: ValueTablePrimitiveValue;
  readonly out: ValueTablePrimitiveValue;
  readonly rowId: string;
}

export interface MappingRuleProjectValueTableRef {
  readonly scope: 'project';
  readonly valueTableId: string;
  readonly tableKey: string;
  readonly revision: number;
  readonly inputSideKey: string;
  readonly outputSideKey: string;
  readonly inputType: ValueTableValueType;
  readonly outputType: ValueTableValueType;
  readonly matchMode?: ValueMapMatchMode;
  readonly resolvedEntries: readonly ValueTableResolvedEntry[];
}

export interface MappingRuleInlineValueTableRef {
  readonly scope: 'inline';
}

export type MappingRuleValueTableRef = MappingRuleProjectValueTableRef | MappingRuleInlineValueTableRef;

export type ValueTableNoMatchMode = 'return_null' | 'return_input' | 'fallback_value';

export interface MappingRuleNoMatchBehavior {
  readonly mode: ValueTableNoMatchMode;
  readonly fallbackValue?: ValueTablePrimitiveValue;
}

export interface MappingRule {
  readonly target: string;
  readonly type: RuleType;
  readonly expression: string;
  readonly description?: string;
  readonly valueTableRef?: MappingRuleValueTableRef;
  readonly noMatchBehavior?: MappingRuleNoMatchBehavior;
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
