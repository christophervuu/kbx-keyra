import { describe, expect, it, vi } from 'vitest';

import type { AIRuntimeConfig } from '../../../src/lib/ai/config.js';
import {
  createPromptRegistryAdapter,
  DynamoPromptRegistryAdapter,
  LocalPromptRegistryAdapter,
  type PromptRecord,
} from '../../../src/lib/ai/index.js';

function createPromptRecord(overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    promptId: 'explain-rule',
    version: 3,
    systemMessage: 'System {{dslReference}}',
    userMessageTemplate: 'User {{expression}}',
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    responseSchema: '{"type":"object"}',
    maxTokens: 800,
    updatedAt: '2026-05-11T00:00:00.000Z',
    updatedBy: 'tester',
    ...overrides,
  };
}

function createConfig(overrides: Partial<AIRuntimeConfig> = {}): AIRuntimeConfig {
  return {
    mode: 'aws',
    promptRegistryTable: 'integrations-keyra-promptregistry',
    promptRegistryLocalDir: undefined,
    promptRegistryActivePointerEnv: undefined,
    dslAssetBucket: 'integrations-keyra',
    dslAssetKey: 'prompt-assets/dsl/keyra-dsl-reference.md',
    dslAssetLocalPath: undefined,
    githubModelsEndpoint: 'https://models.inference.ai.azure.com',
    githubToken: undefined,
    ...overrides,
  };
}

describe('DynamoPromptRegistryAdapter', () => {
  it('queries DynamoDB and returns deterministic latest prompt selection (AE-01)', async () => {
    const record = createPromptRecord();
    const send = vi.fn().mockResolvedValue({
      Items: [record],
    });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', {
      send,
    });

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result).toMatchObject(record);
    expect(result?.selectionSource).toBe('latest-active');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('prefers latest active prompt when active records exist', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [
          createPromptRecord({ version: 4, status: 'active' }),
          createPromptRecord({ version: 3, status: 'active' }),
        ],
      });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', {
      send,
    });

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result?.version).toBe(4);
    expect(result?.status).toBe('active');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('falls back to latest version query when no active prompt is found', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [],
      })
      .mockResolvedValueOnce({
        Items: [createPromptRecord({ version: 5, status: 'inactive' })],
      });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', {
      send,
    });

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result?.version).toBe(5);
    expect(result?.status).toBe('inactive');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uses environment active-pointer override when configured (AE-03)', async () => {
    const send = vi
      .fn()
      // pointer lookup
      .mockResolvedValueOnce({
        Items: [
          {
            promptId: 'explain-rule',
            recordType: 'active-pointer',
            environment: 'prod',
            activeVersion: 4,
          },
        ],
      })
      // version lookup
      .mockResolvedValueOnce({
        Items: [createPromptRecord({ version: 4, status: 'inactive' })],
      });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', 'prod', {
      send,
    });

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result?.version).toBe(4);
    expect(result?.selectionSource).toBe('active-pointer');
    expect(result?.selectionEnvironment).toBe('prod');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('fails deterministically when active-pointer target version is missing (AE-03)', async () => {
    const send = vi
      .fn()
      // pointer lookup
      .mockResolvedValueOnce({
        Items: [
          {
            promptId: 'explain-rule',
            recordType: 'active-pointer',
            environment: 'prod',
            activeVersion: 99,
          },
        ],
      })
      // version lookup misses
      .mockResolvedValueOnce({
        Items: [],
      });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', 'prod', {
      send,
    });

    await expect(adapter.getLatestPrompt('explain-rule')).rejects.toThrow(
      "Failed to query PromptRegistry for promptId 'explain-rule': Active pointer selected missing prompt version 99 for promptId 'explain-rule' in environment 'prod'",
    );
  });

  it('returns cached prompt without additional query on cache hit', async () => {
    const record = createPromptRecord();
    const send = vi.fn().mockResolvedValue({
      Items: [record],
    });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', {
      send,
    });

    const first = await adapter.getLatestPrompt('explain-rule');
    const second = await adapter.getLatestPrompt('explain-rule');

    expect(first).toMatchObject(record);
    expect(second).toMatchObject(record);
    expect(first?.selectionSource).toBe('latest-active');
    expect(second?.selectionSource).toBe('latest-active');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refreshes cache after TTL expiry and updates selected prompt version (AE-07)', async () => {
    vi.useFakeTimers();
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [createPromptRecord({ version: 1 })],
      })
      .mockResolvedValueOnce({
        Items: [createPromptRecord({ version: 2 })],
      });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', {
      send,
    });

    const first = await adapter.getLatestPrompt('explain-rule');
    vi.advanceTimersByTime(300_001);
    const second = await adapter.getLatestPrompt('explain-rule');

    expect(first?.version).toBe(1);
    expect(second?.version).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('returns null when prompt does not exist and caches null', async () => {
    const send = vi.fn().mockResolvedValue({
      Items: [],
    });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', {
      send,
    });

    const first = await adapter.getLatestPrompt('missing-prompt');
    const second = await adapter.getLatestPrompt('missing-prompt');

    expect(first).toBeNull();
    expect(second).toBeNull();
    // first call performs active query + latest fallback query; second call is cached
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('propagates DynamoDB errors with contextual message', async () => {
    const send = vi.fn().mockRejectedValue(new Error('Dynamo unavailable'));
    const adapter = new DynamoPromptRegistryAdapter('prompt-table', {
      send,
    });

    await expect(adapter.getLatestPrompt('explain-rule')).rejects.toThrow(
      "Failed to query PromptRegistry for promptId 'explain-rule': Dynamo unavailable",
    );
  });
});

