import type { BuilderSourceKind, BuilderValueType } from './smart-builder-state';

import { DSL_FUNCTION_CATALOG } from '@/lib/data/dsl-functions';

export type SmartBuilderActionCategory =
  | 'text'
  | 'number'
  | 'date'
  | 'condition'
  | 'null'
  | 'lookup'
  | 'array'
  | 'convert'
  | 'advanced';

export type SmartBuilderActionApplicability = 'input' | 'tray' | 'target' | 'array-scope';

export type BuilderActionRole =
  | 'inputTransform'
  | 'mappingMethod'
  | 'methodParameterAction'
  | 'outputStep'
  | 'conditionPredicate'
  | 'arrayAction';

export interface SmartBuilderActionConstraint {
  readonly minInputs?: number;
  readonly maxInputs?: number;
  readonly allowedInputTypes?: readonly BuilderValueType[];
  readonly requiredInputTypes?: readonly BuilderValueType[];
  readonly allowedTargetTypes?: readonly BuilderValueType[];
  readonly requiresArrayContext?: boolean;
  readonly requiresSourceKinds?: readonly BuilderSourceKind[];
}

export type SmartBuilderActionParameterKind =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'dsl-expression';

export interface SmartBuilderActionParameterOption {
  readonly value: string;
  readonly label: string;
}

export interface SmartBuilderActionParameterConstraint {
  readonly min?: number;
  readonly max?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly allowEmpty?: boolean;
}

export interface SmartBuilderActionParameterDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: SmartBuilderActionParameterKind;
  readonly required: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly description?: string;
  readonly options?: readonly SmartBuilderActionParameterOption[];
  readonly constraints?: SmartBuilderActionParameterConstraint;
}

export interface SmartBuilderActionCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly category: SmartBuilderActionCategory;
  readonly appliesTo: SmartBuilderActionApplicability;
  readonly role: BuilderActionRole;
  readonly dslFunctions: readonly string[];
  readonly constraints?: SmartBuilderActionConstraint;
  readonly parameters?: readonly SmartBuilderActionParameterDefinition[];
}

export const UNSUPPORTED_DSL_FUNCTIONS = {
  startsWith: 'No registered DSL function named startsWith. Use contains or advanced expression.',
} as const;

