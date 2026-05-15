import { expect, test } from '../fixtures/base';
import { ProjectFormPage } from '../pages/project-form.page';
import { ProjectListPage } from '../pages/project-list.page';
import { ProjectOverviewPage } from '../pages/project-overview.page';

test.describe('Project CRUD parity', () => {
  test('create, view, update, and delete a project', async ({ page, resetData }) => {
    await page.goto('/');
    await resetData();

    const projectList = new ProjectListPage(page);
    const projectForm = new ProjectFormPage(page);
    const projectOverview = new ProjectOverviewPage(page);

    const initialName = 'Parity CRUD Project';
    const updatedName = 'Parity CRUD Project Renamed';
    const description = 'Created by Playwright parity suite';

    await projectForm.goto();
    await expect(projectForm.getRoot()).toBeVisible();

    await projectForm.fillName(initialName);
    await projectForm.fillDescription(description);
    await projectForm.submit();

    await expect(projectOverview.getRoot()).toBeVisible();
    await expect(projectOverview.getProjectNameButton()).toContainText(initialName);

    await projectList.goto();
    await expect(projectList.getRoot()).toBeVisible();
    await expect(projectList.getProjectOverviewLink(initialName)).toBeVisible();

    await projectList.getProjectOverviewLink(initialName).click();
    await expect(projectOverview.getRoot()).toBeVisible();

    await projectOverview.inlineRenameProject(updatedName);
    await expect(projectOverview.getProjectNameButton()).toContainText(updatedName);

    await projectOverview.openProjectOverflowMenu();
    await projectOverview.getDeleteProjectMenuItem().click();
    await projectOverview.getDeleteProjectConfirmButton().click();

    await expect(projectList.getRoot()).toBeVisible();
    await expect(projectList.getProjectOverviewLink(updatedName)).toHaveCount(0);
  });
});