describe('LocalPromptRegistryAdapter', () => {
  it('reads prompt from local json file path', async () => {
    const record = createPromptRecord();
    const readPromptFile = vi.fn().mockResolvedValue(JSON.stringify(record));
    const adapter = new LocalPromptRegistryAdapter('/tmp/prompts', readPromptFile);

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result).toMatchObject(record);
    expect(result?.selectionSource).toBe('latest-version');
    expect(readPromptFile).toHaveBeenCalledWith('/tmp/prompts/explain-rule.json');
    expect(readPromptFile).toHaveBeenCalledTimes(1);
  });

  it('selects latest active record when local prompt file contains an array', async () => {
    const readPromptFile = vi.fn().mockResolvedValue(
      JSON.stringify([
        createPromptRecord({ version: 1, status: 'inactive' }),
        createPromptRecord({ version: 2, status: 'active' }),
        createPromptRecord({ version: 3, status: 'active' }),
      ]),
    );
    const adapter = new LocalPromptRegistryAdapter('/tmp/prompts', readPromptFile);

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result?.version).toBe(3);
    expect(result?.status).toBe('active');
  });

  it('uses environment active-pointer override from local array payload', async () => {
    const readPromptFile = vi.fn().mockResolvedValue(
      JSON.stringify([
        createPromptRecord({ version: 3, status: 'active' }),
        createPromptRecord({ version: 4, status: 'inactive' }),
        {
          promptId: 'explain-rule',
          recordType: 'active-pointer',
          environment: 'prod',
          activeVersion: 4,
        },
      ]),
    );

    const adapter = new LocalPromptRegistryAdapter('/tmp/prompts', 'prod', readPromptFile);

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result?.version).toBe(4);
    expect(result?.selectionSource).toBe('active-pointer');
    expect(result?.selectionEnvironment).toBe('prod');
  });

  it('fails deterministically for invalid local active-pointer config', async () => {
    const readPromptFile = vi.fn().mockResolvedValue(
      JSON.stringify([
        createPromptRecord({ version: 2, status: 'active' }),
        {
          promptId: 'explain-rule',
          recordType: 'active-pointer',
          environment: 'prod',
          activeVersion: 0,
        },
      ]),
    );

    const adapter = new LocalPromptRegistryAdapter('/tmp/prompts', 'prod', readPromptFile);

    await expect(adapter.getLatestPrompt('explain-rule')).rejects.toThrow(
      "Failed to read local prompt file '/tmp/prompts/explain-rule.json': Active pointer record has invalid activeVersion for promptId 'explain-rule' in environment 'prod'",
    );
  });

  it('falls back to latest record when local array has no active record', async () => {
    const readPromptFile = vi.fn().mockResolvedValue(
      JSON.stringify([
        createPromptRecord({ version: 2, status: 'inactive' }),
        createPromptRecord({ version: 4, status: 'deprecated' }),
      ]),
    );
    const adapter = new LocalPromptRegistryAdapter('/tmp/prompts', readPromptFile);

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result?.version).toBe(4);
    expect(result?.status).toBe('deprecated');
  });

  it('returns null for missing local file and caches null', async () => {
    const enoent = Object.assign(new Error('not found'), {
      code: 'ENOENT',
    });
    const readPromptFile = vi.fn().mockRejectedValue(enoent);
    const adapter = new LocalPromptRegistryAdapter('/tmp/prompts', readPromptFile);

    const first = await adapter.getLatestPrompt('missing');
    const second = await adapter.getLatestPrompt('missing');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(readPromptFile).toHaveBeenCalledTimes(1);
  });

  it('returns cached local prompt on repeated reads within TTL', async () => {
    const record = createPromptRecord({ version: 9 });
    const readPromptFile = vi.fn().mockResolvedValue(JSON.stringify(record));
    const adapter = new LocalPromptRegistryAdapter('/tmp/prompts', readPromptFile);

    const first = await adapter.getLatestPrompt('explain-rule');
    const second = await adapter.getLatestPrompt('explain-rule');

    expect(first?.version).toBe(9);
    expect(second?.version).toBe(9);
    expect(readPromptFile).toHaveBeenCalledTimes(1);
  });
});

describe('createPromptRegistryAdapter', () => {
  it('returns LocalPromptRegistryAdapter in local mode with local dir', () => {
    const adapter = createPromptRegistryAdapter(
      createConfig({
        mode: 'local',
        promptRegistryLocalDir: './test-prompts',
      }),
    );

    expect(adapter).toBeInstanceOf(LocalPromptRegistryAdapter);
  });

  it('returns DynamoPromptRegistryAdapter in aws mode', () => {
    const adapter = createPromptRegistryAdapter(
      createConfig({
        mode: 'aws',
      }),
    );

    expect(adapter).toBeInstanceOf(DynamoPromptRegistryAdapter);
  });

  it('returns DynamoPromptRegistryAdapter in local mode without local dir', () => {
    const adapter = createPromptRegistryAdapter(
      createConfig({
        mode: 'local',
        promptRegistryLocalDir: undefined,
      }),
    );

    expect(adapter).toBeInstanceOf(DynamoPromptRegistryAdapter);
  });
});
