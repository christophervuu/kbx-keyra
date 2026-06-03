import type { ExecutionResult } from '@keyra/engine';

import type { DiffEntry } from './diff';

export type ISODateString = string;

export type Environment = 'DEV' | 'QA' | 'PROD';

export type DeployStatus = 'deployed' | 'stale' | 'not-deployed' | 'deploying';

export type SchemaFormat = 'json-schema' | 'xsd';

export type SchemaOrigin = 'cdm' | 'published' | 'local';

export type SchemaIngestStatus = 'ingesting' | 'ready' | 'error';

export type SchemaScope = 'global' | 'project';

export type SchemaSyncStatus = 'synced' | 'not-synced' | 'local-changes';

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

export interface MappingConfigOptions {
  readonly unmappedTargets?: 'omit' | 'null' | 'error';
  readonly nullSubtrees?: readonly string[];
  readonly constants?: Readonly<Record<string, unknown>>;
  readonly externalSources?: readonly string[];
}

export interface MappingConfig {
  readonly id?: string;
  readonly projectId?: string;
  readonly name: string;
  readonly version: number;
  readonly engineVersion: string;
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
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
  readonly version: number;
  readonly status: MappingStatus;
  readonly sourceSchemaId?: string;
  readonly targetSchemaId?: string;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly updatedAt: ISODateString;
}

export interface GitHubSourceInfo {
  readonly type: 'github';
  readonly repo: string;
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
  readonly fieldCount: number;
  readonly origin: SchemaOrigin;
  readonly status: SchemaIngestStatus;
  readonly scope: SchemaScope;
  readonly description?: string;
  readonly updatedBy?: string;
  readonly inferred?: boolean;
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
  readonly schemaRefs?: readonly SchemaRef[];
  readonly tags?: readonly string[];
}

export interface UpdateProjectInput {
  readonly name?: string;
  readonly description?: string;
  readonly slug?: string;
  readonly schemaRefs?: readonly SchemaRef[];
  readonly tags?: readonly string[];
}

export interface CreateMappingInput {
  readonly projectId: string;
  readonly name: string;
  readonly sourceSchemaRef?: SchemaRef;
  readonly targetSchemaRef?: SchemaRef;
  readonly config?: MappingConfigOptions;
  readonly rules?: readonly MappingRule[];
}

export interface CreateSchemaInput {
  readonly name: string;
  readonly format: SchemaFormat;
  readonly origin: SchemaOrigin;
  readonly content: Readonly<Record<string, unknown>> | string;
  readonly source?: SchemaSourceInfo;
  readonly scope?: SchemaScope;
  readonly description?: string;
  readonly inferred?: boolean;
  readonly syncStatus?: SchemaSyncStatus;
}

export interface UpdateSchemaInput {
  readonly name?: string;
  readonly description?: string;
  readonly scope?: SchemaScope;
  readonly content?: Readonly<Record<string, unknown>> | string;
  readonly fieldCount?: number;
  readonly format?: SchemaFormat;
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
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
  readonly name?: string;
}

export interface SchemaSyncResult {
  readonly schemaId: string;
  readonly synced: boolean;
  readonly commitSha?: string;
  readonly message?: string;
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
}

export interface ServerPreviewResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly Diagnostic[];
  readonly metadata: {
    readonly environment: Environment;
    readonly snapshotVersion: number;
    readonly deployedAt: ISODateString;
    readonly engineVersion: string;
  };
}

export interface TestCase {
  readonly id: string;
  readonly name: string;
  readonly sourceData: string;
  readonly expectedOutput?: string;
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
  | 'current-vs-qa'
  | 'dev-vs-qa'
  | 'qa-vs-prod';

export interface ComparisonSideMetadata {
  readonly executionContext: 'client' | 'server';
  readonly environment?: Environment;
  readonly configVersion: number;
  readonly snapshotVersion?: number;
  readonly deployedAt?: ISODateString;
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
