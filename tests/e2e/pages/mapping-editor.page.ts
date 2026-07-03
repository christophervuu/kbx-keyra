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

  getAutoMapWorkspace(): Locator {
    return this.page.getByTestId('automap-workspace');
  }

  getAutoMapRunStatusText(): Locator {
    return this.page.getByTestId('workspace-run-status-text');
  }

  getAutoMapRunCounts(): Locator {
    return this.page.getByTestId('workspace-run-counts');
  }

  getAutoMapSuggestionCard(targetPath: string): Locator {
    return this.page.getByTestId(`suggestion-card-${targetPath}`);
  }

  getAutoMapAcceptButton(targetPath: string): Locator {
    return this.page.getByTestId(`accept-${targetPath}`);
  }

  getAutoMapDismissButton(targetPath: string): Locator {
    return this.page.getByTestId(`dismiss-${targetPath}`);
  }

  getAutoMapUndoDismissButton(targetPath: string): Locator {
    return this.page.getByTestId(`undo-dismiss-${targetPath}`);
  }

  getAutoMapBackToEditorButton(): Locator {
    return this.page.getByTestId('workspace-back-to-editor');
  }

  getAutoMapReentryPill(): Locator {
    return this.page.getByTestId('automap-reentry-pill');
  }

  getAutoMapCreateNotice(): Locator {
    return this.page.getByTestId('automap-create-notice');
  }

  getAutoMapRefreshAllButton(): Locator {
    return this.page.getByTestId('bulk-refresh-all');
  }

  getAutoMapAcceptAllValidButton(): Locator {
    return this.page.getByTestId('bulk-accept-all-valid');
  }

  getToolbarViewRulesButton(): Locator {
    return this.page.getByTestId('toolbar-view-rules').first();
  }

  getTargetFieldRow(fieldPath: string): Locator {
    return this.page.getByTestId(`target-field-row-${fieldPath}`);
  }

  getSourceFieldButton(fieldPath: string): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(`stage input field ${fieldPath}`, 'i'),
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

  async waitForAutoMapReviewReady(targetPath: string): Promise<void> {
    await this.getAutoMapWorkspace().waitFor({ state: 'visible' });
    await this.getAutoMapSuggestionCard(targetPath).waitFor({ state: 'visible' });
  }

  async addRule(targetPath: string, expression: string): Promise<void> {
    await this.getAddRuleButton().click();
    await this.getRuleFormTargetInput().fill(targetPath);
    await this.getRuleFormExpressionInput().fill(expression);
    await this.getRuleFormSaveButton().click();
  }
}