export const SMART_BUILDER_ACTION_CATALOG: readonly SmartBuilderActionCatalogEntry[] = [
  // text
  { id: 'text.concat', label: 'Combine values', category: 'text', appliesTo: 'tray', role: 'mappingMethod', dslFunctions: ['concat'], constraints: { minInputs: 2 } },
  { id: 'text.upper', label: 'Uppercase', category: 'text', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['upper'], constraints: { minInputs: 1, maxInputs: 1 } },
  { id: 'text.lower', label: 'Lowercase', category: 'text', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['lower'], constraints: { minInputs: 1, maxInputs: 1 } },
  { id: 'text.trim', label: 'Trim spaces', category: 'text', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['trim'], constraints: { minInputs: 1, maxInputs: 1 } },
  {
    id: 'text.substring',
    label: 'Extract substring',
    category: 'text',
    appliesTo: 'input',
    role: 'inputTransform',
    dslFunctions: ['substring'],
    constraints: { minInputs: 1, maxInputs: 1 },
    parameters: [
      {
        id: 'start',
        label: 'Start index',
        kind: 'integer',
        required: true,
        defaultValue: 0,
        constraints: { min: 0 },
      },
      {
        id: 'length',
        label: 'Length',
        kind: 'integer',
        required: false,
        constraints: { min: 1 },
      },
    ],
  },
  {
    id: 'text.replace',
    label: 'Replace text',
    category: 'text',
    appliesTo: 'input',
    role: 'inputTransform',
    dslFunctions: ['replace', 'replaceAll'],
    constraints: { minInputs: 1, maxInputs: 1 },
    parameters: [
      {
        id: 'match',
        label: 'Text to find',
        kind: 'string',
        required: true,
        defaultValue: '',
        constraints: { allowEmpty: true },
      },
      {
        id: 'replacement',
        label: 'Replacement text',
        kind: 'string',
        required: false,
        defaultValue: '',
        constraints: { allowEmpty: true },
      },
      {
        id: 'mode',
        label: 'Replace mode',
        kind: 'enum',
        required: true,
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'Replace all matches' },
          { value: 'first', label: 'Replace first match only' },
        ],
      },
    ],
  },
  { id: 'text.phoneDigits', label: 'Normalize phone digits', category: 'text', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['trim', 'replaceAll'], constraints: { minInputs: 1, maxInputs: 1 } },
  { id: 'text.length', label: 'Text length', category: 'text', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['length'], constraints: { minInputs: 1, maxInputs: 1 } },
  {
    id: 'text.split',
    label: 'Split text',
    category: 'text',
    appliesTo: 'input',
    role: 'inputTransform',
    dslFunctions: ['split'],
    constraints: { minInputs: 1, maxInputs: 1 },
    parameters: [
      {
        id: 'delimiter',
        label: 'Delimiter',
        kind: 'string',
        required: false,
        defaultValue: ' ',
      },
      {
        id: 'limit',
        label: 'Max parts',
        kind: 'integer',
        required: false,
        constraints: { min: 1 },
      },
    ],
  },

  // number
  { id: 'number.add', label: 'Add numbers', category: 'number', appliesTo: 'tray', role: 'methodParameterAction', dslFunctions: ['add'], constraints: { minInputs: 2 } },
  { id: 'number.subtract', label: 'Subtract numbers', category: 'number', appliesTo: 'tray', role: 'methodParameterAction', dslFunctions: ['subtract'], constraints: { minInputs: 2 } },
  { id: 'number.multiply', label: 'Multiply numbers', category: 'number', appliesTo: 'tray', role: 'methodParameterAction', dslFunctions: ['multiply'], constraints: { minInputs: 2 } },
  { id: 'number.divide', label: 'Divide numbers', category: 'number', appliesTo: 'tray', role: 'methodParameterAction', dslFunctions: ['divide'], constraints: { minInputs: 2 } },
  {
    id: 'number.round',
    label: 'Round number',
    category: 'number',
    appliesTo: 'input',
    role: 'outputStep',
    dslFunctions: ['round'],
    constraints: { minInputs: 1, maxInputs: 1 },
    parameters: [
      {
        id: 'decimals',
        label: 'Decimal places',
        kind: 'integer',
        required: false,
        defaultValue: 0,
        constraints: { min: 0 },
      },
    ],
  },
  { id: 'number.abs', label: 'Absolute value', category: 'number', appliesTo: 'input', role: 'outputStep', dslFunctions: ['abs'], constraints: { minInputs: 1, maxInputs: 1 } },

  // date
  {
    id: 'date.format',
    label: 'Format date',
    category: 'date',
    appliesTo: 'input',
    role: 'inputTransform',
    dslFunctions: ['formatDate'],
    constraints: { minInputs: 1, maxInputs: 1 },
    parameters: [
      {
        id: 'inputFormat',
        label: 'Source date format',
        kind: 'string',
        required: true,
        defaultValue: 'ISO8601',
        options: [
          { value: 'ISO8601', label: 'ISO 8601' },
          { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
          { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD' },
          { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
          { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
          { value: 'YYYY-MM-DD HH:mm:ss', label: 'YYYY-MM-DD HH:mm:ss' },
        ],
        constraints: { minLength: 1 },
      },
      {
        id: 'outputFormat',
        label: 'Target date format',
        kind: 'string',
        required: true,
        defaultValue: 'YYYY-MM-DD',
        options: [
          { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
          { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD' },
          { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
          { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
          { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY' },
          { value: 'YYYY-MM-DD HH:mm:ss', label: 'YYYY-MM-DD HH:mm:ss' },
        ],
        constraints: { minLength: 1 },
      },
    ],
  },
  {
    id: 'date.diff',
    label: 'Date difference',
    category: 'date',
    appliesTo: 'tray',
    role: 'mappingMethod',
    dslFunctions: ['dateDiffSeconds'],
    constraints: { minInputs: 2 },
    parameters: [
      {
        id: 'unit',
        label: 'Difference unit',
        kind: 'enum',
        required: true,
        defaultValue: 'seconds',
        options: [
          { value: 'seconds', label: 'Seconds' },
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
          { value: 'days', label: 'Days' },
        ],
      },
    ],
  },

  // condition
  { id: 'condition.if', label: 'Conditional output', category: 'condition', appliesTo: 'tray', role: 'mappingMethod', dslFunctions: ['if', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'isNull', 'not', 'and', 'or'] },
  { id: 'condition.compare', label: 'Compare inputs', category: 'condition', appliesTo: 'tray', role: 'mappingMethod', dslFunctions: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] },
  { id: 'condition.truthy', label: 'Is present / has value', category: 'condition', appliesTo: 'input', role: 'conditionPredicate', dslFunctions: ['not', 'isNull'] },

  // null
  {
    id: 'null.default',
    label: 'Default if missing',
    category: 'null',
    appliesTo: 'input',
    role: 'outputStep',
    dslFunctions: ['default'],
    constraints: { minInputs: 1, maxInputs: 1 },
    parameters: [
      {
        id: 'fallbackMode',
        label: 'Fallback value from',
        kind: 'enum',
        required: true,
        defaultValue: 'fixed',
        options: [
          { value: 'fixed', label: 'Fixed value' },
          { value: 'input', label: 'Input field' },
          { value: 'constant', label: 'Constant' },
          { value: 'null', label: 'Null value' },
        ],
      },
      {
        id: 'fallbackFixedString',
        label: 'Fallback text',
        kind: 'string',
        required: false,
        defaultValue: '',
        constraints: { allowEmpty: true },
      },
      {
        id: 'fallbackFixedNumber',
        label: 'Fallback number',
        kind: 'number',
        required: false,
        defaultValue: 0,
      },
      {
        id: 'fallbackFixedBoolean',
        label: 'Fallback true/false',
        kind: 'boolean',
        required: false,
        defaultValue: false,
      },
      {
        id: 'fallbackInputId',
        label: 'Fallback input id',
        kind: 'string',
        required: false,
        constraints: { minLength: 1 },
      },
      {
        id: 'fallbackConstantName',
        label: 'Fallback constant name',
        kind: 'string',
        required: false,
        defaultValue: 'DEFAULT_CONSTANT',
        constraints: { minLength: 1 },
      },
      {
        id: 'fallbackExpression',
        label: 'Fallback expression (legacy)',
        kind: 'dsl-expression',
        required: false,
        constraints: { allowEmpty: true },
      },
    ],
  },
  { id: 'null.coalesce', label: 'Use first available', category: 'null', appliesTo: 'tray', role: 'mappingMethod', dslFunctions: ['coalesce'], constraints: { minInputs: 2 } },
  { id: 'null.isNull', label: 'Is missing', category: 'null', appliesTo: 'input', role: 'conditionPredicate', dslFunctions: ['isNull'], constraints: { minInputs: 1, maxInputs: 1 } },

  // lookup
  { id: 'lookup.valueMap', label: 'Value Mapping', category: 'lookup', appliesTo: 'input', role: 'mappingMethod', dslFunctions: ['valueMap'], constraints: { minInputs: 1 } },

  // array
  { id: 'array.map', label: 'Map array', category: 'array', appliesTo: 'array-scope', role: 'arrayAction', dslFunctions: ['map'], constraints: { minInputs: 1, requiresArrayContext: true } },
  { id: 'array.filter', label: 'Filter array', category: 'array', appliesTo: 'array-scope', role: 'arrayAction', dslFunctions: ['filter'], constraints: { minInputs: 1, requiresArrayContext: true } },
  { id: 'array.find', label: 'Find in array', category: 'array', appliesTo: 'array-scope', role: 'arrayAction', dslFunctions: ['find'], constraints: { minInputs: 1, requiresArrayContext: true } },
  { id: 'array.array', label: 'Build array', category: 'array', appliesTo: 'tray', role: 'mappingMethod', dslFunctions: ['array'], constraints: { minInputs: 1 } },
  { id: 'array.merge', label: 'Merge arrays', category: 'array', appliesTo: 'tray', role: 'mappingMethod', dslFunctions: ['merge'], constraints: { minInputs: 2 } },
  { id: 'array.flatten', label: 'Flatten arrays', category: 'array', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['flatten'], constraints: { minInputs: 1, maxInputs: 1 } },
  { id: 'array.first', label: 'First item', category: 'array', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['first'], constraints: { minInputs: 1, maxInputs: 1 } },
  {
    id: 'array.nth',
    label: 'Nth item',
    category: 'array',
    appliesTo: 'input',
    role: 'inputTransform',
    dslFunctions: ['nth'],
    constraints: { minInputs: 1, maxInputs: 1 },
    parameters: [
      {
        id: 'index',
        label: 'Index',
        kind: 'integer',
        required: true,
        defaultValue: 0,
        constraints: { min: 0 },
      },
    ],
  },
  {
    id: 'array.join',
    label: 'Join array',
    category: 'array',
    appliesTo: 'input',
    role: 'inputTransform',
    dslFunctions: ['join'],
    constraints: { minInputs: 1, maxInputs: 1 },
    parameters: [
      {
        id: 'separator',
        label: 'Separator',
        kind: 'string',
        required: false,
        defaultValue: ',',
      },
    ],
  },
  { id: 'array.count', label: 'Count items', category: 'array', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['count'], constraints: { minInputs: 1, maxInputs: 1 } },
  { id: 'array.get', label: 'Get field from object', category: 'array', appliesTo: 'input', role: 'inputTransform', dslFunctions: ['get'], constraints: { minInputs: 1, maxInputs: 1 } },

  // convert
  {
    id: 'convert.cast',
    label: 'Convert type',
    category: 'convert',
    appliesTo: 'input',
    role: 'outputStep',
    dslFunctions: ['cast'],
    constraints: { minInputs: 1, maxInputs: 1, allowedTargetTypes: ['string', 'number', 'boolean'] },
    parameters: [
      {
        id: 'targetType',
        label: 'Convert to',
        kind: 'enum',
        required: true,
        defaultValue: 'string',
        options: [
          { value: 'string', label: 'Text' },
          { value: 'number', label: 'Number' },
          { value: 'boolean', label: 'True/False' },
        ],
      },
    ],
  },

  // advanced
  { id: 'advanced.expression', label: 'Edit expression', category: 'advanced', appliesTo: 'target', role: 'mappingMethod', dslFunctions: [] },
];

export const ALL_REGISTERED_DSL_FUNCTIONS = new Set(DSL_FUNCTION_CATALOG.map((entry) => entry.name));

export function findSmartBuilderActionById(actionId: string): SmartBuilderActionCatalogEntry | undefined {
  return SMART_BUILDER_ACTION_CATALOG.find((action) => action.id === actionId);
}

export function getSmartBuilderActionParameters(
  actionId: string,
): readonly SmartBuilderActionParameterDefinition[] {
  return findSmartBuilderActionById(actionId)?.parameters ?? [];
}
