import type { Page } from '@playwright/test';

import { resetBackend, seedBackend } from './http-seed';
import { clearLocalStorage, seedLocalStorage } from './storage';
import type { TestSeedData } from './test-data';

export type AdapterMode = 'localStorage' | 'httpBackend';

export function adapterModeFromProjectName(projectName: string): AdapterMode {
  return projectName === 'httpBackend' ? 'httpBackend' : 'localStorage';
}

export async function seedData(
  page: Page,
  data: TestSeedData,
  mode: AdapterMode,
): Promise<void> {
  if (mode === 'httpBackend') {
    await seedBackend(data);
    return;
  }

  await seedLocalStorage(page, data);
}

export async function resetData(page: Page, mode: AdapterMode): Promise<void> {
  if (mode === 'httpBackend') {
    await resetBackend();
    return;
  }

  await clearLocalStorage(page);
}
