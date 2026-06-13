import type { ExecutionResult } from '@keyra/engine';

import type { DiffEntry } from './diff';

export type ISODateString = string;

export type RuntimeEnvironment = 'DEV' | 'PREPROD' | 'PROD';

export type Environment = RuntimeEnvironment | 'QA' | 'SANDBOX';

export type DeployStatus = 'deployed' | 'stale' | 'not-deployed' | 'deploying';

export type SchemaFormat = 'json-schema' | 'xsd';

export type SchemaOwnership = 'cdm' | 'user';

export type SchemaDataFormat = 'json' | 'xml';

export type SchemaSourceKind = 'json_schema' | 'xsd' | 'inferred_from_json' | 'inferred_from_xml';

/**
 * Legacy-compatible schema origin values accepted at read boundaries.
 * Canonical FS-087 values are `cdm | uploaded | inferred`.
 */
export type SchemaOrigin = 'cdm' | 'uploaded' | 'inferred' | 'published' | 'local';

export type CanonicalSchemaOrigin = 'cdm' | 'uploaded' | 'inferred';

export type SchemaIngestStatus = 'ingesting' | 'ready' | 'error';

export type SchemaStatus = 'ready' | 'processing' | 'needs_review' | 'error' | 'ingesting';

export type SchemaReviewState = 'not_required' | 'unreviewed' | 'partially_reviewed' | 'reviewed';

export type SchemaReviewIssueCode =
  | 'low_sample_evidence'
  | 'type_ambiguity_conflict'
  | 'optionality_uncertainty'
  | 'empty_shape_unknown'
  | 'field_name_quality'
  | 'missing_description';

export interface SchemaReviewIssueSummary {
  readonly code: SchemaReviewIssueCode;
  readonly count: number;
  readonly blocking: boolean;
}

export type SchemaSampleSource = 'initial_upload' | 'added_sample';

export type SchemaSampleCompatibility = 'unknown' | 'compatible' | 'mismatch';

export interface SchemaSamplePayloadMetadata {
  readonly sampleId: string;
  readonly schemaId: string;
  readonly name: string;
  readonly dataFormat: SchemaDataFormat;
  readonly contentRef: string;
  readonly usedForInference: boolean;
  readonly source: SchemaSampleSource;
  readonly sizeBytes?: number;
  readonly hash?: string;
  readonly summary?: string;
  readonly compatibility?: SchemaSampleCompatibility;
  readonly createdAt: ISODateString;
  readonly createdBy?: string;
}

export interface SchemaSamplePayloadContent {
  readonly sampleId: string;
  readonly schemaId: string;
  readonly dataFormat: SchemaDataFormat;
  readonly raw: string;
  readonly parsed: unknown | null;
}

/**
 * @deprecated FS-087 compatibility-only field.
 * Scope must not determine schema availability behavior.
 */
export type SchemaScope = 'global' | 'project';

/**
 * Canonical sync states exposed to UI consumers (FS-078 T-01):
 * - synced
 * - update-available
 * - sync-failed
 */
export type SchemaSyncStatus =
  | 'synced'
  | 'update-available'
  | 'sync-failed';

export type MappingStatus = 'draft' | 'ready' | 'has-errors';

export type DeploymentRecordStatus = 'active' | 'superseded' | 'rolled-back';

export type SchemaRefType = 'github' | 'local' | 'published';

export interface SchemaRef {
  readonly schemaId: string;
  readonly type: SchemaRefType;
  readonly commitSha?: string;
}

export interface MappingRule {
  readonly target: string;
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'any';
  readonly expression: string;
  readonly description?: string;
}

export interface MappingEditorPreferences {
  /** Mapping-level default selected sample payload id. */
  readonly defaultSelectedSampleId?: string;
}

export interface MappingEnrichmentSource {
  readonly alias: string;
  /**
   * Canonical enrichment entries include schemaId.
   * Legacy compatibility aliases derived from config.externalSources may omit it.
   */
  readonly schemaId?: string;
  readonly required?: boolean;
  readonly description?: string;
}

