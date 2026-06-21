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
  readonly projectId: string;
  readonly key: string;
  readonly name: string;
  readonly description?: string;
  readonly sideA: ValueTableSideDefinition;
  readonly sideB: ValueTableSideDefinition;
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
  readonly valueTableRef?: {
    readonly scope?: string;
    readonly valueTableId?: string;
    readonly revision?: number;
    readonly inputSideKey?: string;
    readonly outputSideKey?: string;
  };
}

interface MappingConfig {
  readonly rules?: readonly MappingConfigRule[];
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
}

interface ResolveProjectValueTableReferenceInput {
  readonly projectId: string;
  readonly valueTableId?: string;
  readonly tableKey: string;
  readonly revision: number;
  readonly inputSideKey: string;
  readonly outputSideKey: string;
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

function nowIso(): string {
  return new Date().toISOString();
}

function toProjectValueTable(item: ValueTableItem): ProjectValueTable {
  return {
    id: item.valueTableId,
    projectId: item.projectId,
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
  return jsonResponse(200, usage, requestId);
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
  } | null;

  if (!projectId || !body?.csv) {
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
