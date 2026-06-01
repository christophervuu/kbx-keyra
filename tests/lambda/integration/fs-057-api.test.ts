import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../../../src/lambda/shared/types.js';

const RUN_INTEGRATION = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RUN_DYNAMODB_LOCAL_INTEGRATION === '1';

const s3Store = vi.hoisted(() => new Map<string, string>());

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    constructor(public readonly input: { Bucket?: string; Key?: string; Body?: string | Uint8Array }) {}
  }

  class GetObjectCommand {
    constructor(public readonly input: { Bucket?: string; Key?: string }) {}
  }

  class DeleteObjectCommand {
    constructor(public readonly input: { Bucket?: string; Key?: string }) {}
  }

  class S3Client {
    async send(command: unknown): Promise<unknown> {
      if (command instanceof PutObjectCommand) {
        const key = `${command.input.Bucket ?? ''}/${command.input.Key ?? ''}`;
        const body = typeof command.input.Body === 'string' ? command.input.Body : '';
        s3Store.set(key, body);
        return {};
      }

      if (command instanceof GetObjectCommand) {
        const key = `${command.input.Bucket ?? ''}/${command.input.Key ?? ''}`;
        if (!s3Store.has(key)) {
          throw { name: 'NoSuchKey' };
        }

        return {
          Body: {
            transformToString: async () => s3Store.get(key) ?? '',
          },
        };
      }

      if (command instanceof DeleteObjectCommand) {
        const key = `${command.input.Bucket ?? ''}/${command.input.Key ?? ''}`;
        s3Store.delete(key);
        return {};
      }

      return {};
    }
  }

  return {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    S3Client,
  };
});

interface Handlers {
  readonly createProject: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly getProject: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly listProjects: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly updateProject: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteProject: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly createMapping: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly getMapping: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly listMappings: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly updateMapping: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteMapping: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly duplicateMapping: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly listVersions: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly getVersion: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly saveVersion: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly listRevisions: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly getRevision: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly createSchema: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly getSchema: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly listSchemas: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteSchema: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly querySchemaNodes: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly deployMapping: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly promoteDeployment: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly rollbackDeployment: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly listDeployments: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly getCurrentDeployments: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
}

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

const REGION = 'us-east-1';
const ENDPOINT = env?.DYNAMODB_LOCAL_ENDPOINT ?? 'http://127.0.0.1:8000';
const TABLE_SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const TABLES = {
  projects: `Projects_IT_${TABLE_SUFFIX}`,
  mappings: `Mappings_IT_${TABLE_SUFFIX}`,
  schemas: `Schemas_IT_${TABLE_SUFFIX}`,
  schemaNodes: `SchemaNodes_IT_${TABLE_SUFFIX}`,
  mappingRevisions: `MappingRevisions_IT_${TABLE_SUFFIX}`,
  mappingVersions: `MappingVersions_IT_${TABLE_SUFFIX}`,
  deployments: `Deployments_IT_${TABLE_SUFFIX}`,
  deploymentCurrent: `DeploymentCurrent_IT_${TABLE_SUFFIX}`,
};

const CONTENT_BUCKET = `integration-bucket-${TABLE_SUFFIX}`;

const ddb = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
});

const doc = DynamoDBDocumentClient.from(ddb);

async function localAvailable(): Promise<boolean> {
  try {
    await ddb.send(new ListTablesCommand({}));
    return true;
  } catch {
    return false;
  }
}

