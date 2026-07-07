import { parse, type AstNode } from '../../engine/dsl/index.js';
import type { MappingConfig, MappingRule } from '../persistence/types.js';
import type { SchemaIdentityDiffSummary } from './diff/identity-diff.js';

export type MappingImpactRole = 'source' | 'target' | 'enrichment';

export interface RulePathUsage {
  readonly kind: 'source' | 'external' | 'target';
  readonly path: string;
  readonly alias?: string;
}

export interface RuleImpact {
  readonly ruleIndex: number;
  readonly target: string;
  readonly expression: string;
  readonly severity: 'breaking' | 'non-breaking';
  readonly matchedPaths: readonly string[];
}

export interface RoleImpactSummary {
  readonly role: MappingImpactRole;
  readonly breakingCount: number;
  readonly nonBreakingCount: number;
  readonly affectedRules: readonly RuleImpact[];
}

interface ExtractedUsage {
  readonly sourcePaths: readonly string[];
  readonly externalPaths: readonly Array<{ readonly alias: string; readonly path: string }>;
}

function escapePointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

function dotPathToPointer(path: string): string {
  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return '';
  }

  return `/${segments.map(escapePointerSegment).join('/')}`;
}

function pointerToDotPath(pointer: string): string {
  if (!pointer.startsWith('/')) {
    return pointer;
  }

  return pointer
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join('.');
}

function isStringLiteralNode(node: AstNode | undefined): node is AstNode & { readonly type: 'StringLiteral'; readonly value: string } {
  return Boolean(node) && node.type === 'StringLiteral';
}

function readPathFromAccessor(node: AstNode): { readonly kind: 'source'; readonly path: string } | { readonly kind: 'external'; readonly alias: string; readonly path: string } | null {
  if (node.type !== 'FunctionCall') {
    return null;
  }

  if (node.name === 'source') {
    const first = node.arguments[0];
    if (isStringLiteralNode(first)) {
      return {
        kind: 'source',
        path: first.value.trim(),
      };
    }
    return null;
  }

  if (node.name === 'external') {
    const first = node.arguments[0];
    if (isStringLiteralNode(first)) {
      return {
        kind: 'external',
        alias: first.value.trim(),
        path: '',
      };
    }
    return null;
  }

  return null;
}

function appendPath(base: string, child: string): string {
  const normalizedBase = base.trim();
  const normalizedChild = child.trim();
  if (!normalizedBase) {
    return normalizedChild;
  }
  if (!normalizedChild) {
    return normalizedBase;
  }
  return `${normalizedBase}.${normalizedChild}`;
}

function walkUsage(node: AstNode, sink: { source: Set<string>; external: Map<string, Set<string>> }): void {
  if (node.type === 'FunctionCall') {
    if (node.name === 'source') {
      const first = node.arguments[0];
      if (isStringLiteralNode(first) && first.value.trim()) {
        sink.source.add(first.value.trim());
      }
    }

    if (node.name === 'get') {
      const accessor = readPathFromAccessor(node.arguments[0] as AstNode);
      const propertyNode = node.arguments[1];
      if (accessor && isStringLiteralNode(propertyNode)) {
        if (accessor.kind === 'source') {
          sink.source.add(appendPath(accessor.path, propertyNode.value));
        }

        if (accessor.kind === 'external' && accessor.alias) {
          const set = sink.external.get(accessor.alias) ?? new Set<string>();
          set.add(appendPath(accessor.path, propertyNode.value));
          sink.external.set(accessor.alias, set);
        }
      }
    }

    if (node.name === 'external') {
      const first = node.arguments[0];
      if (isStringLiteralNode(first) && first.value.trim()) {
        const set = sink.external.get(first.value.trim()) ?? new Set<string>();
        set.add('');
        sink.external.set(first.value.trim(), set);
      }
    }

    for (const argument of node.arguments) {
      walkUsage(argument, sink);
    }
    return;
  }

  if (node.type === 'ObjectTemplate') {
    for (const property of node.properties) {
      walkUsage(property.value, sink);
    }
  }
}