export interface MappingConfigOptions {
  readonly unmappedTargets?: 'omit' | 'null' | 'error';
  readonly nullSubtrees?: readonly string[];
  readonly constants?: Readonly<Record<string, unknown>>;
  readonly externalSources?: readonly string[];
  /** Additive editor-only preferences persisted with mapping config. */
  readonly editorPreferences?: MappingEditorPreferences;
}

export interface MappingConfig {
  readonly id?: string;
  readonly projectId?: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly version: number;
  readonly engineVersion: string;
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
  readonly enrichmentSources?: readonly MappingEnrichmentSource[];
  readonly config: MappingConfigOptions;
  readonly rules: readonly MappingRule[];
}

export interface MappingVersionEntry {
  readonly version: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
  readonly config: MappingConfig;
}

export interface MappingSaveResult {
  readonly revision: number;
  readonly noChange: boolean;
}

export interface MappingRevision {
  readonly revision: number;
  readonly savedAt: string;
  readonly savedBy: string;
  readonly ruleCount: number;
}

export interface MappingRevisionDetail extends MappingRevision {
  readonly mappingId: string;
  readonly config: MappingConfig;
}

export interface MappingVersion {
  readonly version: number;
  readonly revisionNumber: number;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface Project {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly linkedSchemaIds?: readonly string[];
  readonly schemaRefs: readonly SchemaRef[];
  readonly tags: readonly string[];
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface ProjectMetadata {
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly mappingCount?: number;
  readonly schemaCount?: number;
  readonly updatedAt: ISODateString;
}

export interface ProjectDetail extends Project {
  readonly mappings: readonly MappingMetadata[];
}

export interface MappingMetadata {
  readonly mappingId: string;
  readonly projectId: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly version: number;
  readonly status: MappingStatus;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly enrichmentSources?: readonly MappingEnrichmentSource[];
  readonly ruleCount: number;
  readonly coverage: number;
  readonly updatedAt: ISODateString;
}

export interface GitHubSourceInfo {
  readonly type: 'github';
  readonly repo: string;
  readonly repoId?: number;
  readonly branch: string;
  readonly path: string;
  readonly commitSha?: string;
}

export interface UploadSourceInfo {
  readonly type: 'upload';
}

export type SchemaSourceInfo = GitHubSourceInfo | UploadSourceInfo;

export interface SchemaMetadata {
  readonly schemaId: string;
  readonly name: string;
  readonly format: SchemaFormat;
  readonly dataFormat?: SchemaDataFormat;
  readonly sourceKind?: SchemaSourceKind;
  readonly fieldCount: number;
  readonly ownership?: SchemaOwnership;
  readonly isCdm?: boolean;
  readonly readonly?: boolean;
  readonly origin: CanonicalSchemaOrigin;
  readonly status: SchemaStatus;
  /**
   * @deprecated FS-087 compatibility-only field.
   */
  readonly scope?: SchemaScope;
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
  readonly reviewState?: SchemaReviewState;
  readonly reviewIssues?: readonly SchemaReviewIssueSummary[];
  readonly inferenceIssueCounts?: Readonly<Record<SchemaReviewIssueCode, number>>;
  readonly reviewedAt?: ISODateString;
  readonly reviewedBy?: string;
  readonly samplePayloadCount?: number;
  readonly samplePayloads?: readonly SchemaSamplePayloadMetadata[];
  readonly disambiguator?: string;
  readonly syncStatus: SchemaSyncStatus;
  readonly source: SchemaSourceInfo;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface SchemaDetail {
  readonly metadata: SchemaMetadata;
  readonly content: Readonly<Record<string, unknown>> | string;
}

export interface DeploymentRecord {
  readonly mappingId: string;
  readonly environment: Environment;
  readonly version: number;
  readonly snapshotId: string;
  readonly deployedAt: ISODateString;
  readonly deployedBy: string;
  readonly status: DeploymentRecordStatus;
}

export interface DeploymentEnvironmentStatus {
  readonly environment: Environment;
  readonly status: DeployStatus;
  readonly deployedVersion?: number;
  readonly deployedAt?: ISODateString;
}

export interface DeploymentContext {
  readonly mappingId: string;
  readonly mappingName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly environments: readonly DeploymentEnvironmentStatus[];
}

export interface DeploymentDiffField {
  readonly path: string;
  readonly previousValue: unknown;
  readonly nextValue: unknown;
}

export interface DeploymentDiff {
  readonly mappingId: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly changedFields: readonly DeploymentDiffField[];
}

export interface Template {
  readonly templateId: string;
  readonly name: string;
  readonly description: string;
  readonly sourceSchemaType: string;
  readonly targetSchemaType: string;
  readonly ruleCount: number;
  readonly tags: readonly string[];
  readonly configS3Key?: string;
}

export interface TemplateMetadata {
  readonly templateId: string;
  readonly name: string;
  readonly description: string;
  readonly sourceSchemaType: string;
  readonly targetSchemaType: string;
  readonly ruleCount: number;
  readonly tags: readonly string[];
}

export interface TemplateDetail extends Template {
  readonly mappingConfig: MappingConfig;
}

export type ActivityType =
  | 'project-created'
  | 'project-updated'
  | 'mapping-created'
  | 'mapping-updated'
  | 'mapping-deployed'
  | 'schema-linked'
  | 'schema-synced'
  | 'info'
  | 'warning'
  | 'error';

export interface ActivityEntry {
  readonly id: string;
  readonly type: ActivityType;
  readonly message: string;
  readonly timestamp: ISODateString;
  readonly projectId?: string;
  readonly mappingId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description: string;
  readonly slug: string;
  readonly linkedSchemaIds?: readonly string[];
  readonly schemaRefs?: readonly SchemaRef[];
  readonly tags?: readonly string[];
}

export interface UpdateProjectInput {
  readonly name?: string;
  readonly description?: string;
  readonly slug?: string;
  readonly linkedSchemaIds?: readonly string[];
  readonly schemaRefs?: readonly SchemaRef[];
  readonly tags?: readonly string[];
}

export interface CreateMappingInput {
  readonly projectId: string;
  readonly name: string;
  readonly businessContext?: string;
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
  readonly enrichmentSources?: readonly MappingEnrichmentSource[];
  readonly config?: MappingConfigOptions;
  readonly rules?: readonly MappingRule[];
}

export interface CreateSchemaInput {
  readonly name: string;
  readonly format: SchemaFormat;
  readonly origin: SchemaOrigin;
  readonly ownership?: SchemaOwnership;
  readonly sourceKind?: SchemaSourceKind;
  readonly readonly?: boolean;
  readonly status?: SchemaStatus;
  readonly content: Readonly<Record<string, unknown>> | string;
  readonly source?: SchemaSourceInfo;
  /**
   * @deprecated FS-087 compatibility-only field.
   */
  readonly scope?: SchemaScope;
  readonly description?: string;
  readonly inferred?: boolean;
  readonly reviewedAt?: ISODateString;
  readonly reviewedBy?: string;
  readonly disambiguator?: string;
  readonly syncStatus?: SchemaSyncStatus;
}

export interface UpdateSchemaInput {
  readonly name?: string;
  readonly description?: string;
  /**
   * @deprecated FS-087 compatibility-only field.
   */
  readonly scope?: SchemaScope;
  readonly content?: Readonly<Record<string, unknown>> | string;
  readonly fieldCount?: number;
  readonly format?: SchemaFormat;
  readonly status?: SchemaStatus;
  readonly reviewedAt?: ISODateString;
  readonly reviewedBy?: string;
  readonly disambiguator?: string;
}

export interface AddSchemaSampleInput {
  readonly sampleName?: string;
  readonly sampleContent: unknown;
  readonly applySuggestedUpdates?: boolean;
}

export interface AddSchemaSampleDiff {
  readonly additions: readonly string[];
  readonly typeConflicts: ReadonlyArray<{
    path: string;
    existingType: string;
    sampleType: string;
  }>;
  readonly requiredOptionalEvidence: ReadonlyArray<{
    path: string;
    appearsInCurrentSample: boolean;
    totalSamplesAfterSave: number;
  }>;
}

export interface AddSchemaSampleResult {
  readonly sample: SchemaSamplePayloadMetadata;
  readonly diff: AddSchemaSampleDiff;
  readonly schemaUpdated: boolean;
  readonly mode: 'apply_all' | 'save_only';
  readonly metadata: SchemaMetadata;
}

export interface GitHubFile {
  readonly path: string;
  readonly name: string;
  readonly type: 'file' | 'dir';
  readonly sha: string;
  readonly size?: number;
  readonly downloadUrl?: string;
  readonly htmlUrl?: string;
}

export interface LinkCdmSchemaInput {
  readonly projectId: string;
  readonly repo?: string;
  readonly branch?: string;
  readonly path: string;
  readonly name?: string;
}

export interface CdmBulkSyncError {
  readonly path: string;
  readonly reason: string;
}

export interface CdmBulkSyncResult {
  readonly rootPath: string;
  readonly scannedFiles: number;
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly excludedSchemaIds: readonly string[];
  readonly errors: readonly CdmBulkSyncError[];
  readonly message: string;
}

export function normalizeSchemaOrigin(origin: SchemaOrigin | string | null | undefined): CanonicalSchemaOrigin {
  if (origin === 'cdm') {
    return 'cdm';
  }

  if (origin === 'inferred') {
    return 'inferred';
  }

  return 'uploaded';
}

export function normalizeSchemaOwnership(input: {
  ownership?: SchemaOwnership;
  origin?: SchemaOrigin | CanonicalSchemaOrigin | string | null;
}): SchemaOwnership {
  if (input.ownership === 'cdm' || input.ownership === 'user') {
    return input.ownership;
  }

  return normalizeSchemaOrigin(input.origin) === 'cdm' ? 'cdm' : 'user';
}

export function normalizeSchemaSourceKind(input: {
  sourceKind?: SchemaSourceKind | string | null;
  format?: SchemaFormat | string | null;
  inferred?: boolean | null;
}): SchemaSourceKind {
  if (
    input.sourceKind === 'json_schema'
    || input.sourceKind === 'xsd'
    || input.sourceKind === 'inferred_from_json'
    || input.sourceKind === 'inferred_from_xml'
  ) {
    return input.sourceKind;
  }

  if (input.format === 'xsd') {
    return input.inferred ? 'inferred_from_xml' : 'xsd';
  }

  return input.inferred ? 'inferred_from_json' : 'json_schema';
}

export function schemaDataFormatFromSourceKind(sourceKind: SchemaSourceKind): SchemaDataFormat {
  return sourceKind === 'xsd' || sourceKind === 'inferred_from_xml' ? 'xml' : 'json';
}

export function normalizeSchemaStatus(input: {
  status?: SchemaStatus | SchemaIngestStatus | string | null;
  inferred?: boolean | null;
  reviewedAt?: ISODateString | null;
}): SchemaStatus {
  if (input.status === 'processing') {
    return input.status;
  }

  if (input.status === 'needs_review') {
    return input.inferred && !input.reviewedAt ? 'needs_review' : 'ready';
  }

  if (input.status === 'ingesting') {
    return 'processing';
  }

  if (input.status === 'error') {
    return 'error';
  }

  if (input.status === 'ready') {
    if (input.inferred && !input.reviewedAt) {
      return 'needs_review';
    }

    return 'ready';
  }

  if (input.inferred && !input.reviewedAt) {
    return 'needs_review';
  }

  return 'ready';
}

export function normalizeSchemaReviewState(input: {
  reviewState?: SchemaReviewState | string | null;
  inferred?: boolean | null;
  reviewedAt?: ISODateString | null;
}): SchemaReviewState {
  if (
    input.reviewState === 'not_required'
    || input.reviewState === 'unreviewed'
    || input.reviewState === 'partially_reviewed'
    || input.reviewState === 'reviewed'
  ) {
    return input.reviewState;
  }

  if (!input.inferred) {
    return 'not_required';
  }

  return input.reviewedAt ? 'reviewed' : 'unreviewed';
}

export function normalizeProjectLinkedSchemaIds(input: {
  linkedSchemaIds?: readonly string[];
  schemaRefs?: readonly SchemaRef[];
}): readonly string[] {
  const values = Array.isArray(input.linkedSchemaIds)
    ? input.linkedSchemaIds
    : (input.schemaRefs ?? []).map((schemaRef) => schemaRef.schemaId);

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// CDM Re-sync Diff & Result Types (FS-077)
// ---------------------------------------------------------------------------

/**
 * Terminal status of a CDM re-sync operation (FS-077).
 */
export type CdmReSyncStatus = 'no-op' | 'updated' | 'failed';

/**
 * A single field-level diff entry between prior and refreshed schema nodes (FS-077).
 */
export interface SchemaDiffEntry {
  readonly path: string;
  readonly changeType: 'added' | 'removed' | 'modified';
}

/**
 * Field-level diff summary for a successful updated re-sync (FS-077).
 */
export interface SchemaDiffSummary {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly modified: readonly string[];
}

/**
 * Result of a CDM re-sync operation (FS-077).
 *
 * Backward-compat fields (`synced`, `commitSha`, `message`) are retained
 * for existing consumers. New consumers should prefer the canonical `status` field.
 */
export interface SchemaSyncResult {
  readonly schemaId: string;

  /** Canonical three-mode outcome. */
  readonly status: CdmReSyncStatus;

  /**
   * Derived from `status` for backward compat.
   * `true` when status is `updated` or `no-op`; `false` when `failed`.
   */
  readonly synced: boolean;

  /** Human-readable message describing the result. */
  readonly message: string;

  /** Failure reason — present when status is `failed`. */
  readonly reason?: string;

  /** Commit SHA prior to this re-sync call. */
  readonly previousCommitSha?: string;

  /** Commit SHA after this re-sync call. */
  readonly currentCommitSha?: string;

  /** @deprecated Use `currentCommitSha`. Kept for backward compat. */
  readonly commitSha?: string;

  /** Field-level diff summary — present when status is `updated`. */
  readonly diffSummary?: SchemaDiffSummary;
}

export interface PublishSchemaInput {
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly commitMessage?: string;
}

export interface LinkPublishedSchemaInput {
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly name?: string;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly path?: string;
}

// AI types are intentionally minimal in Phase 0.
export interface AutoMapInput {
  readonly projectId: string;
  readonly mappingId: string;
  readonly mode?: 'section' | 'whole';
  readonly sectionPath?: string;
  readonly targetSection?: string;
  readonly sourceContext?: string;
  readonly sourceSchemaId?: string;
  readonly businessContext?: string;
  /** Deterministic visible/filter scope for target-field-first auto-map runs. */
  readonly visibleTargetPaths?: readonly string[];
}

export interface AutoMapResult {
  readonly rules: readonly MappingRule[];
  readonly diagnostics?: readonly Diagnostic[];
  readonly warnings?: readonly string[];
  readonly retrievalMeta?: Readonly<Record<string, unknown>>;
}

export interface AutoMapSectionInput {
  readonly projectId: string;
  readonly mappingId: string;
  readonly mode?: 'section' | 'whole';
  readonly sectionPath?: string;
  readonly targetSection?: string;
  readonly sourceContext?: string;
  readonly sourceSchemaId?: string;
  readonly businessContext?: string;
  /** Deterministic visible/filter scope for target-field-first auto-map runs. */
  readonly visibleTargetPaths?: readonly string[];
}

export interface AutoMapSuggestion {
  readonly target: string;
  readonly expression: string;
  readonly explanation: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly validation?: {
    readonly valid: boolean;
    readonly diagnostics: readonly Diagnostic[];
  };
  /** Stable suggestion identifier for row-level review actions. */
  readonly suggestionId?: string;
  /** Lifecycle state exposed by backend-generated suggestion payloads. */
  readonly lifecycleStatus?: AiSuggestionLifecycleStatus;
  /** Canonical review status for UI action controls. */
  readonly reviewStatus?: SuggestionReviewStatus;
  /** Explicit apply/action eligibility for accept/edit/dismiss UX. */
  readonly actionEligibility?: SuggestionActionEligibility;
}

export interface AutoMapSectionResult {
  readonly suggestions: readonly AutoMapSuggestion[];
  readonly diagnostics?: readonly Diagnostic[];
  readonly retrievalMeta?: {
    readonly mode?: 'section' | 'whole';
    readonly retrievalCandidatesCount?: number;
    readonly retrievalSelectedCount?: number;
    readonly chunkCount?: number;
    readonly noContext?: boolean;
    readonly noContextReason?: string;
  };
  readonly validationMeta?: {
    readonly validationPassCount?: number;
    readonly validationFailCount?: number;
  };
  readonly dedupMeta?: {
    readonly duplicatesCollapsed?: number;
  };
  readonly scopeMeta?: {
    readonly visibleTargetPaths?: readonly string[];
    readonly mode?: 'section' | 'whole';
    readonly sectionPath?: string;
  };
}

export type AiSuggestionLifecycleStatus =
  | 'suggested'
  | 'accepted'
  | 'edited'
  | 'dismissed'
  | 'stale';

export type SuggestionApplyBlockReason =
  | 'invalid'
  | 'stale'
  | 'dismissed'
  | 'already-reviewed'
  | 'not-ready';

export interface SuggestionActionEligibility {
  /** Whether one-click Accept/apply is allowed. */
  readonly canAccept: boolean;
  /** Whether this item is eligible for Batch Accept operations. */
  readonly canBatchAccept: boolean;
  /** Deterministic reasons why apply is blocked. Empty when apply is allowed. */
  readonly blockReasons: readonly SuggestionApplyBlockReason[];
}

export type SuggestionReviewStatus = 'pending' | 'accepted' | 'edited' | 'dismissed';

export interface SuggestionReviewItem {
  readonly suggestion: AutoMapSuggestion;
  readonly currentExpression: string | null;
  readonly reviewStatus: SuggestionReviewStatus;
  readonly isNew: boolean;
}

export interface AutoMapReviewSummary {
  readonly total: number;
  readonly pending: number;
  readonly accepted: number;
  readonly edited: number;
  readonly dismissed: number;
  readonly validCount: number;
  readonly warningCount: number;
  readonly invalidCount: number;
  readonly highConfidence: number;
  readonly mediumConfidence: number;
  readonly lowConfidence: number;
}

export type MappingEditorRowStatus =
  | 'unmapped'
  | 'mapped'
  | 'warning'
  | 'error'
  | 'ai-suggestion'
  | 'accepted-ai-suggestion'
  | 'intentionally-unmapped';

export interface MappingEditorRowContract {
  readonly targetPath: string;
  readonly targetType: string;
  readonly required: boolean;
  readonly status: MappingEditorRowStatus;
  readonly sourceSummary?: string;
  readonly mappingMethodLabel?: string;
  readonly notesPreview?: string;
  readonly sampleOutput?: string;
  readonly suggestion?: AutoMapSuggestion;
}

export interface SuggestExpressionInput {
  readonly mappingId: string;
  readonly instruction: string;
  readonly targetPath: string;
  readonly targetType: string;
  readonly targetDescription?: string;
}

export interface SuggestExpressionValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SuggestExpressionContextMeta {
  readonly sourceNodeCount: number;
  readonly includedNodeCount: number;
  readonly truncated: boolean;
  readonly approxTokenCount: number;
  readonly byteLength: number;
}

export interface SuggestExpressionResult {
  readonly expression: string;
  readonly explanation?: string;
  readonly validation: SuggestExpressionValidationResult;
  readonly readyToApply: boolean;
  readonly context: SuggestExpressionContextMeta;
}

export interface ExplainRuleInput {
  readonly targetPath: string;
  readonly expression: string;
}

export interface ExplainRuleResult {
  readonly explanation: string;
  readonly confidence?: 'high' | 'medium' | 'low';
  readonly limitations?: readonly string[];
}

export interface SmartFixInput {
  readonly mappingId: string;
  readonly ruleIndex: number;
  readonly targetPath: string;
  readonly targetType?: string;
  readonly failingExpression: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly diagnosticScope?: 'all' | 'single';
  readonly selectedDiagnosticIndex?: number;
  readonly ruleVersion?: number;
  readonly ruleHash?: string;
}

export interface SmartFixValidationResult {
  readonly valid: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SmartFixContextMeta {
  readonly truncated: boolean;
  readonly approxTokenCount: number;
  readonly byteLength: number;
  readonly totalDiagnosticCount: number;
  readonly includedDiagnosticCount: number;
  readonly sourceNodeCount: number;
  readonly includedSourceNodeCount: number;
  readonly targetNodeCount: number;
  readonly includedTargetNodeCount: number;
}

export interface SmartFixApplyGuard {
  readonly ruleVersion: number;
  readonly ruleHash: string;
}

export interface SmartFixResult {
  readonly originalExpression: string;
  readonly suggestedExpression: string;
  readonly explanation: string;
  readonly validation: SmartFixValidationResult;
  readonly readyToApply: boolean;
  readonly diagnosticsScopeApplied: 'all' | 'single';
  readonly context: SmartFixContextMeta;
  readonly applyGuard: SmartFixApplyGuard;
}

export type ValidationIssueCategory =
  | 'correctness'
  | 'completeness'
  | 'maintainability'
  | 'risk';

export type ValidationIssueSeverity = 'info' | 'warning' | 'error';

export interface ValidationIssueReference {
  readonly ruleIndex?: number;
  readonly targetPath?: string;
}

export interface ValidationIssue {
  readonly id: string;
  readonly category: ValidationIssueCategory;
  readonly severity: ValidationIssueSeverity;
  readonly affectedRules: readonly ValidationIssueReference[];
  readonly description: string;
  readonly recommendation: string;
}

export interface ValidationSummary {
  readonly totalIssues: number;
  readonly bySeverity: Readonly<Record<ValidationIssueSeverity, number>>;
  readonly byCategory: Readonly<Record<ValidationIssueCategory, number>>;
}

export interface ValidationSampleDataInput {
  readonly contentType: 'application/json' | 'text/json' | 'application/xml' | 'text/xml';
  readonly content: string;
}

export interface ValidateMappingsInput {
  readonly mappingId: string;
  readonly sampleData?: ValidationSampleDataInput;
}

export interface ValidationReport {
  readonly summary: ValidationSummary;
  readonly issues: readonly ValidationIssue[];
  readonly notes?: string;
  readonly meta?: {
    readonly generatedAt?: string;
    readonly model?: string;
    readonly promptId?: string;
  };
}

export interface SchemaSearchResult {
  readonly path: string;
  readonly fieldName: string;
  readonly type: string;
  readonly description?: string;
}

export interface ServerPreviewInput {
  readonly environment: Environment;
  readonly sourceData: Readonly<Record<string, unknown>>;
  readonly externalSources?: Readonly<Record<string, unknown>>;
}

export interface ServerPreviewResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly Diagnostic[];
  readonly metadata: {
    readonly environment: RuntimeEnvironment;
    readonly artifactId: string;
    readonly artifactHash: string;
    readonly deployedAt: ISODateString;
    readonly sourceType: 'revision' | 'version';
    readonly sourceNumber: number;
    readonly engineVersion: string;
  };
}

export interface TestCaseInputSet {
  readonly id: string;
  readonly name: string;
  readonly sourceData: string;
  readonly externalSources: string;
  readonly expectedOutput?: string;
  readonly createdAt: ISODateString;
}

export interface TestCase {
  readonly id: string;
  readonly name: string;
  readonly sourceData: string;
  readonly externalSources?: string;
  readonly expectedOutput?: string;
  readonly inputSets?: readonly TestCaseInputSet[];
  readonly createdAt: ISODateString;
}

export interface TestRunResult {
  readonly testCaseId: string;
  readonly status: 'pass' | 'fail' | 'error';
  readonly errorCount: number;
  readonly warningCount: number;
  readonly executedAt: ISODateString;
  readonly durationMs: number;
  readonly outputSnapshot?: unknown;
}

export type ComparisonMode =
  | 'current-vs-saved'
  | 'current-vs-dev'
  | 'current-vs-preprod'
  | 'dev-vs-preprod'
  | 'preprod-vs-prod';

export interface ComparisonSideMetadata {
  readonly executionContext: 'client' | 'server';
  readonly environment?: Environment;
  readonly configVersion: number;
  readonly deployedAt?: ISODateString;
  readonly sourceType?: 'revision' | 'version';
  readonly sourceNumber?: number;
  readonly artifactId?: string;
  readonly artifactHash?: string;
  readonly engineVersion: string;
  readonly savedAt?: ISODateString;
  readonly hasUnsavedChanges?: boolean;
}

export interface ComparisonSideResult {
  readonly label: string;
  readonly output: Readonly<Record<string, unknown>> | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly metadata: ComparisonSideMetadata;
  readonly status: 'idle' | 'executing' | 'success' | 'error';
  readonly error?: string;
}

export interface ComparisonState {
  readonly mode: ComparisonMode;
  readonly left: ComparisonSideResult;
  readonly right: ComparisonSideResult;
  readonly diffEntries: readonly DiffEntry[] | null;
  readonly overallStatus: 'idle' | 'executing' | 'complete' | 'partial-error';
}

export interface ComparisonSnapshot {
  readonly id: string;
  readonly testCaseId: string;
  readonly mappingId: string;
  readonly mode: ComparisonMode;
  readonly leftResult: ComparisonSideResult;
  readonly rightResult: ComparisonSideResult;
  readonly diffEntries: readonly DiffEntry[];
  readonly capturedAt: ISODateString;
}

export interface PreviewContextValue {
  readonly sourceData: unknown | null;
  readonly isExecuting: boolean;
  readonly lastResult: ExecutionResult | null;
}

export type PreviewExecutionState =
  | { readonly status: 'idle' }
  | { readonly status: 'executing' }
  | { readonly status: 'success'; readonly result: ExecutionResult }
  | { readonly status: 'error'; readonly error: string }
  | { readonly status: 'timeout' };

// ---------------------------------------------------------------------------
// Schema Tree Types (FS-009)
// ---------------------------------------------------------------------------

export type SchemaNodeType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'enum'
  | 'null'
  | 'any'
  | 'union';

export type MappingNodeStatus = 'mapped' | 'unmapped' | 'warning';

export interface SchemaTreeNode {
  path: string;
  fieldName: string;
  type: SchemaNodeType;
  description?: string;
  depth: number;
  isArray: boolean;
  isRequired: boolean;
  parentPath: string | null;
  childCount: number;
  children: SchemaTreeNode[];
  enumValues?: string[];
  inferred?: boolean;
  unionTypes?: string[];
  minOccurs?: number;
  maxOccurs?: number | 'unbounded';
}

export interface ParsedSchema {
  readonly nodes: SchemaTreeNode[];
  readonly totalFieldCount: number;
  readonly format: SchemaFormat;
  readonly parseTimeMs: number;
  readonly inferred: boolean;
}
