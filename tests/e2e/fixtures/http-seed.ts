import type { TestSeedData } from './test-data';

const MOCK_SERVER_BASE_URL = process.env.E2E_MOCK_SERVER_URL ?? 'http://127.0.0.1:4100';

export async function seedBackend(data: TestSeedData): Promise<void> {
  const response = await fetch(`${MOCK_SERVER_BASE_URL}/test/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projects: data.projects,
      mappings: data.mappings,
      schemas: data.schemas,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mock backend seed failed with status ${response.status}`);
  }
}

export async function resetBackend(): Promise<void> {
  const response = await fetch(`${MOCK_SERVER_BASE_URL}/test/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Mock backend reset failed with status ${response.status}`);
  }
}
