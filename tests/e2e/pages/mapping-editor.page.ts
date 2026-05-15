import type { Locator, Page } from '@playwright/test';

export class MappingEditorPage {
  constructor(private readonly page: Page) {}

  async goto(projectId: string, mappingId: string): Promise<void> {
    await this.page.goto(`/projects/${projectId}/mappings/${mappingId}`);
  }

  getRoot(): Locator {
    return this.page.getByTestId('mapping-editor-page');
  }

  getSaveButton(): Locator {
    return this.page.getByTestId('save-button');
  }

  getSaveStatus(): Locator {
    return this.page.getByTestId('save-status');
  }

  getToolbarViewRulesButton(): Locator {
    return this.page.getByTestId('toolbar-view-rules').first();
  }

  getTargetFieldRow(fieldPath: string): Locator {
    return this.page.getByTestId(`target-field-row-${fieldPath}`);
  }

  getSourceFieldButton(fieldPath: string): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(`stage source field ${fieldPath}`, 'i'),
    });
  }

  getAddRuleButton(): Locator {
    return this.page.getByRole('button', { name: /^add rule$/i }).first();
  }

  getRuleFormTargetInput(): Locator {
    return this.page.getByTestId('rule-form-target-input');
  }

  getRuleFormExpressionInput(): Locator {
    return this.page.getByTestId('rule-form-expression-input');
  }

  getRuleFormSaveButton(): Locator {
    return this.page.getByTestId('rule-form-save');
  }

  getRuleRowTarget(targetPath: string): Locator {
    return this.page.getByText(targetPath, { exact: true });
  }

  getRuleList(): Locator {
    return this.page.getByTestId('rule-list');
  }

  getHistoryButton(): Locator {
    return this.page.getByTestId('history-toggle-button');
  }

  getConfigButton(): Locator {
    return this.page.getByTestId('config-toggle-button');
  }

  async save(): Promise<void> {
    if ((await this.getSaveButton().isEnabled()) === false) {
      return;
    }
    await this.getSaveButton().click();
  }

  async selectTargetField(fieldPath: string): Promise<void> {
    await this.getTargetFieldRow(fieldPath).click();
  }

  async stageSourceField(fieldPath: string): Promise<void> {
    await this.getSourceFieldButton(fieldPath).click();
  }

  async switchToRulesView(): Promise<void> {
    await this.getToolbarViewRulesButton().click();
  }

  async addRule(targetPath: string, expression: string): Promise<void> {
    await this.getAddRuleButton().click();
    await this.getRuleFormTargetInput().fill(targetPath);
    await this.getRuleFormExpressionInput().fill(expression);
    await this.getRuleFormSaveButton().click();
  }
}
