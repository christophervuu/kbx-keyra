import { expect, test } from '../fixtures/base';
import { MappingEditorPage } from '../pages/mapping-editor.page';
import { ProjectFormPage } from '../pages/project-form.page';
import { ProjectOverviewPage } from '../pages/project-overview.page';

test.describe('Error handling parity', () => {
  test('renders project not-found state for non-existent project route', async ({ page, resetData }) => {
    await page.goto('/');
    await resetData();

    const projectOverview = new ProjectOverviewPage(page);
    await projectOverview.goto('project-does-not-exist');

    await expect(projectOverview.getRoot()).toBeVisible();
    await expect(page.getByText(/project not found|failed to load project/i)).toBeVisible();
  });

  test('renders mapping load error for non-existent mapping route', async ({
    page,
    seedData,
    testData,
  }) => {
    const projectId = 'project-error-handling';
    const seed = testData.createDefaultSeedData({
      projects: [
        testData.createTestProjectEntity({
          projectId,
          name: 'Error Handling Project',
          slug: 'error-handling-project',
          schemaRefs: [],
        }),
      ],
      mappings: [],
      schemas: [],
      mappingVersions: {},
    });

    await page.goto('/');
    await seedData(seed);

    const mappingEditor = new MappingEditorPage(page);
    await mappingEditor.goto(projectId, 'mapping-does-not-exist');

    await expect(page.getByTestId('editor-load-error')).toBeVisible();
    await expect(page.getByText(/failed to load mapping|not found/i)).toBeVisible();
  });

  test('shows validation feedback when creating project with empty name', async ({ page, resetData }) => {
    await page.goto('/');
    await resetData();

    const projectForm = new ProjectFormPage(page);
    await projectForm.goto();
    await expect(projectForm.getRoot()).toBeVisible();

    await projectForm.submit();
    await expect(projectForm.getNameError()).toBeVisible();
    await expect(projectForm.getNameError()).toContainText(/project name is required/i);
  });
});
