export {
  normalizeDependencyPath,
  isAllowedDependencyPath,
  extractRelativeRefs,
  resolveDependencies,
} from './dependency-resolver.js';
export type {
  CdmDependencyError,
  CdmDependencyErrorCode,
  CdmDependencyResult,
  FileFetcher,
  ResolveDependenciesOptions,
  ResolvedDependency,
} from './dependency-resolver.js';
