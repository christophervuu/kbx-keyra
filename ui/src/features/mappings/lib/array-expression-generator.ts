/**
 * array-expression-generator.ts — FS-043 T-02
 *
 * Pure function that generates a DSL expression string from ArrayBuilderState.
 *
 * Replaces the legacy generator (FS-028 wizard model) with a new implementation
 * aligned with the chain-based Array Builder state model (FS-043).
 *
 * Supported modes and generated DSL patterns:
 *   map             → map(source("path"), { "field": <chainExpr>, ... })
 *   filterMap       → map(filter(source("path"), <predicate>), { "field": <chainExpr>, ... })
 *   buildFromValues → array({...}, {...}, ...) or filter(array(...), not(isNull(item("field"))))
 *   mergeArrayBranches → merge(map(source("a"), {...}), map(source("b"), {...}), ...)
 *   customExpression   → raw DSL passthrough
 *
 * Leaf field expressions are delegated to generateChainExpression() from the
 * scalar chain builder. Cross-array lookup expressions are generated inline.
 * Nested arrays are handled recursively.
 *
 * @pure — no side effects, no hooks, no DOM access. Deterministic output.
 */

import type {
  ArrayBuilderState,
  MapCollectionState,
  FilterMapCollectionState,
  SplitStringCollectionState,
  BuildFromValuesCollectionState,
  MergeBranchesCollectionState,
  ObjectFieldsCollectionState,
  ItemTemplateState,
  ItemFieldMapping,
  FilterPredicateState,
  ValueEntry,
  ValueEntryFieldValue,
  CrossArrayLookupState,
  MergeBranch,
  StaticValueBranch,
} from './array-builder-state';
import { generateChainExpression } from './chain-expression-generator';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes and double-quotes a string for DSL output.
 */
function quoteString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Converts a StaticValueBranch to its DSL literal representation.
 */
function staticValueToDsl(value: StaticValueBranch): string {
  switch (value.type) {
    case 'string':
      return quoteString(value.value);
    case 'number':
      return String(value.value);
    case 'boolean':
      return value.value ? 'true' : 'false';
    case 'null':
      return 'null';
  }
}

/**
 * Converts a raw literal string to its DSL representation using heuristic
 * type detection (matches the engine's literal parsing behaviour).
 */
function literalToDsl(value: string): string {
  if (value === 'true' || value === 'false') return value;
  if (value === 'null') return 'null';
  const trimmed = value.trim();
  const asNumber = Number(trimmed);
  if (trimmed !== '' && isFinite(asNumber)) return String(asNumber);
  return quoteString(value);
}

/**
 * Converts a full target field path to an item-template key.
 *
 * Examples:
 *   lineItems.productCode -> productCode
 *   invoice.lineItems.qty -> qty
 */
function toItemTemplateKey(targetFieldPath: string): string {
  const trimmed = targetFieldPath.trim();
  if (!trimmed) return '';
  const lastDot = trimmed.lastIndexOf('.');
  return lastDot >= 0 ? trimmed.slice(lastDot + 1) : trimmed;
}

type TemplateTree = Map<string, TemplateTree | string>;

function splitPathSegments(path: string): string[] {
  return path
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function getCommonPrefixLength(paths: readonly string[][]): number {
  if (paths.length === 0) return 0;

  // Single-path templates must preserve nested object containers
  // (e.g. compensation.baseSalary -> {"compensation": {"baseSalary": ...}}).
  if (paths.length === 1) {
    const only = paths[0];
    return Math.max(0, (only?.length ?? 0) - 2);
  }

  const minLength = Math.min(...paths.map((segments) => segments.length));
  // Never consume the final field segment.
  const maxComparable = Math.max(0, minLength - 1);

  let index = 0;
  while (index < maxComparable) {
    const expected = paths[0]?.[index];
    if (expected === undefined) break;
    if (paths.some((segments) => segments[index] !== expected)) break;
    index += 1;
  }

  return index;
}

function insertTemplatePath(tree: TemplateTree, segments: readonly string[], expr: string): void {
  if (segments.length === 0) return;

  let current = tree;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const isLeaf = index === segments.length - 1;
    if (!segment) continue;

    if (isLeaf) {
      current.set(segment, expr);
      return;
    }

    const existing = current.get(segment);
    if (existing instanceof Map) {
      current = existing;
      continue;
    }

    const child: TemplateTree = new Map();
    current.set(segment, child);
    current = child;
  }
}

