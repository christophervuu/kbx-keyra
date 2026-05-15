import type { Page } from '@playwright/test';

import type { TestSeedData } from './test-data';

interface LocalStoredSchema {
  metadata: TestSeedData['schemas'][number]['metadata'];
  detail: {
    metadata: TestSeedData['schemas'][number]['metadata'];
    content: TestSeedData['schemas'][number]['content'];
  };
}

interface LocalStoredMapping {
  metadata: TestSeedData['mappings'][number]['metadata'];
  config: TestSeedData['mappings'][number]['config'];
}

export async function seedLocalStorage(page: Page, data: TestSeedData): Promise<void> {
  const storedSchemas: LocalStoredSchema[] = data.schemas.map((schema) => ({
    metadata: schema.metadata,
    detail: {
      metadata: schema.metadata,
      content: schema.content,
    },
  }));

  const storedMappings: LocalStoredMapping[] = data.mappings.map((mapping) => ({
    metadata: mapping.metadata,
    config: mapping.config,
  }));

  await page.evaluate(
    ({ projects, schemas, mappings, mappingVersions }) => {
      localStorage.setItem('keyra:projects', JSON.stringify(projects));
      localStorage.setItem('keyra:schemas', JSON.stringify(schemas));
      localStorage.setItem('keyra:mappings', JSON.stringify(mappings));

      if (mappingVersions) {
        for (const [mappingId, versions] of Object.entries(mappingVersions)) {
          localStorage.setItem(`keyra:versions:${mappingId}`, JSON.stringify(versions));
        }
      }
    },
    {
      projects: data.projects,
      schemas: storedSchemas,
      mappings: storedMappings,
      mappingVersions: data.mappingVersions,
    },
  );
}

export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('keyra:')) {
        localStorage.removeItem(key);
      }
    }
  });
}
