import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, randomUuidMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  randomUuidMock: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/clients.js', () => ({
  dynamoClient: {
    send: sendMock,
  },
}));

async function importProjectsModule() {
  return import('../../../src/lib/persistence/projects.js');
}

describe('persistence projects', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    randomUuidMock.mockReset();
    randomUuidMock.mockReturnValue('project-uuid-1');
    vi.stubGlobal('crypto', {
      randomUUID: () => randomUuidMock(),
    } satisfies Pick<Crypto, 'randomUUID'>);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('create generates UUID, sets timestamps, and writes PutCommand', async () => {
    sendMock.mockResolvedValue({});
    const projects = await importProjectsModule();

    const result = await projects.create({
      name: 'Project A',
      description: 'Description',
      slug: 'project-a',
      schemaRefs: [{ schemaId: 'schema-1', type: 'local' }],
      tags: ['tag-1'],
    });

    expect(result.projectId).toBe('project-uuid-1');
    expect(result.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(result.createdAt).toBe(result.updatedAt);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as {
      input: {
        TableName: string;
        Item: {
          projectId: string;
          name: string;
          description: string;
          slug: string;
          schemaRefs: readonly { schemaId: string; type: string }[];
          tags: readonly string[];
          createdAt: string;
          updatedAt: string;
        };
      };
    };

    expect(command.input.TableName).toBe('keyra-projects');
    expect(command.input.Item).toEqual(result);
  });

  it('get returns item when found and null when not found', async () => {
    const projects = await importProjectsModule();

    sendMock.mockResolvedValueOnce({
      Item: {
        projectId: 'project-1',
        name: 'Project 1',
        description: 'Desc',
        slug: 'project-1',
        schemaRefs: [],
        tags: [],
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      },
    });
    sendMock.mockResolvedValueOnce({ Item: undefined });

    const found = await projects.get('project-1');
    const missing = await projects.get('missing');

    expect(found?.projectId).toBe('project-1');
    expect(missing).toBeNull();

    const firstCall = sendMock.mock.calls[0]?.[0] as { input: { TableName: string; Key: { projectId: string } } };
    expect(firstCall.input).toEqual({
      TableName: 'keyra-projects',
      Key: { projectId: 'project-1' },
    });
  });

  it('list returns all scan results and empty array fallback', async () => {
    const projects = await importProjectsModule();

    sendMock.mockResolvedValueOnce({
      Items: [
        {
          projectId: 'project-1',
          name: 'Project 1',
          description: 'Desc',
          slug: 'project-1',
          schemaRefs: [],
          tags: [],
          createdAt: '2026-05-15T00:00:00.000Z',
          updatedAt: '2026-05-15T00:00:00.000Z',
        },
      ],
    });
    sendMock.mockResolvedValueOnce({ Items: undefined });

    const first = await projects.list();
    const second = await projects.list();

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);

    const firstCall = sendMock.mock.calls[0]?.[0] as { input: { TableName: string } };
    expect(firstCall.input).toEqual({ TableName: 'keyra-projects' });
  });

  it('update builds dynamic UpdateExpression for partial fields and updatedAt', async () => {
    sendMock.mockResolvedValue({
      Attributes: {
        projectId: 'project-1',
        name: 'Updated Name',
        description: 'Updated Description',
        slug: 'project-1',
        schemaRefs: [],
        tags: ['x'],
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T01:00:00.000Z',
      },
    });
    const projects = await importProjectsModule();

    const result = await projects.update('project-1', {
      name: 'Updated Name',
      tags: ['x'],
    });

    expect(result.name).toBe('Updated Name');

    const command = sendMock.mock.calls[0]?.[0] as {
      input: {
        TableName: string;
        Key: { projectId: string };
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
        ReturnValues: string;
      };
    };

    expect(command.input.TableName).toBe('keyra-projects');
    expect(command.input.Key).toEqual({ projectId: 'project-1' });
    expect(command.input.ReturnValues).toBe('ALL_NEW');
    expect(command.input.UpdateExpression).toContain('#updatedAt = :updatedAt');
    expect(command.input.UpdateExpression).toContain('#name = :name');
    expect(command.input.UpdateExpression).toContain('#tags = :tags');
    expect(command.input.ExpressionAttributeNames).toMatchObject({
      '#updatedAt': 'updatedAt',
      '#name': 'name',
      '#tags': 'tags',
    });
    expect(command.input.ExpressionAttributeValues[':name']).toBe('Updated Name');
    expect(command.input.ExpressionAttributeValues[':tags']).toEqual(['x']);
  });

  it('delete sends DeleteCommand and is idempotent', async () => {
    sendMock.mockResolvedValue({});
    const projects = await importProjectsModule();

    await expect(projects.delete('missing-project')).resolves.toBeUndefined();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]?.[0] as { input: { TableName: string; Key: { projectId: string } } };
    expect(command.input).toEqual({
      TableName: 'keyra-projects',
      Key: { projectId: 'missing-project' },
    });
  });

  it('exports projects object with CRUD methods', async () => {
    const mod = await importProjectsModule();

    expect(mod.projects.create).toBe(mod.create);
    expect(mod.projects.get).toBe(mod.get);
    expect(mod.projects.list).toBe(mod.list);
    expect(mod.projects.update).toBe(mod.update);
    expect(mod.projects.delete).toBe(mod.delete);
  });
});
