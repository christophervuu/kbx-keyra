import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '../fixtures/base';
import { ProjectOverviewPage } from '../pages/project-overview.page';
import { SchemaDetailPage } from '../pages/schema-detail.page';
import { SchemaUploadPage } from '../pages/schema-upload.page';

test.describe('Schema upload/load parity', () => {
  test('upload schema, view detail metadata/tree, and reference in project', async ({
    page,
    seedData,
    testData,
  }) => {
    const projectId = 'project-schema-flows';
    const projectName = 'Schema Flow Project';
    const uploadedSchemaName = 'Simple Order Upload';

    const seed = testData.createDefaultSeedData({
      projects: [
        testData.createTestProjectEntity({
          projectId,
          name: projectName,
          slug: 'schema-flow-project',
          schemaRefs: [],
        }),
      ],
      mappings: [],
      schemas: [],
      mappingVersions: {},
    });

    const projectOverview = new ProjectOverviewPage(page);
    const schemaUpload = new SchemaUploadPage(page);
    const schemaDetail = new SchemaDetailPage(page);

    await page.goto('/');
    await seedData(seed);

    await projectOverview.goto(projectId);
    await expect(projectOverview.getRoot()).toBeVisible();
    await expect(projectOverview.getSchemaEmptyState()).toBeVisible();

    await projectOverview.openSchemaUpload();
    await expect(schemaUpload.getDialog()).toBeVisible();

    const fixturePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../fixtures/schemas/simple-order.json',
    );
    await schemaUpload.uploadSchemaFile(fixturePath);
    await schemaUpload.setSchemaName(uploadedSchemaName);
    await schemaUpload.submit();

    await expect(schemaUpload.getDialog()).toHaveCount(0);
    await expect(projectOverview.getSchemaViewButton(uploadedSchemaName)).toBeVisible();

    await projectOverview.getSchemaViewButton(uploadedSchemaName).click();
    await expect(schemaDetail.getRoot()).toBeVisible();
    await expect(schemaDetail.getMetadataSection()).toContainText(uploadedSchemaName);
    await expect(schemaDetail.getTreeSection()).toBeVisible();
    await expect(schemaDetail.getNodeByName('orderId')).toBeVisible();
    await expect(schemaDetail.getNodeByName('totalAmount')).toBeVisible();

    await projectOverview.goto(projectId);
    await expect(projectOverview.getRoot()).toBeVisible();
    await expect(projectOverview.getSchemaViewButton(uploadedSchemaName)).toBeVisible();
  });
});
