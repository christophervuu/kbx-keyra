import type { ISODateString } from './types.js';

export type AutoMapSessionStatus = 'open' | 'generating' | 'reviewing' | 'resolved' | 'superseded' | 'expired';

export type AutoMapRunStatus =
  | 'queued'
  | 'preparing'
  | 'retrieving'
  | 'generating'
  | 'validating'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'superseded';

export type AutoMapWorkUnitStatus =
  | 'queued'
  | 'retrieving'
  | 'generating'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'superseded';

export type AutoMapScopeMode = 'whole' | 'visible' | 'section' | 'selected' | 'refresh' | 'retry-failed';

export type SuggestionReviewStatus =
  | 'pending'
  | 'editing'
  | 'accepted'
  | 'accepted-edited'
  | 'dismissed'
  | 'kept-current'
  | 'stale'
  | 'conflict';

export type SuggestionValidationState = 'ready' | 'warning' | 'invalid';

export interface SuggestionSourceReference {
  readonly inputId: string;
  readonly inputType: 'primary' | 'enrichment';
  readonly path: string;
  readonly displayName?: string;
}

export interface AutoMapGenerationFingerprint {
  readonly sourceSchema: { readonly id: string; readonly version: string };
  readonly targetSchema: { readonly id: string; readonly version: string };
  readonly enrichmentSchemas: readonly {
    readonly inputId: string;
    readonly schemaId: string;
    readonly version: string;
  }[];
  readonly engineVersion: string;
  readonly dslVersion: string;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly model: string;
}

export interface AutoMapRequestFingerprintInput {
  readonly mappingId: string;
  readonly baseMappingRevision: number;
  readonly sourceSchemaVersion: string;
  readonly targetSchemaVersion: string;
  readonly enrichmentSchemaVersions: readonly { readonly inputId: string; readonly version: string }[];
  readonly scopeMode: AutoMapScopeMode;
  readonly sectionPath?: string;
  readonly targetPaths?: readonly string[];
  readonly promptVersion: string;
  readonly model: string;
}

export interface AutoMapSessionItem {
  readonly PK: string;
  readonly SK: 'META';
  readonly entityType: 'AutoMapSession';
  readonly sessionId: string;
  readonly mappingId: string;
  readonly projectId: string;
  readonly status: AutoMapSessionStatus;
  readonly baseMappingRevision: number;
  readonly generationFingerprint: AutoMapGenerationFingerprint;
  readonly reviewCounts: {
    readonly pending: number;
    readonly editing: number;
    readonly accepted: number;
    readonly acceptedEdited: number;
    readonly dismissed: number;
    readonly keptCurrent: number;
    readonly stale: number;
    readonly conflict: number;
    readonly invalid: number;
  };
  readonly lastRunId?: string;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly completedAt?: ISODateString;
  readonly expiresAt?: number;
  readonly GSI1PK: string;
  readonly GSI1SK: string;
  readonly GSI2PK?: string;
  readonly GSI2SK?: string;
}

export interface AutoMapRunItem {
  readonly PK: string;
  readonly SK: string;
  readonly entityType: 'AutoMapRun';
  readonly sessionId: string;
  readonly runId: string;
  readonly status: AutoMapRunStatus;
  readonly scope: {
    readonly mode: AutoMapScopeMode;
    readonly sectionPath?: string;
    readonly targetPaths?: readonly string[];
    readonly refreshOfRunId?: string;
    readonly retryWorkUnitIds?: readonly string[];
  };
  readonly requestFingerprint: string;
  readonly idempotencyKey: string;
  readonly progress: {
    readonly completedWorkUnits: number;
    readonly totalWorkUnits: number;
    readonly completedTargets: number;
    readonly totalTargets: number;
  };
  readonly counts: {
    readonly generated: number;
    readonly ready: number;
    readonly warning: number;
    readonly invalid: number;
    readonly failedTargets: number;
  };
  readonly failure?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
  readonly startedAt?: ISODateString;
  readonly completedAt?: ISODateString;
}

export interface AutoMapWorkUnitItem {
  readonly PK: string;
  readonly SK: string;
  readonly entityType: 'AutoMapWorkUnit';
  readonly sessionId: string;
  readonly runId: string;
  readonly workUnitId: string;
  readonly order: number;
  readonly status: AutoMapWorkUnitStatus;
  readonly targetPaths?: readonly string[];
  readonly contextPaths?: readonly string[];
  readonly generatedSuggestions?: number;
  readonly failedTargets?: number;
  readonly outcome?: 'suggestions' | 'no-suggestions' | 'failed';
  readonly failure?: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly startedAt?: ISODateString;
  readonly completedAt?: ISODateString;
  readonly updatedAt?: ISODateString;
}

