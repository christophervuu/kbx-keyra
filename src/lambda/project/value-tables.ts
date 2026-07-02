import { computeConfigHash } from '../../lib/persistence/hash.js';
import {
  conflict,
  deleteItem,
  DynamoServiceError,
  S3ServiceError,
  errorResponse,
  generateRequestId,
  getItem,
  getObject,
  internalError,
  jsonResponse,
  notFound,
  parseBody,
  parsePathParam,
  parseQueryParam,
  putItem,
  putObject,
  query,
  scan,
  updateItem,
  validationError,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

type ValueTableValueType = 'string' | 'number' | 'boolean';
type ValueTablePrimitiveValue = string | number | boolean;
type ValueTableStatus = 'active' | 'archived';

interface ValueTableSideDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: ValueTableValueType;
}

interface ProjectValueTable {
  readonly id: string;
  readonly projectId: string;
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly sideA: ValueTableSideDefinition;
  readonly sideB: ValueTableSideDefinition;
  readonly currentRevision: number;
  readonly status: ValueTableStatus;
  readonly createdAt: string;
  readonly createdBy?: string;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

interface ProjectValueTableRevisionRow {
  readonly id: string;
  readonly sideAValue: ValueTablePrimitiveValue;
  readonly sideBValue: ValueTablePrimitiveValue;
  readonly description?: string;
}

interface ValueTableDirectionSupport {
  readonly aToB: boolean;
  readonly bToA: boolean;
}

interface ProjectValueTableRevision {
  readonly valueTableId: string;
  readonly revision: number;
  readonly sideA: ValueTableSideDefinition;
  readonly sideB: ValueTableSideDefinition;
  readonly rows: readonly ProjectValueTableRevisionRow[];
  readonly rowCount: number;
  readonly directionSupport: ValueTableDirectionSupport;
  readonly contentHash?: string;
  readonly rowsS3Key?: string;
  readonly createdAt: string;
  readonly createdBy?: string;
}

interface ValueTableResolvedEntry {
  readonly in: ValueTablePrimitiveValue;
  readonly out: ValueTablePrimitiveValue;
  readonly rowId: string;
}

interface MappingRuleProjectValueTableRef {
  readonly scope: 'project';
  readonly valueTableId: string;
  readonly tableKey: string;
  readonly revision: number;
  readonly inputSideKey: string;
  readonly outputSideKey: string;
  readonly inputType: ValueTableValueType;
  readonly outputType: ValueTableValueType;
  readonly resolvedEntries: readonly ValueTableResolvedEntry[];
  readonly sourceMeta?: {
    readonly tableName?: string;
    readonly revisionCreatedAt?: string;
  };
}

interface ValueTableUsageEntry {
  readonly valueTableId: string;
  readonly tableKey: string;
  readonly mappingId: string;
  readonly mappingName?: string;
  readonly mappingVersion?: number;
  readonly pinnedRevision: number;
  readonly direction: 'a_to_b' | 'b_to_a';
  readonly inputSideKey: string;
  readonly outputSideKey: string;
  readonly newerRevisionAvailable: boolean;
  readonly latestRevision: number;
  readonly latestDirectionSupported?: boolean;
  readonly updatedAt?: string;
}

interface ValueTableDiffChange {
  readonly changeType: 'added' | 'removed' | 'changed' | 'unchanged';
  readonly rowId?: string;
  readonly before?: ProjectValueTableRevisionRow;
  readonly after?: ProjectValueTableRevisionRow;
}

interface ValueTableDiffPage {
  readonly summary: {
    readonly valueTableId: string;
    readonly tableKey: string;
    readonly fromRevision: number;
    readonly toRevision: number;
    readonly counts: {
      readonly added: number;
      readonly removed: number;
      readonly changed: number;
      readonly unchanged: number;
    };
    readonly directionImpact: {
      readonly previous: ValueTableDirectionSupport;
      readonly next: ValueTableDirectionSupport;
    };
  };
  readonly changes: readonly ValueTableDiffChange[];
  readonly pageSize: number;
  readonly nextCursor?: string;
}

interface ValueTableItem {
  readonly valueTableId: string;
  readonly projectId?: string;
  readonly scope?: 'project' | 'global';
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly sideA: ValueTableSideDefinition;
  readonly sideB: ValueTableSideDefinition;
  readonly defaultMatchMode?: 'exact' | 'ignore-case';
  readonly currentRevision: number;
  readonly currentRowCount: number;
  readonly status: ValueTableStatus;
  readonly createdAt: string;
  readonly createdBy?: string;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

interface ValueTableRevisionItem {
  readonly valueTableId: string;
  readonly revision: number;
  readonly sideA: ValueTableSideDefinition;
  readonly sideB: ValueTableSideDefinition;
  readonly rowCount: number;
  readonly directionSupport: ValueTableDirectionSupport;
  readonly rowsS3Key: string;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly createdBy?: string;
}

interface MappingItem {
  readonly mappingId: string;
  readonly name: string;
  readonly revision?: number;
  readonly version?: number;
  readonly updatedAt?: string;
  readonly configS3Key?: string;
}

interface MappingConfigRule {
  readonly target?: string;
  readonly valueTableRef?: {
    readonly scope?: string;
    readonly valueTableId?: string;
    readonly revision?: number;
    readonly inputSideKey?: string;
    readonly outputSideKey?: string;
    readonly matchMode?: 'exact' | 'ignore-case';
  };
  readonly noMatchBehavior?: {
    readonly mode?: 'return_null' | 'return_input' | 'fallback_value';
    readonly fallbackValue?: ValueTablePrimitiveValue;
  };
}

interface MappingConfig {
  readonly rules?: readonly MappingConfigRule[];
}

type ValueMapDependencyState = 'current' | 'needs-review' | 'invalid';
type ValueMapOverlayOperationType = 'override' | 'add' | 'exclude';

interface ValueMapOverlayOperation {
  readonly operationId: string;
  readonly type: ValueMapOverlayOperationType;
  readonly targetRowId?: string;
  readonly row?: ProjectValueTableRevisionRow;
}

interface ValueMapProjectLinkItem {
  readonly valueTableId: string;
  readonly revision: number;
  readonly entityType: 'value-map-project-link';
  readonly projectId: string;
  readonly globalValueMapId: string;
  readonly pinnedRevision: number;
  readonly overlayRevision: number;
  readonly dependencyState: ValueMapDependencyState;
  readonly updateAvailable: boolean;
  readonly createdAt: string;
  readonly createdBy?: string;
  readonly updatedAt: string;
  readonly updatedBy?: string;
}

interface ValueMapOverlayRevisionItem {
  readonly valueTableId: string;
  readonly revision: number;
  readonly entityType: 'value-map-overlay-revision';
  readonly operationCount: number;
  readonly operations: readonly ValueMapOverlayOperation[];
  readonly contentHash: string;
  readonly createdAt: string;
  readonly createdBy?: string;
}

interface ProjectValueMapLinkSummary {
  readonly projectId: string;
  readonly valueMapId: string;
  readonly key: string;
  readonly name: string;
  readonly pinnedRevision: number;
  readonly latestRevision: number;
  readonly overlayRevision: number;
  readonly updateAvailable: boolean;
  readonly dependencyState: ValueMapDependencyState;
  readonly status: ValueTableStatus;
}

interface ProjectValueMapEffectiveRow {
  readonly rowId: string;
  readonly sideAValue: ValueTablePrimitiveValue;
  readonly sideBValue: ValueTablePrimitiveValue;
  readonly description?: string;
  readonly provenance: 'inherited' | 'override' | 'add';
}

interface ProjectValueMapDetail {
  readonly projectId: string;
  readonly valueMapId: string;
  readonly key: string;
  readonly name: string;
  readonly pinnedRevision: number;
  readonly latestRevision: number;
  readonly overlayRevision: number;
  readonly updateAvailable: boolean;
  readonly dependencyState: ValueMapDependencyState;
  readonly effectiveRows: readonly ProjectValueMapEffectiveRow[];
}

interface CreateProjectValueTableInput {
  readonly projectId: string;
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly sideA: ValueTableSideDefinition;
  readonly sideB: ValueTableSideDefinition;
  readonly rows: readonly ProjectValueTableRevisionRow[];
}

interface CreateProjectValueTableRevisionInput {
  readonly sideA: ValueTableSideDefinition;
  readonly sideB: ValueTableSideDefinition;
  readonly rows: readonly ProjectValueTableRevisionRow[];
}

interface DuplicateProjectValueTableInput {
  readonly projectId: string;
  readonly name: string;
  readonly key?: string;
  readonly sourceProjectId?: string;
  readonly mode?: 'detached-copy' | 'preserve-link';
}

interface PromoteProjectValueMapInput {
  readonly key?: string;
  readonly name?: string;
  readonly description?: string;
  readonly relink?: boolean;
}

interface ResolveProjectValueTableReferenceInput {
  readonly projectId: string;
  readonly valueTableId?: string;
  readonly tableKey: string;
  readonly revision: number;
  readonly inputSideKey: string;
  readonly outputSideKey: string;
}

interface LinkProjectValueMapInput {
  readonly valueMapId: string;
  readonly revision: number;
}

interface UpdateProjectValueMapOverlayInput {
  readonly operations: readonly ValueMapOverlayOperation[];
  readonly expectedOverlayRevision?: number;
}

interface ReviewProjectValueMapUpdateInput {
  readonly candidateRevision?: number;
}

interface AcceptProjectValueMapUpdateInput {
  readonly candidateRevision: number;
  readonly resolveOrphansAsExcludes?: readonly string[];
}

interface PortableValueMapRuleBinding {
  readonly mappingId: string;
  readonly mappingName?: string;
  readonly mappingRevision?: number;
  readonly ruleIndex: number;
  readonly target?: string;
  readonly pinnedRevision: number;
  readonly inputSideKey: string;
  readonly outputSideKey: string;
  readonly matchMode: 'exact' | 'ignore-case';
  readonly noMatchBehaviorMode?: 'return_null' | 'return_input' | 'fallback_value';
  readonly fallbackValue?: ValueTablePrimitiveValue;
}

interface PortableValueMapExportPayload {
  readonly format: 'value-map-portable-v1';
  readonly exportedAt: string;
  readonly projectId?: string;
  readonly valueMap: {
    readonly valueMapId: string;
    readonly key: string;
    readonly name: string;
    readonly description?: string;
    readonly sideA: ValueTableSideDefinition;
    readonly sideB: ValueTableSideDefinition;
    readonly defaultMatchMode?: 'exact' | 'ignore-case';
    readonly scope: 'project' | 'global';
    readonly sourceProjectId?: string;
    readonly pinnedGlobal?: {
      readonly valueMapId: string;
      readonly revision: number;
      readonly key: string;
      readonly name: string;
    };
    readonly overlayRevision: number;
    readonly overlayOperations: readonly ValueMapOverlayOperation[];
    readonly effectiveRows: readonly ProjectValueTableRevisionRow[];
  };
  readonly usageBindings: readonly PortableValueMapRuleBinding[];
}

interface ImportPortableValueMapResolution {
  readonly action: 'project-copy' | 'choose-global' | 'cancel';
  readonly selectedValueMapId?: string;
  readonly selectedRevision?: number;
}

function getEnvValue(key: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[key];
}

const VALUE_TABLES_TABLE = getEnvValue('VALUE_TABLES_TABLE');
const VALUE_TABLE_REVISIONS_TABLE = getEnvValue('VALUE_TABLE_REVISIONS_TABLE');
const MAPPINGS_TABLE = getEnvValue('MAPPINGS_TABLE');
const CONTENT_BUCKET = getEnvValue('CONTENT_BUCKET');

function getValueTablesTableOrThrow(): string {
  const table = VALUE_TABLES_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: VALUE_TABLES_TABLE');
  }

