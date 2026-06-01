import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { createHash } from 'node:crypto';

import type {
  CreateMappingInput,
  CreateProjectInput,
  CreateSchemaMetadataInput,
  MappingConfig,
  MappingItem,
  MappingStatus,
  MappingVersionItem,
  ProjectItem,
  SchemaIngestStatus,
  SchemaMetadataItem,
  SchemaNodeItem,
  UpdateMappingInput,
  UpdateProjectInput,
} from '../../../../../src/lib/persistence/types.js';

function mappingConfigKey(mappingId: string): string {
  return `mappings/${mappingId}/config.json`;
}

function mappingVersionKey(mappingId: string, version: number): string {
  return `mappings/${mappingId}/versions/v${version}.json`;
}

function schemaOriginalKey(schemaId: string, ext: string): string {
  return `schemas/${schemaId}/original.${ext}`;
}

function schemaContentKey(schemaId: string): string {
  return `schemas/${schemaId}/content.json`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function computeConfigHash(config: MappingConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

async function readBodyAsString(output: unknown): Promise<string | null> {
  const maybeOutput = output as { Body?: unknown };
  const body = maybeOutput.Body;
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

function isNoSuchKey(error: unknown): boolean {
  const maybe = error as { name?: string; Code?: string } | undefined;
  return maybe?.name === 'NoSuchKey' || maybe?.Code === 'NoSuchKey';
}

export function createProjectsModule(deps: {
  readonly dynamoClient: DynamoDBDocumentClient;
  readonly tableName: string;
}) {
  async function create(input: CreateProjectInput): Promise<ProjectItem> {
    const timestamp = nowIso();
    const item: ProjectItem = {
      projectId: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      slug: input.slug,
      schemaRefs: input.schemaRefs ?? [],
      tags: input.tags ?? [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await deps.dynamoClient.send(new PutCommand({
      TableName: deps.tableName,
      Item: item,
    }));

    return item;
  }

  async function get(projectId: string): Promise<ProjectItem | null> {
    const result = await deps.dynamoClient.send(new GetCommand({
      TableName: deps.tableName,
      Key: { projectId },
    }));

    return (result.Item as ProjectItem | undefined) ?? null;
  }

  async function list(): Promise<ProjectItem[]> {
    const result = await deps.dynamoClient.send(new ScanCommand({
      TableName: deps.tableName,
    }));

    return (result.Items as ProjectItem[] | undefined) ?? [];
  }

  async function update(projectId: string, fields: UpdateProjectInput): Promise<ProjectItem> {
    const names: Record<string, string> = {
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':updatedAt': nowIso(),
    };
    const updates: string[] = ['#updatedAt = :updatedAt'];

    const updatableKeys: readonly (keyof UpdateProjectInput)[] = ['name', 'description', 'slug', 'schemaRefs', 'tags'];
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

    const result = await deps.dynamoClient.send(new UpdateCommand({
      TableName: deps.tableName,
      Key: { projectId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }));

    return result.Attributes as ProjectItem;
  }

  async function remove(projectId: string): Promise<void> {
    await deps.dynamoClient.send(new DeleteCommand({
      TableName: deps.tableName,
      Key: { projectId },
    }));
  }

  return {
    create,
    get,
    list,
    update,
    delete: remove,
  };
}

export function createMappingsModule(deps: {
  readonly dynamoClient: DynamoDBDocumentClient;
  readonly s3Client: S3Client;
  readonly tableName: string;
  readonly bucketName: string;
}) {
  type MappingCreateInput = Omit<CreateMappingInput, 'configS3Key'> & { readonly config: MappingConfig };

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

  async function putConfig(configS3Key: string, config: MappingConfig): Promise<void> {
    await deps.s3Client.send(new PutObjectCommand({
      Bucket: deps.bucketName,
      Key: configS3Key,
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    }));
  }

  async function getConfigByKey(configS3Key: string): Promise<MappingConfig | null> {
    try {
      const output = await deps.s3Client.send(new GetObjectCommand({
        Bucket: deps.bucketName,
        Key: configS3Key,
      }));

      const content = await readBodyAsString(output);
      if (!content) {
        return null;
      }
      return JSON.parse(content) as MappingConfig;
    } catch (error) {
      if (isNoSuchKey(error)) {
        return null;
      }
      throw error;
    }
  }

  async function create(input: MappingCreateInput): Promise<MappingItem> {
    const mappingId = crypto.randomUUID();
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
      revision: 1,
      latestVersion: null,
      configHash: computeConfigHash(input.config),
      sourceSchemaId,
      targetSchemaId,
      status: input.status ?? inferStatus(input.config),
      ruleCount,
      coverage: input.coverage ?? 0,
      configS3Key,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await putConfig(configS3Key, createConfigPayload(input.config, mappingId, input.projectId, input.name, 1));

    await deps.dynamoClient.send(new PutCommand({
      TableName: deps.tableName,
      Item: item,
    }));

    return item;
  }

  async function get(mappingId: string): Promise<MappingItem | null> {
    const result = await deps.dynamoClient.send(new GetCommand({
      TableName: deps.tableName,
      Key: { mappingId },
    }));

    return (result.Item as MappingItem | undefined) ?? null;
  }

  async function listByProject(projectId: string): Promise<MappingItem[]> {
    const result = await deps.dynamoClient.send(new QueryCommand({
      TableName: deps.tableName,
      IndexName: 'projectId-index',
      KeyConditionExpression: 'projectId = :projectId',
      ExpressionAttributeValues: {
        ':projectId': projectId,
      },
    }));

    return (result.Items as MappingItem[] | undefined) ?? [];
  }

  async function update(mappingId: string, fields: UpdateMappingInput, config?: MappingConfig): Promise<MappingItem> {
    const existing = await get(mappingId);
    if (!existing) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }

    if (config) {
      const currentRevision = existing.revision ?? existing.version ?? 0;
      const payload = createConfigPayload(
        config,
        mappingId,
        existing.projectId,
        fields.name ?? existing.name,
        currentRevision + 1,
      );
      await putConfig(existing.configS3Key, payload);
    }

    const names: Record<string, string> = {
      '#revision': 'revision',
      '#version': 'version',
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':one': 1,
      ':updatedAt': nowIso(),
    };
    const updates: string[] = ['#revision = #version + :one', '#version = #version + :one', '#updatedAt = :updatedAt'];

    const updatableKeys: readonly (keyof UpdateMappingInput)[] = [
      'name',
      'sourceSchemaId',
      'targetSchemaId',
      'status',
      'ruleCount',
      'coverage',
      'configS3Key',
      'configHash',
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

    const result = await deps.dynamoClient.send(new UpdateCommand({
      TableName: deps.tableName,
      Key: { mappingId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }));

    return result.Attributes as MappingItem;
  }

  async function remove(mappingId: string): Promise<void> {
    const existing = await get(mappingId);
    if (!existing) {
      return;
    }

    await deps.s3Client.send(new DeleteObjectCommand({
      Bucket: deps.bucketName,
      Key: existing.configS3Key,
    }));

    await deps.dynamoClient.send(new DeleteCommand({
      TableName: deps.tableName,
      Key: { mappingId },
    }));
  }

  async function duplicate(mappingId: string, newName: string): Promise<MappingItem> {
    const existing = await get(mappingId);
    if (!existing) {
      throw new Error(`Mapping not found: ${mappingId}`);
    }

    const existingConfig = await getConfigByKey(existing.configS3Key);
    if (!existingConfig) {
      throw new Error(`Mapping config not found: ${existing.configS3Key}`);
    }

    return create({
      projectId: existing.projectId,
      name: newName,
      sourceSchemaId: existing.sourceSchemaId,
      targetSchemaId: existing.targetSchemaId,
      status: existing.status,
      ruleCount: existing.ruleCount,
      coverage: existing.coverage,
      config: {
        ...existingConfig,
        name: newName,
        version: 1,
      },
    });
  }

  return {
    create,
    get,
    listByProject,
    update,
    delete: remove,
    duplicate,
    getConfigByKey,
  };
}

export function createSchemaMetadataModule(deps: {
  readonly dynamoClient: DynamoDBDocumentClient;
  readonly tableName: string;
}) {
  async function create(input: CreateSchemaMetadataInput): Promise<SchemaMetadataItem> {
    const timestamp = nowIso();
    const item: SchemaMetadataItem = {
      schemaId: crypto.randomUUID(),
      name: input.name,
      format: input.format,
      fieldCount: input.fieldCount,
      origin: input.origin,
      status: input.status ?? 'ingesting',
      scope: input.scope,
      description: input.description,
      inferred: input.inferred,
      syncStatus: input.syncStatus ?? 'not-synced',
      source: input.source,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await deps.dynamoClient.send(new PutCommand({
      TableName: deps.tableName,
      Item: item,
    }));

    return item;
  }

  async function get(schemaId: string): Promise<SchemaMetadataItem | null> {
    const result = await deps.dynamoClient.send(new GetCommand({
      TableName: deps.tableName,
      Key: { schemaId },
    }));

    return (result.Item as SchemaMetadataItem | undefined) ?? null;
  }

  async function list(): Promise<SchemaMetadataItem[]> {
    const result = await deps.dynamoClient.send(new ScanCommand({
      TableName: deps.tableName,
    }));

    return (result.Items as SchemaMetadataItem[] | undefined) ?? [];
  }

  async function updateStatus(schemaId: string, status: SchemaIngestStatus, fieldCount?: number): Promise<SchemaMetadataItem> {
    const names: Record<string, string> = {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
    };
    const values: Record<string, unknown> = {
      ':status': status,
      ':updatedAt': nowIso(),
    };

    const updates: string[] = ['#status = :status', '#updatedAt = :updatedAt'];
    if (fieldCount !== undefined) {
      names['#fieldCount'] = 'fieldCount';
      values[':fieldCount'] = fieldCount;
      updates.push('#fieldCount = :fieldCount');
    }

    const result = await deps.dynamoClient.send(new UpdateCommand({
      TableName: deps.tableName,
      Key: { schemaId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }));

    return result.Attributes as SchemaMetadataItem;
  }

  async function remove(schemaId: string): Promise<void> {
    await deps.dynamoClient.send(new DeleteCommand({
      TableName: deps.tableName,
      Key: { schemaId },
    }));
  }

  return {
    create,
    get,
    list,
    updateStatus,
    delete: remove,
  };
}

export function createSchemaNodesModule(deps: {
  readonly dynamoClient: DynamoDBDocumentClient;
  readonly tableName: string;
}) {
  const batchSize = 25;

  function chunk<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  async function batchWrite(schemaId: string, nodes: SchemaNodeItem[]): Promise<void> {
    if (nodes.length === 0) {
      return;
    }

    const normalized = nodes.map((node) => ({ ...node, schemaId }));
    for (const nodeChunk of chunk(normalized, batchSize)) {
      await deps.dynamoClient.send(new BatchWriteCommand({
        RequestItems: {
          [deps.tableName]: nodeChunk.map((node) => ({
            PutRequest: { Item: node },
          })),
        },
      }));
    }
  }

  async function listBySchema(schemaId: string): Promise<SchemaNodeItem[]> {
    const result = await deps.dynamoClient.send(new QueryCommand({
      TableName: deps.tableName,
      KeyConditionExpression: 'schemaId = :sid',
      ExpressionAttributeValues: {
        ':sid': schemaId,
      },
    }));

    return (result.Items as SchemaNodeItem[] | undefined) ?? [];
  }

  async function queryContains(schemaId: string, query: string, limit = 50): Promise<SchemaNodeItem[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const result = await deps.dynamoClient.send(new QueryCommand({
      TableName: deps.tableName,
      KeyConditionExpression: 'schemaId = :sid',
      FilterExpression: 'contains(#path, :q) OR contains(#fieldName, :q)',
      ExpressionAttributeNames: {
        '#path': 'path',
        '#fieldName': 'fieldName',
      },
      ExpressionAttributeValues: {
        ':sid': schemaId,
        ':q': normalizedQuery,
      },
      Limit: Math.max(1, limit),
    }));

    return (result.Items as SchemaNodeItem[] | undefined) ?? [];
  }

  async function deleteBySchema(schemaId: string): Promise<void> {
    const result = await deps.dynamoClient.send(new QueryCommand({
      TableName: deps.tableName,
      KeyConditionExpression: 'schemaId = :sid',
      ExpressionAttributeValues: {
        ':sid': schemaId,
      },
      ProjectionExpression: '#schemaId, #path',
      ExpressionAttributeNames: {
        '#schemaId': 'schemaId',
        '#path': 'path',
      },
    }));

    const keys = (result.Items ?? []).map((item) => {
      const record = item as { schemaId: string; path: string };
      return { schemaId: record.schemaId, path: record.path };
    });

    for (const keyChunk of chunk(keys, batchSize)) {
      await deps.dynamoClient.send(new BatchWriteCommand({
        RequestItems: {
          [deps.tableName]: keyChunk.map((key) => ({
            DeleteRequest: { Key: key },
          })),
        },
      }));
    }
  }

  return {
    batchWrite,
    listBySchema,
    queryContains,
    deleteBySchema,
  };
}

export function createMappingVersionsModule(deps: {
  readonly dynamoClient: DynamoDBDocumentClient;
  readonly s3Client: S3Client;
  readonly tableName: string;
  readonly bucketName: string;
}) {
  const maxVersions = 50;


  async function listAscending(mappingId: string): Promise<MappingVersionItem[]> {
    const result = await deps.dynamoClient.send(new QueryCommand({
      TableName: deps.tableName,
      KeyConditionExpression: 'mappingId = :mappingId',
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
      ScanIndexForward: true,
    }));

    return (result.Items as MappingVersionItem[] | undefined) ?? [];
  }

  async function pruneExcess(mappingId: string): Promise<void> {
    try {
      const versions = await listAscending(mappingId);
      if (versions.length <= maxVersions) {
        return;
      }

      const toDelete = versions.slice(0, versions.length - maxVersions);
      for (const item of toDelete) {
        await deps.dynamoClient.send(new DeleteCommand({
          TableName: deps.tableName,
          Key: {
            mappingId: item.mappingId,
            version: item.version,
          },
        }));

        await deps.s3Client.send(new DeleteObjectCommand({
          Bucket: deps.bucketName,
          Key: item.configS3Key,
        }));
      }
    } catch {
      // pruning intentionally non-fatal for tests
    }
  }

  async function save(
    mappingId: string,
    entry: {
      readonly version: number;
      readonly savedBy: string;
      readonly ruleCount: number;
      readonly config: MappingConfig;
    },
  ): Promise<MappingVersionItem> {
    const configS3Key = mappingVersionKey(mappingId, entry.version);
    const item: MappingVersionItem = {
      mappingId,
      version: entry.version,
      revisionNumber: entry.version,
      createdAt: nowIso(),
      createdBy: entry.savedBy,
      savedAt: nowIso(),
      savedBy: entry.savedBy,
      ruleCount: entry.ruleCount,
      configS3Key,
    };

    const payload: MappingConfig = {
      ...entry.config,
      id: mappingId,
      version: entry.version,
    };

    await deps.s3Client.send(new PutObjectCommand({
      Bucket: deps.bucketName,
      Key: configS3Key,
      Body: JSON.stringify(payload),
      ContentType: 'application/json',
    }));

    await deps.dynamoClient.send(new PutCommand({
      TableName: deps.tableName,
      Item: item,
    }));

    await pruneExcess(mappingId);
    return item;
  }

  async function list(mappingId: string): Promise<MappingVersionItem[]> {
    const result = await deps.dynamoClient.send(new QueryCommand({
      TableName: deps.tableName,
      KeyConditionExpression: 'mappingId = :mappingId',
      ExpressionAttributeValues: {
        ':mappingId': mappingId,
      },
      ScanIndexForward: false,
    }));

    return (result.Items as MappingVersionItem[] | undefined) ?? [];
  }

  async function get(mappingId: string, version: number): Promise<MappingVersionItem | null> {
    const result = await deps.dynamoClient.send(new GetCommand({
      TableName: deps.tableName,
      Key: { mappingId, version },
    }));

    return (result.Item as MappingVersionItem | undefined) ?? null;
  }

  async function getConfig(mappingId: string, version: number): Promise<MappingConfig | null> {
    const item = await get(mappingId, version);
    if (!item) {
      return null;
    }

    try {
      const output = await deps.s3Client.send(new GetObjectCommand({
        Bucket: deps.bucketName,
        Key: item.configS3Key,
      }));
      const content = await readBodyAsString(output);
      if (!content) {
        return null;
      }

      return JSON.parse(content) as MappingConfig;
    } catch (error) {
      if (isNoSuchKey(error)) {
        return null;
      }
      throw error;
    }
  }

  return {
    save,
    list,
    get,
    getConfig,
  };
}

export function createS3Module(deps: {
  readonly s3Client: S3Client;
  readonly bucketName: string;
}) {
  async function putOriginal(schemaId: string, content: string, format: 'json' | 'xsd'): Promise<void> {
    await deps.s3Client.send(new PutObjectCommand({
      Bucket: deps.bucketName,
      Key: schemaOriginalKey(schemaId, format),
      Body: content,
      ContentType: format === 'json' ? 'application/json' : 'application/xml',
    }));
  }

  async function putProcessed(schemaId: string, content: Record<string, unknown>): Promise<void> {
    await deps.s3Client.send(new PutObjectCommand({
      Bucket: deps.bucketName,
      Key: schemaContentKey(schemaId),
      Body: JSON.stringify(content),
      ContentType: 'application/json',
    }));
  }

  async function getProcessed(schemaId: string): Promise<Record<string, unknown> | null> {
    try {
      const output = await deps.s3Client.send(new GetObjectCommand({
        Bucket: deps.bucketName,
        Key: schemaContentKey(schemaId),
      }));
      const content = await readBodyAsString(output);
      if (!content) {
        return null;
      }

      return JSON.parse(content) as Record<string, unknown>;
    } catch (error) {
      if (isNoSuchKey(error)) {
        return null;
      }
      throw error;
    }
  }

  async function getOriginal(schemaId: string, format: 'json' | 'xsd'): Promise<string | null> {
    try {
      const output = await deps.s3Client.send(new GetObjectCommand({
        Bucket: deps.bucketName,
        Key: schemaOriginalKey(schemaId, format),
      }));
      return readBodyAsString(output);
    } catch (error) {
      if (isNoSuchKey(error)) {
        return null;
      }
      throw error;
    }
  }

  async function putMappingConfig(mappingId: string, config: MappingConfig): Promise<void> {
    await deps.s3Client.send(new PutObjectCommand({
      Bucket: deps.bucketName,
      Key: mappingConfigKey(mappingId),
      Body: JSON.stringify(config),
      ContentType: 'application/json',
    }));
  }

  async function getMappingConfig(mappingId: string): Promise<MappingConfig | null> {
    try {
      const output = await deps.s3Client.send(new GetObjectCommand({
        Bucket: deps.bucketName,
        Key: mappingConfigKey(mappingId),
      }));
      const content = await readBodyAsString(output);
      if (!content) {
        return null;
      }

      return JSON.parse(content) as MappingConfig;
    } catch (error) {
      if (isNoSuchKey(error)) {
        return null;
      }
      throw error;
    }
  }

  async function deleteSchemaContent(schemaId: string): Promise<void> {
    await deps.s3Client.send(new DeleteObjectsCommand({
      Bucket: deps.bucketName,
      Delete: {
        Objects: [
          { Key: schemaOriginalKey(schemaId, 'json') },
          { Key: schemaOriginalKey(schemaId, 'xsd') },
          { Key: schemaContentKey(schemaId) },
        ],
      },
    }));
  }

  async function deleteMappingConfig(mappingId: string): Promise<void> {
    await deps.s3Client.send(new DeleteObjectCommand({
      Bucket: deps.bucketName,
      Key: mappingConfigKey(mappingId),
    }));
  }

  return {
    schemaContent: {
      putOriginal,
      putProcessed,
      get: getProcessed,
      getOriginal,
      delete: deleteSchemaContent,
    },
    mappingConfig: {
      put: putMappingConfig,
      get: getMappingConfig,
      delete: deleteMappingConfig,
    },
  };
}
