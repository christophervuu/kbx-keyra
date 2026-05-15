import type { Locator, Page } from '@playwright/test';

export class SchemaUploadPage {
  constructor(private readonly page: Page) {}

  getDialog(): Locator {
    return this.page.getByTestId('schema-upload-dialog');
  }

  getFileInput(): Locator {
    return this.page.getByTestId('file-input');
  }

  getSchemaNameInput(): Locator {
    return this.page.getByTestId('schema-name-input');
  }

  getUploadButton(): Locator {
    return this.page.getByTestId('upload-button');
  }

  getCancelButton(): Locator {
    return this.page.getByTestId('cancel-button');
  }

  getModeTabFile(): Locator {
    return this.page.getByTestId('mode-tab-file');
  }

  getModeTabPaste(): Locator {
    return this.page.getByTestId('mode-tab-paste');
  }

  async uploadSchemaFile(filePath: string): Promise<void> {
    await this.getFileInput().setInputFiles(filePath);
  }

  async setSchemaName(name: string): Promise<void> {
    await this.getSchemaNameInput().fill(name);
  }

  async submit(): Promise<void> {
    await this.getUploadButton().click();
  }
}
