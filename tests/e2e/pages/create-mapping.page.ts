import type { Locator, Page } from '@playwright/test';

export class CreateMappingPage {
  constructor(private readonly page: Page) {}

  getRoot(): Locator {
    return this.page.getByTestId('page-create-mapping');
  }

  getNameInput(): Locator {
    return this.page.locator('#mapping-name');
  }

  getNextButton(): Locator {
    return this.page.getByTestId('next-button');
  }

  getStartModeAutoMapOption(): Locator {
    return this.page.locator('input[name="start-mode"][value="auto-map"]');
  }

  getStartModeAutoMapLabel(): Locator {
    return this.page.getByText('Auto-map suggestions', { exact: true });
  }

  getCreateButton(): Locator {
    return this.page.getByTestId('create-button');
  }

  getSourceSchemaSelect(): Locator {
    return this.page.getByTestId('schema-select-source-schema');
  }

  getTargetSchemaSelect(): Locator {
    return this.page.getByTestId('schema-select-target-schema');
  }

  async fillName(name: string): Promise<void> {
    await this.getNameInput().fill(name);
  }

  async next(): Promise<void> {
    await this.getNextButton().click();
  }

  async selectSourceSchema(schemaId: string): Promise<void> {
    await this.getSourceSchemaSelect().selectOption(schemaId);
  }

  async selectTargetSchema(schemaId: string): Promise<void> {
    await this.getTargetSchemaSelect().selectOption(schemaId);
  }

  async create(): Promise<void> {
    await this.getCreateButton().click();
  }

  async selectStartModeAutoMap(): Promise<void> {
    await this.getStartModeAutoMapLabel().click();
    await this.getStartModeAutoMapOption().check();
  }
}