export interface AutoMapSuggestionItem {
  readonly PK: string;
  readonly SK: string;
  readonly entityType: 'AutoMapSuggestion';
  readonly sessionId: string;
  readonly runId?: string;
  readonly workUnitId?: string;
  readonly suggestionId: string;
  readonly sectionOrder: number;
  readonly targetOrder: number;
  readonly sectionPath: string;
  readonly targetPath: string;
  readonly reviewStatus: SuggestionReviewStatus;
  readonly validationState: SuggestionValidationState;
  readonly sourceReferences: readonly SuggestionSourceReference[];
  readonly version: number;
  readonly acceptedExpression?: string;
  readonly priorExpressionAtAcceptance?: string | null;
  readonly acceptedAtMappingRevision?: number;
  readonly materializedMappingRevision?: number;
  readonly materializedAt?: ISODateString;
}

const SESSION_TRANSITIONS: Readonly<Record<AutoMapSessionStatus, readonly AutoMapSessionStatus[]>> = {
  open: ['generating', 'reviewing', 'resolved', 'superseded', 'expired'],
  generating: ['reviewing', 'resolved', 'superseded', 'expired'],
  reviewing: ['generating', 'resolved', 'superseded', 'expired'],
  resolved: ['superseded', 'expired'],
  superseded: ['expired'],
  expired: [],
};

const RUN_TRANSITIONS: Readonly<Record<AutoMapRunStatus, readonly AutoMapRunStatus[]>> = {
  queued: ['preparing', 'failed', 'superseded'],
  preparing: ['retrieving', 'generating', 'failed', 'superseded'],
  retrieving: ['generating', 'failed', 'superseded'],
  generating: ['validating', 'failed', 'superseded'],
  validating: ['completed', 'partial', 'failed', 'superseded'],
  completed: [],
  partial: [],
  failed: [],
  superseded: [],
};

const WORK_UNIT_TRANSITIONS: Readonly<Record<AutoMapWorkUnitStatus, readonly AutoMapWorkUnitStatus[]>> = {
  queued: ['retrieving', 'failed', 'superseded'],
  retrieving: ['generating', 'failed', 'superseded'],
  generating: ['validating', 'failed', 'superseded'],
  validating: ['completed', 'failed', 'superseded'],
  completed: [],
  failed: [],
  superseded: [],
};

const SUGGESTION_TRANSITIONS: Readonly<Record<SuggestionReviewStatus, readonly SuggestionReviewStatus[]>> = {
  pending: ['editing', 'accepted', 'dismissed', 'kept-current', 'stale'],
  editing: ['pending', 'accepted-edited'],
  accepted: ['pending', 'stale', 'conflict'],
  'accepted-edited': ['editing', 'pending', 'stale', 'conflict'],
  dismissed: ['pending', 'stale'],
  'kept-current': ['pending', 'stale'],
  stale: ['editing', 'dismissed', 'pending', 'conflict'],
  conflict: ['editing', 'dismissed', 'pending', 'stale'],
};

function formatOrder(value: number, width: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Order must be a non-negative integer. Received: ${value}`);
  }

  return String(value).padStart(width, '0');
}

function stableSortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSortDeep(entry));
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableSortDeep(nested)] as const);

    return Object.fromEntries(entries);
  }

  return value;
}

export function sessionPk(sessionId: string): string {
  return `SESSION#${sessionId}`;
}

export function sessionMetaSk(): 'META' {
  return 'META';
}

export function runSk(createdAt: ISODateString, runId: string): string {
  return `RUN#${createdAt}#${runId}`;
}

export function workUnitSk(runId: string, order: number, workUnitId: string): string {
  return `WORK_UNIT#${runId}#${formatOrder(order, 6)}#${workUnitId}`;
}

export function suggestionSk(sectionOrder: number, targetOrder: number, suggestionId: string): string {
  return `SUGGESTION#${formatOrder(sectionOrder, 6)}#${formatOrder(targetOrder, 6)}#${suggestionId}`;
}

export function mappingHistoryGsiPk(mappingId: string): string {
  return `MAPPING#${mappingId}`;
}

export function mappingHistoryGsiSk(createdAt: ISODateString, sessionId: string): string {
  return `CREATED#${createdAt}#${sessionId}`;
}

export function openSessionGsiPk(mappingId: string): string {
  return `MAPPING#${mappingId}`;
}

export function openSessionGsiSk(updatedAt: ISODateString, sessionId: string): string {
  return `OPEN#${updatedAt}#${sessionId}`;
}

export function buildHistoryIndexAttributes(mappingId: string, createdAt: ISODateString, sessionId: string): {
  readonly GSI1PK: string;
  readonly GSI1SK: string;
} {
  return {
    GSI1PK: mappingHistoryGsiPk(mappingId),
    GSI1SK: mappingHistoryGsiSk(createdAt, sessionId),
  };
}

