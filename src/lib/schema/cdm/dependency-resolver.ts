// ---------------------------------------------------------------------------
// CDM Relative $ref Dependency Resolver (FS-077)
//
// Resolves relative JSON Schema $ref targets from a root CDM schema file,
// enforcing an allowed-folder allowlist and returning deterministic errors
// for disallowed, missing, circular, or too-deep references.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CdmDependencyErrorCode =
  | 'DISALLOWED_PATH'
  | 'UNRESOLVED_REF'
  | 'CYCLE_DETECTED'
  | 'DEPTH_EXCEEDED'
  | 'MAX_DEPENDENCIES_EXCEEDED'
  | 'FETCH_FAILED'
  | 'INVALID_REF_FORMAT';

export interface CdmDependencyError {
  readonly code: CdmDependencyErrorCode;
  readonly message: string;
  /** The original $ref value from the source schema. */
  readonly ref: string;
  /** The normalized repo-root-relative path (when computable). */
  readonly resolvedPath?: string;
}

export interface ResolvedDependency {
  /** Repo-root-relative path (e.g. "JSONSchemas/Definitions/Common/Types.json"). */
  readonly path: string;
  /** Raw file content fetched from the source. */
  readonly content: string;
  /** Git blob SHA of the fetched file. */
  readonly sha: string;
}

export interface CdmDependencyResult {
  /** Successfully resolved dependencies (deduplicated). */
  readonly dependencies: readonly ResolvedDependency[];
  /** Resolution errors encountered. */
  readonly errors: readonly CdmDependencyError[];
}

/**
 * Signature for fetching a file from the source repository.
 * Consumers (tests / lambda) provide their own implementation.
 */
export type FileFetcher = (
  path: string,
  branch: string,
) => Promise<{ content: string; sha: string } | 'not-found' | 'error'>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The only directories that are valid dependency sources for CDM schemas.
 */
const ALLOWED_DEPENDENCY_ROOTS: readonly string[] = [
  'JSONSchemas/CoreSchemas',
  'JSONSchemas/Definitions',
  'JSONSchemas/Events',
];

/**
 * Directories that must never be treated as dependency sources.
 */
const FORBIDDEN_DEPENDENCY_ROOTS: readonly string[] = [
  'JSONSchemas/Sample Payloads',
];

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_DEPENDENCIES = 50;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `ref` is a relative-path reference (./ or ../).
 */
function isRelativeRef(ref: string): boolean {
  return ref.startsWith('./') || ref.startsWith('../');
}

/**
 * Normalize a relative reference against a base directory.
 *
 * Both arguments are POSIX-style (forward slashes) with no leading slash.
 * Traversal above the repo root is silently capped (backing out beyond the
 * root yields an empty string).
 */
export function normalizeDependencyPath(baseDir: string, ref: string): string {
  const dirSegments = baseDir.split('/').filter(Boolean);
  const refParts = ref.split('/');

  for (const part of refParts) {
    if (part === '.' || part === '') {
      continue;
    }
    if (part === '..') {
      if (dirSegments.length > 0) {
        dirSegments.pop();
      }
      continue;
    }
    dirSegments.push(part);
  }

  return dirSegments.join('/');
}

/**
 * Check whether a resolved path is allowed as a dependency source.
 */