function serializeTemplateTree(tree: TemplateTree): string {
  const entries = Array.from(tree.entries()).map(([key, value]) => {
    const serializedValue = typeof value === 'string' ? value : serializeTemplateTree(value);
    return `${quoteString(key)}: ${serializedValue}`;
  });
  return `{${entries.join(', ')}}`;
}

/**
 * Rewrites internal scoped source placeholders to valid DSL accessors.
 *
 * Internal UI storage:
 *   source("__item__:sku")    -> item("sku")
 *   source("__source__:code") -> source("code")
 */
function normalizeScopedSourceCalls(expression: string): string {
  return expression
    .replace(/source\("__item__:(.*?)"\)/g, 'item("$1")')
    .replace(/source\("__parent__:(.*?)"\)/g, 'parent("$1")')
    .replace(/source\("__source__:(.*?)"\)/g, 'source("$1")');
}

/**
 * Converts collection source paths into DSL iterables.
 *
 * Internal UI storage:
 *   __item__:employees -> item("employees")
 *   __source__:orders  -> source("orders")
 *   orders             -> source("orders")
 */
function collectionSourceToDsl(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('__item__:')) {
    return `item(${quoteString(trimmed.slice('__item__:'.length))})`;
  }
  if (trimmed.startsWith('__source__:')) {
    return `source(${quoteString(trimmed.slice('__source__:'.length))})`;
  }
  return `source(${quoteString(trimmed)})`;
}

// ---------------------------------------------------------------------------
// Filter predicate generation
// ---------------------------------------------------------------------------

/**
 * Generates a DSL boolean expression from a FilterPredicateState.
 * Returns empty string if the predicate is incomplete.
 */
function generateFilterPredicate(predicate: FilterPredicateState): string {
  if (predicate.kind === 'raw') {
    return predicate.dsl.trim();
  }

  // Structured predicate
  const { left, operator, right } = predicate;

  // Generate left operand expression
  let leftExpr: string;
  if (left.kind === 'itemField') {
    if (!left.fieldPath.trim()) return '';
    leftExpr = `item(${quoteString(left.fieldPath)})`;
  } else {
    // expression fallback
    leftExpr = left.dsl.trim();
    if (!leftExpr) return '';
  }

  // Unary operators — no right operand needed
  switch (operator) {
    case 'isNull':
      return `isNull(${leftExpr})`;
    case 'isNotNull':
      return `not(isNull(${leftExpr}))`;
  }

  // Binary operators — need right operand
  let rightExpr: string;
  switch (right.kind) {
    case 'static':
      rightExpr = literalToDsl(right.value);
      break;
    case 'sourceField':
      if (!right.path.trim()) return '';
      rightExpr = `source(${quoteString(right.path)})`;
      break;
    case 'itemField':
      if (!right.fieldPath.trim()) return '';
      rightExpr = `item(${quoteString(right.fieldPath)})`;
      break;
    case 'none':
      return '';
  }

  return `${operator}(${leftExpr}, ${rightExpr})`;
}

// ---------------------------------------------------------------------------
// Cross-array lookup generation
// ---------------------------------------------------------------------------

/**
 * Generates the DSL expression for a cross-array lookup.
 *
 * Pattern:
 *   default(get(find(source("lookupArray"), eq(item("matchField"), <compareExpr>)), "returnField"), fallback)
 *
 * When no fallback is set, omits the default() wrapper:
 *   get(find(source("lookupArray"), eq(item("matchField"), <compareExpr>)), "returnField")
 */