export function buildOpenSessionIndexAttributes(mappingId: string, updatedAt: ISODateString, sessionId: string): {
  readonly GSI2PK: string;
  readonly GSI2SK: string;
} {
  return {
    GSI2PK: openSessionGsiPk(mappingId),
    GSI2SK: openSessionGsiSk(updatedAt, sessionId),
  };
}

export function canTransitionSessionStatus(from: AutoMapSessionStatus, to: AutoMapSessionStatus): boolean {
  return from === to || SESSION_TRANSITIONS[from].includes(to);
}

export function canTransitionRunStatus(from: AutoMapRunStatus, to: AutoMapRunStatus): boolean {
  return from === to || RUN_TRANSITIONS[from].includes(to);
}

export function canTransitionWorkUnitStatus(from: AutoMapWorkUnitStatus, to: AutoMapWorkUnitStatus): boolean {
  return from === to || WORK_UNIT_TRANSITIONS[from].includes(to);
}

export function canTransitionSuggestionReviewStatus(from: SuggestionReviewStatus, to: SuggestionReviewStatus): boolean {
  return from === to || SUGGESTION_TRANSITIONS[from].includes(to);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function digestToHex(digest: ArrayBuffer): string {
  return toHex(new Uint8Array(digest));
}

export async function createRequestFingerprint(input: AutoMapRequestFingerprintInput): Promise<string> {
  const canonical = stableSortDeep({
    ...input,
    targetPaths: [...(input.targetPaths ?? [])],
    enrichmentSchemaVersions: [...input.enrichmentSchemaVersions].sort((left, right) =>
      left.inputId.localeCompare(right.inputId),
    ),
  });

  const encoder = new TextEncoder();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(canonical)));
  return digestToHex(digest);
}

export function nextSuggestionVersion(currentVersion: number): number {
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error(`currentVersion must be a non-negative integer. Received: ${currentVersion}`);
  }

  return currentVersion + 1;
}

export function assertExpectedSuggestionVersion(currentVersion: number, expectedVersion: number): void {
  if (!Number.isInteger(currentVersion) || !Number.isInteger(expectedVersion)) {
    throw new Error('Suggestion versions must be integers.');
  }

  if (currentVersion !== expectedVersion) {
    throw new Error(
      `Suggestion version mismatch. currentVersion=${currentVersion}, expectedVersion=${expectedVersion}`,
    );
  }
}

export function buildInsertIfAbsentConditionExpression(): {
  readonly ConditionExpression: string;
} {
  return {
    ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
  };
}

export function buildSessionNotSupersededCondition(statusAttributeName: string = 'status'): {
  readonly ConditionExpression: string;
  readonly ExpressionAttributeNames: Readonly<Record<string, string>>;
  readonly ExpressionAttributeValues: Readonly<Record<string, AutoMapSessionStatus>>;
} {
  return {
    ConditionExpression: '#sessionStatus <> :superseded',
    ExpressionAttributeNames: {
      '#sessionStatus': statusAttributeName,
    },
    ExpressionAttributeValues: {
      ':superseded': 'superseded',
    },
  };
}

export function buildRunNotSupersededCondition(
  runStatusAttributeName: string = 'status',
  sessionStatusAttributeName: string = 'sessionStatus',
): {
  readonly ConditionExpression: string;
  readonly ExpressionAttributeNames: Readonly<Record<string, string>>;
  readonly ExpressionAttributeValues: Readonly<Record<string, AutoMapRunStatus | AutoMapSessionStatus>>;
} {
  return {
    ConditionExpression: '#runStatus <> :runSuperseded AND #sessionStatus <> :sessionSuperseded',
    ExpressionAttributeNames: {
      '#runStatus': runStatusAttributeName,
      '#sessionStatus': sessionStatusAttributeName,
    },
    ExpressionAttributeValues: {
      ':runSuperseded': 'superseded',
      ':sessionSuperseded': 'superseded',
    },
  };
}

export function buildSuggestionExpectedVersionCondition(expectedVersion: number): {
  readonly ConditionExpression: string;
  readonly ExpressionAttributeNames: Readonly<Record<string, string>>;
  readonly ExpressionAttributeValues: Readonly<Record<string, number>>;
} {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error(`expectedVersion must be a non-negative integer. Received: ${expectedVersion}`);
  }

  return {
    ConditionExpression: '#version = :expectedVersion',
    ExpressionAttributeNames: {
      '#version': 'version',
    },
    ExpressionAttributeValues: {
      ':expectedVersion': expectedVersion,
    },
  };
}

export const autoMapTransitions = {
  session: SESSION_TRANSITIONS,
  run: RUN_TRANSITIONS,
  workUnit: WORK_UNIT_TRANSITIONS,
  suggestion: SUGGESTION_TRANSITIONS,
} as const;
