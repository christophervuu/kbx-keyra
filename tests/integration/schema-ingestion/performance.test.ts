import { describe, expect, it } from 'vitest';

import { parseJsonSchema } from '../../../src/lib/schema/parser/parse-json-schema.js';
import { generateJsonSchemaString } from './fixtures/generate-schema.js';

function measureMs(fn: () => void): number {
  const start = Date.now();
  fn();
  return Date.now() - start;
}

describe('schema ingestion integration - performance benchmarks', () => {
  it('500-field parse time is below 1 second', () => {
    const content = generateJsonSchemaString(500);

    const elapsedMs = measureMs(() => {
      const result = parseJsonSchema(content, 'schema-500');
      expect(result.fieldCount).toBe(500);
    });

    expect(elapsedMs).toBeLessThan(1_000);
  });

  it('23,000-field parse time is below 10 seconds', () => {
    const content = generateJsonSchemaString(23_000);

    const elapsedMs = measureMs(() => {
      const result = parseJsonSchema(content, 'schema-23000');
      expect(result.fieldCount).toBe(23_000);
    });

    expect(elapsedMs).toBeLessThan(10_000);
  }, 30_000);

  it('query result mapping overhead is below 50ms for 100 hits', () => {
    const hits = Array.from({ length: 100 }, (_, index) => ({
      path: `Order.Field${index + 1}`,
      fieldName: `Field${index + 1}`,
      type: index % 2 === 0 ? 'string' : 'number',
      depth: index % 5,
      isArray: index % 7 === 0,
      embeddingText: `Order.Field${index + 1} | Field${index + 1} (string)`,
      score: Math.random() * 10,
    }));

    const elapsedMs = measureMs(() => {
      const mapped = hits.map((hit) => ({
        path: hit.path,
        fieldName: hit.fieldName,
        type: hit.type,
        depth: hit.depth,
        isArray: hit.isArray,
        score: hit.score,
        embeddingText: hit.embeddingText,
      }));

      expect(mapped).toHaveLength(100);
    });

    expect(elapsedMs).toBeLessThan(50);
  });

  it('dynamo-style 500-node chunking logic is below 100ms excluding I/O', () => {
    const nodes = Array.from({ length: 500 }, (_, index) => ({
      schemaId: 'schema-1',
      path: `Order.Field${index + 1}`,
    }));

    const elapsedMs = measureMs(() => {
      const batches: Array<typeof nodes> = [];
      for (let index = 0; index < nodes.length; index += 25) {
        batches.push(nodes.slice(index, index + 25));
      }

      expect(batches).toHaveLength(20);
      expect(batches[0]).toHaveLength(25);
      expect(batches[19]).toHaveLength(25);
    });

    expect(elapsedMs).toBeLessThan(100);
  });
});