function generateCrossArrayLookup(lookup: CrossArrayLookupState): string {
  const { lookupArrayPath, matchField, compareScope, compareField, returnField, fallback } = lookup;

  if (!lookupArrayPath.trim() || !matchField.trim() || !compareField.trim() || !returnField.trim()) {
    return '';
  }

  const compareExpr =
    compareScope === 'parent'
      ? `parent(${quoteString(compareField)})`
      : `item(${quoteString(compareField)})`;

  const findExpr = `find(source(${quoteString(lookupArrayPath)}), eq(item(${quoteString(matchField)}), ${compareExpr}))`;
  const getExpr = `get(${findExpr}, ${quoteString(returnField)})`;

  if (fallback !== undefined) {
    return `default(${getExpr}, ${staticValueToDsl(fallback)})`;
  }

  return getExpr;
}

// ---------------------------------------------------------------------------
// Item field expression generation
// ---------------------------------------------------------------------------

/**
 * Generates the DSL expression for a single ItemFieldMapping.
 * Returns empty string for unmapped ('empty') fields.
 */
function generateItemFieldExpression(mapping: ItemFieldMapping): string {
  switch (mapping.kind) {
    case 'empty':
      return '';
    case 'expression':
      return mapping.dsl.trim();
    case 'chain':
      return normalizeScopedSourceCalls(generateChainExpression(mapping.chainState));
    case 'crossArrayLookup':
      return generateCrossArrayLookup(mapping.lookupState);
  }
}

// ---------------------------------------------------------------------------
// Object template generation
// ---------------------------------------------------------------------------

/**
 * Generates the DSL object template from an item template's fields.
 *
 * Only includes fields that have a non-empty generated expression.
 * Returns '{}' when no fields are mapped.
 *
 * Pattern: { "targetField": <expr>, ... }
 */
function generateObjectTemplate(template: ItemTemplateState): string {
  const entries: Array<{ path: string; expr: string }> = [];

  for (const field of template.fields) {
    const expr = generateItemFieldExpression(field);
    if (expr) {
      entries.push({ path: field.targetFieldPath, expr });
    }
  }

  for (const [nestedFieldPath, nestedState] of template.nestedArrays) {
    const nestedExpr = generateArrayExpression(nestedState).trim();
    if (!nestedExpr) continue;
    // Nested builders are first-class property values in the parent template.
    entries.push({ path: nestedFieldPath, expr: nestedExpr });
  }

  if (entries.length === 0) return '{}';

  const segmentedPaths = entries
    .map((entry) => splitPathSegments(entry.path))
    .filter((segments) => segments.length > 0);
  const commonPrefixLength = getCommonPrefixLength(segmentedPaths);

  const tree: TemplateTree = new Map();
  for (const entry of entries) {
    const fullSegments = splitPathSegments(entry.path);
    if (fullSegments.length === 0) continue;

    const relativeSegments = fullSegments.slice(commonPrefixLength);
    const segments = relativeSegments.length > 0 ? relativeSegments : [toItemTemplateKey(entry.path)];
    insertTemplatePath(tree, segments, entry.expr);
  }

  if (tree.size === 0) return '{}';
  return serializeTemplateTree(tree);
}

// ---------------------------------------------------------------------------
// ValueEntry generation (Build from Values mode)
// ---------------------------------------------------------------------------

/**
 * Generates the DSL expression for a single ValueEntryFieldValue.
 */
function generateValueEntryFieldValue(value: ValueEntryFieldValue): string {
  switch (value.kind) {
    case 'empty':
      return '';
    case 'sourceField':
      return value.path.trim() ? `source(${quoteString(value.path)})` : '';
    case 'static':
      return staticValueToDsl(value.value);
    case 'expression':
      return value.dsl.trim();
  }
}

/**
 * Generates the DSL expression for a single ValueEntry.
 *
 * Object entries produce an object template: { "field": <expr>, ... }
 * Primitive entries produce a single expression.
 */
