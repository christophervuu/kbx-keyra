import { afterAll, describe, expect, it } from 'vitest';

import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import {
  apiEvent,
  importFullStackHandlers,
  parseApiBody,
  registerHarnessLifecycle,
  teardownHarness,
} from './helpers/full-stack.js';
import {
  fixtureMappingConfig,
  fixtureProjectInput,
  fixtureSchemaContent,
} from './helpers/fixtures.js';
import { createFreshSession } from './helpers/session.js';
import { TEST_TABLES } from './helpers/setup.js';

const RUN_PERSISTENCE_INTEGRATION =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RUN_PERSISTENCE_INTEGRATION === '1';

type ErrorEnvelope = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly statusCode: number;
    readonly retryable: boolean;
    readonly requestId: string;
  };
};

function expectStructuredContentUnavailable(response: { statusCode: number; body: string }): void {
  expect(response.statusCode).toBe(500);
  const body = parseApiBody<ErrorEnvelope>(response);

  expect(body.error.code).toBe('CONTENT_UNAVAILABLE');
  expect(body.error.statusCode).toBe(500);
  expect(body.error.retryable).toBe(false);
  expect(typeof body.error.requestId).toBe('string');
  expect(body.error.requestId.length).toBeGreaterThan(0);
  expect(body.error.message.toLowerCase()).toContain('unavailable');

  // Ensure no raw AWS SDK internals leak through error messages.
  expect(body.error.message).not.toMatch(/NoSuchKey|AccessDenied|S3ServiceException|@aws-sdk|stack/i);
}

function localClients() {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const region = env?.AWS_REGION ?? 'us-east-1';
  const endpoint = env?.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';

  const ddb = new DynamoDBClient({
    region,
    endpoint,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  });

  return {
    doc: DynamoDBDocumentClient.from(ddb),
  };
}

