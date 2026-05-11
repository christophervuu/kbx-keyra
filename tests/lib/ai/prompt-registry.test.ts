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
    dslAssetBucket: 'integrations-keyra',
    dslAssetKey: 'prompt-assets/dsl/keyra-dsl-reference.md',
    dslAssetLocalPath: undefined,
    githubModelsEndpoint: 'https://models.inference.ai.azure.com',
    githubToken: undefined,
    ...overrides,
  };
}

describe('DynamoPromptRegistryAdapter', () => {
  it('queries DynamoDB and returns highest-version prompt', async () => {
    const record = createPromptRecord();
    const send = vi.fn().mockResolvedValue({
      Items: [record],
    });

    const adapter = new DynamoPromptRegistryAdapter('prompt-table', {
      send,
    });

    const result = await adapter.getLatestPrompt('explain-rule');

    expect(result).toEqual(record);
    expect(send).toHaveBeenCalledTimes(1);
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

    expect(first).toEqual(record);
    expect(second).toEqual(record);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refreshes cache after TTL expiry', async () => {
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
    expect(send).toHaveBeenCalledTimes(1);
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

    expect(result).toEqual(record);
    expect(readPromptFile).toHaveBeenCalledWith('/tmp/prompts/explain-rule.json');
    expect(readPromptFile).toHaveBeenCalledTimes(1);
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
