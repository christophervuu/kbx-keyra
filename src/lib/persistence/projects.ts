import { DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoClient } from './clients.js';
import { TABLE_NAMES } from './config.js';
import type { CreateProjectInput, ProjectItem, UpdateProjectInput } from './types.js';
import { normalizeProjectLinkedSchemaIds } from './types.js';

type ProjectUpdatableField = keyof UpdateProjectInput;

function nowIso(): string {
  return new Date().toISOString();
}

function createProjectId(): string {
  return crypto.randomUUID();
}

function buildProjectUpdateExpression(
  fields: UpdateProjectInput,
): Pick<
  NonNullable<ConstructorParameters<typeof UpdateCommand>[0]>,
  'UpdateExpression' | 'ExpressionAttributeNames' | 'ExpressionAttributeValues'
> {
  const names: Record<string, string> = {
    '#updatedAt': 'updatedAt',
  };
  const values: Record<string, unknown> = {
    ':updatedAt': nowIso(),
  };
  const updates: string[] = ['#updatedAt = :updatedAt'];

  const updatableKeys: readonly ProjectUpdatableField[] = ['name', 'description', 'slug', 'linkedSchemaIds', 'schemaRefs', 'tags'];

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

export async function create(input: CreateProjectInput): Promise<ProjectItem> {
  const timestamp = nowIso();

  const schemaRefs = input.schemaRefs ?? [];
  const linkedSchemaIds = normalizeProjectLinkedSchemaIds({
    linkedSchemaIds: input.linkedSchemaIds,
    schemaRefs,
  });

  const item: ProjectItem = {
    projectId: createProjectId(),
    name: input.name,
    description: input.description,
    slug: input.slug,
    linkedSchemaIds,
    schemaRefs,
    tags: input.tags ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await dynamoClient.send(
    new PutCommand({
      TableName: TABLE_NAMES.projects,
      Item: item,
    }),
  );

  return item;
}

export async function get(projectId: string): Promise<ProjectItem | null> {
  const result = await dynamoClient.send(
    new GetCommand({
      TableName: TABLE_NAMES.projects,
      Key: {
        projectId,
      },
    }),
  );

  return (result.Item as ProjectItem | undefined) ?? null;
}

export async function list(): Promise<ProjectItem[]> {
  const result = await dynamoClient.send(
    new ScanCommand({
      TableName: TABLE_NAMES.projects,
    }),
  );

  return (result.Items as ProjectItem[] | undefined) ?? [];
}

export async function update(projectId: string, fields: UpdateProjectInput): Promise<ProjectItem> {
  const expression = buildProjectUpdateExpression(fields);

  const result = await dynamoClient.send(
    new UpdateCommand({
      TableName: TABLE_NAMES.projects,
      Key: {
        projectId,
      },
      ...expression,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as ProjectItem;
}

export async function remove(projectId: string): Promise<void> {
  await dynamoClient.send(
    new DeleteCommand({
      TableName: TABLE_NAMES.projects,
      Key: {
        projectId,
      },
    }),
  );
}

export { remove as delete };

export const projects = {
  create,
  get,
  list,
  update,
  delete: remove,
};