async function createTables(): Promise<void> {
  await ddb.send(new CreateTableCommand({
    TableName: TABLES.projects,
    AttributeDefinitions: [{ AttributeName: 'projectId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await ddb.send(new CreateTableCommand({
    TableName: TABLES.mappings,
    AttributeDefinitions: [
      { AttributeName: 'mappingId', AttributeType: 'S' },
      { AttributeName: 'projectId', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'mappingId', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'projectId-index',
        KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await ddb.send(new CreateTableCommand({
    TableName: TABLES.schemas,
    AttributeDefinitions: [{ AttributeName: 'schemaId', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'schemaId', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await ddb.send(new CreateTableCommand({
    TableName: TABLES.schemaNodes,
    AttributeDefinitions: [
      { AttributeName: 'schemaId', AttributeType: 'S' },
      { AttributeName: 'path', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'schemaId', KeyType: 'HASH' },
      { AttributeName: 'path', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await ddb.send(new CreateTableCommand({
    TableName: TABLES.mappingRevisions,
    AttributeDefinitions: [
      { AttributeName: 'mappingId', AttributeType: 'S' },
      { AttributeName: 'revision', AttributeType: 'N' },
    ],
    KeySchema: [
      { AttributeName: 'mappingId', KeyType: 'HASH' },
      { AttributeName: 'revision', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await ddb.send(new CreateTableCommand({
    TableName: TABLES.mappingVersions,
    AttributeDefinitions: [
      { AttributeName: 'mappingId', AttributeType: 'S' },
      { AttributeName: 'version', AttributeType: 'N' },
    ],
    KeySchema: [
      { AttributeName: 'mappingId', KeyType: 'HASH' },
      { AttributeName: 'version', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await ddb.send(new CreateTableCommand({
    TableName: TABLES.deployments,
    AttributeDefinitions: [
      { AttributeName: 'mappingId', AttributeType: 'S' },
      { AttributeName: 'environmentDeployedAt', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'mappingId', KeyType: 'HASH' },
      { AttributeName: 'environmentDeployedAt', KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }));

  await ddb.send(new CreateTableCommand({
    TableName: TABLES.deploymentCurrent,
    AttributeDefinitions: [{ AttributeName: 'mappingIdEnvironment', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'mappingIdEnvironment', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  }));
}

async function clearTable(tableName: string, keyNames: readonly string[]): Promise<void> {
  const scan = await doc.send(new ScanCommand({ TableName: tableName }));
  const items = scan.Items ?? [];
  if (items.length === 0) {
    return;
  }

  const chunked: Array<typeof items> = [];
  for (let index = 0; index < items.length; index += 25) {
    chunked.push(items.slice(index, index + 25));
  }

  for (const chunk of chunked) {
    await doc.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: chunk.map((item) => ({
          DeleteRequest: {
            Key: Object.fromEntries(keyNames.map((key) => [key, item[key]])),
          },
        })),
      },
    }));
  }
}

async function clearAllTables(): Promise<void> {
  await clearTable(TABLES.deploymentCurrent, ['mappingIdEnvironment']);
  await clearTable(TABLES.deployments, ['mappingId', 'environmentDeployedAt']);
  await clearTable(TABLES.mappingVersions, ['mappingId', 'version']);
  await clearTable(TABLES.mappingRevisions, ['mappingId', 'revision']);
  await clearTable(TABLES.schemaNodes, ['schemaId', 'path']);
  await clearTable(TABLES.mappings, ['mappingId']);
  await clearTable(TABLES.schemas, ['schemaId']);
  await clearTable(TABLES.projects, ['projectId']);
  s3Store.clear();
}

async function dropTables(): Promise<void> {
  for (const name of [
    TABLES.deploymentCurrent,
    TABLES.deployments,
    TABLES.mappingVersions,
    TABLES.mappingRevisions,
    TABLES.schemaNodes,
    TABLES.schemas,
    TABLES.mappings,
    TABLES.projects,
  ]) {
    await ddb.send(new DeleteTableCommand({ TableName: name }));
  }
}

function event(
  body?: unknown,
  pathParameters?: Record<string, string>,
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    ...(pathParameters ? { pathParameters } : {}),
    ...(queryStringParameters ? { queryStringParameters } : {}),
  };
}

function parseBody<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

describe.skipIf(!RUN_INTEGRATION)('FS-057 integration (DynamoDB Local + mocked S3)', () => {
  let handlers: Handlers;

  beforeAll(async () => {
    if (!(await localAvailable())) {
      throw new Error(`DynamoDB Local not reachable at ${ENDPOINT}. Start DynamoDB Local and re-run with RUN_DYNAMODB_LOCAL_INTEGRATION=1.`);
    }

    if (!env) {
      throw new Error('process.env is not available');
    }

    env.AWS_REGION = REGION;
    env.AWS_ACCESS_KEY_ID = 'test';
    env.AWS_SECRET_ACCESS_KEY = 'test';
    env.AWS_ENDPOINT_URL_DYNAMODB = ENDPOINT;
    env.AWS_ENDPOINT_URL = ENDPOINT;

    env.PROJECTS_TABLE = TABLES.projects;
    env.MAPPINGS_TABLE = TABLES.mappings;
    env.SCHEMAS_TABLE = TABLES.schemas;
    env.SCHEMA_NODES_TABLE = TABLES.schemaNodes;
    env.MAPPING_REVISIONS_TABLE = TABLES.mappingRevisions;
    env.MAPPING_VERSIONS_TABLE = TABLES.mappingVersions;
    env.DEPLOYMENTS_TABLE = TABLES.deployments;
    env.DEPLOYMENT_CURRENT_TABLE = TABLES.deploymentCurrent;
    env.DYNAMODB_ENDPOINT = ENDPOINT;
    env.CONTENT_BUCKET = CONTENT_BUCKET;
    env.STORAGE_BUCKET = CONTENT_BUCKET;
    env.OPENSEARCH_ENDPOINT = 'http://localhost:9200';

    await createTables();

    vi.resetModules();

    const project = await import('../../../src/lambda/project/index.js');
    const mapping = await import('../../../src/lambda/mapping/index.js');
    const schema = await import('../../../src/lambda/schema/index.js');
    const deployment = await import('../../../src/lambda/deployment/index.js');

    handlers = {
      createProject: project.createProjectHandler,
      getProject: project.getProjectHandler,
      listProjects: project.listProjectsHandler,
      updateProject: project.updateProjectHandler,
      deleteProject: project.deleteProjectHandler,
      createMapping: mapping.createMappingHandler,
      getMapping: mapping.getMappingHandler,
      listMappings: mapping.listMappingsHandler,
      updateMapping: mapping.updateMappingHandler,
      deleteMapping: mapping.deleteMappingHandler,
      duplicateMapping: mapping.duplicateMappingHandler,
      listVersions: mapping.listMappingVersionsHandler,
      getVersion: mapping.getMappingVersionHandler,
      saveVersion: mapping.saveMappingVersionHandler,
      listRevisions: mapping.listMappingRevisionsHandler,
      getRevision: mapping.getMappingRevisionHandler,
      createSchema: schema.createSchemaHandler,
      getSchema: schema.getSchemaHandler,
      listSchemas: schema.listSchemasHandler,
      deleteSchema: schema.deleteSchemaHandler,
      querySchemaNodes: schema.querySchemaNodesHandler,
      deployMapping: deployment.deployMappingHandler,
      promoteDeployment: deployment.promoteDeploymentHandler,
      rollbackDeployment: deployment.rollbackDeploymentHandler,
      listDeployments: deployment.listDeploymentsHandler,
      getCurrentDeployments: deployment.getCurrentDeploymentsHandler,
    };
  });

  beforeEach(async () => {
    await clearAllTables();
  });

  it('AE-01 and AE-14: project create/get/list/update embeds mappings and schemas', async () => {
    const schemaCreate = await handlers.createSchema(event({
      name: 'Order Schema',
      format: 'json-schema',
      origin: 'local',
      content: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
        },
      },
    }));
    const schemaId = parseBody<{ schemaId: string }>(schemaCreate).schemaId;

    const create = await handlers.createProject(event({
      name: 'My Project',
      description: 'Test',
      slug: 'my-project',
      schemaRefs: [{ schemaId, type: 'local' }],
    }));
    expect(create.statusCode).toBe(201);
    expect(create.headers?.['Access-Control-Allow-Origin']).toBe('*');

    const created = parseBody<{ projectId: string; mappingCount: number; schemaCount: number }>(create);
    expect(created.mappingCount).toBe(0);
    expect(created.schemaCount).toBe(1);

    const detail = await handlers.getProject(event(undefined, { id: created.projectId }));
    expect(detail.statusCode).toBe(200);
    const parsedDetail = parseBody<{ mappings: unknown[]; schemas: Array<{ schemaId: string }> }>(detail);
    expect(parsedDetail.mappings).toEqual([]);
    expect(parsedDetail.schemas.map((entry) => entry.schemaId)).toContain(schemaId);

    const updated = await handlers.updateProject(event({ description: 'Updated' }, { id: created.projectId }));
    expect(updated.statusCode).toBe(200);

    const list = await handlers.listProjects(event());
    expect(list.statusCode).toBe(200);
    expect(parseBody<Array<{ projectId: string }>>(list).length).toBe(1);
  });

  it('AE-02, AE-07, AE-09, AE-13: mapping lifecycle, duplicate, scoping, optimistic concurrency', async () => {
    const p1 = parseBody<{ projectId: string }>(await handlers.createProject(event({ name: 'P1', slug: 'p1' })));
    const p2 = parseBody<{ projectId: string }>(await handlers.createProject(event({ name: 'P2', slug: 'p2' })));

    const created = await handlers.createMapping(event({ projectId: p1.projectId, name: 'Invoice Map', rules: [] }));
    expect(created.statusCode).toBe(201);
    const mapping = parseBody<{ mappingId: string; version: number }>(created);
    expect(mapping.version).toBe(1);

    const updated = await handlers.updateMapping(event({
      projectId: p1.projectId,
      name: 'Invoice Map',
      expectedRevision: 1,
      rules: [
        { target: 'Invoice.Id', type: 'string', expression: 'source("id")' },
        { target: 'Invoice.Amount', type: 'number', expression: 'source("amount")' },
        { target: 'Invoice.Currency', type: 'string', expression: 'source("currency")' },
      ],
    }, { id: mapping.mappingId }));
    expect(updated.statusCode).toBe(200);
    expect(parseBody<{ revision: number; ruleCount: number }>(updated)).toMatchObject({ revision: 2, ruleCount: 3 });

    const stale = await handlers.updateMapping(event({ projectId: p1.projectId, name: 'Invoice Map', expectedRevision: 1, rules: [] }, { id: mapping.mappingId }));
    expect(stale.statusCode).toBe(409);

    const get = await handlers.getMapping(event(undefined, { id: mapping.mappingId }));
    expect(get.statusCode).toBe(200);
    expect(parseBody<{ version: number }>(get).version).toBe(2);

    const duplicate = await handlers.duplicateMapping(event({ name: 'Invoice Map (Copy)' }, { id: mapping.mappingId }));
    expect(duplicate.statusCode).toBe(201);
    const duplicated = parseBody<{ mappingId: string; version: number; name: string }>(duplicate);
    expect(duplicated.mappingId).not.toBe(mapping.mappingId);
    expect(duplicated.version).toBe(1);
    expect(duplicated.name).toBe('Invoice Map (Copy)');

    await handlers.createMapping(event({ projectId: p2.projectId, name: 'Other Map', rules: [] }));
    const scoped = await handlers.listMappings(event(undefined, { projectId: p1.projectId }));
    const scopedList = parseBody<Array<{ projectId: string }>>(scoped);
    expect(scopedList.every((entry) => entry.projectId === p1.projectId)).toBe(true);
  });

  it('AE-10: mapping version save/list/get lifecycle', async () => {
    const project = parseBody<{ projectId: string }>(await handlers.createProject(event({ name: 'P', slug: 'p' })));
    const mapping = parseBody<{ mappingId: string }>(await handlers.createMapping(event({ projectId: project.projectId, name: 'M', rules: [] })));

    const saved = await handlers.updateMapping(event({
      projectId: project.projectId,
      name: 'M',
      expectedRevision: 1,
      rules: [{ target: 'A', type: 'string', expression: 'source("a")' }],
    }, { id: mapping.mappingId }));
    expect(saved.statusCode).toBe(200);

    const save1 = await handlers.saveVersion(event({}, { mappingId: mapping.mappingId }));
    expect(save1.statusCode).toBe(201);

    const save2 = await handlers.saveVersion(event({}, { mappingId: mapping.mappingId }));
    expect(save2.statusCode).toBe(201);

    const list = await handlers.listVersions(event(undefined, { mappingId: mapping.mappingId }));
    expect(list.statusCode).toBe(200);
    expect(parseBody<Array<{ version: number }>>(list).map((entry) => entry.version)).toEqual([2, 1]);

    const get = await handlers.getVersion(event(undefined, { mappingId: mapping.mappingId, version: '1' }));
    expect(get.statusCode).toBe(200);
    expect(parseBody<{ version: number }>(get).version).toBe(1);
  });

  it('FS-063: revision save, no-op detection, conflict, and version linkage', async () => {
    const project = parseBody<{ projectId: string }>(await handlers.createProject(event({ name: 'P', slug: 'p' })));
    const mapping = parseBody<{ mappingId: string }>(await handlers.createMapping(event({ projectId: project.projectId, name: 'M', rules: [] })));

    const save = await handlers.updateMapping(event({
      projectId: project.projectId,
      name: 'M',
      expectedRevision: 1,
      rules: [{ target: 'A', type: 'string', expression: 'source("a")' }],
    }, { id: mapping.mappingId }));
    expect(save.statusCode).toBe(200);
    expect(parseBody<{ revision: number; noChange: boolean }>(save)).toMatchObject({ revision: 2, noChange: false });

    const noOp = await handlers.updateMapping(event({
      projectId: project.projectId,
      name: 'M',
      expectedRevision: 2,
      rules: [{ target: 'A', type: 'string', expression: 'source("a")' }],
    }, { id: mapping.mappingId }));
    expect(noOp.statusCode).toBe(200);
    expect(parseBody<{ revision: number; noChange: boolean }>(noOp)).toMatchObject({ revision: 2, noChange: true });

    const conflict = await handlers.updateMapping(event({
      projectId: project.projectId,
      name: 'M',
      expectedRevision: 1,
      rules: [],
    }, { id: mapping.mappingId }));
    expect(conflict.statusCode).toBe(409);

    const createVersion = await handlers.saveVersion(event({}, { mappingId: mapping.mappingId }));
    expect(createVersion.statusCode).toBe(201);
    expect(parseBody<{ version: number; revisionNumber: number }>(createVersion)).toMatchObject({ version: 1, revisionNumber: 2 });

    const revisions = await handlers.listRevisions(event(undefined, { mappingId: mapping.mappingId }));
    expect(revisions.statusCode).toBe(200);
    expect(parseBody<Array<{ revision: number }>>(revisions).map((entry) => entry.revision)).toContain(2);

    const revision = await handlers.getRevision(event(undefined, { mappingId: mapping.mappingId, revision: '2' }));
    expect(revision.statusCode).toBe(200);
    expect(parseBody<{ revision: number }>(revision).revision).toBe(2);
  });

  it('AE-03, AE-04, AE-08: schema small/large create and query flow', async () => {
    const small = await handlers.createSchema(event({
      name: 'Small',
      format: 'json-schema',
      origin: 'local',
      content: {
        type: 'object',
        properties: {
          AddressLine1: { type: 'string' },
          City: { type: 'string' },
        },
      },
    }));
    expect(small.statusCode).toBe(201);
    const smallMeta = parseBody<{ schemaId: string; status: string; fieldCount: number }>(small);
    expect(smallMeta.status).toBe('ready');
    expect(smallMeta.fieldCount).toBeGreaterThan(0);

    const detail = await handlers.getSchema(event(undefined, { id: smallMeta.schemaId }));
    expect(detail.statusCode).toBe(200);
    expect(parseBody<{ metadata: { schemaId: string } }>(detail).metadata.schemaId).toBe(smallMeta.schemaId);

    const query = await handlers.querySchemaNodes(event({ query: 'address' }, { id: smallMeta.schemaId }));
    expect(query.statusCode).toBe(200);
    const results = parseBody<Array<{ path: string; fieldName: string; type: string }>>(query);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('path');
    expect(results[0]).toHaveProperty('fieldName');
    expect(results[0]).toHaveProperty('type');

    const large = await handlers.createSchema(event({
      name: 'Large',
      format: 'xsd',
      origin: 'local',
      content: `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">${'<xs:element name="f" type="xs:string"/>'.repeat(501)}</xs:schema>`,
    }));
    expect(large.statusCode).toBe(201);
    expect(parseBody<{ status: string }>(large).status).toBe('ingesting');
  });

  it('AE-05, AE-11, AE-12: error envelope + CORS + validation', async () => {
    const notFound = await handlers.getProject(event(undefined, { id: 'nonexistent-uuid' }));
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers?.['Access-Control-Allow-Origin']).toBe('*');
    expect(notFound.headers?.['Content-Type']).toBe('application/json');

    const body = parseBody<{ error: { code: string; message: string; statusCode: number; retryable: boolean } }>(notFound);
    expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(body.error.statusCode).toBe(404);
    expect(typeof body.error.message).toBe('string');
    expect(typeof body.error.retryable).toBe('boolean');

    const validation = await handlers.createProject(event({ description: 'No name', slug: 'x' }));
    expect(validation.statusCode).toBe(400);
    expect(parseBody<{ error: { code: string } }>(validation).error.code).toBe('VALIDATION_ERROR');
  });

  it('AE-06: delete project blocked by mappings', async () => {
    const project = parseBody<{ projectId: string }>(await handlers.createProject(event({ name: 'P', slug: 'p' })));
    await handlers.createMapping(event({ projectId: project.projectId, name: 'M', rules: [] }));

    const blocked = await handlers.deleteProject(event(undefined, { id: project.projectId }));
    expect(blocked.statusCode).toBe(409);
    expect(parseBody<{ error: { code: string } }>(blocked).error.code).toBe('CONFLICT');
  });

  it('schema delete blocked when referenced and succeeds when unreferenced', async () => {
    const schema = parseBody<{ schemaId: string }>(await handlers.createSchema(event({
      name: 'S',
      format: 'json-schema',
      origin: 'local',
      content: { type: 'object', properties: { id: { type: 'string' } } },
    })));

    const project = await handlers.createProject(event({
      name: 'P',
      slug: 'p',
      schemaRefs: [{ schemaId: schema.schemaId, type: 'local' }],
    }));
    expect(project.statusCode).toBe(201);

    const blocked = await handlers.deleteSchema(event(undefined, { id: schema.schemaId }));
    expect(blocked.statusCode).toBe(409);

    await clearTable(TABLES.projects, ['projectId']);
    const deleted = await handlers.deleteSchema(event(undefined, { id: schema.schemaId }));
    expect(deleted.statusCode).toBe(204);
  });

  it('FS-064 AE-01/AE-02/AE-03/AE-06/AE-07/AE-08 deployment handlers integration', async () => {
    const project = parseBody<{ projectId: string }>(await handlers.createProject(event({ name: 'Deploy Project', slug: 'deploy-project' })));
    const mapping = parseBody<{ mappingId: string }>(await handlers.createMapping(event({ projectId: project.projectId, name: 'Deploy Map', rules: [] })));

    const saved = await handlers.updateMapping(event({
      projectId: project.projectId,
      name: 'Deploy Map',
      expectedRevision: 1,
      rules: [{ target: 'A', type: 'string', expression: 'source("a")' }],
    }, { id: mapping.mappingId }));
    expect(saved.statusCode).toBe(200);
    expect(parseBody<{ revision: number }>(saved).revision).toBe(2);

    const deployRevisionDev = await handlers.deployMapping(
      event({ environment: 'DEV', sourceType: 'revision', sourceNumber: 2 }, { mappingId: mapping.mappingId }),
    );
    expect(deployRevisionDev.statusCode).toBe(201);
    expect(parseBody<{ sourceType: string; sourceNumber: number }>(deployRevisionDev)).toMatchObject({ sourceType: 'revision', sourceNumber: 2 });

    const deployRevisionQa = await handlers.deployMapping(
      event({ environment: 'QA', sourceType: 'revision', sourceNumber: 2 }, { mappingId: mapping.mappingId }),
    );
    expect(deployRevisionQa.statusCode).toBe(400);
    expect(parseBody<{ error: { code: string } }>(deployRevisionQa).error.code).toBe('REVISION_NOT_DEPLOYABLE_TO_ENV');

    const versionCreated = await handlers.saveVersion(event({}, { mappingId: mapping.mappingId }));
    expect(versionCreated.statusCode).toBe(201);
    expect(parseBody<{ version: number; revisionNumber: number }>(versionCreated)).toMatchObject({ version: 1, revisionNumber: 2 });

    const deployVersionProd = await handlers.deployMapping(
      event({ environment: 'PROD', sourceType: 'version', sourceNumber: 1 }, { mappingId: mapping.mappingId }),
    );
    expect(deployVersionProd.statusCode).toBe(201);
    expect(parseBody<{ sourceType: string; sourceNumber: number }>(deployVersionProd)).toMatchObject({ sourceType: 'version', sourceNumber: 1 });

    const promoteFromRevision = await handlers.promoteDeployment(
      event({ fromEnvironment: 'DEV', toEnvironment: 'QA' }, { mappingId: mapping.mappingId }),
    );
    expect(promoteFromRevision.statusCode).toBe(400);
    expect(parseBody<{ error: { code: string } }>(promoteFromRevision).error.code).toBe('PROMOTION_REQUIRES_VERSION');

    const deployVersionDev = await handlers.deployMapping(
      event({ environment: 'DEV', sourceType: 'version', sourceNumber: 1 }, { mappingId: mapping.mappingId }),
    );
    expect(deployVersionDev.statusCode).toBe(201);

    const promoteVersion = await handlers.promoteDeployment(
      event({ fromEnvironment: 'DEV', toEnvironment: 'QA' }, { mappingId: mapping.mappingId }),
    );
    expect(promoteVersion.statusCode).toBe(201);
    expect(parseBody<{ sourceType: string; sourceNumber: number; promotedFrom: string }>(promoteVersion)).toMatchObject({
      sourceType: 'version',
      sourceNumber: 1,
      promotedFrom: 'DEV',
    });

    const listProdBeforeRollback = await handlers.listDeployments(
      event(undefined, { mappingId: mapping.mappingId }, { environment: 'PROD' }),
    );
    expect(listProdBeforeRollback.statusCode).toBe(200);
    const prodEntries = parseBody<Array<{ environmentDeployedAt: string; sourceNumber: number }>>(listProdBeforeRollback);
    expect(prodEntries.length).toBe(1);
    const firstProdEntry = prodEntries[0];
    expect(firstProdEntry).toBeDefined();

    const updatedAgain = await handlers.updateMapping(event({
      projectId: project.projectId,
      name: 'Deploy Map',
      expectedRevision: 2,
      rules: [{ target: 'A', type: 'string', expression: 'source("aa")' }],
    }, { id: mapping.mappingId }));
    expect(updatedAgain.statusCode).toBe(200);

    const versionTwo = await handlers.saveVersion(event({}, { mappingId: mapping.mappingId }));
    expect(versionTwo.statusCode).toBe(201);
    expect(parseBody<{ version: number }>(versionTwo).version).toBe(2);

    const deployVersionTwoProd = await handlers.deployMapping(
      event({ environment: 'PROD', sourceType: 'version', sourceNumber: 2 }, { mappingId: mapping.mappingId }),
    );
    expect(deployVersionTwoProd.statusCode).toBe(201);

    const rollback = await handlers.rollbackDeployment(
      event({ environment: 'PROD', deploymentSK: firstProdEntry!.environmentDeployedAt }, { mappingId: mapping.mappingId }),
    );
    expect(rollback.statusCode).toBe(201);
    expect(parseBody<{ rollbackOf: string; sourceNumber: number }>(rollback)).toMatchObject({
      rollbackOf: firstProdEntry!.environmentDeployedAt,
      sourceNumber: 1,
    });

    const current = await handlers.getCurrentDeployments(event(undefined, { mappingId: mapping.mappingId }));
    expect(current.statusCode).toBe(200);
    const currentBody = parseBody<{ DEV: { sourceType: string }; QA: { sourceType: string }; PROD: { sourceType: string; sourceNumber: number } }>(current);
    expect(currentBody.DEV.sourceType).toBe('version');
    expect(currentBody.QA.sourceType).toBe('version');
    expect(currentBody.PROD.sourceNumber).toBe(1);
  });

  afterAll(async () => {
    await dropTables();
  });
});
