import { expect, test } from '../fixtures/base';
import { CreateMappingPage } from '../pages/create-mapping.page';
import { MappingEditorPage } from '../pages/mapping-editor.page';
import { ProjectOverviewPage } from '../pages/project-overview.page';

test.describe('Mapping CRUD parity', () => {
  test('create mapping, persist rule, duplicate mapping, and delete original', async ({
    page,
    seedData,
    testData,
  }) => {
    const projectId = 'project-mapping-crud';
    const sourceSchemaId = 'schema-source-crud';
    const targetSchemaId = 'schema-target-crud';
    const mappingName = 'Parity Mapping';
    const mappingCopyName = `${mappingName} (Copy)`;

    const seed = testData.createDefaultSeedData({
      projects: [
        testData.createTestProjectEntity({
          projectId,
          name: 'Mapping CRUD Project',
          slug: 'mapping-crud-project',
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
            name: 'Source CRUD Schema',
            scope: 'project',
          }),
          content: {
            type: 'object',
            properties: {
              sourceField: { type: 'string' },
            },
            required: ['sourceField'],
          },
        },
        {
          metadata: testData.createTestSchema({
            schemaId: targetSchemaId,
            name: 'Target CRUD Schema',
            scope: 'project',
          }),
          content: {
            type: 'object',
            properties: {
              targetField: { type: 'string' },
            },
            required: ['targetField'],
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
    await createMapping.next();

    await createMapping.selectSourceSchema(sourceSchemaId);
    await createMapping.next();

    await createMapping.selectTargetSchema(targetSchemaId);
    await createMapping.create();

    await expect(mappingEditor.getRoot()).toBeVisible();
    await expect(mappingEditor.getSaveStatus()).toContainText(/saved/i);

    await mappingEditor.selectTargetField('targetField');
    await mappingEditor.stageSourceField('sourceField');

    await expect(mappingEditor.getSaveStatus()).toContainText(/unsaved/i);
    await mappingEditor.save();
    await expect(mappingEditor.getSaveStatus()).toContainText(/saved/i);

    await expect(mappingEditor.getSaveStatus()).toContainText(/unsaved|saved/i);

    await projectOverview.goto(projectId);
    await expect(projectOverview.getMappingLinkByName(mappingName)).toBeVisible();

    await projectOverview.getMappingLinkByName(mappingName).click();
    await expect(mappingEditor.getRoot()).toBeVisible();
    await mappingEditor.switchToRulesView();
    await expect(mappingEditor.getRuleList()).toBeVisible();
    await expect(mappingEditor.getRuleList()).toContainText('targetField');
    await expect(mappingEditor.getRuleList()).toContainText('source("sourceField")');

    await projectOverview.goto(projectId);
    await projectOverview.getDuplicateMappingButton(mappingName).click();
    await expect(projectOverview.getMappingLinkByName(mappingCopyName)).toBeVisible();

    await projectOverview.getDeleteMappingButton(mappingName).click();
    await projectOverview.getDeleteMappingConfirmButton().click();

    await expect(projectOverview.getMappingLinkByName(mappingName)).toHaveCount(0);
    await expect(projectOverview.getMappingLinkByName(mappingCopyName)).toBeVisible();
  });
});
