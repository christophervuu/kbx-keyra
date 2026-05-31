import { afterAll, describe, expect, it } from 'vitest';

import {
  apiEvent,
  importFullStackHandlers,
  parseApiBody,
  registerHarnessLifecycle,
  teardownHarness,
} from './helpers/full-stack.js';
import { createFreshSession } from './helpers/session.js';
import {
  fixtureMappingConfig,
  fixtureMappingInput,
  fixtureProjectInput,
} from './helpers/fixtures.js';

const RUN_PERSISTENCE_INTEGRATION =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.RUN_PERSISTENCE_INTEGRATION === '1';

describe.skipIf(!RUN_PERSISTENCE_INTEGRATION)('FS-061 T-01 harness smoke', () => {
  registerHarnessLifecycle();

  afterAll(async () => {
    await teardownHarness();
  });

  it('createFreshSession returns full operation surface', () => {
    const session = createFreshSession();

    expect(session.__sessionId).toBeTypeOf('string');

    expect(session.projects).toMatchObject({
      create: expect.any(Function),
      get: expect.any(Function),
      list: expect.any(Function),
      update: expect.any(Function),
      delete: expect.any(Function),
    });

    expect(session.mappings).toMatchObject({
      create: expect.any(Function),
      get: expect.any(Function),
      listByProject: expect.any(Function),
      update: expect.any(Function),
      delete: expect.any(Function),
      duplicate: expect.any(Function),
    });

    expect(session.schemaMetadata).toMatchObject({
      create: expect.any(Function),
      get: expect.any(Function),
      list: expect.any(Function),
      updateStatus: expect.any(Function),
      delete: expect.any(Function),
    });

    expect(session.schemaNodes).toMatchObject({
      batchWrite: expect.any(Function),
      listBySchema: expect.any(Function),
      queryContains: expect.any(Function),
      deleteBySchema: expect.any(Function),
    });

    expect(session.mappingVersions).toMatchObject({
      save: expect.any(Function),
      list: expect.any(Function),
      get: expect.any(Function),
      getConfig: expect.any(Function),
    });

    expect(session.s3).toMatchObject({
      schemaContent: {
        putOriginal: expect.any(Function),
        putProcessed: expect.any(Function),
        get: expect.any(Function),
        getOriginal: expect.any(Function),
        delete: expect.any(Function),
      },
      mappingConfig: {
        put: expect.any(Function),
        get: expect.any(Function),
        delete: expect.any(Function),
      },
    });
  });

  it('supports simple create/get across fresh sessions', async () => {
    const sessionA = createFreshSession();
    const createdProject = await sessionA.projects.create(fixtureProjectInput);

    const sessionB = createFreshSession();
    const loadedProject = await sessionB.projects.get(createdProject.projectId);

    expect(loadedProject).toEqual(createdProject);
  });

  it('independent sessions have distinct instances but shared persisted state', async () => {
    const sessionA = createFreshSession();
    const sessionB = createFreshSession();

    expect(sessionA.__sessionId).not.toEqual(sessionB.__sessionId);
    expect(sessionA.projects).not.toBe(sessionB.projects);
    expect(sessionA.mappings).not.toBe(sessionB.mappings);
    expect(sessionA.mappingVersions).not.toBe(sessionB.mappingVersions);

    const createdProject = await sessionA.projects.create({
      ...fixtureProjectInput,
      name: 'Fresh Session Shared Persisted State',
      slug: 'fresh-session-shared-persisted-state',
    });

    const sessionBRead = await sessionB.projects.get(createdProject.projectId);
    expect(sessionBRead?.projectId).toBe(createdProject.projectId);
  });

  it('full-stack handler invocation works through helper', async () => {
    const handlers = await importFullStackHandlers();

    const createProjectResponse = await handlers.createProject(apiEvent({
      name: 'FS-061 Full Stack Smoke Project',
      description: 'created through lambda invocation helper',
      slug: 'fs-061-full-stack-smoke-project',
      schemaRefs: [],
      tags: ['smoke'],
    }));

    expect(createProjectResponse.statusCode).toBe(201);
    const created = parseApiBody<{ projectId: string }>(createProjectResponse);

    const createMappingResponse = await handlers.createMapping(apiEvent({
      ...fixtureMappingInput,
      projectId: created.projectId,
      name: 'FS-061 Full Stack Mapping',
      rules: fixtureMappingConfig.rules,
      config: fixtureMappingConfig.config,
      engineVersion: fixtureMappingConfig.engineVersion,
      sourceSchemaRef: fixtureMappingConfig.sourceSchemaRef,
      targetSchemaRef: fixtureMappingConfig.targetSchemaRef,
    }));

    expect(createMappingResponse.statusCode).toBe(201);
    const createdMapping = parseApiBody<{ mappingId: string }>(createMappingResponse);

    const getMappingResponse = await handlers.getMapping(
      apiEvent(undefined, { id: createdMapping.mappingId }),
    );

    expect(getMappingResponse.statusCode).toBe(200);
  });
});
