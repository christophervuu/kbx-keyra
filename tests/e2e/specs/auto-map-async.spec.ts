import { expect, test } from '../fixtures/base';
import { CreateMappingPage } from '../pages/create-mapping.page';
import { MappingEditorPage } from '../pages/mapping-editor.page';
import { ProjectOverviewPage } from '../pages/project-overview.page';

test.describe('Auto-Map async E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const key = 'keyra:automap:pending-session';
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      } catch {
        // no-op for environments where storage is unavailable before navigation settles
      }
    });
  });

  test('http backend: create→review flow with progressive async status and review actions', async ({
    page,
    adapterMode,
    seedData,
    testData,
  }) => {
    if (adapterMode !== 'httpBackend') {
      await page.goto('/');
      return;
    }

    const projectId = 'project-auto-map-async-e2e';
    const sourceSchemaId = 'schema-source-auto-map-e2e';
    const targetSchemaId = 'schema-target-auto-map-e2e';
    const mappingId = 'mapping-0001';
    const mappingName = 'Async Auto-Map E2E Mapping';

    const seed = testData.createDefaultSeedData({
      projects: [
        testData.createTestProjectEntity({
          projectId,
          name: 'Auto-Map Async E2E Project',
          slug: 'auto-map-async-e2e-project',
          schemaRefs: [
            { schemaId: sourceSchemaId, type: 'local' },
            { schemaId: targetSchemaId, type: 'local' },
          ],
        }),
      ],
      schemas: [
        {
          metadata: testData.createTestSchema({
            schemaId: sourceSchemaId,
            name: 'AutoMap Source',
            scope: 'project',
          }),
          content: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
              amount: { type: 'number' },
            },
            required: ['orderId'],
          },
        },
        {
          metadata: testData.createTestSchema({
            schemaId: targetSchemaId,
            name: 'AutoMap Target',
            scope: 'project',
          }),
          content: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
              amount: { type: 'number' },
            },
            required: ['orderId'],
          },
        },
      ],
      mappings: [],
      mappingVersions: {},
      autoMapScenarios: [
        {
          scenarioId: 'scenario-auto-map-e2e',
          mappingId,
          sectionPath: '',
          visibleTargetPaths: ['orderId', 'amount'],
          startRun: {
            sessionId: 'ams-auto-map-e2e',
            runId: 'run-auto-map-e2e-1',
            status: 'queued',
            queued: true,
          },
          runStatuses: [
            {
              status: 'queued',
              progress: { completedWorkUnits: 0, totalWorkUnits: 2, completedTargets: 0, totalTargets: 2 },
              counts: { generated: 0, ready: 0, warning: 0, invalid: 0, failedTargets: 0 },
            },
            {
              status: 'generating',
              progress: { completedWorkUnits: 1, totalWorkUnits: 2, completedTargets: 1, totalTargets: 2 },
              counts: { generated: 1, ready: 1, warning: 0, invalid: 0, failedTargets: 0 },
            },
            {
              status: 'completed',
              progress: { completedWorkUnits: 2, totalWorkUnits: 2, completedTargets: 2, totalTargets: 2 },
              counts: { generated: 2, ready: 2, warning: 0, invalid: 0, failedTargets: 0 },
            },
          ],
          suggestionsByPoll: [
            [],
            [
              {
                target: 'orderId',
                expression: 'source("orderId")',
                explanation: 'Order id match',
                confidence: 'high',
                reviewStatus: 'pending',
                validation: { valid: true, diagnostics: [] },
              },
            ],
            [
              {
                target: 'orderId',
                expression: 'source("orderId")',
                explanation: 'Order id match',
                confidence: 'high',
                reviewStatus: 'pending',
                validation: { valid: true, diagnostics: [] },
              },
              {
                target: 'amount',
                expression: 'source("amount")',
                explanation: 'Amount passthrough',
                confidence: 'medium',
                reviewStatus: 'pending',
                validation: { valid: true, diagnostics: [] },
              },
            ],
          ],
        },
      ],
    });

    const projectOverview = new ProjectOverviewPage(page);
    const createMapping = new CreateMappingPage(page);
    const mappingEditor = new MappingEditorPage(page);

    await page.goto('/');
    await seedData(seed);

    await projectOverview.goto(projectId);
    await expect(projectOverview.getRoot()).toBeVisible();
    await projectOverview.getCreateMappingButton().click();

    await expect(createMapping.getRoot()).toBeVisible();
    await createMapping.fillName(mappingName);
    await createMapping.selectSourceSchema(sourceSchemaId);
    await createMapping.selectTargetSchema(targetSchemaId);
    await createMapping.selectStartModeAutoMap();
    await expect(createMapping.getStartModeAutoMapOption()).toBeChecked();
    await expect(createMapping.getCreateButton()).toContainText(/Create & Generate Suggestions/i);
    await createMapping.create();

    await expect(mappingEditor.getRoot()).toBeVisible();
    const createdMappingId = /\/projects\/[^/]+\/mappings\/([^/?#]+)/.exec(page.url())?.[1] ?? mappingId;

    await page.evaluate((mappingIdArg) => {
      const key = `keyra:automap-suggestions:${mappingIdArg}`;
      sessionStorage.setItem(
        key,
        JSON.stringify({
          '': {
            sectionPath: '',
            generatedAt: new Date().toISOString(),
            generationContext: {},
            items: [
              {
                targetPath: 'orderId',
                suggestedExpression: 'source("orderId")',
                explanation: 'Order id match',
                confidence: 'high',
                validation: { valid: true, diagnostics: [] },
                status: 'suggested',
                isNew: true,
                existingExpressionAtGeneration: null,
                acceptedExpression: null,
                priorExpressionAtAcceptance: null,
                isMaterialized: false,
              },
              {
                targetPath: 'amount',
                suggestedExpression: 'source("amount")',
                explanation: 'Amount passthrough',
                confidence: 'medium',
                validation: { valid: true, diagnostics: [] },
                status: 'suggested',
                isNew: true,
                existingExpressionAtGeneration: null,
                acceptedExpression: null,
                priorExpressionAtAcceptance: null,
                isMaterialized: false,
              },
            ],
          },
        }),
      );
    }, createdMappingId);

    await mappingEditor.goto(projectId, createdMappingId);
    await expect(mappingEditor.getRoot()).toBeVisible();
    await expect(mappingEditor.getAutoMapWorkspace()).toBeVisible();

    await mappingEditor.waitForAutoMapReviewReady('orderId');
    await mappingEditor.getAutoMapSuggestionCard('amount').waitFor({ state: 'visible' });

    await mappingEditor.getAutoMapAcceptButton('orderId').click();
    await expect(mappingEditor.getSaveStatus()).toContainText(/unsaved/i);

    await mappingEditor.getAutoMapBackToEditorButton().click();
    await expect(mappingEditor.getAutoMapWorkspace()).toHaveCount(0);

    await mappingEditor.goto(projectId, createdMappingId);
    await expect(mappingEditor.getAutoMapWorkspace()).toBeVisible();

    await page.reload();
    await expect(mappingEditor.getRoot()).toBeVisible();
    await expect(mappingEditor.getAutoMapWorkspace()).toBeVisible();
  });

  test('local storage mode: auto-map create path remains isolated from backend AI APIs', async ({
    page,
    adapterMode,
    seedData,
    testData,
  }) => {
    test.skip(adapterMode !== 'localStorage', 'Isolation check is specific to local storage adapter mode.');

    const projectId = 'project-auto-map-isolation-local';
    const sourceSchemaId = 'schema-source-auto-map-local';
    const targetSchemaId = 'schema-target-auto-map-local';

    const seed = testData.createDefaultSeedData({
      projects: [
        testData.createTestProjectEntity({
          projectId,
          name: 'Auto-Map Isolation Local Project',
          slug: 'auto-map-isolation-local',
          schemaRefs: [
            { schemaId: sourceSchemaId, type: 'local' },
            { schemaId: targetSchemaId, type: 'local' },
          ],
        }),
      ],
      schemas: [
        {
          metadata: testData.createTestSchema({ schemaId: sourceSchemaId, name: 'Source Local', scope: 'project' }),
          content: { type: 'object', properties: { sourceField: { type: 'string' } }, required: ['sourceField'] },
        },
        {
          metadata: testData.createTestSchema({ schemaId: targetSchemaId, name: 'Target Local', scope: 'project' }),
          content: { type: 'object', properties: { targetField: { type: 'string' } }, required: ['targetField'] },
        },
      ],
      mappings: [],
      mappingVersions: {},
    });

    let aiSessionRequests = 0;
    await page.route('**/ai/auto-map/sessions**', async (route) => {
      aiSessionRequests += 1;
      await route.continue();
    });

    const projectOverview = new ProjectOverviewPage(page);
    const createMapping = new CreateMappingPage(page);
    const mappingEditor = new MappingEditorPage(page);

    await page.goto('/');
    await seedData(seed);

    await projectOverview.goto(projectId);
    await expect(projectOverview.getRoot()).toBeVisible();
    await projectOverview.getCreateMappingButton().click();

    await expect(createMapping.getRoot()).toBeVisible();
    await createMapping.fillName('Local Isolation Mapping');
    await createMapping.selectSourceSchema(sourceSchemaId);
    await createMapping.selectTargetSchema(targetSchemaId);
    await createMapping.selectStartModeAutoMap();
    await createMapping.create();

    await expect(mappingEditor.getRoot()).toBeVisible();
    await expect(mappingEditor.getAutoMapCreateNotice()).toBeVisible();
    expect(aiSessionRequests).toBe(0);
  });
});
