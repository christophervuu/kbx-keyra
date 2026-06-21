import { DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import { computeConfigHash } from './hash.js';
import { getMappingConfig } from './s3/mapping-config.js';
import { getValueTableRevisionRows, putValueTableRevisionRows } from './s3/value-table-revisions.js';
import type {
  CreateValueTableInput,
  CreateValueTableRevisionInput,
  MappingConfig,
  MappingItem,
  MappingRuleProjectValueTableRef,
  ProjectValueTable,
  ProjectValueTableRevision,
  ProjectValueTableRevisionRow,
  ResolveValueTableReferenceInput,
  ValueTableDirectionSupport,
  ValueTableItem,
  ValueTablePrimitiveValue,
  ValueTableResolvedEntry,
  ValueTableRevisionItem,
  ValueTableUsageEntry,
} from './types.js';
import { toProjectValueTable } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
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

export function computeDirectionSupport(rows: readonly ProjectValueTableRevisionRow[]): ValueTableDirectionSupport {
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
  readonly sideA: ValueTableItem['sideA'];
  readonly sideB: ValueTableItem['sideB'];
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

async function putRevision(
  valueTableId: string,
  revision: number,
  sideA: ValueTableRevisionItem['sideA'],
  sideB: ValueTableRevisionItem['sideB'],
  rows: readonly ProjectValueTableRevisionRow[],
  createdBy: string,
): Promise<ValueTableRevisionItem> {
  const directionSupport = computeDirectionSupport(rows);
  const contentHash = await computeRevisionHash({
    sideA,
    sideB,
    rows,
  });
  const rowsS3Key = await putValueTableRevisionRows(valueTableId, revision, rows);
  const createdAt = nowIso();

  const revisionItem: ValueTableRevisionItem = {
    valueTableId,
    revision,
    sideA,
    sideB,
    rowCount: rows.length,
    directionSupport,
    rowsS3Key,
    contentHash,
    createdAt,
    createdBy,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.valueTableRevisions,
      Item: revisionItem,
      ConditionExpression: 'attribute_not_exists(valueTableId) AND attribute_not_exists(revision)',
    }),
  );

  return revisionItem;
}

async function toProjectRevision(item: ValueTableRevisionItem): Promise<ProjectValueTableRevision | null> {
  const rows = await getValueTableRevisionRows(item.valueTableId, item.revision);
  if (!rows) {
    return null;
  }

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

export async function listByProject(projectId: string): Promise<ProjectValueTable[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAMES.valueTables,
      IndexName: 'projectId-index',
      KeyConditionExpression: '#projectId = :projectId',
      ExpressionAttributeNames: {
        '#projectId': 'projectId',
      },
      ExpressionAttributeValues: {
        ':projectId': projectId,
      },
    }),
  );

  const items = (result.Items as ValueTableItem[] | undefined) ?? [];
  return items.map(toProjectValueTable);
}

export async function get(valueTableId: string): Promise<ProjectValueTable | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.valueTables,
      Key: { valueTableId },
    }),
  );

  const item = (result.Item as ValueTableItem | undefined) ?? null;
  return item ? toProjectValueTable(item) : null;
}

export async function getItem(valueTableId: string): Promise<ValueTableItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.valueTables,
      Key: { valueTableId },
    }),
  );

  return (result.Item as ValueTableItem | undefined) ?? null;
}

export async function getRevisionItem(valueTableId: string, revision: number): Promise<ValueTableRevisionItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.valueTableRevisions,
      Key: {
        valueTableId,
        revision,
      },
    }),
  );

  return (result.Item as ValueTableRevisionItem | undefined) ?? null;
}

export async function getRevision(
  valueTableId: string,
  revision: number,
): Promise<ProjectValueTableRevision | null> {
  const item = await getRevisionItem(valueTableId, revision);
  if (!item) {
    return null;
  }

  return toProjectRevision(item);
}

export async function create(input: CreateValueTableInput): Promise<ProjectValueTable> {
  const rows = normalizeRows(input.rows);
  const valueTableId = crypto.randomUUID();
  const createdAt = nowIso();
  const createdBy = input.createdBy ?? 'system';

  const existing = await listByProject(input.projectId);
  if (existing.some((table) => table.key === input.key)) {
    throw new Error(`Value table key already exists in project: ${input.key}`);
  }

  const tableItem: ValueTableItem = {
    valueTableId,
    projectId: input.projectId,
    key: input.key,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    sideA: input.sideA,
    sideB: input.sideB,
    currentRevision: 1,
    currentRowCount: rows.length,
    status: 'active',
    createdAt,
    createdBy,
    updatedAt: createdAt,
    updatedBy: createdBy,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.valueTables,
      Item: tableItem,
      ConditionExpression: 'attribute_not_exists(valueTableId)',
    }),
  );

  await putRevision(
    valueTableId,
    1,
    input.sideA,
    input.sideB,
    rows,
    createdBy,
  );

  return toProjectValueTable(tableItem);
}

