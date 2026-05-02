import { describe, expect, it } from 'vitest';

import { detectSchemaFormat } from '../detect-schema-format';

describe('detectSchemaFormat', () => {
  it('detects JSON Schema via $schema marker', () => {
    const raw = '{"$schema":"http://json-schema.org/draft-07/schema#","title":"Order"}';
    const result = detectSchemaFormat(raw);

    expect(result.format).toBe('json-schema');
    expect(result.confidence).toBe('high');
    expect(result.parsedContent).toEqual({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Order',
    });
  });

  it('detects JSON Schema via properties + type marker', () => {
    const raw = '{"type":"object","properties":{"x":{"type":"string"}}}';
    const result = detectSchemaFormat(raw);

    expect(result.format).toBe('json-schema');
    expect(result.confidence).toBe('high');
  });

  it('classifies valid JSON without schema markers as sample-json', () => {
    const raw = '{"name":"Alice","age":30}';
    const result = detectSchemaFormat(raw, 'sample.json');

    expect(result.format).toBe('sample-json');
    expect(result.confidence).toBe('medium');
    expect(result.parsedContent).toEqual({ name: 'Alice', age: 30 });
  });

  it('detects XSD via schema root marker', () => {
    const raw = '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"></xs:schema>';
    const result = detectSchemaFormat(raw);

    expect(result.format).toBe('xsd');
    expect(result.confidence).toBe('high');
    expect(result.parsedContent).toBe(raw);
  });

  it('classifies non-schema XML as sample-xml', () => {
    const raw = '<?xml version="1.0"?><root><name>Alice</name></root>';
    const result = detectSchemaFormat(raw);

    expect(result.format).toBe('sample-xml');
    expect(result.confidence).toBe('low');
  });

  it('returns unknown for empty content', () => {
    const result = detectSchemaFormat('   ');

    expect(result.format).toBe('unknown');
    expect(result.confidence).toBe('low');
  });

  it('returns unknown for invalid JSON non-XML text', () => {
    const raw = '{ invalid';
    const result = detectSchemaFormat(raw);

    expect(result.format).toBe('unknown');
    expect(result.confidence).toBe('low');
    expect(result.parsedContent).toBe(raw);
  });

  it('uses .xsd extension as an XSD hint for XML-like content', () => {
    const raw = '<schema></schema>';
    const result = detectSchemaFormat(raw, 'customer.xsd');

    expect(result.format).toBe('xsd');
    expect(result.confidence).toBe('medium');
  });
});
