import { test, expect } from '../fixtures/base';

import { createDefaultSeedData } from '../fixtures/test-data';

test('seedData/resetData routes by active adapter mode', async ({ page, adapterMode, seedData, resetData }) => {
  const data = createDefaultSeedData();

  await page.goto('/');
  await seedData(data);

  if (adapterMode === 'localStorage') {
    const projectsRaw = await page.evaluate(() => localStorage.getItem('keyra:projects'));
    const projects = projectsRaw ? (JSON.parse(projectsRaw) as unknown[]) : [];
    expect(projects.length).toBe(1);
  } else {
    const response = await fetch('http://127.0.0.1:4100/projects');
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { success: boolean; data: unknown[] };
    expect(payload.success).toBe(true);
    expect(payload.data.length).toBe(1);
  }

  await resetData();

  if (adapterMode === 'localStorage') {
    const projectsRaw = await page.evaluate(() => localStorage.getItem('keyra:projects'));
    const projects = projectsRaw ? (JSON.parse(projectsRaw) as unknown[]) : [];
    expect(projects.length).toBe(0);
  } else {
    const response = await fetch('http://127.0.0.1:4100/projects');
    const payload = (await response.json()) as { success: boolean; data: unknown[] };
    expect(payload.data.length).toBe(0);
  }
});
