import type { Locator, Page } from '@playwright/test';

export class ProjectFormPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/projects/new');
  }

  getRoot(): Locator {
    return this.page.getByTestId('page-create-project');
  }

  getNameInput(): Locator {
    return this.page.locator('#project-name');
  }

  getDescriptionInput(): Locator {
    return this.page.locator('#project-description');
  }

  getTagsInput(): Locator {
    return this.page.locator('#project-tags');
  }

  getSubmitButton(): Locator {
    return this.page.getByTestId('submit-button');
  }

  getNameError(): Locator {
    return this.page.getByTestId('name-error');
  }

  getCancelButton(): Locator {
    return this.page.getByTestId('cancel-button');
  }

  async fillName(name: string): Promise<void> {
    await this.getNameInput().fill(name);
  }

  async fillDescription(description: string): Promise<void> {
    await this.getDescriptionInput().fill(description);
  }

  async fillTags(tagsCsv: string): Promise<void> {
    await this.getTagsInput().fill(tagsCsv);
  }

  async submit(): Promise<void> {
    await this.getSubmitButton().click();
  }
}
