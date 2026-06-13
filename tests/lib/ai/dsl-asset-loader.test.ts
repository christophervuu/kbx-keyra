import { describe, expect, it, vi } from 'vitest';

import type { AIRuntimeConfig } from '../../../src/lib/ai/config.js';
import { createDslAssetLoader, LocalDslAssetLoader, S3DslAssetLoader } from '../../../src/lib/ai/index.js';

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

describe('S3DslAssetLoader', () => {
  it('loads DSL reference content from S3', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue('# KeyRa DSL Reference'),
      },
    });

    const loader = new S3DslAssetLoader('integrations-keyra', 'prompt-assets/dsl/keyra-dsl-reference.md', {
      send,
    });

    const result = await loader.loadDslReference();

    expect(result).toBe('# KeyRa DSL Reference');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns cached content without calling S3 again within TTL', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: {
        transformToString: vi.fn().mockResolvedValue('dsl-content-v1'),
      },
    });

    const loader = new S3DslAssetLoader('integrations-keyra', 'prompt-assets/dsl/keyra-dsl-reference.md', {
      send,
    });

    const first = await loader.loadDslReference();
    const second = await loader.loadDslReference();

    expect(first).toBe('dsl-content-v1');
    expect(second).toBe('dsl-content-v1');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('refreshes S3 content after cache expiry', async () => {
    vi.useFakeTimers();
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Body: {
          transformToString: vi.fn().mockResolvedValue('dsl-content-v1'),
        },
      })
      .mockResolvedValueOnce({
        Body: {
          transformToString: vi.fn().mockResolvedValue('dsl-content-v2'),
        },
      });

    const loader = new S3DslAssetLoader('integrations-keyra', 'prompt-assets/dsl/keyra-dsl-reference.md', {
      send,
    });

    const first = await loader.loadDslReference();
    vi.advanceTimersByTime(300_001);
    const second = await loader.loadDslReference();

    expect(first).toBe('dsl-content-v1');
    expect(second).toBe('dsl-content-v2');
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('throws asset-not-found message for S3 NoSuchKey', async () => {
    const send = vi.fn().mockRejectedValue(
      Object.assign(new Error('No such key'), {
        name: 'NoSuchKey',
      }),
    );

    const loader = new S3DslAssetLoader('integrations-keyra', 'missing.md', {
      send,
    });

    await expect(loader.loadDslReference()).rejects.toThrow('DSL asset not found in S3: s3://integrations-keyra/missing.md');
  });

  it('throws contextual message for general S3 errors', async () => {
    const send = vi.fn().mockRejectedValue(new Error('socket hang up'));

    const loader = new S3DslAssetLoader('integrations-keyra', 'prompt-assets/dsl/keyra-dsl-reference.md', {
      send,
    });

    await expect(loader.loadDslReference()).rejects.toThrow(
      'Failed to load DSL asset from S3 (s3://integrations-keyra/prompt-assets/dsl/keyra-dsl-reference.md): socket hang up',
    );
  });
});

describe('LocalDslAssetLoader', () => {
  it('reads DSL reference from local file path', async () => {
    const readDslFile = vi.fn().mockResolvedValue('# Local DSL Reference');
    const loader = new LocalDslAssetLoader('./test-assets/dsl-reference.md', readDslFile);

    const result = await loader.loadDslReference();

    expect(result).toBe('# Local DSL Reference');
    expect(readDslFile).toHaveBeenCalledWith('./test-assets/dsl-reference.md');
    expect(readDslFile).toHaveBeenCalledTimes(1);
  });

  it('returns cached local content without re-reading file within TTL', async () => {
    const readDslFile = vi.fn().mockResolvedValue('dsl-local-v1');
    const loader = new LocalDslAssetLoader('./test-assets/dsl-reference.md', readDslFile);

    const first = await loader.loadDslReference();
    const second = await loader.loadDslReference();

    expect(first).toBe('dsl-local-v1');
    expect(second).toBe('dsl-local-v1');
    expect(readDslFile).toHaveBeenCalledTimes(1);
  });

  it('throws meaningful error when local file is missing', async () => {
    const enoent = Object.assign(new Error('not found'), {
      code: 'ENOENT',
    });
    const readDslFile = vi.fn().mockRejectedValue(enoent);
    const loader = new LocalDslAssetLoader('./missing-dsl.md', readDslFile);

    await expect(loader.loadDslReference()).rejects.toThrow('Local DSL asset not found at path: ./missing-dsl.md');
  });
});

describe('createDslAssetLoader', () => {
  it('returns LocalDslAssetLoader in local mode when path is set', () => {
    const loader = createDslAssetLoader(
      createConfig({
        mode: 'local',
        dslAssetLocalPath: './test-assets/dsl-reference.md',
      }),
    );

    expect(loader).toBeInstanceOf(LocalDslAssetLoader);
  });

  it('returns S3DslAssetLoader in aws mode', () => {
    const loader = createDslAssetLoader(
      createConfig({
        mode: 'aws',
      }),
    );

    expect(loader).toBeInstanceOf(S3DslAssetLoader);
  });

  it('returns S3DslAssetLoader in local mode when no local path is set', () => {
    const loader = createDslAssetLoader(
      createConfig({
        mode: 'local',
        dslAssetLocalPath: undefined,
      }),
    );

    expect(loader).toBeInstanceOf(S3DslAssetLoader);
  });
});
