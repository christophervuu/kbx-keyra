import type { AIResponse } from './types.js';
import type { ModelUsage } from './model-client.js';

function normalizeSchemaType(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return [];
}

function validateSchemaObjectShape(data: unknown, schema: Record<string, unknown>): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return 'expected object';
  }

  const dataRecord = data as Record<string, unknown>;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string')
    : [];

  for (const requiredKey of required) {
    if (!(requiredKey in dataRecord)) {
      return `missing required property '${requiredKey}'`;
    }
  }

  const properties =
    typeof schema.properties === 'object' && schema.properties !== null
      ? (schema.properties as Record<string, unknown>)
      : undefined;

  if (properties) {
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!(key in dataRecord)) {
        continue;
      }

      if (typeof propertySchema !== 'object' || propertySchema === null) {
        continue;
      }

      const propertySchemaRecord = propertySchema as Record<string, unknown>;
      const propertyTypes = normalizeSchemaType(propertySchemaRecord.type);
      if (propertyTypes.length === 0) {
        continue;
      }

      const value = dataRecord[key];
      const matchesType = propertyTypes.some((propertyType) => {
        if (propertyType === 'string') {
          return typeof value === 'string';
        }
        if (propertyType === 'number') {
          return typeof value === 'number';
        }
        if (propertyType === 'boolean') {
          return typeof value === 'boolean';
        }
        if (propertyType === 'object') {
          return typeof value === 'object' && value !== null && !Array.isArray(value);
        }
        if (propertyType === 'array') {
          return Array.isArray(value);
        }
        if (propertyType === 'null') {
          return value === null;
        }
        return true;
      });

      if (!matchesType) {
        return `property '${key}' has invalid type`;
      }

      if (propertySchemaRecord.enum && Array.isArray(propertySchemaRecord.enum)) {
        const enumValues = propertySchemaRecord.enum;
        if (!enumValues.includes(value)) {
          return `property '${key}' must be one of: ${enumValues.join(', ')}`;
        }
      }
    }
  }

  if (schema.additionalProperties === false && properties) {
    const allowedKeys = new Set(Object.keys(properties));
    for (const key of Object.keys(dataRecord)) {
      if (!allowedKeys.has(key)) {
        return `unexpected property '${key}'`;
      }
    }
  }

  return null;
}

function validateSchemaArrayShape(data: unknown, schema: Record<string, unknown>): string | null {
  if (!Array.isArray(data)) {
    return 'expected array';
  }

  if (typeof schema.items !== 'object' || schema.items === null) {
    return null;
  }

  const itemSchema = schema.items as Record<string, unknown>;

  for (let index = 0; index < data.length; index += 1) {
    const item = data[index];
    const itemType = normalizeSchemaType(itemSchema.type);

    if (itemType.includes('object')) {
      const itemValidation = validateSchemaObjectShape(item, itemSchema);
      if (itemValidation) {
        return `item[${index}] ${itemValidation}`;
      }
    }
  }

  return null;
}

function validateAgainstSchema(data: unknown, responseSchema: object): string | null {
  const schema = responseSchema as Record<string, unknown>;
  const topLevelTypes = normalizeSchemaType(schema.type);

  if (topLevelTypes.length === 0) {
    return null;
  }

  if (topLevelTypes.includes('object')) {
    return validateSchemaObjectShape(data, schema);
  }

  if (topLevelTypes.includes('array')) {
    return validateSchemaArrayShape(data, schema);
  }

  return null;
}

export function parseModelOutput(
  content: string | null,
  promptId: string,
  model: string,
  responseSchema: object,
  usage?: ModelUsage,
): AIResponse<unknown> {
  if (!content || content.trim().length === 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_MODEL_OUTPUT',
        message: 'Model response content is empty or null',
      },
      promptId,
    };
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const schemaViolation = validateAgainstSchema(parsed, responseSchema);
    if (schemaViolation) {
      return {
        success: false,
        error: {
          code: 'INVALID_MODEL_OUTPUT',
          message: `Model response failed schema validation: ${schemaViolation}`,
        },
        promptId,
      };
    }

    return {
      success: true,
      data: parsed,
      promptId,
      model,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'INVALID_MODEL_OUTPUT',
        message: `Failed to parse model response as JSON: ${error instanceof Error ? error.message : 'Unknown parse error'}`,
      },
      promptId,
    };
  }
}
