const JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'object',
  'array',
  'boolean',
  'null',
]);

export type DetectedFormat = 'json-schema' | 'xsd' | 'sample-json' | 'sample-xml' | 'unknown';

export interface FormatDetectionResult {
  readonly format: DetectedFormat;
  readonly parsedContent: unknown;
  readonly confidence: 'high' | 'medium' | 'low';
}

function hasJsonSchemaType(value: unknown): boolean {
  if (typeof value === 'string') {
    return JSON_SCHEMA_TYPES.has(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => typeof item === 'string' && JSON_SCHEMA_TYPES.has(item));
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasXsdExtension(fileName?: string): boolean {
  return fileName?.toLowerCase().endsWith('.xsd') ?? false;
}

function isXmlLike(content: string): boolean {
  const trimmed = content.trim();
  return /^<\?xml\b/i.test(trimmed) || /^<[^>]+>/.test(trimmed);
}

export function detectSchemaFormat(rawContent: string, fileName?: string): FormatDetectionResult {
  const content = rawContent.trim();

  if (content.length === 0) {
    return {
      format: 'unknown',
      parsedContent: rawContent,
      confidence: 'low',
    };
  }

  try {
    const parsed = JSON.parse(content) as unknown;

    if (isRecord(parsed)) {
      const hasSchemaMarker = '$schema' in parsed;
      const hasPropertiesMarker = 'properties' in parsed;
      const hasTypeMarker = hasJsonSchemaType(parsed.type);

      if (hasSchemaMarker || hasPropertiesMarker || hasTypeMarker) {
        return {
          format: 'json-schema',
          parsedContent: parsed,
          confidence: 'high',
        };
      }
    }

    return {
      format: 'sample-json',
      parsedContent: parsed,
      confidence: 'medium',
    };
  } catch {
    const hasExplicitXsdMarker =
      /<\s*(?:xs|xsd):schema\b/i.test(content) || /xmlns:(?:xs|xsd)\s*=\s*["'][^"']+["']/i.test(content);

    if (hasExplicitXsdMarker) {
      return {
        format: 'xsd',
        parsedContent: rawContent,
        confidence: 'high',
      };
    }

    if (isXmlLike(content)) {
      if (hasXsdExtension(fileName)) {
        return {
          format: 'xsd',
          parsedContent: rawContent,
          confidence: 'medium',
        };
      }

      return {
        format: 'sample-xml',
        parsedContent: rawContent,
        confidence: 'low',
      };
    }

    return {
      format: 'unknown',
      parsedContent: rawContent,
      confidence: 'low',
    };
  }
}
