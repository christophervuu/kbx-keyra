import { describe, expect, it } from 'vitest';

import {
  extractRelativeRefs,
  isAllowedDependencyPath,
  normalizeDependencyPath,
  resolveDependencies,
} from '../../../../src/lib/schema/cdm/index.js';
import type { FileFetcher } from '../../../../src/lib/schema/cdm/index.js';

// ---------------------------------------------------------------------------
// normalizeDependencyPath
// ---------------------------------------------------------------------------

describe('normalizeDependencyPath', () => {
  it('resolves a same-directory ref (./)', () => {
    expect(
      normalizeDependencyPath('JSONSchemas-bundled/CommonDataModels/Payment', './CommonTypes.json'),
    ).toBe('JSONSchemas-bundled/CommonDataModels/Payment/CommonTypes.json');
  });

  it('resolves a parent-directory ref (../)', () => {
    expect(
      normalizeDependencyPath(
        'JSONSchemas-bundled/CommonDataModels/Payment',
        '../../Definitions/Common/PaymentTypes.json',
      ),
    ).toBe('JSONSchemas-bundled/Definitions/Common/PaymentTypes.json');
  });

  it('caps traversal at repo root (does not escape)', () => {
    expect(
      normalizeDependencyPath('JSONSchemas-bundled/CommonDataModels', '../../../../escape.txt'),
    ).toBe('escape.txt');
  });

  it('handles empty base directory', () => {
    expect(normalizeDependencyPath('', './foo.json')).toBe('foo.json');
  });

  it('resolves multi-level parent traversal', () => {
    expect(
      normalizeDependencyPath(
        'JSONSchemas-bundled/CommonDataModels/Payment/V2',
        '../../../Definitions/Base.json',
      ),
    ).toBe('JSONSchemas-bundled/Definitions/Base.json');
  });
});

// ---------------------------------------------------------------------------
// isAllowedDependencyPath
// ---------------------------------------------------------------------------

