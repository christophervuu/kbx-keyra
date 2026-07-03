/**
 * array-decomposer.ts — FS-043 T-03
 *
 * Pure function that decomposes a DSL expression string into ArrayBuilderState,
 * enabling the array builder to hydrate from previously saved array expressions.
 *
 * Pattern detection order (per spec note):
 *   1. merge(...)                     → Merge Array Branches mode
 *   2. map(filter(filter(map(array(...), ...), ...), ...), ...) → Object Fields mode
 *   3. map(filter(source(...), ...), ...) → Filter + Map mode
 *   4. map(source(...), ...)           → Map mode
 *   4. array(...) / filter(array(...), ...) → Build from Values mode
 *   5. fallback                        → Custom Expression mode
 *
 * Merge is checked first because merge(map(...), map(...)) contains map() calls
 * that would otherwise match the map pattern.
 *
 * Leaf field decomposition delegates to decomposeToChain() from chain-decomposer.ts.
 * Cross-array lookup patterns (default(get(find(...), ...), ...)) are detected
 * before delegating to the chain decomposer.
 * Nested map() calls within item templates are detected as nested arrays.
 *
 * @pure — no side effects, deterministic output for a given input.
 */

import {
  createEmptyItemTemplate,
  deriveCompletionStatus,
} from './array-builder-state';
import type {
  ArrayBuilderState,
  CollectionState,
  ItemTemplateState,
  ItemFieldMapping,
  FilterPredicateState,
  FilterOperator,
  FilterLeftOperand,
  FilterRightOperand,
  CrossArrayLookupState,
  MergeBranch,
  ValueEntry,
  ValueEntryFieldValue,
  StaticValueBranch,
} from './array-builder-state';
import { decomposeToChain } from './chain-decomposer';

import { parse, defaultRegistry } from '@/lib/engine';
import type { AstNode } from '@/lib/engine';


// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type DecomposeArrayResult =
  | { readonly success: true; readonly state: ArrayBuilderState }
  | { readonly success: false; readonly reason: string; readonly rawExpression: string };

// ---------------------------------------------------------------------------
// Internal AST helpers
// ---------------------------------------------------------------------------

function isCall(node: AstNode, name: string): node is Extract<AstNode, { type: 'FunctionCall' }> {
  return node.type === 'FunctionCall' && node.name === name;
}

function isSourceCall(node: AstNode): boolean {
  return (
    node.type === 'FunctionCall' &&
    node.name === 'source' &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type === 'StringLiteral'
  );
}

function isCollectionSourceCall(node: AstNode): boolean {
  return (
    node.type === 'FunctionCall' &&
    (node.name === 'source' || node.name === 'item') &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type === 'StringLiteral'
  );
}

function extractSourcePath(node: AstNode): string {
  if (
    node.type === 'FunctionCall' &&
    node.name === 'source' &&
    node.arguments[0]?.type === 'StringLiteral'
  ) {
    return node.arguments[0].value;
  }
  return '';
}

function extractCollectionSourcePath(node: AstNode): string {
  if (
    node.type === 'FunctionCall' &&
    node.arguments.length === 1 &&
    node.arguments[0]?.type === 'StringLiteral'
  ) {
    if (node.name === 'source') return node.arguments[0].value;
    if (node.name === 'item') return `__item__:${node.arguments[0].value}`;
  }
  return '';
}

function isItemCallWithLiteral(node: AstNode, value: string): boolean {
  return (
    isCall(node, 'item')
    && node.arguments.length === 1
    && node.arguments[0]?.type === 'StringLiteral'
    && node.arguments[0].value === value
  );
}

/**
 * Reconstructs a DSL expression string from an AST node.
 * Used to extract sub-expressions for delegation to decomposeToChain().
 */
