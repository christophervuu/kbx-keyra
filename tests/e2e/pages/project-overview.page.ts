import type { Locator, Page } from '@playwright/test';

export class ProjectOverviewPage {
  constructor(private readonly page: Page) {}

  async goto(projectId: string): Promise<void> {
    await this.page.goto(`/projects/${projectId}`);
  }

  getRoot(): Locator {
    return this.page.getByTestId('page-project-overview');
  }

  getProjectNameButton(): Locator {
    return this.page.getByRole('button', { name: /project name/i });
  }

  getOverflowMenuTrigger(): Locator {
    return this.page.getByTestId('project-overflow-menu-trigger');
  }

  getDeleteProjectMenuItem(): Locator {
    return this.page.getByRole('menuitem', { name: /delete project/i });
  }

  getDeleteProjectConfirmButton(): Locator {
    return this.page.getByRole('button', { name: /delete project/i });
  }

  getCreateMappingButton(): Locator {
    return this.page.getByTestId('header-create-mapping-btn');
  }

  getSchemaCardByName(schemaName: string): Locator {
    return this.page.locator('div', { hasText: schemaName }).filter({ has: this.page.getByRole('button', { name: /view schema/i }) }).first();
  }

  getSchemaViewButton(schemaName: string): Locator {
    return this.getSchemaCardByName(schemaName).getByRole('button', { name: /view schema/i });
  }

  getMappingLinkByName(mappingName: string): Locator {
    return this.page.getByRole('link', { name: mappingName, exact: true });
  }

  getDuplicateMappingButton(mappingName: string): Locator {
    return this.page.getByRole('row', { name: mappingName }).getByRole('button', {
      name: `Duplicate mapping ${mappingName}`,
      exact: true,
    });
  }

  getDeleteMappingButton(mappingName: string): Locator {
    return this.page.getByRole('row', { name: mappingName }).getByRole('button', {
      name: `Delete mapping ${mappingName}`,
      exact: true,
    });
  }

  getDeleteMappingConfirmButton(): Locator {
    return this.page.getByTestId('delete-confirm-button');
  }

  getSchemaEmptyState(): Locator {
    return this.page.getByTestId('schema-empty-state');
  }

  getMappingEmptyState(): Locator {
    return this.page.getByTestId('mapping-empty-state');
  }

  getSchemaUploadDialog(): Locator {
    return this.page.getByTestId('schema-upload-dialog');
  }

  getAddSchemaButton(): Locator {
    return this.page.getByRole('button', { name: /add schema/i });
  }

  async openSchemaUpload(): Promise<void> {
    await this.getAddSchemaButton().click();
  }

  async openProjectOverflowMenu(): Promise<void> {
    await this.getOverflowMenuTrigger().click();
  }

  async inlineRenameProject(nextName: string): Promise<void> {
    const nameButton = this.page.getByRole('button', { name: /project name/i });
    await nameButton.click();
    const input = this.page.getByLabel(/project name/i);
    await input.fill(nextName);
    await input.press('Enter');
  }
}
