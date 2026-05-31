import { afterEach, beforeAll } from 'vitest';

import {
  applyIntegrationEnvironment,
  assertLocalServicesAvailable,
  createBucket,
  createTables,
  deleteBucket,
  deleteTables,
  TEST_BUCKET,
  TEST_TABLES,
} from './setup.js';
import { cleanBucket, cleanTable } from './cleanup.js';

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../../../../../src/lambda/shared/types.js';

export interface FullStackHandlers {
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
  readonly createSchema: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly getSchema: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly listSchemas: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly deleteSchema: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  readonly querySchemaNodes: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
}

export function apiEvent(body?: unknown, pathParameters?: Record<string, string>): APIGatewayProxyEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    ...(pathParameters ? { pathParameters } : {}),
  };
}

export function parseApiBody<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

export async function importFullStackHandlers(): Promise<FullStackHandlers> {
  const project = await import('../../../../../src/lambda/project/index.js');
  const mapping = await import('../../../../../src/lambda/mapping/index.js');
  const schema = await import('../../../../../src/lambda/schema/index.js');

  return {
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
    createSchema: schema.createSchemaHandler,
    getSchema: schema.getSchemaHandler,
    listSchemas: schema.listSchemasHandler,
    deleteSchema: schema.deleteSchemaHandler,
    querySchemaNodes: schema.querySchemaNodesHandler,
  };
}

export async function cleanHarnessState(): Promise<void> {
  await cleanTable(TEST_TABLES.mappingVersions);
  await cleanTable(TEST_TABLES.schemaNodes);
  await cleanTable(TEST_TABLES.mappings);
  await cleanTable(TEST_TABLES.schemaMetadata);
  await cleanTable(TEST_TABLES.projects);
  await cleanBucket(TEST_BUCKET);
}

export function registerHarnessLifecycle(): void {
  beforeAll(async () => {
    applyIntegrationEnvironment();
    await assertLocalServicesAvailable();
    await createTables();
    await createBucket();
  });

  afterEach(async () => {
    await cleanHarnessState();
  });
}

export async function teardownHarness(): Promise<void> {
  await deleteBucket();
  await deleteTables();
}
