type JsonSchema = {
  readonly type: 'object';
  readonly properties: Record<string, JsonSchemaNode>;
};

type JsonSchemaNode = {
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, JsonSchemaNode>;
  items?: JsonSchemaNode;
  required?: string[];
  description?: string;
};

const TYPE_CYCLE: Array<'string' | 'number' | 'boolean'> = ['string', 'number', 'boolean'];

function ensureObject(node: JsonSchemaNode): JsonSchemaNode {
  if (node.type && node.type !== 'object') {
    return node;
  }

  if (!node.type) {
    node.type = 'object';
  }

  if (!node.properties) {
    node.properties = {};
  }

  return node;
}

function ensureArray(node: JsonSchemaNode): JsonSchemaNode {
  if (!node.type) {
    node.type = 'array';
  }

  if (node.type !== 'array') {
    return node;
  }

  if (!node.items) {
    node.items = {
      type: 'object',
      properties: {},
    };
  }

  if (!node.items.properties) {
    node.items.properties = {};
  }

  return node;
}

function markRequired(parent: JsonSchemaNode, key: string): void {
  if (!parent.required) {
    parent.required = [];
  }

  if (!parent.required.includes(key)) {
    parent.required.push(key);
  }
}

function addLeafPath(
  root: JsonSchema,
  segments: readonly string[],
  leafType: 'string' | 'number' | 'boolean',
  description: string,
  arraySegmentIndex: number | null,
  required: boolean,
): void {
  let cursor: JsonSchemaNode = root;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }

    const parentObject = ensureObject(cursor);
    if (!parentObject.properties) {
      parentObject.properties = {};
    }

    const existing = parentObject.properties[segment] ?? {};

    if (arraySegmentIndex === index) {
      const arrayNode = ensureArray(existing);
      parentObject.properties[segment] = arrayNode;
      cursor = arrayNode.items ?? { type: 'object', properties: {} };
      if (!arrayNode.items) {
        arrayNode.items = cursor;
      }
      continue;
    }

    const objectNode = ensureObject(existing);
    parentObject.properties[segment] = objectNode;
    cursor = objectNode;
  }

  const leafName = segments[segments.length - 1] ?? `Field${Math.random().toString(16).slice(2)}`;
  const parentObject = ensureObject(cursor);
  if (!parentObject.properties) {
    parentObject.properties = {};
  }

  parentObject.properties[leafName] = {
    type: leafType,
    description,
  };

  if (required) {
    markRequired(parentObject, leafName);
  }
}

/**
 * Deterministically generates a JSON Schema with the requested leaf field count.
 *
 * Output intentionally mixes nested objects, array item structures, and primitive
 * leaf types to resemble realistic business documents.
 */
export function generateJsonSchema(fieldCount: number): JsonSchema {
  const root: JsonSchema = {
    type: 'object',
    properties: {},
  };

  const normalized = Number.isFinite(fieldCount) ? Math.max(0, Math.floor(fieldCount)) : 0;

  for (let index = 0; index < normalized; index += 1) {
    const id = index + 1;
    const type = TYPE_CYCLE[index % TYPE_CYCLE.length] ?? 'string';
    const required = index % 4 === 0;

    switch (index % 4) {
      case 0:
        addLeafPath(
          root,
          ['Order', 'Header', `DocumentField${id}`],
          type,
          `Order header field ${id}`,
          null,
          required,
        );
        break;
      case 1:
        addLeafPath(
          root,
          ['Order', 'LineItems', `ItemField${id}`],
          type,
          `Line item field ${id}`,
          1,
          required,
        );
        break;
      case 2:
        addLeafPath(
          root,
          ['Parties', 'Buyer', 'Address', `AddressField${id}`],
          type,
          `Buyer address field ${id}`,
          null,
          required,
        );
        break;
      default:
        addLeafPath(
          root,
          ['Invoice', 'Totals', `AmountField${id}`],
          type,
          `Invoice totals field ${id}`,
          null,
          required,
        );
        break;
    }
  }

  return root;
}

export function generateJsonSchemaString(fieldCount: number): string {
  return JSON.stringify(generateJsonSchema(fieldCount));
}
