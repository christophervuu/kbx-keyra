import type { Locator, Page } from '@playwright/test';

export class ProjectListPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  getRoot(): Locator {
    return this.page.getByTestId('page-home-dashboard');
  }

  getCreateProjectButton(): Locator {
    return this.page.getByRole('link', { name: /create project/i });
  }

  getProjectOverviewLink(projectName: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`open project ${projectName}`, 'i') });
  }
}