function generateValueEntry(entry: ValueEntry): string {
  if (entry.kind === 'primitive') {
    return generateValueEntryFieldValue(entry.value);
  }

  // Object entry
  const pairs: string[] = [];
  for (const [fieldName, fieldValue] of Object.entries(entry.fields)) {
    const expr = generateValueEntryFieldValue(fieldValue);
    if (expr) {
      pairs.push(`${quoteString(fieldName)}: ${expr}`);
    }
  }

  if (pairs.length === 0) return '';
  return `{${pairs.join(', ')}}`;
}

// ---------------------------------------------------------------------------
// Mode-specific generators
// ---------------------------------------------------------------------------

/**
 * Generates DSL for Map mode.
 * Pattern: map(source("path"), { "field": <chain>, ... })
 */
function generateMapExpression(
  collection: MapCollectionState,
  template: ItemTemplateState,
): string {
  const sourceExpr = collectionSourceToDsl(collection.sourceArrayPath);
  if (!sourceExpr) return '';
  const objectTemplate = generateObjectTemplate(template);
  return `map(${sourceExpr}, ${objectTemplate})`;
}

/**
 * Generates DSL for Filter + Map mode.
 * Pattern: map(filter(source("path"), <predicate>), { "field": <chain>, ... })
 */
function generateFilterMapExpression(
  collection: FilterMapCollectionState,
  template: ItemTemplateState,
): string {
  const sourceExpr = collectionSourceToDsl(collection.sourceArrayPath);
  if (!sourceExpr) return '';

  const predicate = generateFilterPredicate(collection.filterPredicate);
  if (!predicate) return '';

  const objectTemplate = generateObjectTemplate(template);
  return `map(filter(${sourceExpr}, ${predicate}), ${objectTemplate})`;
}

/**
 * Generates DSL for Build from Values mode.
 *
 * Without null filtering: array({...}, {...}, ...)
 * With null filtering:    filter(array({...}, {...}, ...), not(isNull(item("field"))))
 */
function generateBuildFromValuesExpression(collection: BuildFromValuesCollectionState): string {
  if (collection.entries.length === 0) return '';

  const entryExprs = collection.entries
    .map(generateValueEntry)
    .filter((e) => e.length > 0);

  if (entryExprs.length === 0) return '';

  const arrayExpr = `array(${entryExprs.join(', ')})`;

  if (collection.nullFilteringEnabled && collection.nullFilterField) {
    const fieldRef = `item(${quoteString(collection.nullFilterField)})`;
    return `filter(${arrayExpr}, not(isNull(${fieldRef})))`;
  }

  return arrayExpr;
}

/**
 * Pattern: map(split(source("path"), ","), trim(item("")))
 * Optional variations:
 *   - no trim: map(split(...), item(""))
 *   - drop empty: filter(<mapExpr>, neq(item(""), ""))
 */
function generateSplitStringExpression(collection: SplitStringCollectionState): string {
  const sourcePath = collection.sourceStringPath.trim();
  if (!sourcePath) return '';
  if (collection.delimiter.length === 0) return '';

  const iterable = collectionSourceToDsl(sourcePath);
  if (!iterable) return '';

  const splitExpr = `split(${iterable}, ${quoteString(collection.delimiter)})`;
  const mapExpr = collection.trimItems
    ? `map(${splitExpr}, trim(item("")))`
    : `map(${splitExpr}, item(""))`;

  if (!collection.dropEmpty) {
    return mapExpr;
  }

  return `filter(${mapExpr}, neq(item(""), ""))`;
}

/**
 * Generates DSL for a single merge branch.
 * Pattern: map(source("path"), { "field": <chain>, ... })
 */
function generateMergeBranchExpression(branch: MergeBranch): string {
  const sourceExpr = collectionSourceToDsl(branch.sourceArrayPath);
  if (!sourceExpr) return '';
  const objectTemplate = generateObjectTemplate(branch.itemTemplate);
  return `map(${sourceExpr}, ${objectTemplate})`;
}

/**
 * Generates DSL for Merge Array Branches mode.
 * Pattern: merge(map(source("a"), {...}), map(source("b"), {...}), ...)
 */
