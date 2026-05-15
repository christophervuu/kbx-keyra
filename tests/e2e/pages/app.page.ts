import type { Locator, Page } from '@playwright/test';

export class AppPage {
  constructor(private readonly page: Page) {}

  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
  }

  getHomePage(): Locator {
    return this.page.getByTestId('page-home-dashboard');
  }

  getCreateProjectPage(): Locator {
    return this.page.getByTestId('page-create-project');
  }

  getProjectOverviewPage(): Locator {
    return this.page.getByTestId('page-project-overview');
  }

  getCreateMappingPage(): Locator {
    return this.page.getByTestId('page-create-mapping');
  }

  getMappingEditorPage(): Locator {
    return this.page.getByTestId('mapping-editor-page');
  }

  getSchemaLibraryPage(): Locator {
    return this.page.getByTestId('page-schema-library');
  }

  getSchemaDetailPage(): Locator {
    return this.page.getByTestId('page-schema-detail');
  }
}