describe('isAllowedDependencyPath', () => {
  it('allows paths within CoreSchemas', () => {
    expect(isAllowedDependencyPath('JSONSchemas-bundled/CoreSchemas')).toBe(true);
    expect(isAllowedDependencyPath('JSONSchemas-bundled/CoreSchemas/SomeType.json')).toBe(true);
    expect(isAllowedDependencyPath('JSONSchemas-bundled/CoreSchemas/Sub/Foo.json')).toBe(true);
  });

  it('allows paths within Definitions', () => {
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Definitions')).toBe(true);
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Definitions/Common/Types.json')).toBe(true);
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Definitions/Custom/Foo.json')).toBe(true);
  });

  it('allows paths within Events', () => {
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Events')).toBe(true);
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Events/OrderPlaced.json')).toBe(true);
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Events/Payment/Authorized.json')).toBe(true);
  });

  it('rejects paths within Sample Payloads', () => {
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Sample Payloads')).toBe(false);
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Sample Payloads/Payment.json')).toBe(false);
  });

  it('rejects paths within CommonDataModels (not in allowlist)', () => {
    expect(isAllowedDependencyPath('JSONSchemas-bundled/CommonDataModels')).toBe(false);
    expect(isAllowedDependencyPath('JSONSchemas-bundled/CommonDataModels/Payment/Payment.json')).toBe(false);
  });

  it('rejects arbitrary paths outside all known roots', () => {
    expect(isAllowedDependencyPath('some/other/path.json')).toBe(false);
    expect(isAllowedDependencyPath('')).toBe(false);
  });

  it('rejects paths that would be under Sample Payloads even if also under an allowed root', () => {
    // Strict prefix match — Sample Payloads is checked first
    expect(isAllowedDependencyPath('JSONSchemas-bundled/Sample Payloads/CoreSchemas/Foo.json')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractRelativeRefs
// ---------------------------------------------------------------------------

describe('extractRelativeRefs', () => {
  it('extracts ./ and ../ refs from a schema', () => {
    const content = JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        foo: { $ref: '../Definitions/Common/Foo.json' },
        bar: { $ref: './Bar.json' },
      },
    });

    const refs = extractRelativeRefs(content);
    expect(refs).toContain('../Definitions/Common/Foo.json');
    expect(refs).toContain('./Bar.json');
    expect(refs).toHaveLength(2);
  });

  it('ignores local $ref (starts with #/)', () => {
    const content = JSON.stringify({
      definitions: {
        Foo: { type: 'string' },
      },
      properties: {
        foo: { $ref: '#/definitions/Foo' },
      },
    });

    const refs = extractRelativeRefs(content);
    expect(refs).toHaveLength(0);
  });

  it('ignores absolute URL refs', () => {
    const content = JSON.stringify({
      properties: {
        foo: { $ref: 'https://example.com/schemas/Foo.json' },
      },
    });

    const refs = extractRelativeRefs(content);
    expect(refs).toHaveLength(0);
  });

  it('handles nested $ref inside items', () => {
    const content = JSON.stringify({
      type: 'array',
      items: { $ref: '../Definitions/Common/Item.json' },
    });

    const refs = extractRelativeRefs(content);
    expect(refs).toEqual(['../Definitions/Common/Item.json']);
  });

  it('handles $ref inside allOf/anyOf/oneOf', () => {
    const content = JSON.stringify({
      allOf: [
        { $ref: '../CoreSchemas/Base.json' },
      ],
      anyOf: [
        { $ref: './OptionA.json' },
        { $ref: './OptionB.json' },
      ],
    });

    const refs = extractRelativeRefs(content);
    expect(refs).toContain('../CoreSchemas/Base.json');
    expect(refs).toContain('./OptionA.json');
    expect(refs).toContain('./OptionB.json');
    expect(refs).toHaveLength(3);
  });

  it('deduplicates repeated $ref values', () => {
    const content = JSON.stringify({
      properties: {
        a: { $ref: './Common.json' },
        b: { $ref: './Common.json' },
      },
    });

    const refs = extractRelativeRefs(content);
    expect(refs).toEqual(['./Common.json']);
  });

  it('returns empty array for invalid JSON', () => {
    const refs = extractRelativeRefs('not valid json');
    expect(refs).toEqual([]);
  });

  it('returns empty array for schema with no $ref', () => {
    const content = JSON.stringify({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
    const refs = extractRelativeRefs(content);
    expect(refs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveDependencies — mock-based integration tests
// ---------------------------------------------------------------------------

describe('resolveDependencies', () => {
  /** Factory for a FileFetcher that resolves known paths. */
  function mockFetcher(
    files: Record<string, { content: string; sha: string }>,
  ): FileFetcher {
    return async (path: string) => {
      const entry = files[path];
      if (!entry) return 'not-found';
      return entry;
    };
  }

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('resolves a single dependency into CoreSchemas', async () => {
    const rootContent = JSON.stringify({
      properties: {
        base: { $ref: '../../CoreSchemas/Base.json' },
      },
    });

    const fetcher = mockFetcher({
      'JSONSchemas-bundled/CoreSchemas/Base.json': {
        content: JSON.stringify({ type: 'object', properties: { id: { type: 'string' } } }),
        sha: 'abc111',
      },
    });

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Payment/Payment.json',
      rootContent,
      'main',
      fetcher,
    );

    expect(result.errors).toHaveLength(0);
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0]!.path).toBe('JSONSchemas-bundled/CoreSchemas/Base.json');
    expect(result.dependencies[0]!.sha).toBe('abc111');
  });

  it('resolves transitive dependencies', async () => {
    const rootContent = JSON.stringify({
      properties: {
        base: { $ref: '../../Definitions/Common/Base.json' },
      },
    });

    const fetcher = mockFetcher({
      'JSONSchemas-bundled/Definitions/Common/Base.json': {
        content: JSON.stringify({
          properties: {
            shared: { $ref: './SharedType.json' },
          },
        }),
        sha: 'aaa',
      },
      'JSONSchemas-bundled/Definitions/Common/SharedType.json': {
        content: JSON.stringify({ type: 'string' }),
        sha: 'bbb',
      },
    });

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Order/Order.json',
      rootContent,
      'main',
      fetcher,
    );

    expect(result.errors).toHaveLength(0);
    expect(result.dependencies).toHaveLength(2);

    const paths = result.dependencies.map((d) => d.path);
    expect(paths).toContain('JSONSchemas-bundled/Definitions/Common/Base.json');
    expect(paths).toContain('JSONSchemas-bundled/Definitions/Common/SharedType.json');
  });

  it('deduplicates shared dependencies', async () => {
    const rootContent = JSON.stringify({
      properties: {
        a: { $ref: './A.json' },
        b: { $ref: './A.json' }, // same dep, referenced twice
      },
    });

    const fetcher = mockFetcher({
      'JSONSchemas-bundled/Events/A.json': {
        content: JSON.stringify({ type: 'string' }),
        sha: 'aaa',
      },
    });

    const result = await resolveDependencies(
      // The root path's base is JSONSchemas/Events for this test
      'JSONSchemas-bundled/Events/Root.json',
      rootContent,
      'main',
      fetcher,
    );

    expect(result.errors).toHaveLength(0);
    expect(result.dependencies).toHaveLength(1); // deduplicated
  });

  // -----------------------------------------------------------------------
  // Path guarding
  // -----------------------------------------------------------------------

  it('fails with DISALLOWED_PATH when ref resolves outside allowlist', async () => {
    // The ref resolves to a path outside CoreSchemas/Definitions/Events
    const rootContent = JSON.stringify({
      properties: {
        bad: { $ref: '../Sample Payloads/test.json' },
      },
    });

    const fetcher = mockFetcher({});

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Payment/Payment.json',
      rootContent,
      'main',
      fetcher,
    );

    expect(result.dependencies).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('DISALLOWED_PATH');
    expect(result.errors[0]!.resolvedPath).toContain('Sample Payloads');
  });

  it('rejects refs into CommonDataModels itself', async () => {
    const rootContent = JSON.stringify({
      properties: {
        x: { $ref: './AnotherFile.json' },
      },
    });

    const fetcher = mockFetcher({});

    const result = await resolveDependencies(
      // Base: JSONSchemas/CommonDataModels/Order
      'JSONSchemas-bundled/CommonDataModels/Order/Order.json',
      rootContent,
      'main',
      fetcher,
    );

    // ./AnotherFile.json resolves to JSONSchemas-bundled/CommonDataModels/Order/AnotherFile.json
    // which is NOT in the allowlist (only CoreSchemas/Definitions/Events allowed)
    expect(result.dependencies).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('DISALLOWED_PATH');
  });

  // -----------------------------------------------------------------------
  // File-not-found
  // -----------------------------------------------------------------------

  it('fails with UNRESOLVED_REF when file does not exist', async () => {
    const rootContent = JSON.stringify({
      properties: {
        missing: { $ref: '../../CoreSchemas/Missing.json' },
      },
    });

    const fetcher = mockFetcher({}); // nothing available

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Payment/Payment.json',
      rootContent,
      'main',
      fetcher,
    );

    expect(result.dependencies).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.code).toBe('UNRESOLVED_REF');
    expect(result.errors[0]!.resolvedPath).toBe('JSONSchemas-bundled/CoreSchemas/Missing.json');
  });

  // -----------------------------------------------------------------------
  // Cycles
  // -----------------------------------------------------------------------

  it('detects a direct cycle (A -> B -> A) with CYCLE_DETECTED error', async () => {
    const rootContent = JSON.stringify({
      properties: { next: { $ref: '../../Definitions/Common/A.json' } },
    });

    const fetcher = mockFetcher({
      'JSONSchemas-bundled/Definitions/Common/A.json': {
        content: JSON.stringify({
          properties: { prev: { $ref: './B.json' } },
        }),
        sha: 'a',
      },
      'JSONSchemas-bundled/Definitions/Common/B.json': {
        content: JSON.stringify({
          properties: { back: { $ref: './A.json' } }, // cycle back to A
        }),
        sha: 'b',
      },
    });

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Test/Test.json',
      rootContent,
      'main',
      fetcher,
    );

    // Both files resolve (content is processed before the back-edge is detected),
    // but a CYCLE_DETECTED error is also emitted.
    expect(result.dependencies.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  it('detects a self-cycle (file refs itself) with CYCLE_DETECTED error', async () => {
    const rootContent = JSON.stringify({
      properties: { self: { $ref: '../../Definitions/Common/Self.json' } },
    });

    const fetcher = mockFetcher({
      'JSONSchemas-bundled/Definitions/Common/Self.json': {
        content: JSON.stringify({
          properties: { again: { $ref: './Self.json' } }, // self-ref
        }),
        sha: 's',
      },
    });

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Test/Test.json',
      rootContent,
      'main',
      fetcher,
    );

    expect(result.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Depth guard
  // -----------------------------------------------------------------------

  it('enforces maxDepth', async () => {
    // Chain: root -> dep1 -> dep2 -> dep3 -> dep4 -> ...
    // Deps stay within an allowed directory using same-directory refs (./).
    const deps: Record<string, { content: string; sha: string }> = {};
    for (let i = 1; i <= 15; i++) {
      const nextRef = i < 15 ? `./dep${i + 1}.json` : undefined;
      const contentObj: Record<string, unknown> = {
        type: 'object',
      };
      if (nextRef) {
        contentObj.properties = { next: { $ref: nextRef } };
      }
      deps[`JSONSchemas-bundled/CoreSchemas/dep${i}.json`] = {
        content: JSON.stringify(contentObj),
        sha: `sha${i}`,
      };
    }

    const fetcher = mockFetcher(deps);

    const rootContent = JSON.stringify({
      properties: { start: { $ref: '../../CoreSchemas/dep1.json' } },
    });

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Test/Test.json',
      rootContent,
      'main',
      fetcher,
      { maxDepth: 5 },
    );

    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => e.code === 'DEPTH_EXCEEDED')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Max-dependencies guard
  // -----------------------------------------------------------------------

  it('enforces maxDependencies', async () => {
    // Many sibling deps that would exceed limit
    const rootObj: Record<string, unknown> = { type: 'object', properties: {} };
    const deps: Record<string, { content: string; sha: string }> = {};

    for (let i = 1; i <= 3; i++) {
      const ref = `../../Definitions/dep${i}.json`;
      (rootObj.properties as Record<string, unknown>)[`prop${i}`] = { $ref: ref };
      deps[`JSONSchemas-bundled/Definitions/dep${i}.json`] = {
        content: JSON.stringify({ type: 'string' }),
        sha: `sha${i}`,
      };
    }

    const fetcher = mockFetcher(deps);

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Test/Test.json',
      JSON.stringify(rootObj),
      'main',
      fetcher,
      { maxDependencies: 2 },
    );

    // Should resolve at most 2 dependencies before hitting the limit
    expect(result.dependencies.length).toBeLessThanOrEqual(2);
    // Should have at least one MAX_DEPENDENCIES_EXCEEDED error if we have more refs than limit
    expect(result.errors.some((e) => e.code === 'MAX_DEPENDENCIES_EXCEEDED')).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Empty / edge cases
  // -----------------------------------------------------------------------

  it('returns empty result for a schema with no relative $ref', async () => {
    const rootContent = JSON.stringify({
      type: 'object',
      properties: { x: { type: 'string' } },
    });

    const fetcher = mockFetcher({});

    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Test/Test.json',
      rootContent,
      'main',
      fetcher,
    );

    expect(result.dependencies).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles schema at repo root', async () => {
    const rootContent = JSON.stringify({
      properties: { dep: { $ref: 'CoreSchemas/Foo.json' } },
    });

    const fetcher = mockFetcher({});
    // CoreSchemas/Foo.json without leading JSONSchemas/ is not in allowlist
    // (it must be JSONSchemas/CoreSchemas/... per allowlist)

    const result = await resolveDependencies(
      'RootSchema.json',
      rootContent,
      'main',
      fetcher,
    );

    expect(result.dependencies).toHaveLength(0);
  });

  it('returns errors when root content is not parseable JSON', async () => {
    const result = await resolveDependencies(
      'JSONSchemas-bundled/CommonDataModels/Test/Test.json',
      'not json',
      'main',
      mockFetcher({}),
    );

    // extractRelativeRefs returns [] for invalid JSON, so no resolution happens
    expect(result.dependencies).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
