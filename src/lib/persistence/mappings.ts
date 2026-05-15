import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';

import { dynamoClient, s3Client } from './clients.js';
import { BUCKET_NAME, TABLE_NAMES, mappingConfigKey } from './config.js';
import type { CreateMappingInput, MappingConfig, MappingItem, MappingStatus, UpdateMappingInput } from './types.js';

type MappingCreateInput = Omit<CreateMappingInput, 'configS3Key'> & { readonly config: MappingConfig };
type MappingUpdateField = keyof UpdateMappingInput;

async function readObjectBodyAsString(output: GetObjectCommandOutput): Promise<string | null> {
  const body = output.Body;
  if (!body) {
    return null;
  }

  if (typeof body === 'string') {
    return body;
  }

  const candidate = body as { transformToString?: () => Promise<string> };
  if (typeof candidate.transformToString === 'function') {
    return candidate.transformToString();
  }

  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createMappingId(): string {
  return crypto.randomUUID();
}

function inferStatus(config: MappingConfig): MappingStatus {
  return config.rules.length === 0 ? 'draft' : 'ready';
}

function createConfigPayload(config: MappingConfig, mappingId: string, projectId: string, name: string, version: number): MappingConfig {
  return {
    ...config,
    id: mappingId,
    projectId,
    name,
    version,
  };
}

async function putMappingConfig(configS3Key: string, config: MappingConfig): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: configS3Key,
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    }),
  );
}

async function getMappingConfig(configS3Key: string): Promise<MappingConfig | null> {
  const output = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: configS3Key,
    }),
  );

  const content = await readObjectBodyAsString(output);
  if (!content) {
    return null;
  }

  return JSON.parse(content) as MappingConfig;
}

function buildMappingUpdateExpression(
  fields: UpdateMappingInput,
): Pick<UpdateCommandInput, 'UpdateExpression' | 'ExpressionAttributeNames' | 'ExpressionAttributeValues'> {
  const names: Record<string, string> = {
    '#version': 'version',
    '#updatedAt': 'updatedAt',
  };
  const values: Record<string, unknown> = {
    ':one': 1,
    ':updatedAt': nowIso(),
  };

  const updates: string[] = ['#version = #version + :one', '#updatedAt = :updatedAt'];
  const updatableKeys: readonly MappingUpdateField[] = [
    'name',
    'sourceSchemaId',
    'targetSchemaId',
    'status',
    'ruleCount',
    'coverage',
    'configS3Key',
  ];

  for (const key of updatableKeys) {
    const value = fields[key];
    if (value === undefined) {
      continue;
    }

    const nameKey = `#${key}`;
    const valueKey = `:${key}`;
    names[nameKey] = key;
    values[valueKey] = value;
    updates.push(`${nameKey} = ${valueKey}`);
  }

  return {
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

export async function create(input: MappingCreateInput): Promise<MappingItem> {
  const mappingId = createMappingId();
  const timestamp = nowIso();
  const configS3Key = mappingConfigKey(mappingId);
  const sourceSchemaId = input.config.sourceSchemaRef?.schemaId ?? input.sourceSchemaId;
  const targetSchemaId = input.config.targetSchemaRef?.schemaId ?? input.targetSchemaId;
  const ruleCount = input.ruleCount ?? input.config.rules.length;
  const item: MappingItem = {
    mappingId,
    projectId: input.projectId,
    name: input.name,
    version: 1,
    sourceSchemaId,
    targetSchemaId,
    status: input.status ?? inferStatus(input.config),
    ruleCount,
    coverage: input.coverage ?? 0,
    configS3Key,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const configPayload = createConfigPayload(input.config, mappingId, input.projectId, input.name, 1);
  await putMappingConfig(configS3Key, configPayload);
  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.mappings,
      Item: item,
    }),
  );

  return item;
}

export async function get(mappingId: string): Promise<MappingItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.mappings,
      Key: {
        mappingId,
      },
    }),
  );

  return (result.Item as MappingItem | undefined) ?? null;
}

export async function listByProject(projectId: string): Promise<MappingItem[]> {
  const result = await dynamoClient.send(
    new QueryCommand({
      TableName: TABLE_NAMES.mappings,
      IndexName: 'projectId-index',
      KeyConditionExpression: 'projectId = :projectId',
      ExpressionAttributeValues: {
        ':projectId': projectId,
      },
    }),
  );

  return (result.Items as MappingItem[] | undefined) ?? [];
}

export async function update(
  mappingId: string,
  fields: UpdateMappingInput,
  config?: MappingConfig,
): Promise<MappingItem> {
  const existing = await get(mappingId);
  if (!existing) {
    throw new Error(`Mapping not found: ${mappingId}`);
  }

  if (config) {
    const nextVersion = existing.version + 1;
    const nextName = fields.name ?? existing.name;
    const nextProjectId = existing.projectId;
    const payload = createConfigPayload(config, mappingId, nextProjectId, nextName, nextVersion);
    await putMappingConfig(existing.configS3Key, payload);
  }

  const expression = buildMappingUpdateExpression(fields);
  const result = await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.mappings,
      Key: {
        mappingId,
      },
      ...expression,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as MappingItem;
}

export async function remove(mappingId: string): Promise<void> {
  const existing = await get(mappingId);
  if (!existing) {
    return;
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: existing.configS3Key,
    }),
  );

  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAMES.mappings,
      Key: {
        mappingId,
      },
    }),
  );
}

export async function duplicate(mappingId: string, newName: string): Promise<MappingItem> {
  const existing = await get(mappingId);
  if (!existing) {
    throw new Error(`Mapping not found: ${mappingId}`);
  }

  const existingConfig = await getMappingConfig(existing.configS3Key);
  if (!existingConfig) {
    throw new Error(`Mapping config not found: ${existing.configS3Key}`);
  }

  const duplicateConfig: MappingConfig = {
    ...existingConfig,
    name: newName,
    version: 1,
  };

  return create({
    projectId: existing.projectId,
    name: newName,
    sourceSchemaId: existing.sourceSchemaId,
    targetSchemaId: existing.targetSchemaId,
    status: existing.status,
    ruleCount: existing.ruleCount,
    coverage: existing.coverage,
    config: duplicateConfig,
  });
}

export { remove as delete };

export const mappings = {
  create,
  get,
  listByProject,
  update,
  delete: remove,
  duplicate,
};