function generateMergeBranchesExpression(collection: MergeBranchesCollectionState): string {
  if (collection.branches.length < 2) return '';

  const branchExprs = collection.branches
    .map(generateMergeBranchExpression)
    .filter((e) => e.length > 0);

  if (branchExprs.length < 2) return '';

  return `merge(${branchExprs.join(', ')})`;
}

function generateObjectFieldsParentExpression(collection: ObjectFieldsCollectionState): string {
  const objectPath = collection.parent.objectPath.trim();

  if (collection.parent.input.kind === 'primary') {
    if (!objectPath) return '';
    return `source(${quoteString(objectPath)})`;
  }

  const alias = collection.parent.input.alias.trim();
  if (!alias) return '';
  const base = `external(${quoteString(alias)})`;
  if (!objectPath) return base;
  return `get(${base}, ${quoteString(objectPath)})`;
}

/**
 * Generates DSL for Object Fields mode.
 *
 * Canonical pattern (without optional inclusion predicate):
 *   map(
 *     filter(
 *       map(array("k1", ...), {"day": item(""), "value": get(<parent>, item(""))}),
 *       not(isNull(item("value")))
 *     ),
 *     <objectTemplate>
 *   )
 *
 * With optional inclusion predicate, applies a second filter layer after the
 * mandatory null/absent value filter.
 */