describe.skipIf(!RUN_PERSISTENCE_INTEGRATION)('FS-061 T-06 orphaned storage error behavior', () => {
  registerHarnessLifecycle();

  afterAll(async () => {
    await teardownHarness();
  });

  it('orphaned mapping config returns CONTENT_UNAVAILABLE envelope', async () => {
    const handlers = await importFullStackHandlers();
    const session = createFreshSession();
    const project = await session.projects.create({
      ...fixtureProjectInput,
      name: 'Orphan Mapping Config Parent',
      slug: 'orphan-mapping-config-parent',
    });

    const orphanId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await localClients().doc.send(new PutCommand({
      TableName: TEST_TABLES.mappings,
      Item: {
        mappingId: orphanId,
        projectId: project.projectId,
        name: 'Orphan Mapping Config',
        version: 1,
        status: 'ready',
        ruleCount: 1,
        coverage: 100,
        configS3Key: `mappings/${orphanId}/config.json`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));

    const response = await handlers.getMapping(apiEvent(undefined, { id: orphanId }));
    expectStructuredContentUnavailable(response);
  });

  it('orphaned mapping version snapshot returns CONTENT_UNAVAILABLE envelope', async () => {
    const handlers = await importFullStackHandlers();

    const mappingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const version = 7;

    await localClients().doc.send(new PutCommand({
      TableName: TEST_TABLES.mappingVersions,
      Item: {
        mappingId,
        version,
        savedAt: new Date().toISOString(),
        savedBy: 'integration-user',
        ruleCount: 3,
        configS3Key: `mappings/${mappingId}/versions/v${version}.json`,
      },
    }));

    const response = await handlers.getVersion(apiEvent(undefined, {
      mappingId,
      version: String(version),
    }));

    expectStructuredContentUnavailable(response);
  });

  it('orphaned schema content returns CONTENT_UNAVAILABLE envelope', async () => {
    const handlers = await importFullStackHandlers();

    const schemaId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await localClients().doc.send(new PutCommand({
      TableName: TEST_TABLES.schemaMetadata,
      Item: {
        schemaId,
        name: 'Orphan Schema Content',
        format: 'json-schema',
        fieldCount: 3,
        origin: 'local',
        status: 'ready',
        scope: 'project',
        inferred: false,
        syncStatus: 'synced',
        source: { type: 'upload' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));

    const response = await handlers.getSchema(apiEvent(undefined, { id: schemaId }));
    expectStructuredContentUnavailable(response);
  });

  it('all orphan scenarios return envelope with no raw AWS details', async () => {
    const handlers = await importFullStackHandlers();
    const doc = localClients().doc;

    const mappingId = '12121212-1212-4121-8121-121212121212';
    const versionMappingId = '34343434-3434-4343-8343-343434343434';
    const schemaId = '56565656-5656-4565-8565-565656565656';

    await doc.send(new PutCommand({
      TableName: TEST_TABLES.mappings,
      Item: {
        mappingId,
        projectId: '78787878-7878-4787-8787-787878787878',
        name: 'Envelope Validation Mapping',
        version: 1,
        status: 'ready',
        ruleCount: 0,
        coverage: 0,
        configS3Key: `mappings/${mappingId}/config.json`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));

    await doc.send(new PutCommand({
      TableName: TEST_TABLES.mappingVersions,
      Item: {
        mappingId: versionMappingId,
        version: 7,
        savedAt: new Date().toISOString(),
        savedBy: 'integration-user',
        ruleCount: 1,
        configS3Key: `mappings/${versionMappingId}/versions/v7.json`,
      },
    }));

    await doc.send(new PutCommand({
      TableName: TEST_TABLES.schemaMetadata,
      Item: {
        schemaId,
        name: 'Envelope Validation Schema',
        format: 'json-schema',
        fieldCount: 1,
        origin: 'local',
        status: 'ready',
        scope: 'project',
        inferred: false,
        syncStatus: 'synced',
        source: { type: 'upload' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));

    const mappingResp = await handlers.getMapping(apiEvent(undefined, {
      id: mappingId,
    }));
    const versionResp = await handlers.getVersion(apiEvent(undefined, {
      mappingId: versionMappingId,
      version: '7',
    }));
    const schemaResp = await handlers.getSchema(apiEvent(undefined, {
      id: schemaId,
    }));

    expectStructuredContentUnavailable(mappingResp);
    expectStructuredContentUnavailable(versionResp);
    expectStructuredContentUnavailable(schemaResp);
  });

  it('non-orphan baseline succeeds for mapping, version, and schema', async () => {
    const handlers = await importFullStackHandlers();
    const session = createFreshSession();

    const project = await session.projects.create({
      ...fixtureProjectInput,
      name: 'Non Orphan Baseline Parent',
      slug: 'non-orphan-baseline-parent',
    });

    const createdMapping = await handlers.createMapping(apiEvent({
      projectId: project.projectId,
      name: 'Baseline Mapping',
      rules: fixtureMappingConfig.rules,
      config: fixtureMappingConfig.config,
      engineVersion: fixtureMappingConfig.engineVersion,
      sourceSchemaRef: fixtureMappingConfig.sourceSchemaRef,
      targetSchemaRef: fixtureMappingConfig.targetSchemaRef,
    }));
    expect(createdMapping.statusCode).toBe(201);
    const mappingBody = parseApiBody<{ mappingId: string }>(createdMapping);

    const loadedMapping = await handlers.getMapping(apiEvent(undefined, { id: mappingBody.mappingId }));
    expect(loadedMapping.statusCode).toBe(200);

    const saveVersion = await handlers.saveVersion(apiEvent({
      version: 1,
      savedAt: new Date().toISOString(),
      savedBy: 'integration-user',
      ruleCount: fixtureMappingConfig.rules.length,
      config: {
        ...fixtureMappingConfig,
        id: mappingBody.mappingId,
        projectId: project.projectId,
        version: 1,
      },
    }, { mappingId: mappingBody.mappingId }));
    expect(saveVersion.statusCode).toBe(204);

    const loadedVersion = await handlers.getVersion(apiEvent(undefined, {
      mappingId: mappingBody.mappingId,
      version: '1',
    }));
    expect(loadedVersion.statusCode).toBe(200);

    const createdSchemaMetadata = await session.schemaMetadata.create({
      name: 'Baseline Schema',
      format: 'json-schema',
      fieldCount: 3,
      origin: 'local',
      status: 'ready',
      scope: 'project',
      inferred: false,
      syncStatus: 'synced',
      source: { type: 'upload' },
    });
    await session.s3.schemaContent.putProcessed(createdSchemaMetadata.schemaId, fixtureSchemaContent as Record<string, unknown>);

    const loadedSchema = await handlers.getSchema(apiEvent(undefined, { id: createdSchemaMetadata.schemaId }));
    expect(loadedSchema.statusCode).toBe(200);
  });

  it('documents direct-Dynamo orphan setup intentionally bypassing create flows', async () => {
    // Intentional no-op assertion test: this suite creates orphan states by writing
    // DynamoDB records directly (without corresponding S3 objects). This is required
    // to validate integrity-failure behavior and cannot be produced via normal APIs,
    // which always write metadata + content together.
    expect(true).toBe(true);
  });

  it('orphaned mapping version supports legacy inline config while S3-key paths error when missing', async () => {
    const handlers = await importFullStackHandlers();
    const doc = localClients().doc;

    const inlineMappingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await doc.send(new PutCommand({
      TableName: TEST_TABLES.mappingVersions,
      Item: {
        mappingId: inlineMappingId,
        version: 1,
        savedAt: new Date().toISOString(),
        savedBy: 'integration-user',
        ruleCount: 1,
        config: {
          name: 'Legacy Inline Version',
          version: 1,
          engineVersion: '1.0.0',
          config: {},
          rules: [],
        },
      },
    }));

    const inlineResponse = await handlers.getVersion(apiEvent(undefined, {
      mappingId: inlineMappingId,
      version: '1',
    }));
    expect(inlineResponse.statusCode).toBe(200);

    const missingRefMappingId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    await doc.send(new PutCommand({
      TableName: TEST_TABLES.mappingVersions,
      Item: {
        mappingId: missingRefMappingId,
        version: 2,
        savedAt: new Date().toISOString(),
        savedBy: 'integration-user',
        ruleCount: 1,
      },
    }));

    const missingRefResponse = await handlers.getVersion(apiEvent(undefined, {
      mappingId: missingRefMappingId,
      version: '2',
    }));
    expectStructuredContentUnavailable(missingRefResponse);
  });

  it('orphan scenarios are independently testable in one run', async () => {
    const doc = localClients().doc;
    const mappingId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const schemaId = '99999999-9999-4999-8999-999999999999';

    await doc.send(new BatchWriteCommand({
      RequestItems: {
        [TEST_TABLES.mappings]: [
          {
            PutRequest: {
              Item: {
                mappingId,
                projectId: '77777777-7777-4777-8777-777777777777',
                name: 'Independent Orphan Mapping',
                version: 1,
                status: 'ready',
                ruleCount: 0,
                coverage: 0,
                configS3Key: `mappings/${mappingId}/config.json`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
          },
        ],
        [TEST_TABLES.schemaMetadata]: [
          {
            PutRequest: {
              Item: {
                schemaId,
                name: 'Independent Orphan Schema',
                format: 'json-schema',
                fieldCount: 1,
                origin: 'local',
                status: 'ready',
                scope: 'project',
                inferred: false,
                syncStatus: 'synced',
                source: { type: 'upload' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
          },
        ],
      },
    }));

    const handlers = await importFullStackHandlers();
    const mappingResp = await handlers.getMapping(apiEvent(undefined, { id: mappingId }));
    const schemaResp = await handlers.getSchema(apiEvent(undefined, { id: schemaId }));

    expectStructuredContentUnavailable(mappingResp);
    expectStructuredContentUnavailable(schemaResp);
  });
});