export async function createRevision(input: CreateValueTableRevisionInput): Promise<ProjectValueTableRevision> {
  const existing = await getItem(input.valueTableId);
  if (!existing) {
    throw new Error(`Value table not found: ${input.valueTableId}`);
  }

  if (existing.status === 'archived') {
    throw new Error(`Cannot create revision for archived value table: ${input.valueTableId}`);
  }

  if (
    typeof input.expectedCurrentRevision === 'number'
    && input.expectedCurrentRevision !== existing.currentRevision
  ) {
    throw new Error(`Revision mismatch: expected ${existing.currentRevision}, got ${input.expectedCurrentRevision}`);
  }

  const rows = normalizeRows(input.rows);
  const nextRevision = existing.currentRevision + 1;
  const createdBy = input.createdBy ?? 'system';

  const revisionItem = await putRevision(
    input.valueTableId,
    nextRevision,
    input.sideA,
    input.sideB,
    rows,
    createdBy,
  );

  const updatedAt = nowIso();
  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.valueTables,
      Key: { valueTableId: input.valueTableId },
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
        ':updatedBy': createdBy,
        ':expectedRevision': existing.currentRevision,
      },
    }),
  );

  const projectRevision = await toProjectRevision(revisionItem);
  if (!projectRevision) {
    throw new Error(`Failed to read revision rows: ${input.valueTableId}@${nextRevision}`);
  }

  return projectRevision;
}

export async function archive(valueTableId: string): Promise<ProjectValueTable | null> {
  await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.valueTables,
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
    }),
  );

  return get(valueTableId);
}

export async function remove(valueTableId: string): Promise<void> {
  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAMES.valueTables,
      Key: { valueTableId },
    }),
  );
}

async function listMappings(): Promise<MappingItem[]> {
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAMES.mappings,
    }),
  );

  return (result.Items as MappingItem[] | undefined) ?? [];
}

function extractProjectRefs(config: MappingConfig): readonly MappingRuleProjectValueTableRef[] {
  const refs: MappingRuleProjectValueTableRef[] = [];
  const rules = Array.isArray(config.rules) ? config.rules : [];

  for (const rule of rules) {
    const candidate = rule.valueTableRef as MappingRuleProjectValueTableRef | undefined;
    if (candidate?.scope === 'project') {
      refs.push(candidate);
    }
  }

  return refs;
}

export async function listUsage(valueTableId: string): Promise<ValueTableUsageEntry[]> {
  const table = await getItem(valueTableId);
  if (!table) {
    return [];
  }

  const mappings = await listMappings();
  const usage: ValueTableUsageEntry[] = [];

  for (const mapping of mappings) {
    if (!mapping.configS3Key) {
      continue;
    }

    const config = await getMappingConfig(mapping.mappingId);
    if (!config) {
      continue;
    }

    const refs = extractProjectRefs(config);
    for (const ref of refs) {
      if (ref.valueTableId !== valueTableId) {
        continue;
      }

      const direction = ref.inputSideKey === table.sideA.key && ref.outputSideKey === table.sideB.key
        ? 'a_to_b'
        : 'b_to_a';
      const latestRevision = table.currentRevision;
      const latestRevisionItem = await getRevisionItem(valueTableId, latestRevision);
      const latestDirectionSupported = direction === 'a_to_b'
        ? latestRevisionItem?.directionSupport.aToB
        : latestRevisionItem?.directionSupport.bToA;

      usage.push({
        valueTableId,
        tableKey: table.key,
        mappingId: mapping.mappingId,
        mappingName: mapping.name,
        mappingVersion: mapping.revision ?? mapping.version,
        pinnedRevision: ref.revision,
        direction,
        inputSideKey: ref.inputSideKey,
        outputSideKey: ref.outputSideKey,
        newerRevisionAvailable: ref.revision < latestRevision,
        latestRevision,
        latestDirectionSupported,
        updatedAt: mapping.updatedAt,
      });
    }
  }

  return usage;
}

export async function resolveReference(
  input: ResolveValueTableReferenceInput,
): Promise<{ ref: MappingRuleProjectValueTableRef } | null> {
  const tables = await listByProject(input.projectId);
  const table = input.valueTableId
    ? tables.find((candidate) => candidate.id === input.valueTableId)
    : tables.find((candidate) => candidate.key === input.tableKey);

  if (!table || table.status === 'archived') {
    return null;
  }

  const revision = await getRevision(table.id, input.revision);
  if (!revision) {
    return null;
  }

  const inputSide = input.inputSideKey === revision.sideA.key
    ? revision.sideA
    : input.inputSideKey === revision.sideB.key
      ? revision.sideB
      : null;
  const outputSide = input.outputSideKey === revision.sideA.key
    ? revision.sideA
    : input.outputSideKey === revision.sideB.key
      ? revision.sideB
      : null;

  if (!inputSide || !outputSide || inputSide.key === outputSide.key) {
    return null;
  }

  const direction = inputSide.key === revision.sideA.key ? 'aToB' : 'bToA';
  if (!revision.directionSupport[direction]) {
    return null;
  }

  const resolvedEntries: ValueTableResolvedEntry[] = revision.rows.map((row) => ({
    in: inputSide.key === revision.sideA.key ? row.sideAValue : row.sideBValue,
    out: outputSide.key === revision.sideA.key ? row.sideAValue : row.sideBValue,
    rowId: row.id,
  }));

  return {
    ref: {
      scope: 'project',
      valueTableId: table.id,
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
}

export const valueTables = {
  create,
  createRevision,
  get,
  getItem,
  getRevision,
  getRevisionItem,
  listByProject,
  listUsage,
  archive,
  delete: remove,
  resolveReference,
};
