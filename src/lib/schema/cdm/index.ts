export {
  CDM_MANIFEST,
  CDM_MANIFEST_VERSION,
  buildCdmManifestMetadataItems,
} from './cdm-manifest.js';
export type { CdmManifestEntry } from './cdm-manifest.js';

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
