import type { Locator, Page } from '@playwright/test';

export class SchemaDetailPage {
  constructor(private readonly page: Page) {}

  async goto(schemaId: string): Promise<void> {
    await this.page.goto(`/schemas/${schemaId}`);
  }

  getRoot(): Locator {
    return this.page.getByTestId('page-schema-detail');
  }

  getMetadataSection(): Locator {
    return this.page.getByTestId('schema-detail-metadata');
  }

  getTreeSection(): Locator {
    return this.page.getByTestId('schema-detail-tree');
  }

  getNodeByName(fieldName: string): Locator {
    return this.page.getByText(fieldName, { exact: true });
  }

  getErrorState(): Locator {
    return this.page.getByTestId('schema-detail-error');
  }

  getNotFoundState(): Locator {
    return this.page.getByTestId('schema-detail-not-found');
  }
}