function astToString(node: AstNode): string {
  switch (node.type) {
    case 'StringLiteral':
      return `"${node.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    case 'NumberLiteral':
      return String(node.value);
    case 'BooleanLiteral':
      return node.value ? 'true' : 'false';
    case 'NullLiteral':
      return 'null';
    case 'ObjectTemplate': {
      const pairs = node.properties.map(
        (p) => `"${p.key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}": ${astToString(p.value)}`,
      );
      return `{${pairs.join(', ')}}`;
    }
    case 'FunctionCall': {
      const args = node.arguments.map(astToString).join(', ');
      return `${node.name}(${args})`;
    }
  }
}

function nodeToStaticValueBranch(node: AstNode): StaticValueBranch | null {
  switch (node.type) {
    case 'StringLiteral':
      return { type: 'string', value: node.value };
    case 'NumberLiteral':
      return { type: 'number', value: node.value };
    case 'BooleanLiteral':
      return { type: 'boolean', value: node.value };
    case 'NullLiteral':
      return { type: 'null' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Filter predicate decomposition
// ---------------------------------------------------------------------------

/**
 * Attempts to decompose a filter predicate AST node into FilterPredicateState.
 * Falls back to a raw predicate if the pattern is not recognized.
 */
function decomposeFilterPredicate(node: AstNode): FilterPredicateState {
  // Unary: isNull(item("field"))
  if (isCall(node, 'isNull') && node.arguments.length === 1) {
    const arg = node.arguments[0]!;
    const left = decomposeFilterLeftOperand(arg);
    if (left !== null) {
      return { kind: 'structured', left, operator: 'isNull', right: { kind: 'none' } };
    }
  }

  // Unary: not(isNull(item("field")))
  if (isCall(node, 'not') && node.arguments.length === 1) {
    const inner = node.arguments[0]!;
    if (isCall(inner, 'isNull') && inner.arguments.length === 1) {
      const arg = inner.arguments[0]!;
      const left = decomposeFilterLeftOperand(arg);
      if (left !== null) {
        return { kind: 'structured', left, operator: 'isNotNull', right: { kind: 'none' } };
      }
    }
  }

  // Binary: op(left, right)
  const binaryOp = tryDecomposeBinaryPredicate(node);
  if (binaryOp !== null) return binaryOp;

  // Fallback: raw DSL
  return { kind: 'raw', dsl: astToString(node) };
}

const BINARY_OPERATOR_MAP: Record<string, FilterOperator> = {
  eq: 'eq',
  neq: 'neq',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
};

function tryDecomposeBinaryPredicate(node: AstNode): FilterPredicateState | null {
  if (node.type !== 'FunctionCall') return null;
  const op = BINARY_OPERATOR_MAP[node.name];
  if (!op) return null;
  if (node.arguments.length !== 2) return null;

  const leftNode = node.arguments[0]!;
  const rightNode = node.arguments[1]!;

  const left = decomposeFilterLeftOperand(leftNode);
  if (left === null) return null;

  const right = decomposeFilterRightOperand(rightNode);

  return { kind: 'structured', left, operator: op, right };
}

function decomposeFilterLeftOperand(node: AstNode): FilterLeftOperand | null {
  // item("field") → itemField
  if (isCall(node, 'item') && node.arguments.length === 1 && node.arguments[0]?.type === 'StringLiteral') {
    return { kind: 'itemField', fieldPath: node.arguments[0].value };
  }
  // Any other expression → expression fallback
  return { kind: 'expression', dsl: astToString(node) };
}

function decomposeFilterRightOperand(node: AstNode): FilterRightOperand {
  // source("path") → sourceField
  if (isSourceCall(node)) {
    return { kind: 'sourceField', path: extractSourcePath(node) };
  }
  // item("field") → itemField
  if (isCall(node, 'item') && node.arguments.length === 1 && node.arguments[0]?.type === 'StringLiteral') {
    return { kind: 'itemField', fieldPath: node.arguments[0].value };
  }
  // Literal → static
  const staticVal = nodeToStaticValueBranch(node);
  if (staticVal !== null) {
    return { kind: 'static', value: staticVal.type === 'null' ? 'null' : String((staticVal as { value?: unknown }).value ?? '') };
  }
  // Fallback: treat as static with raw string
  return { kind: 'static', value: astToString(node) };
}

// ---------------------------------------------------------------------------
// Cross-array lookup detection
// ---------------------------------------------------------------------------

/**
 * Detects the cross-array lookup pattern:
 *   default(get(find(source("lookupArray"), eq(item("matchField"), <compareExpr>)), "returnField"), fallback)
 * or without default():
 *   get(find(source("lookupArray"), eq(item("matchField"), <compareExpr>)), "returnField")
 *
 * Returns CrossArrayLookupState if matched, null otherwise.
 */
function tryDecomposeCrossArrayLookup(node: AstNode): CrossArrayLookupState | null {
  let getNode: Extract<AstNode, { type: 'FunctionCall' }> | null = null;
  let fallback: StaticValueBranch | undefined;

  // default(get(...), fallback)
  if (isCall(node, 'default') && node.arguments.length === 2) {
    const inner = node.arguments[0]!;
    if (!isCall(inner, 'get')) return null;
    getNode = inner;
    const fallbackNode = node.arguments[1]!;
    fallback = nodeToStaticValueBranch(fallbackNode) ?? undefined;
  } else if (isCall(node, 'get')) {
    getNode = node;
  } else {
    return null;
  }

  // get(find(...), "returnField")
  if (getNode.arguments.length !== 2) return null;
  const findNode = getNode.arguments[0]!;
  const returnFieldNode = getNode.arguments[1]!;

  if (!isCall(findNode, 'find')) return null;
  if (returnFieldNode.type !== 'StringLiteral') return null;
  const returnField = returnFieldNode.value;

  // find(source("lookupArray"), eq(item("matchField"), <compareExpr>))
  if (findNode.arguments.length !== 2) return null;
  const sourceNode = findNode.arguments[0]!;
  const predicateNode = findNode.arguments[1]!;

  if (!isSourceCall(sourceNode)) return null;
  const lookupArrayPath = extractSourcePath(sourceNode);

  // eq(item("matchField"), <compareExpr>)
  if (!isCall(predicateNode, 'eq') || predicateNode.arguments.length !== 2) return null;
  const matchNode = predicateNode.arguments[0]!;
  const compareNode = predicateNode.arguments[1]!;

  if (!isCall(matchNode, 'item') || matchNode.arguments.length !== 1 || matchNode.arguments[0]?.type !== 'StringLiteral') {
    return null;
  }
  const matchField = matchNode.arguments[0].value;

  // compareExpr: item("field") or parent("field")
  let compareScope: 'item' | 'parent';
  let compareField: string;

  if (isCall(compareNode, 'item') && compareNode.arguments.length === 1 && compareNode.arguments[0]?.type === 'StringLiteral') {
    compareScope = 'item';
    compareField = compareNode.arguments[0].value;
  } else if (isCall(compareNode, 'parent') && compareNode.arguments.length === 1 && compareNode.arguments[0]?.type === 'StringLiteral') {
    compareScope = 'parent';
    compareField = compareNode.arguments[0].value;
  } else {
    return null;
  }

  return {
    kind: 'crossArrayLookup',
    lookupArrayPath,
    matchField,
    compareScope,
    compareField,
    returnField,
    fallback,
  };
}

// ---------------------------------------------------------------------------
// Item template decomposition
// ---------------------------------------------------------------------------

/**
 * Decomposes an ObjectTemplate AST node into an ItemTemplateState.
 * Each property value is decomposed as an ItemFieldMapping.
 *
 * Nested map() calls within property values are detected as nested arrays.
 * Cross-array lookup patterns are detected before delegating to decomposeToChain().
 */
function decomposeItemTemplate(node: AstNode): ItemTemplateState {
  if (node.type !== 'ObjectTemplate') {
    return createEmptyItemTemplate();
  }

  const fields: ItemFieldMapping[] = [];
  const nestedArrays = new Map<string, ArrayBuilderState>();

  for (const prop of node.properties) {
    const targetFieldPath = prop.key;
    const valueNode = prop.value;

    // Nested array: map(...) within item template
    if (isCall(valueNode, 'map')) {
      const nestedResult = decomposeMapOrFilterMap(valueNode);
      if (nestedResult.success) {
        nestedArrays.set(targetFieldPath, nestedResult.state);
        // Add an empty field mapping as placeholder (nested array is in nestedArrays map)
        fields.push({ kind: 'empty', targetFieldPath });
        continue;
      }
      // If nested map decomposition fails, fall through to chain decomposition
    }

    // Cross-array lookup pattern
    const crossArrayLookup = tryDecomposeCrossArrayLookup(valueNode);
    if (crossArrayLookup !== null) {
      fields.push({ kind: 'crossArrayLookup', targetFieldPath, lookupState: crossArrayLookup });
      continue;
    }

    // Direct scoped field references inside map templates.
    if (isCall(valueNode, 'item') && valueNode.arguments.length === 1 && valueNode.arguments[0]?.type === 'StringLiteral') {
      fields.push({
        kind: 'chain',
        targetFieldPath,
        chainState: {
          source: { kind: 'field', path: `__item__:${valueNode.arguments[0].value}` },
          steps: [],
        },
      });
      continue;
    }

    if (isSourceCall(valueNode)) {
      fields.push({
        kind: 'chain',
        targetFieldPath,
        chainState: {
          source: { kind: 'field', path: `__source__:${extractSourcePath(valueNode)}` },
          steps: [],
        },
      });
      continue;
    }

    const staticValue = nodeToStaticValueBranch(valueNode);
    if (staticValue !== null) {
      fields.push({
        kind: 'chain',
        targetFieldPath,
        chainState: {
          source: { kind: 'static', value: staticValue },
          steps: [],
        },
      });
      continue;
    }

    // Leaf field: delegate to decomposeToChain()
    const exprStr = astToString(valueNode);
    const chainResult = decomposeToChain(exprStr);
    if ('chain' in chainResult) {
      fields.push({ kind: 'chain', targetFieldPath, chainState: chainResult.chain });
    } else {
      // Preserve unrecognized leaf expressions as raw expression mappings.
      fields.push({ kind: 'expression', targetFieldPath, dsl: exprStr });
    }
  }

  return { fields, nestedArrays };
}

// ---------------------------------------------------------------------------
// Pattern matchers
// ---------------------------------------------------------------------------

/**
 * Attempts to decompose a map() or map(filter(...)) node.
 * Returns a DecomposeArrayResult for use in both top-level and nested contexts.
 */
function decomposeMapOrFilterMap(
  node: Extract<AstNode, { type: 'FunctionCall' }>,
): DecomposeArrayResult {
  if (node.name !== 'map' || node.arguments.length !== 2) {
    return { success: false, reason: 'Not a map() call with 2 arguments', rawExpression: astToString(node) };
  }

  const firstArg = node.arguments[0]!;
  const templateArg = node.arguments[1]!;

  // map(source("path"), {...}) or map(item("path"), {...}) → Map mode
  if (isCollectionSourceCall(firstArg)) {
    const sourceArrayPath = extractCollectionSourcePath(firstArg);
    const itemTemplate = decomposeItemTemplate(templateArg);
    const collectionState: CollectionState = { mode: 'map', sourceArrayPath };
    return buildState(collectionState, itemTemplate);
  }

  // map(filter(source("path")|item("path"), predicate), {...}) → Filter + Map mode
  if (isCall(firstArg, 'filter') && firstArg.arguments.length === 2) {
    const filterSource = firstArg.arguments[0]!;
    const filterPredicate = firstArg.arguments[1]!;

    if (isCollectionSourceCall(filterSource)) {
      const sourceArrayPath = extractCollectionSourcePath(filterSource);
      const predicate = decomposeFilterPredicate(filterPredicate);
      const itemTemplate = decomposeItemTemplate(templateArg);
      const collectionState: CollectionState = {
        mode: 'filterMap',
        sourceArrayPath,
        filterPredicate: predicate,
      };
      return buildState(collectionState, itemTemplate);
    }
  }

  return {
    success: false,
    reason: 'map() first argument is not source()/item() or filter(source()/item(), ...)',
    rawExpression: astToString(node),
  };
}

function tryDecomposeObjectFieldsParent(
  node: AstNode,
): { input: { kind: 'primary' } | { kind: 'enrichment'; alias: string }; objectPath: string } | null {
  if (isSourceCall(node)) {
    return {
      input: { kind: 'primary' },
      objectPath: extractSourcePath(node),
    };
  }

  if (isCall(node, 'external') && node.arguments.length === 1 && node.arguments[0]?.type === 'StringLiteral') {
    return {
      input: { kind: 'enrichment', alias: node.arguments[0].value },
      objectPath: '',
    };
  }

  if (
    isCall(node, 'get')
    && node.arguments.length === 2
    && isCall(node.arguments[0]!, 'external')
    && node.arguments[0]!.arguments.length === 1
    && node.arguments[0]!.arguments[0]?.type === 'StringLiteral'
    && node.arguments[1]?.type === 'StringLiteral'
  ) {
    return {
      input: { kind: 'enrichment', alias: node.arguments[0]!.arguments[0].value },
      objectPath: node.arguments[1].value,
    };
  }

  return null;
}

function tryDecomposeObjectFieldsCandidateMap(node: AstNode): {
  orderedChildKeys: readonly string[];
  parent: { input: { kind: 'primary' } | { kind: 'enrichment'; alias: string }; objectPath: string };
} | null {
  if (!isCall(node, 'map') || node.arguments.length !== 2) return null;
  const keysArrayNode = node.arguments[0]!;
  const candidateTemplateNode = node.arguments[1]!;

  if (!isCall(keysArrayNode, 'array')) return null;
  const orderedChildKeys: string[] = [];
  for (const arg of keysArrayNode.arguments) {
    if (arg.type !== 'StringLiteral') return null;
    orderedChildKeys.push(arg.value);
  }
  if (orderedChildKeys.length === 0) return null;

  if (candidateTemplateNode.type !== 'ObjectTemplate') return null;
  if (candidateTemplateNode.properties.length !== 2) return null;

  const [dayProp, valueProp] = candidateTemplateNode.properties;
  if (!dayProp || !valueProp) return null;
  if (dayProp.key !== 'day' || valueProp.key !== 'value') return null;
  if (!isItemCallWithLiteral(dayProp.value, '')) return null;

  if (!isCall(valueProp.value, 'get') || valueProp.value.arguments.length !== 2) return null;
  const parentExprNode = valueProp.value.arguments[0]!;
  const keyExprNode = valueProp.value.arguments[1]!;
  if (!isItemCallWithLiteral(keyExprNode, '')) return null;

  const parent = tryDecomposeObjectFieldsParent(parentExprNode);
  if (parent === null) return null;

  return { orderedChildKeys, parent };
}

function tryDecomposeObjectFieldsMandatoryFilter(node: AstNode): {
  orderedChildKeys: readonly string[];
  parent: { input: { kind: 'primary' } | { kind: 'enrichment'; alias: string }; objectPath: string };
} | null {
  if (!isCall(node, 'filter') || node.arguments.length !== 2) return null;
  const candidateMapNode = node.arguments[0]!;
  const predicateNode = node.arguments[1]!;

  if (
    !isCall(predicateNode, 'not')
    || predicateNode.arguments.length !== 1
    || !isCall(predicateNode.arguments[0]!, 'isNull')
    || predicateNode.arguments[0]!.arguments.length !== 1
    || !isItemCallWithLiteral(predicateNode.arguments[0]!.arguments[0]!, 'value')
  ) {
    return null;
  }

  return tryDecomposeObjectFieldsCandidateMap(candidateMapNode);
}

function tryDecomposeObjectFields(
  node: Extract<AstNode, { type: 'FunctionCall' }>,
): DecomposeArrayResult | null {
  if (!isCall(node, 'map') || node.arguments.length !== 2) return null;

  const firstArg = node.arguments[0]!;
  const templateArg = node.arguments[1]!;

  let orderedChildKeys: readonly string[] | null = null;
  let parent: { input: { kind: 'primary' } | { kind: 'enrichment'; alias: string }; objectPath: string } | null = null;
  let inclusionPredicate: FilterPredicateState | undefined;

  const mandatoryOnly = tryDecomposeObjectFieldsMandatoryFilter(firstArg);
  if (mandatoryOnly !== null) {
    orderedChildKeys = mandatoryOnly.orderedChildKeys;
    parent = mandatoryOnly.parent;
  } else if (isCall(firstArg, 'filter') && firstArg.arguments.length === 2) {
    const mandatoryFilterNode = firstArg.arguments[0]!;
    const additionalPredicateNode = firstArg.arguments[1]!;
    const mandatory = tryDecomposeObjectFieldsMandatoryFilter(mandatoryFilterNode);
    if (mandatory !== null) {
      orderedChildKeys = mandatory.orderedChildKeys;
      parent = mandatory.parent;
      inclusionPredicate = decomposeFilterPredicate(additionalPredicateNode);
    }
  }

  if (orderedChildKeys === null || parent === null) return null;

  const itemTemplate = decomposeItemTemplate(templateArg);
  const collectionState: CollectionState = {
    mode: 'objectFields',
    parent,
    orderedChildKeys,
    missingBehavior: 'skip-null-or-absent',
    ...(inclusionPredicate !== undefined && { inclusionPredicate }),
  };

  return buildState(collectionState, itemTemplate);
}

/**
 * Attempts to decompose a merge(...) node into Merge Array Branches mode.
 * Each argument must be a map(source(...), {...}) call.
 */
function tryDecomposeMerge(node: AstNode): DecomposeArrayResult | null {
  if (!isCall(node, 'merge')) return null;
  if (node.arguments.length < 2) return null;

  // >10 branches: fall through to custom expression (Q1)
  if (node.arguments.length > 10) return null;

  const branches: MergeBranch[] = [];

  for (const arg of node.arguments) {
    if (!isCall(arg, 'map') || arg.arguments.length !== 2) {
      return null;
    }
    const sourceArg = arg.arguments[0]!;
    const templateArg = arg.arguments[1]!;

    if (!isSourceCall(sourceArg)) return null;

    const sourceArrayPath = extractSourcePath(sourceArg);
    const itemTemplate = decomposeItemTemplate(templateArg);
    branches.push({ sourceArrayPath, itemTemplate });
  }

  const collectionState: CollectionState = { mode: 'mergeArrayBranches', branches };
  return buildState(collectionState, createEmptyItemTemplate());
}

/**
 * Attempts to decompose an array(...) or filter(array(...), ...) node into
 * Build from Values mode.
 */
function tryDecomposeBuildFromValues(node: AstNode): DecomposeArrayResult | null {
  let arrayNode: Extract<AstNode, { type: 'FunctionCall' }> | null = null;
  let nullFilteringEnabled = false;
  let nullFilterField: string | undefined;

  // filter(array(...), not(isNull(item("field"))))
  if (isCall(node, 'filter') && node.arguments.length === 2) {
    const inner = node.arguments[0]!;
    const predNode = node.arguments[1]!;

    if (!isCall(inner, 'array')) return null;
    arrayNode = inner;

    // Detect not(isNull(item("field"))) pattern
    if (isCall(predNode, 'not') && predNode.arguments.length === 1) {
      const isNullNode = predNode.arguments[0]!;
      if (isCall(isNullNode, 'isNull') && isNullNode.arguments.length === 1) {
        const itemNode = isNullNode.arguments[0]!;
        if (isCall(itemNode, 'item') && itemNode.arguments.length === 1 && itemNode.arguments[0]?.type === 'StringLiteral') {
          nullFilteringEnabled = true;
          nullFilterField = itemNode.arguments[0].value;
        }
      }
    }
  } else if (isCall(node, 'array')) {
    arrayNode = node;
  } else {
    return null;
  }

  const entries: ValueEntry[] = [];

  for (const arg of arrayNode.arguments) {
    const entry = decomposeValueEntry(arg);
    entries.push(entry);
  }

  const collectionState: CollectionState = {
    mode: 'buildFromValues',
    entries,
    nullFilteringEnabled,
    ...(nullFilterField !== undefined && { nullFilterField }),
  };

  return buildState(collectionState, createEmptyItemTemplate());
}

/**
 * Decomposes a single array() argument into a ValueEntry.
 */
function decomposeValueEntry(node: AstNode): ValueEntry {
  // Object template → object entry
  if (node.type === 'ObjectTemplate') {
    const fields: Record<string, ValueEntryFieldValue> = {};
    for (const prop of node.properties) {
      fields[prop.key] = decomposeValueEntryFieldValue(prop.value);
    }
    return { kind: 'object', fields };
  }

  // Anything else → primitive entry
  return { kind: 'primitive', value: decomposeValueEntryFieldValue(node) };
}

/**
 * Decomposes a value node into a ValueEntryFieldValue.
 */
function decomposeValueEntryFieldValue(node: AstNode): ValueEntryFieldValue {
  // source("path") → sourceField
  if (isSourceCall(node)) {
    return { kind: 'sourceField', path: extractSourcePath(node) };
  }

  // Static literal
  const staticVal = nodeToStaticValueBranch(node);
  if (staticVal !== null) {
    return { kind: 'static', value: staticVal };
  }

  // Anything else → expression
  return { kind: 'expression', dsl: astToString(node) };
}

// ---------------------------------------------------------------------------
// State assembly helper
// ---------------------------------------------------------------------------

function buildState(collectionState: CollectionState, itemTemplate: ItemTemplateState): DecomposeArrayResult {
  const partial: Omit<ArrayBuilderState, 'completionStatus'> = {
    mode: collectionState.mode,
    collectionState,
    itemTemplate,
  };
  const state: ArrayBuilderState = {
    ...partial,
    completionStatus: deriveCompletionStatus({ ...partial, completionStatus: 'notStarted' }),
  };
  return { success: true, state };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decomposes a DSL expression string into ArrayBuilderState.
 *
 * Pattern detection order:
 *   1. merge(...)                         → Merge Array Branches mode
 *   2. map(filter(source(...), ...), ...) → Filter + Map mode
 *   3. map(source(...), ...)              → Map mode
 *   4. array(...) / filter(array(...), ...) → Build from Values mode
 *   5. fallback                            → Custom Expression mode (success: false)
 *
 * Returns { success: false, reason, rawExpression } for unrecognized patterns.
 * The caller should load rawExpression into Custom Expression mode.
 *
 * @pure — no side effects, deterministic output for a given input.
 */
export function decomposeArrayExpression(expression: string): DecomposeArrayResult {
  const trimmed = expression.trim();

  if (trimmed === '') {
    return {
      success: false,
      reason: 'Empty expression',
      rawExpression: trimmed,
    };
  }

  const parseResult = parse(trimmed, { registry: defaultRegistry });

  if (!parseResult.success || parseResult.ast === null) {
    const msg =
      parseResult.diagnostics[0]?.message ?? 'Syntax error in expression';
    return {
      success: false,
      reason: `Parse error: ${msg}`,
      rawExpression: trimmed,
    };
  }

  const ast = parseResult.ast;

  // 1. Merge branches
  const mergeResult = tryDecomposeMerge(ast);
  if (mergeResult !== null) return mergeResult;

  // 2 & 3. Map / Filter+Map
  if (isCall(ast, 'map')) {
    const objectFieldsResult = tryDecomposeObjectFields(ast);
    if (objectFieldsResult !== null) return objectFieldsResult;

    const mapResult = decomposeMapOrFilterMap(ast);
    if (mapResult.success) return mapResult;
    // map() was recognized but inner structure failed — fall through to custom
    return {
      success: false,
      reason: mapResult.reason,
      rawExpression: trimmed,
    };
  }

  // 4. Build from Values
  const bfvResult = tryDecomposeBuildFromValues(ast);
  if (bfvResult !== null) return bfvResult;

  // 5. Unrecognized — custom expression fallback
  return {
    success: false,
    reason: `Unrecognized array expression pattern: top-level function is "${ast.type === 'FunctionCall' ? ast.name : ast.type}"`,
    rawExpression: trimmed,
  };
}