  return table;
}

function getValueTableRevisionsTableOrThrow(): string {
  const table = VALUE_TABLE_REVISIONS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: VALUE_TABLE_REVISIONS_TABLE');
  }

  return table;
}

function getMappingsTableOrThrow(): string {
  const table = MAPPINGS_TABLE?.trim();
  if (!table) {
    throw new Error('Missing required environment variable: MAPPINGS_TABLE');
  }

  return table;
}

function getContentBucketOrThrow(): string {
  const bucket = CONTENT_BUCKET?.trim();
  if (!bucket) {
    throw new Error('Missing required environment variable: CONTENT_BUCKET');
  }

  return bucket;
}

function parseProjectIdFromEvent(event: APIGatewayProxyEvent): string | null {
  return parsePathParam(event, 'projectId') ?? parsePathParam(event, 'id');
}

function nowIso(): string {
  return new Date().toISOString();
}

function toProjectValueTable(item: ValueTableItem): ProjectValueTable {
  return {
    id: item.valueTableId,
    projectId: item.projectId ?? '',
    key: item.key,
    name: item.name,
    ...(item.description ? { description: item.description } : {}),
    sideA: item.sideA,
    sideB: item.sideB,
    currentRevision: item.currentRevision,
    status: item.status,
    createdAt: item.createdAt,
    ...(item.createdBy ? { createdBy: item.createdBy } : {}),
    updatedAt: item.updatedAt,
    ...(item.updatedBy ? { updatedBy: item.updatedBy } : {}),
  };
}

function isGlobalValueMap(item: ValueTableItem): boolean {
  return item.scope === 'global';
}

function projectLinkSk(projectId: string, valueMapId: string): string {
  return `link#${projectId}#${valueMapId}`;
}

function parseProjectLinkSk(sk: string): { projectId: string; valueMapId: string } | null {
  const parts = sk.split('#');
  if (parts.length !== 3 || parts[0] !== 'link') {
    return null;
  }

  const projectId = parts[1];
  const valueMapId = parts[2];
  if (!projectId || !valueMapId) {
    return null;
  }

  return { projectId, valueMapId };
}

function isProjectLinkItem(item: unknown): item is ValueMapProjectLinkItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as Partial<ValueMapProjectLinkItem>;
  return candidate.entityType === 'value-map-project-link'
    && typeof candidate.projectId === 'string'
    && typeof candidate.globalValueMapId === 'string';
}

function isOverlayRevisionItem(item: unknown): item is ValueMapOverlayRevisionItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as Partial<ValueMapOverlayRevisionItem>;
  return candidate.entityType === 'value-map-overlay-revision'
    && Array.isArray(candidate.operations);
}

function rowsS3Key(valueTableId: string, revision: number): string {
  return `value-tables/${valueTableId}/revisions/r${revision}.json`;
}

function isPrimitiveValue(value: unknown): value is ValueTablePrimitiveValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function normalizeRows(rows: readonly ProjectValueTableRevisionRow[]): readonly ProjectValueTableRevisionRow[] {
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      id: typeof row.id === 'string' && row.id.trim().length > 0 ? row.id : crypto.randomUUID(),
      sideAValue: row.sideAValue,
      sideBValue: row.sideBValue,
      ...(typeof row.description === 'string' && row.description.trim().length > 0
        ? { description: row.description.trim() }
        : {}),
    }))
    .filter((row) => isPrimitiveValue(row.sideAValue) && isPrimitiveValue(row.sideBValue));
}

function computeDirectionSupport(rows: readonly ProjectValueTableRevisionRow[]): ValueTableDirectionSupport {
  const aValues = new Set<ValueTablePrimitiveValue>();
  const bValues = new Set<ValueTablePrimitiveValue>();
  let aToB = true;
  let bToA = true;

  for (const row of rows) {
    if (aValues.has(row.sideAValue)) {
      aToB = false;
    }

    if (bValues.has(row.sideBValue)) {
      bToA = false;
    }

    aValues.add(row.sideAValue);
    bValues.add(row.sideBValue);
  }

  return { aToB, bToA };
}

async function computeRevisionHash(payload: {
  readonly sideA: ValueTableSideDefinition;
  readonly sideB: ValueTableSideDefinition;
  readonly rows: readonly ProjectValueTableRevisionRow[];
}): Promise<string> {
  return computeConfigHash({
    name: 'value-table-hash',
    version: 1,
    engineVersion: '2.0.0',
    config: {},
    rules: [],
    ...payload,
  } as never);
}

async function getValueTable(valueTableId: string): Promise<ValueTableItem | null> {
  return getItem<ValueTableItem>({
    TableName: getValueTablesTableOrThrow(),
    Key: { valueTableId },
  });
}

async function getValueTableRevisionItem(
  valueTableId: string,
  revision: number,
): Promise<ValueTableRevisionItem | null> {
  return getItem<ValueTableRevisionItem>({
    TableName: getValueTableRevisionsTableOrThrow(),
    Key: {
      valueTableId,
      revision,
    },
  });
}

