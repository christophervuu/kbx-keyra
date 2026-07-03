import { expect, test } from '../fixtures/base';

import { CreateMappingPage } from '../pages/create-mapping.page';
import { MappingEditorPage } from '../pages/mapping-editor.page';
import { ProjectOverviewPage } from '../pages/project-overview.page';

test.describe('FS-103 cache parity', () => {
  test('return navigation preserves content without full skeleton regression in both adapter modes', async ({
    page,
    seedData,
    testData,
  }) => {
    const projectId = 'project-cache-parity';
    const sourceSchemaId = 'schema-source-cache';
    const targetSchemaId = 'schema-target-cache';
    const mappingName = 'Cache Mapping';

    const seed = testData.createDefaultSeedData({
      projects: [
        testData.createTestProjectEntity({
          projectId,
          name: 'Cache Parity Project',
          slug: 'cache-parity-project',
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
            name: 'Source Cache Schema',
            scope: 'project',
          }),
          content: {
            type: 'object',
            properties: {
              sourceField: { type: 'string' },
            },
          },
        },
        {
          metadata: testData.createTestSchema({
            schemaId: targetSchemaId,
            name: 'Target Cache Schema',
            scope: 'project',
          }),
          content: {
            type: 'object',
            properties: {
              targetField: { type: 'string' },
            },
          },
        },
      ],
      mappings: [],
      mappingVersions: {},
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
    await createMapping.create();

    await expect(mappingEditor.getRoot()).toBeVisible();

    await projectOverview.goto(projectId);
    await expect(projectOverview.getRoot()).toBeVisible();
    await expect(page.getByTestId('project-overview-skeleton')).toHaveCount(0);
    await expect(projectOverview.getMappingLinkByName(mappingName)).toBeVisible();

    await projectOverview.getMappingLinkByName(mappingName).click();
    await expect(mappingEditor.getRoot()).toBeVisible();
  });

  test('backend context switch clears incompatible cache and prevents stale cross-context render', async ({
    page,
    adapterMode,
    seedData,
    testData,
  }) => {
    if (adapterMode !== 'httpBackend') {
      await page.goto('/');
      return;
    }

    const initialSeed = testData.createDefaultSeedData({
      projects: [
        testData.createTestProjectEntity({
          projectId: 'project-context-old',
          name: 'Old Backend Project',
          slug: 'old-backend-project',
          schemaRefs: [],
        }),
      ],
      mappings: [],
      schemas: [],
      mappingVersions: {},
    });

    const nextSeed = testData.createDefaultSeedData({
      projects: [
        testData.createTestProjectEntity({
          projectId: 'project-context-new',
          name: 'New Backend Project',
          slug: 'new-backend-project',
          schemaRefs: [],
        }),
      ],
      mappings: [],
      schemas: [],
      mappingVersions: {},
    });

    await page.goto('/');
    await seedData(initialSeed);
    await page.reload();

    await expect(page.getByText('Old Backend Project')).toBeVisible();

    await seedData(nextSeed);
    await page.reload();

    await expect(page.getByText('New Backend Project')).toBeVisible();
    await expect(page.getByText('Old Backend Project')).toHaveCount(0);
  });
});
