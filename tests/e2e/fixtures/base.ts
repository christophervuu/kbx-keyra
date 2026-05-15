import { test as base } from '@playwright/test';

import { resetData, seedData, adapterModeFromProjectName, type AdapterMode } from './seed';
import {
  createDefaultSeedData,
  createTestMapping,
  createTestMappingConfig,
  createTestProject,
  createTestProjectEntity,
  createTestSchema,
  createTestSchemaDetail,
  type TestSeedData,
} from './test-data';

interface TestDataFactories {
  createTestProject: typeof createTestProject;
  createTestProjectEntity: typeof createTestProjectEntity;
  createTestMapping: typeof createTestMapping;
  createTestMappingConfig: typeof createTestMappingConfig;
  createTestSchema: typeof createTestSchema;
  createTestSchemaDetail: typeof createTestSchemaDetail;
  createDefaultSeedData: typeof createDefaultSeedData;
}

export interface E2EFixtures {
  adapterMode: AdapterMode;
  testData: TestDataFactories;
  seedData: (data: TestSeedData) => Promise<void>;
  resetData: () => Promise<void>;
}

export const test = base.extend<E2EFixtures>({
  adapterMode: [
    async ({ browserName }, use, testInfo) => {
      void browserName;
      await use(adapterModeFromProjectName(testInfo.project.name));
    },
    { auto: true },
  ],

  testData: async ({ browserName }, use) => {
    void browserName;
    await use({
      createTestProject,
      createTestProjectEntity,
      createTestMapping,
      createTestMappingConfig,
      createTestSchema,
      createTestSchemaDetail,
      createDefaultSeedData,
    });
  },

  seedData: async ({ page, adapterMode }, use) => {
    await use(async (data: TestSeedData) => {
      await seedData(page, data, adapterMode);
    });
  },

  resetData: async ({ page, adapterMode }, use) => {
    await use(async () => {
      await resetData(page, adapterMode);
    });
  },
});

test.afterEach(async ({ page, adapterMode }) => {
  await resetData(page, adapterMode);
});

export { expect } from '@playwright/test';