function generateObjectFieldsExpression(
  collection: ObjectFieldsCollectionState,
  template: ItemTemplateState,
): string {
  const orderedKeys = collection.orderedChildKeys
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  if (orderedKeys.length === 0) return '';

  const parentExpr = generateObjectFieldsParentExpression(collection);
  if (!parentExpr) return '';

  const keyArrayExpr = `array(${orderedKeys.map(quoteString).join(', ')})`;
  const candidateTemplate = `{"day": item(""), "value": get(${parentExpr}, item(""))}`;
  const candidateMapExpr = `map(${keyArrayExpr}, ${candidateTemplate})`;
  const mandatoryFilterExpr = `filter(${candidateMapExpr}, not(isNull(item("value"))))`;

  let filteredCandidatesExpr = mandatoryFilterExpr;
  if (collection.inclusionPredicate !== undefined) {
    const inclusionPredicateExpr = generateFilterPredicate(collection.inclusionPredicate);
    // Optional inclusion predicate should not invalidate the whole objectFields
    // expression while the user is still editing an incomplete condition.
    // Keep the mandatory canonical non-null filter active and apply the extra
    // filter only once the predicate is valid/non-empty.
    if (inclusionPredicateExpr) {
      filteredCandidatesExpr = `filter(${filteredCandidatesExpr}, ${inclusionPredicateExpr})`;
    }
  }

  const objectTemplate = generateObjectTemplate(template);
  return `map(${filteredCandidatesExpr}, ${objectTemplate})`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a DSL expression string from an ArrayBuilderState.
 *
 * Returns an empty string for:
 *   - Incomplete states (no source configured, no entries, etc.)
 *   - States with structural errors that prevent generation
 *
 * Delegates leaf field generation to generateChainExpression() (FS-039).
 * Handles nested arrays recursively via the item template's nestedArrays map.
 *
 * @pure — no side effects, deterministic output for a given input.
 */
export function generateArrayExpression(state: ArrayBuilderState): string {
  const { mode, collectionState, itemTemplate } = state;

  switch (mode) {
    case 'map':
      return generateMapExpression(collectionState as MapCollectionState, itemTemplate);

    case 'filterMap':
      return generateFilterMapExpression(
        collectionState as FilterMapCollectionState,
        itemTemplate,
      );

    case 'buildFromValues':
      return generateBuildFromValuesExpression(
        collectionState as BuildFromValuesCollectionState,
      );

    case 'splitString':
      return generateSplitStringExpression(collectionState as SplitStringCollectionState);

    case 'mergeArrayBranches':
      return generateMergeBranchesExpression(collectionState as MergeBranchesCollectionState);

    case 'objectFields':
      return generateObjectFieldsExpression(
        collectionState as ObjectFieldsCollectionState,
        itemTemplate,
      );

    case 'customExpression': {
      const cs = collectionState as { mode: 'customExpression'; rawExpression: string };
      return cs.rawExpression;
    }

    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Legacy type compatibility shim
//
// The following types are re-exported for backward compatibility with
// ArrayMappingBuilder.tsx and use-array-builder.ts, which will be replaced
// in FS-043 T-04+. Do not use these types in new code.
// ---------------------------------------------------------------------------

/** @deprecated Use ArrayBuilderState from array-builder-state.ts (FS-043) */
export type ArrayPattern =
  | '1:1 map'
  | 'filter-then-map'
  | 'merge-arrays'
  | 'build-from-scalars'
  | 'advanced';

/** @deprecated Use ItemFieldMapping from array-builder-state.ts (FS-043) */
export interface FieldMapping {
  targetField: string;
  sourceField: string;
}

/**
 * @deprecated Use ArrayBuilderState from array-builder-state.ts (FS-043).
 * This is the legacy wizard-model state shape retained for backward compatibility.
 */
export interface LegacyArrayBuilderState {
  sourceArrayPath: string;
  pattern: ArrayPattern;
  fieldMappings: FieldMapping[];
  rawExpression: string;
  additionalSourcePaths: string[];
}

/**
 * @deprecated Alias for LegacyArrayBuilderState. Use ArrayBuilderState from
 * array-builder-state.ts (FS-043) for new code.
 */
export type { LegacyArrayBuilderState as ArrayBuilderState };

// ---------------------------------------------------------------------------
// Legacy generator (backward compatibility)
// ---------------------------------------------------------------------------

function legacyEscapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function legacyBuildObjectTemplate(fieldMappings: FieldMapping[]): string {
  if (fieldMappings.length === 0) return '{}';
  const pairs = fieldMappings
    .map((m) => `"${legacyEscapeString(m.targetField)}": item("${legacyEscapeString(m.sourceField)}")`)
    .join(', ');
  return `{${pairs}}`;
}

/**
 * @deprecated Use generateArrayExpression() with the new ArrayBuilderState from
 * array-builder-state.ts (FS-043). This function is retained for backward
 * compatibility with use-array-builder.ts and ArrayMappingBuilder.tsx, which
 * will be replaced in FS-043 T-04+.
 */
export function generateLegacyArrayExpression(state: LegacyArrayBuilderState): string {
  const { sourceArrayPath, pattern, fieldMappings, rawExpression, additionalSourcePaths } = state;

  if (!sourceArrayPath && pattern !== 'advanced') return '';

  switch (pattern) {
    case '1:1 map': {
      const template = legacyBuildObjectTemplate(fieldMappings);
      return `map(source("${legacyEscapeString(sourceArrayPath)}"), ${template})`;
    }
    case 'filter-then-map': {
      const template = legacyBuildObjectTemplate(fieldMappings);
      return `map(filter(source("${legacyEscapeString(sourceArrayPath)}"), item("")), ${template})`;
    }
    case 'merge-arrays': {
      const allPaths = [sourceArrayPath, ...additionalSourcePaths].filter(Boolean);
      if (allPaths.length === 0) return '';
      if (allPaths.length === 1) return `source("${legacyEscapeString(allPaths[0])}")`;
      const args = allPaths.map((p) => `source("${legacyEscapeString(p)}")`).join(', ');
      return `concat(${args})`;
    }
    case 'build-from-scalars': {
      const args = fieldMappings.map((m) => `source("${legacyEscapeString(m.sourceField)}")`).join(', ');
      return args ? `array(${args})` : '';
    }
    case 'advanced':
      return rawExpression;
    default:
      return '';
  }
}

export {
  generateFilterPredicate,
  generateCrossArrayLookup,
  generateObjectTemplate,
  generateValueEntry,
  generateMergeBranchExpression,
};
