import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useServerPreview } from './use-server-preview';

import { AdapterProvider } from '@/lib/api/adapter-provider';
import type { ApiAdapter } from '@/lib/api/types';
import type { ServerPreviewResult } from '@/lib/types';


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAPPING_ID = 'mapping-abc';

const MOCK_RESULT: ServerPreviewResult = {
  output: { field: 'value' },
  diagnostics: [],
  metadata: {
    environment: 'DEV',
    artifactId: 'artifact-dev-3',
    artifactHash: 'hash-dev-3',
    deployedAt: '2026-01-01T00:00:00Z',
    sourceType: 'version',
    sourceNumber: 3,
    engineVersion: '1.0.0',
  },
};

const SOURCE_DATA = { name: 'Alice' };

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function makeAdapter(
  previewOnServer: ApiAdapter['previewOnServer'],
): Partial<ApiAdapter> {
  return { previewOnServer };
}

function makeWrapper(adapter: Partial<ApiAdapter>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      AdapterProvider,
      { adapter: adapter as ApiAdapter },
      children,
    );
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useServerPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial idle state', () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(
      () => useServerPreview({ mappingId: MAPPING_ID, environment: 'DEV' }),
      { wrapper: makeWrapper(adapter) },
    );

    expect(result.current.result).toBeNull();
    expect(result.current.isExecuting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isAvailable).toBe(true);
  });

  it('stores result on successful execution', async () => {
    const adapter = makeAdapter(vi.fn().mockResolvedValue(MOCK_RESULT));
    const { result } = renderHook(
      () => useServerPreview({ mappingId: MAPPING_ID, environment: 'DEV' }),
      { wrapper: makeWrapper(adapter) },
    );

    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });

    expect(result.current.result).toEqual(MOCK_RESULT);
    expect(result.current.error).toBeNull();
    expect(result.current.isExecuting).toBe(false);
    expect(result.current.isAvailable).toBe(true);
  });

  it('sets timeout error when adapter takes longer than 10 seconds', async () => {
    const neverResolves = new Promise<ServerPreviewResult>(() => {/* intentionally never resolves */});
    const adapter = makeAdapter(vi.fn().mockReturnValue(neverResolves));

    const { result } = renderHook(
      () => useServerPreview({ mappingId: MAPPING_ID, environment: 'PREPROD' }),
      { wrapper: makeWrapper(adapter) },
    );

    let executePromise: Promise<void>;
    act(() => {
      executePromise = result.current.execute(SOURCE_DATA);
    });

    // Advance past the 10-second timeout
    await act(async () => {
      vi.advanceTimersByTime(10_001);
      await executePromise;
    });

    expect(result.current.error).toBe('Server preview timed out after 10 seconds');
    expect(result.current.result).toBeNull();
    expect(result.current.isExecuting).toBe(false);
  });

  it('sets isAvailable=false on "Not available in offline mode" error', async () => {
    const adapter = makeAdapter(
      vi.fn().mockRejectedValue(new Error('Not available in offline mode')),
    );
    const { result } = renderHook(
      () => useServerPreview({ mappingId: MAPPING_ID, environment: 'DEV' }),
      { wrapper: makeWrapper(adapter) },
    );

    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.error).toBe('Server preview is not available in offline mode');
    expect(result.current.result).toBeNull();
  });

  it('isAvailable remains false after subsequent calls (sticky)', async () => {
    const adapter = makeAdapter(
      vi.fn().mockRejectedValue(new Error('Not available in offline mode')),
    );
    const { result } = renderHook(
      () => useServerPreview({ mappingId: MAPPING_ID, environment: 'DEV' }),
      { wrapper: makeWrapper(adapter) },
    );

    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });
    expect(result.current.isAvailable).toBe(false);

    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });
    expect(result.current.isAvailable).toBe(false);
  });

  it('stores generic error message for non-offline adapter errors', async () => {
    const adapter = makeAdapter(
      vi.fn().mockRejectedValue(new Error('Internal server error')),
    );
    const { result } = renderHook(
      () => useServerPreview({ mappingId: MAPPING_ID, environment: 'PROD' }),
      { wrapper: makeWrapper(adapter) },
    );

    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });

    expect(result.current.error).toBe('Internal server error');
    expect(result.current.isAvailable).toBe(true); // not an offline error
    expect(result.current.result).toBeNull();
  });

  it('maps NOT_DEPLOYED backend error to deterministic guidance', async () => {
    const notDeployed = Object.assign(new Error('NOT_DEPLOYED: no active deployment found'), {
      code: 'NOT_DEPLOYED',
      statusCode: 404,
      retryable: false,
      details: {
        environment: 'PREPROD',
        finalStatus: 'failed',
      },
    });

    const adapter = makeAdapter(vi.fn().mockRejectedValue(notDeployed));
    const { result } = renderHook(
      () => useServerPreview({ mappingId: MAPPING_ID, environment: 'PREPROD' }),
      { wrapper: makeWrapper(adapter) },
    );

    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });

    expect(result.current.error).toBe(
      'No deployed artifact found in PREPROD. Deploy to PREPROD first, then run server preview.',
    );
    expect(result.current.isAvailable).toBe(true);
  });

  it('resets result and error between sequential calls', async () => {
    const mockFn = vi.fn()
      .mockResolvedValueOnce(MOCK_RESULT)
      .mockRejectedValueOnce(new Error('Something went wrong'));

    const adapter = makeAdapter(mockFn);
    const { result } = renderHook(
      () => useServerPreview({ mappingId: MAPPING_ID, environment: 'DEV' }),
      { wrapper: makeWrapper(adapter) },
    );

    // First call — success
    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });
    expect(result.current.result).toEqual(MOCK_RESULT);
    expect(result.current.error).toBeNull();

    // Second call — error; result should be cleared
    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('Something went wrong');
  });

  it('passes correct mappingId and environment to adapter', async () => {
    const previewFn = vi.fn().mockResolvedValue(MOCK_RESULT);
    const adapter = makeAdapter(previewFn);

    const { result } = renderHook(
      () => useServerPreview({ mappingId: 'my-mapping', environment: 'PROD' }),
      { wrapper: makeWrapper(adapter) },
    );

    await act(async () => {
      await result.current.execute(SOURCE_DATA);
    });

    expect(previewFn).toHaveBeenCalledWith('my-mapping', {
      environment: 'PROD',
      sourceData: SOURCE_DATA,
      externalSources: {},
    });
  });

  it('passes externalSources when provided', async () => {
    const previewFn = vi.fn().mockResolvedValue(MOCK_RESULT);
    const adapter = makeAdapter(previewFn);

    const { result } = renderHook(
      () => useServerPreview({ mappingId: 'my-mapping', environment: 'PROD' }),
      { wrapper: makeWrapper(adapter) },
    );

    await act(async () => {
      await result.current.execute(SOURCE_DATA, { customerProfile: { id: 'c-1' } });
    });

    expect(previewFn).toHaveBeenCalledWith('my-mapping', {
      environment: 'PROD',
      sourceData: SOURCE_DATA,
      externalSources: { customerProfile: { id: 'c-1' } },
    });
  });
});