async function getValueTableRevision(
  valueTableId: string,
  revision: number,
): Promise<ProjectValueTableRevision | null> {
  const item = await getValueTableRevisionItem(valueTableId, revision);
  if (!item) {
    return null;
  }

  const rawRows = await getObject({
    Bucket: getContentBucketOrThrow(),
    Key: item.rowsS3Key,
  });

  const parsed = JSON.parse(rawRows) as { rows?: ProjectValueTableRevisionRow[] };
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

  return {
    valueTableId: item.valueTableId,
    revision: item.revision,
    sideA: item.sideA,
    sideB: item.sideB,
    rows,
    rowCount: item.rowCount,
    directionSupport: item.directionSupport,
    contentHash: item.contentHash,
    rowsS3Key: item.rowsS3Key,
    createdAt: item.createdAt,
    ...(item.createdBy ? { createdBy: item.createdBy } : {}),
  };
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function parseCursor(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    return 0;
  }

  return parsed;
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseType(value: string): ValueTableValueType | null {
  if (value === 'string' || value === 'number' || value === 'boolean') {
    return value;
  }

  return null;
}

function normalizeMatchMode(matchMode: unknown): 'exact' | 'ignore-case' {
  return matchMode === 'ignore-case' ? 'ignore-case' : 'exact';
}

function toRowsFromEffectiveRows(rows: readonly ProjectValueMapEffectiveRow[]): readonly ProjectValueTableRevisionRow[] {
  return rows.map((row) => ({
    id: row.rowId,
    sideAValue: row.sideAValue,
    sideBValue: row.sideBValue,
    ...(row.description ? { description: row.description } : {}),
  }));
}

function parseBooleanQuery(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parsePortableExportPayload(raw: unknown): PortableValueMapExportPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<PortableValueMapExportPayload>;
  if (candidate.format !== 'value-map-portable-v1') {
    return null;
  }

  if (!candidate.valueMap || typeof candidate.valueMap !== 'object') {
    return null;
  }

  const map = candidate.valueMap as PortableValueMapExportPayload['valueMap'];
  if (
    typeof map.valueMapId !== 'string'
    || typeof map.key !== 'string'
    || typeof map.name !== 'string'
    || !Array.isArray(map.effectiveRows)
    || !Array.isArray(map.overlayOperations)
    || !map.sideA
    || !map.sideB
  ) {
    return null;
  }

  return candidate as PortableValueMapExportPayload;
}

function areRowsEquivalent(
  left: readonly ProjectValueTableRevisionRow[],
  right: readonly ProjectValueTableRevisionRow[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const toStable = (rows: readonly ProjectValueTableRevisionRow[]) => rows
    .map((row) => ({
      id: row.id,
      sideAValue: row.sideAValue,
      sideBValue: row.sideBValue,
      description: row.description ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify(toStable(left)) === JSON.stringify(toStable(right));
}

async function collectRuleBindingsForValueMap(valueMapId: string): Promise<readonly PortableValueMapRuleBinding[]> {
  const mappings = await scan<MappingItem>({
    TableName: getMappingsTableOrThrow(),
  });

  const bindings: PortableValueMapRuleBinding[] = [];

  for (const mapping of mappings) {
    if (!mapping.configS3Key) {
      continue;
    }

    let config: MappingConfig | null = null;
    try {
      const raw = await getObject({
        Bucket: getContentBucketOrThrow(),
        Key: mapping.configS3Key,
      });
      config = JSON.parse(raw) as MappingConfig;
    } catch {
      continue;
    }

    const rules = Array.isArray(config.rules) ? config.rules : [];
    rules.forEach((rule, index) => {
      const ref = rule.valueTableRef;
      if (!ref || ref.scope !== 'project' || ref.valueTableId !== valueMapId) {
        return;
      }

      bindings.push({
        mappingId: mapping.mappingId,
        mappingName: mapping.name,
        mappingRevision: mapping.revision ?? mapping.version,
        ruleIndex: index,
        target: rule.target,
        pinnedRevision: typeof ref.revision === 'number' ? ref.revision : 1,
        inputSideKey: ref.inputSideKey ?? '',
        outputSideKey: ref.outputSideKey ?? '',
        matchMode: normalizeMatchMode(ref.matchMode),
        noMatchBehaviorMode: rule.noMatchBehavior?.mode,
        ...(rule.noMatchBehavior && 'fallbackValue' in rule.noMatchBehavior
          ? { fallbackValue: rule.noMatchBehavior.fallbackValue }
          : {}),
      });
    });
  }

  return bindings;
}

function coercePrimitive(value: string, type: ValueTableValueType): ValueTablePrimitiveValue | null {
  if (type === 'string') {
    return value;
  }

  if (type === 'number') {
    if (value.trim().length === 0) {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return null;
}

async function buildUsageEntries(valueTable: ValueTableItem): Promise<ValueTableUsageEntry[]> {
  const mappings = await scan<MappingItem>({
    TableName: getMappingsTableOrThrow(),
  });

  const usage: ValueTableUsageEntry[] = [];

  for (const mapping of mappings) {
    if (!mapping.configS3Key) {
      continue;
    }

    let config: MappingConfig | null = null;
    try {
      const rawConfig = await getObject({
        Bucket: getContentBucketOrThrow(),
        Key: mapping.configS3Key,
      });
      config = JSON.parse(rawConfig) as MappingConfig;
    } catch {
      continue;
    }

    const rules = Array.isArray(config.rules) ? config.rules : [];
    for (const rule of rules) {
      if (rule.valueTableRef?.scope !== 'project') {
        continue;
      }

      if (rule.valueTableRef.valueTableId !== valueTable.valueTableId) {
        continue;
      }

      const latestRevision = valueTable.currentRevision;
      const revision = typeof rule.valueTableRef.revision === 'number'
        ? rule.valueTableRef.revision
        : latestRevision;
      const direction = rule.valueTableRef.inputSideKey === valueTable.sideA.key
      && rule.valueTableRef.outputSideKey === valueTable.sideB.key
        ? 'a_to_b'
        : 'b_to_a';

      const latestRevisionItem = await getValueTableRevisionItem(valueTable.valueTableId, latestRevision);
      const latestDirectionSupported = direction === 'a_to_b'
        ? latestRevisionItem?.directionSupport.aToB
        : latestRevisionItem?.directionSupport.bToA;

      usage.push({
        valueTableId: valueTable.valueTableId,
        tableKey: valueTable.key,
        mappingId: mapping.mappingId,
        mappingName: mapping.name,
        mappingVersion: mapping.revision ?? mapping.version,
        pinnedRevision: revision,
        direction,
        inputSideKey: rule.valueTableRef.inputSideKey ?? '',
        outputSideKey: rule.valueTableRef.outputSideKey ?? '',
        newerRevisionAvailable: revision < latestRevision,
        latestRevision,
        latestDirectionSupported,
        updatedAt: mapping.updatedAt,
      });
    }
  }

  return usage;
}

async function getProjectValueMapLink(projectId: string, valueMapId: string): Promise<ValueMapProjectLinkItem | null> {
  const item = await getItem<ValueMapProjectLinkItem>({
    TableName: getValueTableRevisionsTableOrThrow(),
    Key: {
      valueTableId: projectLinkSk(projectId, valueMapId),
      revision: 0,
    },
  });

  return item && isProjectLinkItem(item) ? item : null;
}

async function listProjectValueMapLinks(projectId: string): Promise<readonly ValueMapProjectLinkItem[]> {
  const items = await scan<unknown>({
    TableName: getValueTableRevisionsTableOrThrow(),
  });

  return items
    .filter((candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return false;
      }

      const valueTableId = (candidate as { valueTableId?: unknown }).valueTableId;
      const revision = (candidate as { revision?: unknown }).revision;
      if (typeof valueTableId !== 'string' || revision !== 0) {
        return false;
      }

      const parsed = parseProjectLinkSk(valueTableId);
      return parsed?.projectId === projectId;
    })
    .filter(isProjectLinkItem);
}

async function listOverlayRevisions(projectId: string, valueMapId: string): Promise<readonly ValueMapOverlayRevisionItem[]> {
  const pk = projectLinkSk(projectId, valueMapId);

  const revisions = await query<unknown>({
    TableName: getValueTableRevisionsTableOrThrow(),
    KeyConditionExpression: '#valueTableId = :valueTableId AND #revision > :revision',
    ExpressionAttributeNames: {
      '#valueTableId': 'valueTableId',
      '#revision': 'revision',
    },
    ExpressionAttributeValues: {
      ':valueTableId': pk,
      ':revision': 0,
    },
    ScanIndexForward: true,
  }).catch(async () => {
    const scanned = await scan<unknown>({
      TableName: getValueTableRevisionsTableOrThrow(),
    });

    return scanned.filter((candidate) => {
      if (!candidate || typeof candidate !== 'object') {
        return false;
      }

      const valueTableId = (candidate as { valueTableId?: unknown }).valueTableId;
      const revision = (candidate as { revision?: unknown }).revision;
      return valueTableId === pk && typeof revision === 'number' && revision > 0;
    });
  });

  return revisions.filter(isOverlayRevisionItem);
}

function applyOverlayOperations(
  baseRows: readonly ProjectValueTableRevisionRow[],
  overlayOperations: readonly ValueMapOverlayOperation[],
): readonly ProjectValueMapEffectiveRow[] {
  const rows = new Map<string, ProjectValueMapEffectiveRow>();

  for (const row of baseRows) {
    rows.set(row.id, {
      rowId: row.id,
      sideAValue: row.sideAValue,
      sideBValue: row.sideBValue,
      ...(row.description ? { description: row.description } : {}),
      provenance: 'inherited',
    });
  }

  for (const operation of overlayOperations) {
    if (operation.type === 'exclude' && operation.targetRowId) {
      rows.delete(operation.targetRowId);
      continue;
    }

    if (operation.type === 'override' && operation.targetRowId && operation.row) {
      rows.set(operation.targetRowId, {
        rowId: operation.targetRowId,
        sideAValue: operation.row.sideAValue,
        sideBValue: operation.row.sideBValue,
        ...(operation.row.description ? { description: operation.row.description } : {}),
        provenance: 'override',
      });
      continue;
    }

    if (operation.type === 'add' && operation.row) {
      rows.set(operation.row.id, {
        rowId: operation.row.id,
        sideAValue: operation.row.sideAValue,
        sideBValue: operation.row.sideBValue,
        ...(operation.row.description ? { description: operation.row.description } : {}),
        provenance: 'add',
      });
    }
  }

  return Array.from(rows.values());
}

async function resolveProjectValueMapDetail(projectId: string, valueMapId: string): Promise<ProjectValueMapDetail | null> {
  const link = await getProjectValueMapLink(projectId, valueMapId);
  if (!link) {
    return null;
  }

  const globalMap = await getValueTable(valueMapId);
  if (!globalMap || !isGlobalValueMap(globalMap)) {
    return null;
  }

  const pinnedRevision = await getValueTableRevision(valueMapId, link.pinnedRevision);
  if (!pinnedRevision) {
    return null;
  }

  const overlayRevisions = await listOverlayRevisions(projectId, valueMapId);
  const operations = [...overlayRevisions]
    .sort((a, b) => a.revision - b.revision)
    .flatMap((revision) => revision.operations);
  const effectiveRows = applyOverlayOperations(pinnedRevision.rows, operations);

  return {
    projectId,
    valueMapId,
    key: globalMap.key,
    name: globalMap.name,
    pinnedRevision: link.pinnedRevision,
    latestRevision: globalMap.currentRevision,
    overlayRevision: link.overlayRevision,
    updateAvailable: link.updateAvailable,
    dependencyState: link.dependencyState,
    effectiveRows,
  };
}

async function listProjectValueTables(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'id');
  if (!projectId) {
    const err = validationError('Missing required path parameter: id', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const queryText = parseQueryParam(event, 'query')?.toLowerCase();
  const status = parseQueryParam(event, 'status');
  const sortBy = parseQueryParam(event, 'sortBy') ?? 'updatedAt';
  const sortDirection = parseQueryParam(event, 'sortDirection') ?? 'desc';

  const items = await query<ValueTableItem>({
    TableName: getValueTablesTableOrThrow(),
    IndexName: 'projectId-index',
    KeyConditionExpression: '#projectId = :projectId',
    ExpressionAttributeNames: {
      '#projectId': 'projectId',
    },
    ExpressionAttributeValues: {
      ':projectId': projectId,
    },
  });

  let tables = items.map(toProjectValueTable);

  if (queryText) {
    tables = tables.filter((table) =>
      table.name.toLowerCase().includes(queryText)
      || table.key.toLowerCase().includes(queryText)
      || table.sideA.label.toLowerCase().includes(queryText)
      || table.sideB.label.toLowerCase().includes(queryText));
  }

  if (status === 'active' || status === 'archived') {
    tables = tables.filter((table) => table.status === status);
  }

  const direction = sortDirection === 'asc' ? 1 : -1;
  const rowCounts = new Map(items.map((item) => [item.valueTableId, item.currentRowCount]));
  const usageCountByTableId = new Map<string, number>();

  if (sortBy === 'usedBy') {
    for (const table of tables) {
      const usage = await buildUsageEntries(items.find((item) => item.valueTableId === table.id) ?? {
        valueTableId: table.id,
        projectId,
        key: table.key,
        name: table.name,
        sideA: table.sideA,
        sideB: table.sideB,
        currentRevision: table.currentRevision,
        currentRowCount: 0,
        status: table.status,
        createdAt: table.createdAt,
        updatedAt: table.updatedAt,
      });
      usageCountByTableId.set(table.id, usage.length);
    }
  }

  tables = [...tables].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name) * direction;
    }

    if (sortBy === 'rowCount') {
      return ((rowCounts.get(a.id) ?? 0) - (rowCounts.get(b.id) ?? 0)) * direction;
    }

    if (sortBy === 'usedBy') {
      return ((usageCountByTableId.get(a.id) ?? 0) - (usageCountByTableId.get(b.id) ?? 0)) * direction;
    }

    return a.updatedAt.localeCompare(b.updatedAt) * direction;
  });

  return jsonResponse(200, tables, requestId);
}

async function getProjectValueTable(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  if (!valueTableId) {
    const err = validationError('Missing required path parameter: valueTableId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const table = await getValueTable(valueTableId);
  if (!table) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  return jsonResponse(200, toProjectValueTable(table), requestId);
}

async function getProjectValueTableRevision(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  const revision = parsePositiveInteger(parsePathParam(event, 'revision'));

  if (!valueTableId || !revision) {
    const err = validationError('Missing required path parameters: valueTableId and revision', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const table = await getValueTable(valueTableId);
  if (!table) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const resolvedRevision = await getValueTableRevision(valueTableId, revision);
  if (!resolvedRevision) {
    const err = notFound('ProjectValueTableRevision', `${valueTableId}@${revision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  return jsonResponse(200, resolvedRevision, requestId);
}

async function createProjectValueTable(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'id');
  const body = parseBody(event);

  if (!projectId) {
    const err = validationError('Missing required path parameter: id', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (!body) {
    const err = validationError('Missing request body', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const input = body as Partial<CreateProjectValueTableInput>;
  if (!input.key || !input.name || !input.sideA || !input.sideB || !Array.isArray(input.rows)) {
    const err = validationError('Missing required fields: key, name, sideA, sideB, rows', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const existingTables = await query<ValueTableItem>({
    TableName: getValueTablesTableOrThrow(),
    IndexName: 'projectId-index',
    KeyConditionExpression: '#projectId = :projectId',
    ExpressionAttributeNames: {
      '#projectId': 'projectId',
    },
    ExpressionAttributeValues: {
      ':projectId': projectId,
    },
  });

  if (existingTables.some((item) => item.key === input.key)) {
    const err = conflict(`Value table key already exists in project: ${input.key}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const valueTableId = crypto.randomUUID();
  const createdAt = nowIso();
  const rows = normalizeRows(input.rows);
  const directionSupport = computeDirectionSupport(rows);
  const hash = await computeRevisionHash({
    sideA: input.sideA,
    sideB: input.sideB,
    rows,
  });

  const tableItem: ValueTableItem = {
    valueTableId,
    projectId,
    key: input.key,
    name: input.name,
    ...(typeof input.description === 'string' && input.description.trim().length > 0
      ? { description: input.description.trim() }
      : {}),
    sideA: input.sideA,
    sideB: input.sideB,
    currentRevision: 1,
    currentRowCount: rows.length,
    status: 'active',
    createdAt,
    createdBy: 'system',
    updatedAt: createdAt,
    updatedBy: 'system',
  };

  const revisionItem: ValueTableRevisionItem = {
    valueTableId,
    revision: 1,
    sideA: input.sideA,
    sideB: input.sideB,
    rowCount: rows.length,
    directionSupport,
    rowsS3Key: rowsS3Key(valueTableId, 1),
    contentHash: hash,
    createdAt,
    createdBy: 'system',
  };

  await putObject({
    Bucket: getContentBucketOrThrow(),
    Key: revisionItem.rowsS3Key,
    Body: JSON.stringify({ rows }),
    ContentType: 'application/json',
  });

  await putItem({
    TableName: getValueTablesTableOrThrow(),
    Item: tableItem,
    ConditionExpression: 'attribute_not_exists(valueTableId)',
  });

  await putItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Item: revisionItem,
    ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
  });

  return jsonResponse(201, toProjectValueTable(tableItem), requestId);
}

async function createProjectValueTableRevision(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  const body = parseBody(event);

  if (!valueTableId) {
    const err = validationError('Missing required path parameter: valueTableId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (!body) {
    const err = validationError('Missing request body', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const input = body as Partial<CreateProjectValueTableRevisionInput>;
  if (!input.sideA || !input.sideB || !Array.isArray(input.rows)) {
    const err = validationError('Missing required fields: sideA, sideB, rows', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const existing = await getValueTable(valueTableId);
  if (!existing) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (existing.status === 'archived') {
    const err = conflict(`Cannot create revision for archived value table: ${valueTableId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const nextRevision = existing.currentRevision + 1;
  const updatedAt = nowIso();
  const rows = normalizeRows(input.rows);
  const directionSupport = computeDirectionSupport(rows);
  const hash = await computeRevisionHash({
    sideA: input.sideA,
    sideB: input.sideB,
    rows,
  });

  const revisionItem: ValueTableRevisionItem = {
    valueTableId,
    revision: nextRevision,
    sideA: input.sideA,
    sideB: input.sideB,
    rowCount: rows.length,
    directionSupport,
    rowsS3Key: rowsS3Key(valueTableId, nextRevision),
    contentHash: hash,
    createdAt: updatedAt,
    createdBy: 'system',
  };

  await putObject({
    Bucket: getContentBucketOrThrow(),
    Key: revisionItem.rowsS3Key,
    Body: JSON.stringify({ rows }),
    ContentType: 'application/json',
  });

  await putItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Item: revisionItem,
    ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
  });

  await updateItem({
    TableName: getValueTablesTableOrThrow(),
    Key: { valueTableId },
    UpdateExpression:
      'SET #sideA = :sideA, #sideB = :sideB, #currentRevision = :currentRevision, #currentRowCount = :currentRowCount, #updatedAt = :updatedAt, #updatedBy = :updatedBy',
    ConditionExpression: '#currentRevision = :expectedRevision',
    ExpressionAttributeNames: {
      '#sideA': 'sideA',
      '#sideB': 'sideB',
      '#currentRevision': 'currentRevision',
      '#currentRowCount': 'currentRowCount',
      '#updatedAt': 'updatedAt',
      '#updatedBy': 'updatedBy',
    },
    ExpressionAttributeValues: {
      ':sideA': input.sideA,
      ':sideB': input.sideB,
      ':currentRevision': nextRevision,
      ':currentRowCount': rows.length,
      ':updatedAt': updatedAt,
      ':updatedBy': 'system',
      ':expectedRevision': existing.currentRevision,
    },
  });

  const response: ProjectValueTableRevision = {
    valueTableId,
    revision: revisionItem.revision,
    sideA: revisionItem.sideA,
    sideB: revisionItem.sideB,
    rows,
    rowCount: revisionItem.rowCount,
    directionSupport: revisionItem.directionSupport,
    rowsS3Key: revisionItem.rowsS3Key,
    contentHash: revisionItem.contentHash,
    createdAt: revisionItem.createdAt,
    createdBy: revisionItem.createdBy,
  };

  return jsonResponse(201, response, requestId);
}

async function duplicateProjectValueTable(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  const body = parseBody(event) as Partial<DuplicateProjectValueTableInput> | null;
  if (!valueTableId || !body?.projectId || !body.name) {
    const err = validationError('Missing required fields: valueTableId, projectId, name', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const sourceTable = await getValueTable(valueTableId);
  if (!sourceTable) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const sourceProjectId = body.sourceProjectId?.trim();
  const mode = body.mode ?? 'detached-copy';
  const sourceLinkProjectId = sourceProjectId && sourceProjectId.length > 0
    ? sourceProjectId
    : sourceTable.projectId;

  const sourceLink = sourceLinkProjectId
    ? await getProjectValueMapLink(sourceLinkProjectId, valueTableId)
    : null;

  if (sourceLink) {
    const linkProjectId = sourceLinkProjectId ?? sourceTable.projectId;
    if (!linkProjectId) {
      const err = validationError('Missing source project context for linked value map duplication', requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const detail = await resolveProjectValueMapDetail(linkProjectId, valueTableId);
    if (!detail) {
      const err = notFound('ProjectValueMapLink', `${linkProjectId}:${valueTableId}`, requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    if (mode === 'preserve-link') {
      const existingLink = await getProjectValueMapLink(body.projectId, sourceLink.globalValueMapId);
      if (existingLink) {
        const err = conflict(`Project is already linked to value map: ${sourceLink.globalValueMapId}`, requestId);
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
      }

      const globalMap = await getValueTable(sourceLink.globalValueMapId);
      if (!globalMap || !isGlobalValueMap(globalMap)) {
        const err = notFound('GlobalValueMap', sourceLink.globalValueMapId, requestId);
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
      }

      const pinnedRevision = await getValueTableRevision(sourceLink.globalValueMapId, sourceLink.pinnedRevision);
      if (!pinnedRevision) {
        const err = notFound(
          'GlobalValueMapRevision',
          `${sourceLink.globalValueMapId}@${sourceLink.pinnedRevision}`,
          requestId,
        );
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
      }

      const createdAt = nowIso();
      const newLink: ValueMapProjectLinkItem = {
        valueTableId: projectLinkSk(body.projectId, sourceLink.globalValueMapId),
        revision: 0,
        entityType: 'value-map-project-link',
        projectId: body.projectId,
        globalValueMapId: sourceLink.globalValueMapId,
        pinnedRevision: sourceLink.pinnedRevision,
        overlayRevision: sourceLink.overlayRevision,
        dependencyState: sourceLink.dependencyState,
        updateAvailable: sourceLink.pinnedRevision < globalMap.currentRevision,
        createdAt,
        createdBy: 'system',
        updatedAt: createdAt,
        updatedBy: 'system',
      };

      await putItem({
        TableName: getValueTableRevisionsTableOrThrow(),
        Item: newLink,
        ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
      });

      const sourceOverlays = await listOverlayRevisions(linkProjectId, sourceLink.globalValueMapId);
      for (const sourceOverlay of sourceOverlays) {
        const copiedOverlay: ValueMapOverlayRevisionItem = {
          valueTableId: projectLinkSk(body.projectId, sourceLink.globalValueMapId),
          revision: sourceOverlay.revision,
          entityType: 'value-map-overlay-revision',
          operationCount: sourceOverlay.operationCount,
          operations: sourceOverlay.operations,
          contentHash: sourceOverlay.contentHash,
          createdAt: sourceOverlay.createdAt,
          createdBy: sourceOverlay.createdBy,
        };

        await putItem({
          TableName: getValueTableRevisionsTableOrThrow(),
          Item: copiedOverlay,
          ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
        });
      }

      const duplicatedDetail = await resolveProjectValueMapDetail(body.projectId, sourceLink.globalValueMapId);
      return jsonResponse(201, {
        mode: 'preserve-link',
        duplicatedLink: duplicatedDetail,
      }, requestId);
    }

    const projectKeyBase = body.key?.trim() || `${detail.key}-copy`;
    const createEvent: APIGatewayProxyEvent = {
      ...event,
      pathParameters: { id: body.projectId },
      body: JSON.stringify({
        projectId: body.projectId,
        key: projectKeyBase,
        name: body.name,
        description: sourceTable.description,
        sideA: sourceTable.sideA,
        sideB: sourceTable.sideB,
        rows: toRowsFromEffectiveRows(detail.effectiveRows),
      }),
    };

    const created = await createProjectValueTable(createEvent, requestId);
    if (created.statusCode !== 201) {
      return created;
    }

    const payload = JSON.parse(created.body) as ProjectValueTable;
    return jsonResponse(201, {
        mode: 'detached-copy',
        detachedFrom: {
          projectId: linkProjectId,
          valueMapId: sourceLink.globalValueMapId,
          pinnedRevision: sourceLink.pinnedRevision,
          overlayRevision: sourceLink.overlayRevision,
      },
      table: payload,
    }, requestId);
  }

  const sourceRevision = await getValueTableRevision(valueTableId, sourceTable.currentRevision);
  if (!sourceRevision) {
    const err = notFound('ProjectValueTableRevision', `${valueTableId}@${sourceTable.currentRevision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const key = body.key?.trim() || `${sourceTable.key}-copy`;
  const createEvent: APIGatewayProxyEvent = {
    ...event,
    pathParameters: { id: body.projectId },
    body: JSON.stringify({
      projectId: body.projectId,
      key,
      name: body.name,
      description: sourceTable.description,
      sideA: sourceRevision.sideA,
      sideB: sourceRevision.sideB,
      rows: sourceRevision.rows,
    }),
  };

  return createProjectValueTable(createEvent, requestId);
}

async function archiveProjectValueTable(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  if (!valueTableId) {
    const err = validationError('Missing required path parameter: valueTableId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const table = await getValueTable(valueTableId);
  if (!table) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  await updateItem({
    TableName: getValueTablesTableOrThrow(),
    Key: { valueTableId },
    UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt, #updatedBy = :updatedBy',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
      '#updatedBy': 'updatedBy',
    },
    ExpressionAttributeValues: {
      ':status': 'archived',
      ':updatedAt': nowIso(),
      ':updatedBy': 'system',
    },
  });

  const updated = await getValueTable(valueTableId);
  return jsonResponse(200, toProjectValueTable(updated ?? table), requestId);
}

async function deleteProjectValueTable(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  if (!valueTableId) {
    const err = validationError('Missing required path parameter: valueTableId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const table = await getValueTable(valueTableId);
  if (!table) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const usage = await buildUsageEntries(table);
  if (usage.length > 0) {
    const err = conflict(`ProjectValueTable is still referenced: ${valueTableId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId, {
      usageCount: usage.length,
      usage: usage.slice(0, 20),
    });
  }

  await deleteItem({
    TableName: getValueTablesTableOrThrow(),
    Key: { valueTableId },
  });

  return jsonResponse(204, null, requestId);
}

async function listProjectValueTableUsage(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  if (!valueTableId) {
    const err = validationError('Missing required path parameter: valueTableId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const table = await getValueTable(valueTableId);
  if (!table) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const usage = await buildUsageEntries(table);
  return jsonResponse(200, {
    mappings: usage,
    linkedProjects: [],
    counts: {
      mappings: usage.length,
      linkedProjects: 0,
    },
  }, requestId);
}

async function listGlobalValueMaps(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const queryText = parseQueryParam(event, 'query')?.toLowerCase();
  const status = parseQueryParam(event, 'status');

  const items = await scan<ValueTableItem>({
    TableName: getValueTablesTableOrThrow(),
  });

  let maps = items
    .filter((item) => isGlobalValueMap(item))
    .map(toProjectValueTable);

  if (queryText) {
    maps = maps.filter((table) =>
      table.name.toLowerCase().includes(queryText)
      || table.key.toLowerCase().includes(queryText)
      || table.sideA.label.toLowerCase().includes(queryText)
      || table.sideB.label.toLowerCase().includes(queryText));
  }

  if (status === 'active' || status === 'archived') {
    maps = maps.filter((table) => table.status === status);
  }

  maps = [...maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return jsonResponse(200, maps, requestId);
}

async function createGlobalValueMap(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const body = parseBody(event);

  if (!body) {
    const err = validationError('Missing request body', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const input = body as Partial<Omit<CreateProjectValueTableInput, 'projectId'>>;
  if (!input.key || !input.name || !input.sideA || !input.sideB || !Array.isArray(input.rows)) {
    const err = validationError('Missing required fields: key, name, sideA, sideB, rows', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const existing = await scan<ValueTableItem>({
    TableName: getValueTablesTableOrThrow(),
  });

  if (existing.some((item) => isGlobalValueMap(item) && item.key === input.key)) {
    const err = conflict(`Value map key already exists in global library: ${input.key}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const valueTableId = crypto.randomUUID();
  const createdAt = nowIso();
  const rows = normalizeRows(input.rows);
  const directionSupport = computeDirectionSupport(rows);
  const hash = await computeRevisionHash({
    sideA: input.sideA,
    sideB: input.sideB,
    rows,
  });

  const tableItem: ValueTableItem = {
    valueTableId,
    scope: 'global',
    key: input.key,
    name: input.name,
    ...(typeof input.description === 'string' && input.description.trim().length > 0
      ? { description: input.description.trim() }
      : {}),
    sideA: input.sideA,
    sideB: input.sideB,
    defaultMatchMode: 'exact',
    currentRevision: 1,
    currentRowCount: rows.length,
    status: 'active',
    createdAt,
    createdBy: 'system',
    updatedAt: createdAt,
    updatedBy: 'system',
  };

  const revisionItem: ValueTableRevisionItem = {
    valueTableId,
    revision: 1,
    sideA: input.sideA,
    sideB: input.sideB,
    rowCount: rows.length,
    directionSupport,
    rowsS3Key: rowsS3Key(valueTableId, 1),
    contentHash: hash,
    createdAt,
    createdBy: 'system',
  };

  await putObject({
    Bucket: getContentBucketOrThrow(),
    Key: revisionItem.rowsS3Key,
    Body: JSON.stringify({ rows }),
    ContentType: 'application/json',
  });

  await putItem({
    TableName: getValueTablesTableOrThrow(),
    Item: tableItem,
    ConditionExpression: 'attribute_not_exists(valueTableId)',
  });

  await putItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Item: revisionItem,
    ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
  });

  return jsonResponse(201, toProjectValueTable(tableItem), requestId);
}

async function promoteProjectValueMap(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parseProjectIdFromEvent(event);
  const valueTableId = parsePathParam(event, 'valueTableId');
  const body = (parseBody(event) ?? {}) as PromoteProjectValueMapInput;

  if (!projectId || !valueTableId) {
    const err = validationError('Missing required path parameters: projectId and valueTableId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const source = await getValueTable(valueTableId);
  if (!source) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (isGlobalValueMap(source)) {
    const err = conflict(`Value map is already global: ${valueTableId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (source.projectId !== projectId) {
    const err = conflict(`Value map does not belong to project '${projectId}': ${valueTableId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const sourceRevision = await getValueTableRevision(valueTableId, source.currentRevision);
  if (!sourceRevision) {
    const err = notFound('ProjectValueTableRevision', `${valueTableId}@${source.currentRevision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const key = body.key?.trim() || source.key;
  const name = body.name?.trim() || source.name;
  const description = typeof body.description === 'string' && body.description.trim().length > 0
    ? body.description.trim()
    : source.description;

  const existing = await scan<ValueTableItem>({
    TableName: getValueTablesTableOrThrow(),
  });

  if (existing.some((item) => isGlobalValueMap(item) && item.key === key)) {
    const err = conflict(`Value map key already exists in global library: ${key}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const promotedId = crypto.randomUUID();
  const createdAt = nowIso();
  const promotedRows = normalizeRows(sourceRevision.rows);
  const directionSupport = computeDirectionSupport(promotedRows);
  const hash = await computeRevisionHash({
    sideA: sourceRevision.sideA,
    sideB: sourceRevision.sideB,
    rows: promotedRows,
  });

  const promotedTable: ValueTableItem = {
    valueTableId: promotedId,
    scope: 'global',
    key,
    name,
    ...(description ? { description } : {}),
    sideA: sourceRevision.sideA,
    sideB: sourceRevision.sideB,
    defaultMatchMode: source.defaultMatchMode ?? 'exact',
    currentRevision: 1,
    currentRowCount: promotedRows.length,
    status: 'active',
    createdAt,
    createdBy: 'system',
    updatedAt: createdAt,
    updatedBy: 'system',
  };

  const promotedRevision: ValueTableRevisionItem = {
    valueTableId: promotedId,
    revision: 1,
    sideA: sourceRevision.sideA,
    sideB: sourceRevision.sideB,
    rowCount: promotedRows.length,
    directionSupport,
    rowsS3Key: rowsS3Key(promotedId, 1),
    contentHash: hash,
    createdAt,
    createdBy: 'system',
  };

  await putObject({
    Bucket: getContentBucketOrThrow(),
    Key: promotedRevision.rowsS3Key,
    Body: JSON.stringify({ rows: promotedRows }),
    ContentType: 'application/json',
  });

  await putItem({
    TableName: getValueTablesTableOrThrow(),
    Item: promotedTable,
    ConditionExpression: 'attribute_not_exists(valueTableId)',
  });

  await putItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Item: promotedRevision,
    ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
  });

  if (body.relink) {
    const linkedRows = promotedRows;
    if (!areRowsEquivalent(sourceRevision.rows, linkedRows)) {
      const err = conflict('Promotion relink blocked: promoted revision is not behavior-equivalent to source rows', requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const linkRecord: ValueMapProjectLinkItem = {
      valueTableId: projectLinkSk(projectId, promotedId),
      revision: 0,
      entityType: 'value-map-project-link',
      projectId,
      globalValueMapId: promotedId,
      pinnedRevision: 1,
      overlayRevision: 0,
      dependencyState: 'current',
      updateAvailable: false,
      createdAt,
      createdBy: 'system',
      updatedAt: createdAt,
      updatedBy: 'system',
    };

    await putItem({
      TableName: getValueTableRevisionsTableOrThrow(),
      Item: linkRecord,
      ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
    });

    const detail = await resolveProjectValueMapDetail(projectId, promotedId);
    return jsonResponse(201, {
      promoted: toProjectValueTable(promotedTable),
      relinked: detail,
    }, requestId);
  }

  return jsonResponse(201, {
    promoted: toProjectValueTable(promotedTable),
  }, requestId);
}

async function listValueTableRevisions(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  if (!valueTableId) {
    const err = validationError('Missing required path parameter: valueTableId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const table = await getValueTable(valueTableId);
  if (!table) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const items = await query<ValueTableRevisionItem>({
    TableName: getValueTableRevisionsTableOrThrow(),
    KeyConditionExpression: '#valueTableId = :valueTableId',
    ExpressionAttributeNames: {
      '#valueTableId': 'valueTableId',
    },
    ExpressionAttributeValues: {
      ':valueTableId': valueTableId,
    },
    ScanIndexForward: false,
  });

  return jsonResponse(200, items, requestId);
}

async function getProjectValueTableRevisionDiff(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  const fromRevision = parsePositiveInteger(parseQueryParam(event, 'fromRevision'));
  const toRevision = parsePositiveInteger(parseQueryParam(event, 'toRevision'));
  const pageSizeRaw = parsePositiveInteger(parseQueryParam(event, 'pageSize'));
  const pageSize = Math.min(500, Math.max(1, pageSizeRaw ?? 100));
  const offset = parseCursor(parseQueryParam(event, 'cursor'));

  if (!valueTableId || !fromRevision || !toRevision) {
    const err = validationError('Missing required query/path parameters: valueTableId, fromRevision, toRevision', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const table = await getValueTable(valueTableId);
  if (!table) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const from = await getValueTableRevision(valueTableId, fromRevision);
  const to = await getValueTableRevision(valueTableId, toRevision);
  if (!from || !to) {
    const err = notFound('ProjectValueTableRevision', `${valueTableId}:${fromRevision}->${toRevision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const fromMap = new Map(from.rows.map((row) => [row.id, row]));
  const toMap = new Map(to.rows.map((row) => [row.id, row]));
  const ids = Array.from(new Set([...fromMap.keys(), ...toMap.keys()])).sort((a, b) => a.localeCompare(b));

  const allChanges: ValueTableDiffChange[] = ids.map((id) => {
    const before = fromMap.get(id);
    const after = toMap.get(id);

    if (!before && after) {
      return {
        changeType: 'added',
        rowId: id,
        after,
      };
    }

    if (before && !after) {
      return {
        changeType: 'removed',
        rowId: id,
        before,
      };
    }

    if (before && after) {
      const changed = JSON.stringify(before) !== JSON.stringify(after);
      return {
        changeType: changed ? 'changed' : 'unchanged',
        rowId: id,
        before,
        after,
      };
    }

    return {
      changeType: 'unchanged',
      rowId: id,
    };
  });

  const counts = allChanges.reduce(
    (acc, change) => {
      if (change.changeType === 'added') acc.added += 1;
      if (change.changeType === 'removed') acc.removed += 1;
      if (change.changeType === 'changed') acc.changed += 1;
      if (change.changeType === 'unchanged') acc.unchanged += 1;
      return acc;
    },
    { added: 0, removed: 0, changed: 0, unchanged: 0 },
  );

  const changes = allChanges.slice(offset, offset + pageSize);
  const nextCursor = offset + pageSize < allChanges.length ? String(offset + pageSize) : undefined;

  const page: ValueTableDiffPage = {
    summary: {
      valueTableId,
      tableKey: table.key,
      fromRevision,
      toRevision,
      counts,
      directionImpact: {
        previous: from.directionSupport,
        next: to.directionSupport,
      },
    },
    changes,
    pageSize,
    ...(nextCursor ? { nextCursor } : {}),
  };

  return jsonResponse(200, page, requestId);
}

async function exportProjectValueTableCsv(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const valueTableId = parsePathParam(event, 'valueTableId');
  const revisionParam = parsePositiveInteger(parseQueryParam(event, 'revision'));

  if (!valueTableId) {
    const err = validationError('Missing required path parameter: valueTableId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const table = await getValueTable(valueTableId);
  if (!table) {
    const err = notFound('ProjectValueTable', valueTableId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const portable = parseBooleanQuery(parseQueryParam(event, 'portable'));
  const sourceProjectId = parseQueryParam(event, 'projectId') ?? parsePathParam(event, 'projectId');

  if (portable) {
    const sourceLinkProjectId = sourceProjectId?.trim() && sourceProjectId.trim().length > 0
      ? sourceProjectId.trim()
      : table.projectId;
    const sourceLink = sourceLinkProjectId
      ? await getProjectValueMapLink(sourceLinkProjectId, valueTableId)
      : null;

    if (sourceLink) {
      const linkProjectId = sourceLinkProjectId ?? table.projectId;
      if (!linkProjectId) {
        const err = validationError('Missing source project context for portable export', requestId);
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
      }

      const detail = await resolveProjectValueMapDetail(linkProjectId, valueTableId);
      if (!detail) {
        const err = notFound('ProjectValueMapLink', `${linkProjectId}:${valueTableId}`, requestId);
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
      }

      const globalMap = await getValueTable(sourceLink.globalValueMapId);
      if (!globalMap || !isGlobalValueMap(globalMap)) {
        const err = notFound('GlobalValueMap', sourceLink.globalValueMapId, requestId);
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
      }

      const overlays = await listOverlayRevisions(linkProjectId, sourceLink.globalValueMapId);
      const bindings = await collectRuleBindingsForValueMap(sourceLink.globalValueMapId);
      const portablePayload: PortableValueMapExportPayload = {
        format: 'value-map-portable-v1',
        exportedAt: nowIso(),
        projectId: linkProjectId,
        valueMap: {
          valueMapId: sourceLink.globalValueMapId,
          key: detail.key,
          name: detail.name,
          description: globalMap.description,
          sideA: globalMap.sideA,
          sideB: globalMap.sideB,
          defaultMatchMode: globalMap.defaultMatchMode,
          scope: 'global',
          pinnedGlobal: {
            valueMapId: sourceLink.globalValueMapId,
            revision: sourceLink.pinnedRevision,
            key: detail.key,
            name: detail.name,
          },
          overlayRevision: sourceLink.overlayRevision,
          overlayOperations: [...overlays]
            .sort((a, b) => a.revision - b.revision)
            .flatMap((entry) => entry.operations),
          effectiveRows: toRowsFromEffectiveRows(detail.effectiveRows),
        },
        usageBindings: bindings,
      };

      return jsonResponse(200, portablePayload, requestId);
    }

    const revisionForPortable = revisionParam ?? table.currentRevision;
    const detachedRevision = await getValueTableRevision(valueTableId, revisionForPortable);
    if (!detachedRevision) {
      const err = notFound('ProjectValueTableRevision', `${valueTableId}@${revisionForPortable}`, requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const bindings = await collectRuleBindingsForValueMap(valueTableId);
    const portablePayload: PortableValueMapExportPayload = {
      format: 'value-map-portable-v1',
      exportedAt: nowIso(),
      projectId: table.projectId,
      valueMap: {
        valueMapId: valueTableId,
        key: table.key,
        name: table.name,
        description: table.description,
        sideA: detachedRevision.sideA,
        sideB: detachedRevision.sideB,
        defaultMatchMode: table.defaultMatchMode,
        scope: 'project',
        sourceProjectId: table.projectId,
        overlayRevision: 0,
        overlayOperations: [],
        effectiveRows: detachedRevision.rows,
      },
      usageBindings: bindings,
    };

    return jsonResponse(200, portablePayload, requestId);
  }

  const revision = revisionParam ?? table.currentRevision;
  const resolvedRevision = await getValueTableRevision(valueTableId, revision);
  if (!resolvedRevision) {
    const err = notFound('ProjectValueTableRevision', `${valueTableId}@${revision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const header = [
    resolvedRevision.sideA.label,
    resolvedRevision.sideB.label,
    'Description',
  ];
  const rows = resolvedRevision.rows.map((row) => [
    String(row.sideAValue),
    String(row.sideBValue),
    row.description ?? '',
  ]);
  const csv = [header, ...rows]
    .map((line) => line.map(csvEscape).join(','))
    .join('\n');

  return jsonResponse(200, csv, requestId);
}

async function importProjectValueTableCsv(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'id');
  const body = parseBody(event) as {
    csv?: string;
    name?: string;
    key?: string;
    portablePayload?: PortableValueMapExportPayload;
    resolution?: ImportPortableValueMapResolution;
  } | null;

  if (!projectId || !body) {
    const err = validationError('Missing required fields: id and body', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (body.portablePayload) {
    const payload = parsePortableExportPayload(body.portablePayload);
    if (!payload) {
      const err = validationError('Invalid portablePayload format', requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    const resolution = body.resolution;
    const pinnedGlobal = payload.valueMap.pinnedGlobal;

    if (pinnedGlobal) {
      const globalMap = await getValueTable(pinnedGlobal.valueMapId);
      const pinnedRevision = globalMap
        ? await getValueTableRevision(pinnedGlobal.valueMapId, pinnedGlobal.revision)
        : null;
      const pinnedAvailable = Boolean(globalMap && isGlobalValueMap(globalMap) && pinnedRevision);

      if (!pinnedAvailable && !resolution) {
        const err = conflict('Import requires explicit resolution for unavailable referenced global revision', requestId);
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId, {
          importStatus: 'requires-resolution',
          referencedGlobal: pinnedGlobal,
          options: ['project-copy', 'choose-global', 'cancel'],
          recommended: 'project-copy',
        });
      }

      if (!pinnedAvailable && resolution?.action === 'cancel') {
        const err = conflict('Import canceled by user resolution choice', requestId);
        return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId, {
          importStatus: 'canceled',
        });
      }

      if (pinnedAvailable && !resolution) {
        const existingLink = await getProjectValueMapLink(projectId, pinnedGlobal.valueMapId);
        if (existingLink) {
          const err = conflict(`Project is already linked to value map: ${pinnedGlobal.valueMapId}`, requestId);
          return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
        }

        const createdAt = nowIso();
        const newLink: ValueMapProjectLinkItem = {
          valueTableId: projectLinkSk(projectId, pinnedGlobal.valueMapId),
          revision: 0,
          entityType: 'value-map-project-link',
          projectId,
          globalValueMapId: pinnedGlobal.valueMapId,
          pinnedRevision: pinnedGlobal.revision,
          overlayRevision: payload.valueMap.overlayRevision,
          dependencyState: 'current',
          updateAvailable: pinnedGlobal.revision < (globalMap?.currentRevision ?? pinnedGlobal.revision),
          createdAt,
          createdBy: 'system',
          updatedAt: createdAt,
          updatedBy: 'system',
        };

        await putItem({
          TableName: getValueTableRevisionsTableOrThrow(),
          Item: newLink,
          ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
        });

        if (payload.valueMap.overlayOperations.length > 0) {
          const contentHash = await computeRevisionHash({
            sideA: { key: 'overlay', label: 'overlay', type: 'string' },
            sideB: { key: 'overlay', label: 'overlay', type: 'string' },
            rows: payload.valueMap.overlayOperations.map((operation) => ({
              id: operation.operationId,
              sideAValue: operation.type,
              sideBValue: operation.targetRowId ?? operation.row?.id ?? '',
            })),
          });

          const overlayRevision: ValueMapOverlayRevisionItem = {
            valueTableId: projectLinkSk(projectId, pinnedGlobal.valueMapId),
            revision: payload.valueMap.overlayRevision > 0 ? payload.valueMap.overlayRevision : 1,
            entityType: 'value-map-overlay-revision',
            operationCount: payload.valueMap.overlayOperations.length,
            operations: payload.valueMap.overlayOperations,
            contentHash,
            createdAt,
            createdBy: 'system',
          };

          await putItem({
            TableName: getValueTableRevisionsTableOrThrow(),
            Item: overlayRevision,
            ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
          });
        }

        const detail = await resolveProjectValueMapDetail(projectId, pinnedGlobal.valueMapId);
        return jsonResponse(201, {
          importStatus: 'linked',
          detail,
        }, requestId);
      }

      if (!pinnedAvailable && resolution?.action === 'choose-global') {
        if (!resolution.selectedValueMapId || !resolution.selectedRevision) {
          const err = validationError('Resolution choose-global requires selectedValueMapId and selectedRevision', requestId);
          return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
        }

        const chosenGlobal = await getValueTable(resolution.selectedValueMapId);
        const chosenRevision = await getValueTableRevision(resolution.selectedValueMapId, resolution.selectedRevision);
        if (!chosenGlobal || !isGlobalValueMap(chosenGlobal) || !chosenRevision) {
          const err = notFound(
            'GlobalValueMapRevision',
            `${resolution.selectedValueMapId}@${resolution.selectedRevision}`,
            requestId,
          );
          return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
        }

        const chosenEffectiveRows = chosenRevision.rows;
        if (!areRowsEquivalent(payload.valueMap.effectiveRows, chosenEffectiveRows)) {
          const err = conflict('Selected global value mapping is not behavior-equivalent to imported effective rows', requestId);
          return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId, {
            reason: 'behavior-not-equivalent',
          });
        }

        const existingLink = await getProjectValueMapLink(projectId, resolution.selectedValueMapId);
        if (existingLink) {
          const err = conflict(`Project is already linked to value map: ${resolution.selectedValueMapId}`, requestId);
          return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
        }

        const createdAt = nowIso();
        const item: ValueMapProjectLinkItem = {
          valueTableId: projectLinkSk(projectId, resolution.selectedValueMapId),
          revision: 0,
          entityType: 'value-map-project-link',
          projectId,
          globalValueMapId: resolution.selectedValueMapId,
          pinnedRevision: resolution.selectedRevision,
          overlayRevision: 0,
          dependencyState: 'current',
          updateAvailable: resolution.selectedRevision < chosenGlobal.currentRevision,
          createdAt,
          createdBy: 'system',
          updatedAt: createdAt,
          updatedBy: 'system',
        };

        await putItem({
          TableName: getValueTableRevisionsTableOrThrow(),
          Item: item,
          ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
        });

        const detail = await resolveProjectValueMapDetail(projectId, resolution.selectedValueMapId);
        return jsonResponse(201, {
          importStatus: 'linked-via-resolution',
          detail,
        }, requestId);
      }
    }

    if (!resolution || resolution.action === 'project-copy') {
      const generatedKey = body.key?.trim() || `${payload.valueMap.key}-imported`;
      const createEvent: APIGatewayProxyEvent = {
        ...event,
        pathParameters: { id: projectId },
        body: JSON.stringify({
          projectId,
          key: generatedKey,
          name: body.name?.trim() || `${payload.valueMap.name} (Imported)` ,
          description: payload.valueMap.description,
          sideA: payload.valueMap.sideA,
          sideB: payload.valueMap.sideB,
          rows: payload.valueMap.effectiveRows,
        }),
      };

      const created = await createProjectValueTable(createEvent, requestId);
      if (created.statusCode !== 201) {
        return created;
      }

      const createdTable = JSON.parse(created.body) as ProjectValueTable;
      return jsonResponse(201, {
        importStatus: 'detached-project-copy',
        table: createdTable,
      }, requestId);
    }
  }

  if (!body.csv) {
    const err = validationError('Missing required fields: id and csv', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const lines = body.csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    const err = validationError('CSV must include a header row and at least one data row', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const headerLine = lines[0] ?? 'Side A,Side B,string,string';
  const [headerA = 'Side A', headerB = 'Side B', typeA = 'string', typeB = 'string'] = parseCsvLine(headerLine);
  const parsedTypeA = parseType(typeA.trim().toLowerCase()) ?? 'string';
  const parsedTypeB = parseType(typeB.trim().toLowerCase()) ?? 'string';

  const rows: ProjectValueTableRevisionRow[] = [];
  for (const line of lines.slice(1)) {
    const [rawA = '', rawB = '', description = ''] = parseCsvLine(line);
    const sideAValue = coercePrimitive(rawA, parsedTypeA);
    const sideBValue = coercePrimitive(rawB, parsedTypeB);

    if (sideAValue === null || sideBValue === null) {
      const err = validationError('CSV row contains invalid typed values', requestId);
      return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
    }

    rows.push({
      id: crypto.randomUUID(),
      sideAValue,
      sideBValue,
      ...(description.trim().length > 0 ? { description: description.trim() } : {}),
    });
  }

  const generatedKey = body.key?.trim().length
    ? body.key.trim()
    : headerA
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `value-table-${crypto.randomUUID()}`;

  const createEvent: APIGatewayProxyEvent = {
    ...event,
    pathParameters: { id: projectId },
    body: JSON.stringify({
      projectId,
      key: generatedKey,
      name: body.name?.trim() || `${headerA} / ${headerB}`,
      sideA: {
        key: `${generatedKey}-a`,
        label: headerA,
        type: parsedTypeA,
      },
      sideB: {
        key: `${generatedKey}-b`,
        label: headerB,
        type: parsedTypeB,
      },
      rows,
    }),
  };

  const created = await createProjectValueTable(createEvent, requestId);
  if (created.statusCode !== 201) {
    return created;
  }

  const createdTable = JSON.parse(created.body) as ProjectValueTable;
  const revision = await getValueTableRevision(createdTable.id, 1);
  return jsonResponse(201, revision, requestId);
}

async function resolveProjectValueTableReference(
  event: APIGatewayProxyEvent,
  requestId: string,
): Promise<APIGatewayProxyResult> {
  const projectId = parsePathParam(event, 'id');
  const body = parseBody(event) as ResolveProjectValueTableReferenceInput | null;

  if (!projectId || !body) {
    const err = validationError('Missing required path/body for resolve', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const tableCandidates = await query<ValueTableItem>({
    TableName: getValueTablesTableOrThrow(),
    IndexName: 'projectId-index',
    KeyConditionExpression: '#projectId = :projectId',
    ExpressionAttributeNames: {
      '#projectId': 'projectId',
    },
    ExpressionAttributeValues: {
      ':projectId': projectId,
    },
  });

  const table = body.valueTableId
    ? tableCandidates.find((candidate) => candidate.valueTableId === body.valueTableId)
    : tableCandidates.find((candidate) => candidate.key === body.tableKey);

  if (!table) {
    const err = notFound('ProjectValueTable', body.valueTableId ?? body.tableKey, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (table.status === 'archived') {
    const err = conflict(`Archived value table cannot be newly selected: ${table.valueTableId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const revision = await getValueTableRevision(table.valueTableId, body.revision);
  if (!revision) {
    const err = notFound('ProjectValueTableRevision', `${table.valueTableId}@${body.revision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const inputSide = body.inputSideKey === revision.sideA.key
    ? revision.sideA
    : body.inputSideKey === revision.sideB.key
      ? revision.sideB
      : null;
  const outputSide = body.outputSideKey === revision.sideA.key
    ? revision.sideA
    : body.outputSideKey === revision.sideB.key
      ? revision.sideB
      : null;

  if (!inputSide || !outputSide) {
    const err = validationError('Unknown value-table side key', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (inputSide.key === outputSide.key) {
    const err = validationError('Input and output side must differ', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const direction = inputSide.key === revision.sideA.key ? 'aToB' : 'bToA';
  if (!revision.directionSupport[direction]) {
    const err = validationError('Selected value-table direction is not supported', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const resolvedEntries: ValueTableResolvedEntry[] = revision.rows.map((row) => ({
    in: inputSide.key === revision.sideA.key ? row.sideAValue : row.sideBValue,
    out: outputSide.key === revision.sideA.key ? row.sideAValue : row.sideBValue,
    rowId: row.id,
  }));

  const payload: { ref: MappingRuleProjectValueTableRef } = {
    ref: {
      scope: 'project',
      valueTableId: table.valueTableId,
      tableKey: table.key,
      revision: revision.revision,
      inputSideKey: inputSide.key,
      outputSideKey: outputSide.key,
      inputType: inputSide.type,
      outputType: outputSide.type,
      resolvedEntries,
      sourceMeta: {
        tableName: table.name,
        revisionCreatedAt: revision.createdAt,
      },
    },
  };

  return jsonResponse(200, payload, requestId);
}

async function listProjectValueMaps(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parseProjectIdFromEvent(event);
  if (!projectId) {
    const err = validationError('Missing required path parameter: projectId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const links = await listProjectValueMapLinks(projectId);
  const summaries: ProjectValueMapLinkSummary[] = [];

  for (const link of links) {
    const globalMap = await getValueTable(link.globalValueMapId);
    if (!globalMap || !isGlobalValueMap(globalMap)) {
      continue;
    }

    summaries.push({
      projectId,
      valueMapId: link.globalValueMapId,
      key: globalMap.key,
      name: globalMap.name,
      pinnedRevision: link.pinnedRevision,
      latestRevision: globalMap.currentRevision,
      overlayRevision: link.overlayRevision,
      updateAvailable: link.updateAvailable,
      dependencyState: link.dependencyState,
      status: globalMap.status,
    });
  }

  return jsonResponse(200, summaries, requestId);
}

async function linkProjectValueMap(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parseProjectIdFromEvent(event);
  const body = parseBody(event) as LinkProjectValueMapInput | null;
  if (!projectId || !body?.valueMapId || !body.revision) {
    const err = validationError('Missing required fields: projectId, valueMapId, revision', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const globalMap = await getValueTable(body.valueMapId);
  if (!globalMap || !isGlobalValueMap(globalMap)) {
    const err = notFound('GlobalValueMap', body.valueMapId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (globalMap.status === 'archived') {
    const err = conflict(`Archived value map cannot be newly linked: ${body.valueMapId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const revision = await getValueTableRevision(body.valueMapId, body.revision);
  if (!revision) {
    const err = notFound('GlobalValueMapRevision', `${body.valueMapId}@${body.revision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const existing = await getProjectValueMapLink(projectId, body.valueMapId);
  if (existing) {
    const err = conflict(`Project is already linked to value map: ${body.valueMapId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const createdAt = nowIso();
  const item: ValueMapProjectLinkItem = {
    valueTableId: projectLinkSk(projectId, body.valueMapId),
    revision: 0,
    entityType: 'value-map-project-link',
    projectId,
    globalValueMapId: body.valueMapId,
    pinnedRevision: body.revision,
    overlayRevision: 0,
    dependencyState: 'current',
    updateAvailable: body.revision < globalMap.currentRevision,
    createdAt,
    createdBy: 'system',
    updatedAt: createdAt,
    updatedBy: 'system',
  };

  await putItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Item: item,
    ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
  });

  const detail = await resolveProjectValueMapDetail(projectId, body.valueMapId);
  return jsonResponse(201, detail ?? {
    projectId,
    valueMapId: body.valueMapId,
    key: globalMap.key,
    name: globalMap.name,
    pinnedRevision: body.revision,
    latestRevision: globalMap.currentRevision,
    overlayRevision: 0,
    updateAvailable: body.revision < globalMap.currentRevision,
    dependencyState: 'current',
    effectiveRows: revision.rows.map((row) => ({
      rowId: row.id,
      sideAValue: row.sideAValue,
      sideBValue: row.sideBValue,
      ...(row.description ? { description: row.description } : {}),
      provenance: 'inherited' as const,
    })),
  }, requestId);
}

async function getProjectValueMapDetail(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parseProjectIdFromEvent(event);
  const valueMapId = parsePathParam(event, 'valueTableId');
  if (!projectId || !valueMapId) {
    const err = validationError('Missing required path parameters: projectId and valueMapId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const detail = await resolveProjectValueMapDetail(projectId, valueMapId);
  if (!detail) {
    const err = notFound('ProjectValueMapLink', `${projectId}:${valueMapId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  return jsonResponse(200, detail, requestId);
}

async function updateProjectValueMapOverlay(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parseProjectIdFromEvent(event);
  const valueMapId = parsePathParam(event, 'valueTableId');
  const body = parseBody(event) as UpdateProjectValueMapOverlayInput | null;

  if (!projectId || !valueMapId || !body || !Array.isArray(body.operations)) {
    const err = validationError('Missing required fields: projectId, valueMapId, operations', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const link = await getProjectValueMapLink(projectId, valueMapId);
  if (!link) {
    const err = notFound('ProjectValueMapLink', `${projectId}:${valueMapId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  if (
    typeof body.expectedOverlayRevision === 'number'
    && body.expectedOverlayRevision !== link.overlayRevision
  ) {
    const err = conflict(
      `Overlay revision mismatch: expected ${link.overlayRevision}, got ${body.expectedOverlayRevision}`,
      requestId,
    );
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const nextOverlayRevision = link.overlayRevision + 1;
  const createdAt = nowIso();
  const contentHash = await computeRevisionHash({
    sideA: { key: 'overlay', label: 'overlay', type: 'string' },
    sideB: { key: 'overlay', label: 'overlay', type: 'string' },
    rows: body.operations.map((operation) => ({
      id: operation.operationId,
      sideAValue: operation.type,
      sideBValue: operation.targetRowId ?? operation.row?.id ?? '',
    })),
  });

  const overlayRevision: ValueMapOverlayRevisionItem = {
    valueTableId: projectLinkSk(projectId, valueMapId),
    revision: nextOverlayRevision,
    entityType: 'value-map-overlay-revision',
    operationCount: body.operations.length,
    operations: body.operations,
    contentHash,
    createdAt,
    createdBy: 'system',
  };

  await putItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Item: overlayRevision,
    ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
  });

  await updateItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Key: {
      valueTableId: projectLinkSk(projectId, valueMapId),
      revision: 0,
    },
    UpdateExpression:
      'SET #overlayRevision = :overlayRevision, #dependencyState = :dependencyState, #updatedAt = :updatedAt, #updatedBy = :updatedBy',
    ConditionExpression: '#overlayRevision = :expectedOverlayRevision',
    ExpressionAttributeNames: {
      '#overlayRevision': 'overlayRevision',
      '#dependencyState': 'dependencyState',
      '#updatedAt': 'updatedAt',
      '#updatedBy': 'updatedBy',
    },
    ExpressionAttributeValues: {
      ':overlayRevision': nextOverlayRevision,
      ':dependencyState': 'needs-review',
      ':updatedAt': createdAt,
      ':updatedBy': 'system',
      ':expectedOverlayRevision': link.overlayRevision,
    },
  });

  const detail = await resolveProjectValueMapDetail(projectId, valueMapId);
  return jsonResponse(200, detail, requestId);
}

async function reviewProjectValueMapUpdate(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parseProjectIdFromEvent(event);
  const valueMapId = parsePathParam(event, 'valueTableId');
  const body = parseBody(event) as ReviewProjectValueMapUpdateInput | null;

  if (!projectId || !valueMapId) {
    const err = validationError('Missing required path parameters: projectId and valueMapId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const link = await getProjectValueMapLink(projectId, valueMapId);
  if (!link) {
    const err = notFound('ProjectValueMapLink', `${projectId}:${valueMapId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const globalMap = await getValueTable(valueMapId);
  if (!globalMap || !isGlobalValueMap(globalMap)) {
    const err = notFound('GlobalValueMap', valueMapId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const candidateRevision = body?.candidateRevision ?? globalMap.currentRevision;
  const candidate = await getValueTableRevision(valueMapId, candidateRevision);
  const pinned = await getValueTableRevision(valueMapId, link.pinnedRevision);

  if (!candidate || !pinned) {
    const err = notFound('GlobalValueMapRevision', `${valueMapId}@${candidateRevision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const pinnedIds = new Set(pinned.rows.map((row) => row.id));
  const candidateIds = new Set(candidate.rows.map((row) => row.id));

  const orphanedRowIds = Array.from(pinnedIds).filter((rowId) => !candidateIds.has(rowId));
  const conflicts: Array<{ type: 'orphan'; rowId: string; message: string }> = orphanedRowIds.map((rowId) => ({
    type: 'orphan',
    rowId,
    message: `Overlay target row no longer exists in candidate revision: ${rowId}`,
  }));

  return jsonResponse(200, {
    projectId,
    valueMapId,
    currentPinnedRevision: link.pinnedRevision,
    candidateRevision,
    updateAvailable: candidateRevision > link.pinnedRevision,
    conflicts,
    orphanedRowIds,
    canAccept: conflicts.length === 0,
  }, requestId);
}

async function acceptProjectValueMapUpdate(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parseProjectIdFromEvent(event);
  const valueMapId = parsePathParam(event, 'valueTableId');
  const body = parseBody(event) as AcceptProjectValueMapUpdateInput | null;

  if (!projectId || !valueMapId || !body?.candidateRevision) {
    const err = validationError('Missing required fields: projectId, valueMapId, candidateRevision', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const link = await getProjectValueMapLink(projectId, valueMapId);
  if (!link) {
    const err = notFound('ProjectValueMapLink', `${projectId}:${valueMapId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const candidate = await getValueTableRevision(valueMapId, body.candidateRevision);
  const pinned = await getValueTableRevision(valueMapId, link.pinnedRevision);
  if (!candidate || !pinned) {
    const err = notFound('GlobalValueMapRevision', `${valueMapId}@${body.candidateRevision}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const pinnedIds = new Set(pinned.rows.map((row) => row.id));
  const candidateIds = new Set(candidate.rows.map((row) => row.id));
  const orphanedRowIds = Array.from(pinnedIds).filter((rowId) => !candidateIds.has(rowId));
  const resolved = new Set(body.resolveOrphansAsExcludes ?? []);
  const unresolved = orphanedRowIds.filter((rowId) => !resolved.has(rowId));

  if (unresolved.length > 0) {
    const err = conflict('Cannot accept update while unresolved conflicts/orphans remain', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId, {
      unresolvedOrphans: unresolved,
    });
  }

  await updateItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Key: {
      valueTableId: projectLinkSk(projectId, valueMapId),
      revision: 0,
    },
    UpdateExpression:
      'SET #pinnedRevision = :pinnedRevision, #dependencyState = :dependencyState, #updateAvailable = :updateAvailable, #updatedAt = :updatedAt, #updatedBy = :updatedBy',
    ExpressionAttributeNames: {
      '#pinnedRevision': 'pinnedRevision',
      '#dependencyState': 'dependencyState',
      '#updateAvailable': 'updateAvailable',
      '#updatedAt': 'updatedAt',
      '#updatedBy': 'updatedBy',
    },
    ExpressionAttributeValues: {
      ':pinnedRevision': body.candidateRevision,
      ':dependencyState': 'needs-review',
      ':updateAvailable': false,
      ':updatedAt': nowIso(),
      ':updatedBy': 'system',
    },
  });

  const detail = await resolveProjectValueMapDetail(projectId, valueMapId);
  return jsonResponse(200, detail, requestId);
}

async function unlinkProjectValueMap(event: APIGatewayProxyEvent, requestId: string): Promise<APIGatewayProxyResult> {
  const projectId = parseProjectIdFromEvent(event);
  const valueMapId = parsePathParam(event, 'valueTableId');
  if (!projectId || !valueMapId) {
    const err = validationError('Missing required path parameters: projectId and valueMapId', requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const link = await getProjectValueMapLink(projectId, valueMapId);
  if (!link) {
    const err = notFound('ProjectValueMapLink', `${projectId}:${valueMapId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const valueTable = await getValueTable(valueMapId);
  if (!valueTable) {
    const err = notFound('GlobalValueMap', valueMapId, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }

  const usage = await buildUsageEntries(valueTable);
  const linkedUsage = usage.filter((entry) => entry.valueTableId === valueMapId);
  if (linkedUsage.length > 0) {
    const err = conflict(`Cannot unlink value map while mappings reference it: ${valueMapId}`, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId, {
      usageCount: linkedUsage.length,
      usage: linkedUsage,
    });
  }

  await deleteItem({
    TableName: getValueTableRevisionsTableOrThrow(),
    Key: {
      valueTableId: projectLinkSk(projectId, valueMapId),
      revision: 0,
    },
  });

  const overlays = await listOverlayRevisions(projectId, valueMapId);
  for (const overlay of overlays) {
    await deleteItem({
      TableName: getValueTableRevisionsTableOrThrow(),
      Key: {
        valueTableId: overlay.valueTableId,
        revision: overlay.revision,
      },
    });
  }

  return jsonResponse(204, null, requestId);
}

async function wrap(
  event: APIGatewayProxyEvent,
  fn: (event: APIGatewayProxyEvent, requestId: string) => Promise<APIGatewayProxyResult>,
): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();
  try {
    return await fn(event, requestId);
  } catch (error) {
    if (error instanceof DynamoServiceError || error instanceof S3ServiceError) {
      return errorResponse(
        error.appError.code,
        error.appError.message,
        error.appError.statusCode,
        error.appError.retryable,
        requestId,
      );
    }

    const err = internalError(undefined, requestId);
    return errorResponse(err.code, err.message, err.statusCode, err.retryable, requestId);
  }
}

export async function listProjectValueTablesHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, listProjectValueTables);
}

export async function getProjectValueTableHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, getProjectValueTable);
}

export async function getProjectValueTableRevisionHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, getProjectValueTableRevision);
}

export async function createProjectValueTableHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, createProjectValueTable);
}

export async function createProjectValueTableRevisionHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, createProjectValueTableRevision);
}

export async function duplicateProjectValueTableHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, duplicateProjectValueTable);
}

export async function archiveProjectValueTableHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, archiveProjectValueTable);
}

export async function deleteProjectValueTableHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, deleteProjectValueTable);
}

export async function listProjectValueTableUsageHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, listProjectValueTableUsage);
}

export async function listProjectValueMapsHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, listProjectValueMaps);
}

export async function linkProjectValueMapHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, linkProjectValueMap);
}

export async function getProjectValueMapDetailHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, getProjectValueMapDetail);
}

export async function updateProjectValueMapOverlayHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, updateProjectValueMapOverlay);
}

export async function reviewProjectValueMapUpdateHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, reviewProjectValueMapUpdate);
}

export async function acceptProjectValueMapUpdateHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, acceptProjectValueMapUpdate);
}

export async function unlinkProjectValueMapHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, unlinkProjectValueMap);
}

export async function listGlobalValueMapsHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, listGlobalValueMaps);
}

export async function createGlobalValueMapHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, createGlobalValueMap);
}

export async function promoteProjectValueMapHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, promoteProjectValueMap);
}

export async function listValueTableRevisionsHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, listValueTableRevisions);
}

export async function getProjectValueTableRevisionDiffHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, getProjectValueTableRevisionDiff);
}

export async function exportProjectValueTableCsvHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, exportProjectValueTableCsv);
}

export async function importProjectValueTableCsvHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  return wrap(event, importProjectValueTableCsv);
}

export async function resolveProjectValueTableReferenceHandler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  return wrap(event, resolveProjectValueTableReference);
}