export function extractRuleUsageFromExpression(expression: string): ExtractedUsage {
  const parsed = parse(expression);
  if (!parsed.ast) {
    return {
      sourcePaths: [],
      externalPaths: [],
    };
  }

  const sink = {
    source: new Set<string>(),
    external: new Map<string, Set<string>>(),
  };

  walkUsage(parsed.ast, sink);

  const externalPaths = [...sink.external.entries()]
    .flatMap(([alias, paths]) => [...paths].map((path) => ({ alias, path })))
    .sort((a, b) => `${a.alias}:${a.path}`.localeCompare(`${b.alias}:${b.path}`));

  return {
    sourcePaths: [...sink.source].sort(),
    externalPaths,
  };
}

function matchesImpact(pointerPath: string, impactedPointers: ReadonlySet<string>): boolean {
  for (const impacted of impactedPointers) {
    if (!impacted) {
      continue;
    }

    if (pointerPath === impacted || pointerPath.startsWith(`${impacted}/`) || impacted.startsWith(`${pointerPath}/`)) {
      return true;
    }
  }

  return false;
}

function getRulePathsForRole(
  rule: MappingRule,
  role: MappingImpactRole,
  enrichmentAlias?: string,
): readonly string[] {
  if (role === 'target') {
    return [rule.target];
  }

  const usage = extractRuleUsageFromExpression(rule.expression);
  if (role === 'source') {
    return usage.sourcePaths;
  }

  return usage.externalPaths
    .filter((entry) => !enrichmentAlias || entry.alias === enrichmentAlias)
    .map((entry) => entry.path)
    .filter((path) => path.length > 0);
}

export function computeRoleImpactSummary(input: {
  readonly mapping: MappingConfig;
  readonly role: MappingImpactRole;
  readonly identityDiff: SchemaIdentityDiffSummary;
  readonly enrichmentAlias?: string;
}): RoleImpactSummary {
  const breakingPointers = new Set<string>([
    ...input.identityDiff.removed,
    ...input.identityDiff.renamed.map((entry) => entry.fromJsonPointer),
    ...input.identityDiff.moved.map((entry) => entry.fromJsonPointer),
  ]);

  const nonBreakingPointers = new Set<string>([
    ...input.identityDiff.added,
    ...input.identityDiff.renamed.map((entry) => entry.toJsonPointer),
    ...input.identityDiff.moved.map((entry) => entry.toJsonPointer),
  ]);

  const affectedRules: RuleImpact[] = [];

  for (const [ruleIndex, rule] of input.mapping.rules.entries()) {
    const paths = getRulePathsForRole(rule, input.role, input.enrichmentAlias);
    if (paths.length === 0) {
      continue;
    }

    const matchedBreaking = paths.filter((path) => matchesImpact(dotPathToPointer(path), breakingPointers));
    const matchedNonBreaking = paths.filter((path) => matchesImpact(dotPathToPointer(path), nonBreakingPointers));

    if (matchedBreaking.length === 0 && matchedNonBreaking.length === 0) {
      continue;
    }

    affectedRules.push({
      ruleIndex,
      target: rule.target,
      expression: rule.expression,
      severity: matchedBreaking.length > 0 ? 'breaking' : 'non-breaking',
      matchedPaths: [...new Set([...matchedBreaking, ...matchedNonBreaking])].sort(),
    });
  }

  return {
    role: input.role,
    breakingCount: affectedRules.filter((rule) => rule.severity === 'breaking').length,
    nonBreakingCount: affectedRules.filter((rule) => rule.severity === 'non-breaking').length,
    affectedRules,
  };
}

export function impactedPointerToDotPath(pointer: string): string {
  return pointerToDotPath(pointer);
}