export function isAllowedDependencyPath(path: string): boolean {
  for (const forbidden of FORBIDDEN_DEPENDENCY_ROOTS) {
    if (path === forbidden || path.startsWith(`${forbidden}/`)) {
      return false;
    }
  }

  for (const allowed of ALLOWED_DEPENDENCY_ROOTS) {
    if (path === allowed || path.startsWith(`${allowed}/`)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// $ref extraction
// ---------------------------------------------------------------------------

/**
 * Extract all relative-path $ref values from a JSON Schema document.
 *
 * Only refs starting with `./` or `../` are included (local `#/...` refs
 * are ignored — they are handled by the existing parser internally).
 */
export function extractRelativeRefs(content: string): readonly string[] {
  const refs: string[] = [];

  try {
    const parsed = JSON.parse(content) as unknown;
    walkJsonForRefs(parsed, refs, new Set<string>());
  } catch {
    // Invalid JSON cannot contain extractable refs.
    return [];
  }

  return refs;
}

function walkJsonForRefs(value: unknown, refs: string[], seen: Set<string>): void {
  if (typeof value !== 'object' || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      walkJsonForRefs(item, refs, seen);
    }
    return;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.$ref === 'string' && !seen.has(obj.$ref)) {
    seen.add(obj.$ref);
    if (isRelativeRef(obj.$ref)) {
      refs.push(obj.$ref);
    }
  }

  for (const val of Object.values(obj)) {
    walkJsonForRefs(val, refs, seen);
  }
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export interface ResolveDependenciesOptions {
  /** Maximum transitive resolution depth (default 10). */
  readonly maxDepth?: number;
  /** Maximum total number of unique dependencies (default 50). */
  readonly maxDependencies?: number;
}

/**
 * Resolve relative $ref dependencies for a CDM schema file.
 *
 * @param rootPath - Repo-root-relative path of the root schema file.
 * @param content  - Raw JSON content of the root schema.
 * @param branch   - Git branch to fetch dependencies from.
 * @param fetchFile - File-fetcher implementation.
 * @param options  - Optional limits.
 */
export async function resolveDependencies(
  rootPath: string,
  content: string,
  branch: string,
  fetchFile: FileFetcher,
  options?: ResolveDependenciesOptions,
): Promise<CdmDependencyResult> {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxDeps = options?.maxDependencies ?? DEFAULT_MAX_DEPENDENCIES;

  // Determine the base directory for resolving the root schema's relative refs.
  const lastSlash = rootPath.lastIndexOf('/');
  const baseDir = lastSlash >= 0 ? rootPath.slice(0, lastSlash) : '';

  const resolved = new Map<string, ResolvedDependency>();
  const errors: CdmDependencyError[] = [];
  const visiting = new Set<string>();

  async function resolveOne(
    ref: string,
    currentBase: string,
    depth: number,
  ): Promise<void> {
    // --- Depth guard ---
    if (depth > maxDepth) {
      errors.push({
        code: 'DEPTH_EXCEEDED',
        message: `Maximum resolution depth (${maxDepth}) exceeded processing ref "${ref}".`,
        ref,
      });
      return;
    }

    // --- Normalize the resolved path ---
    let resolvedPath: string;
    try {
      resolvedPath = normalizeDependencyPath(currentBase, ref);
    } catch {
      errors.push({
        code: 'INVALID_REF_FORMAT',
        message: `Failed to normalize ref "${ref}" against base "${currentBase}".`,
        ref,
      });
      return;
    }

    if (!resolvedPath) {
      errors.push({
        code: 'INVALID_REF_FORMAT',
        message: `Ref "${ref}" resolved to an empty path from base "${currentBase}".`,
        ref,
        resolvedPath: '',
      });
      return;
    }

    // --- Already resolved ---
    if (resolved.has(resolvedPath)) {
      return;
    }

    // --- Cycle detection ---
    if (visiting.has(resolvedPath)) {
      errors.push({
        code: 'CYCLE_DETECTED',
        message: `Circular dependency detected: "${ref}" resolves to "${resolvedPath}" which is already being resolved in this chain.`,
        ref,
        resolvedPath,
      });
      return;
    }

    // --- Allowlist check ---
    if (!isAllowedDependencyPath(resolvedPath)) {
      errors.push({
        code: 'DISALLOWED_PATH',
        message: `Ref "${ref}" resolves to "${resolvedPath}" which is not in an allowed dependency directory. ` +
          `Allowed: ${ALLOWED_DEPENDENCY_ROOTS.join(', ')}.`,
        ref,
        resolvedPath,
      });
      return;
    }

    // --- Capacity guard ---
    if (resolved.size + errors.length >= maxDeps) {
      errors.push({
        code: 'MAX_DEPENDENCIES_EXCEEDED',
        message: `Maximum number of dependencies (${maxDeps}) would be exceeded processing "${ref}".`,
        ref,
        resolvedPath,
      });
      return;
    }

    visiting.add(resolvedPath);

    // --- Fetch ---
    let fetchResult: Awaited<ReturnType<FileFetcher>>;
    try {
      fetchResult = await fetchFile(resolvedPath, branch);
    } catch (err) {
      errors.push({
        code: 'FETCH_FAILED',
        message: `Unexpected error fetching dependency at "${resolvedPath}": ${(err as Error).message ?? String(err)}`,
        ref,
        resolvedPath,
      });
      visiting.delete(resolvedPath);
      return;
    }

    if (fetchResult === 'not-found') {
      errors.push({
        code: 'UNRESOLVED_REF',
        message: `Dependency not found at resolved path "${resolvedPath}".`,
        ref,
        resolvedPath,
      });
      visiting.delete(resolvedPath);
      return;
    }

    if (fetchResult === 'error') {
      errors.push({
        code: 'FETCH_FAILED',
        message: `Failed to fetch dependency at "${resolvedPath}" (source returned error).`,
        ref,
        resolvedPath,
      });
      visiting.delete(resolvedPath);
      return;
    }

    // --- Recursively resolve transitive refs BEFORE marking as resolved ---
    // This ensures the visiting-set cycle detection catches back-edges
    // before they would cause infinite recursion.
    const transitiveRefs = extractRelativeRefs(fetchResult.content);
    if (transitiveRefs.length > 0) {
      const nextBase = resolvedPath.includes('/')
        ? resolvedPath.slice(0, resolvedPath.lastIndexOf('/'))
        : '';
      for (const transitiveRef of transitiveRefs) {
        await resolveOne(transitiveRef, nextBase, depth + 1);
      }
    }

    // Mark as resolved only after transitive refs are fully processed.
    const dependency: ResolvedDependency = {
      path: resolvedPath,
      content: fetchResult.content,
      sha: fetchResult.sha,
    };

    resolved.set(resolvedPath, dependency);
    visiting.delete(resolvedPath);
  }

  // --- Resolve root-level refs ---
  const rootRefs = extractRelativeRefs(content);
  for (const ref of rootRefs) {
    await resolveOne(ref, baseDir, 1);
  }

  return {
    dependencies: [...resolved.values()],
    errors,
  };
}
