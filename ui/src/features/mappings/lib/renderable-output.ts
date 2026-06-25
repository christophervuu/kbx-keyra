import type {
  JsonValue,
  OutputPathEntry,
  OutputPathIndex,
  RenderableOutput,
} from '@/lib/types/domain';

const textEncoder = new TextEncoder();

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeToJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeToJsonValue(item));
  }

  if (isJsonObject(value)) {
    const next: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) {
      next[key] = normalizeToJsonValue(value[key]);
    }
    return next;
  }

  return String(value);
}

function createOutputPathEntry(params: {
  runtimePath: string;
  targetSchemaPath?: string;
  owningRuleTargetPath?: string;
  nodeKind: OutputPathEntry['nodeKind'];
}): OutputPathEntry {
  const { runtimePath, targetSchemaPath, owningRuleTargetPath, nodeKind } = params;
  return {
    runtimePath,
    ...(targetSchemaPath ? { targetSchemaPath } : {}),
    ...(owningRuleTargetPath ? { owningRuleTargetPath } : {}),
    nodeKind,
  };
}

function registerPath(index: Record<string, OutputPathEntry>, runtimePath: string, entry: OutputPathEntry): void {
  if (runtimePath.length === 0) {
    return;
  }
  if (!(runtimePath in index)) {
    index[runtimePath] = entry;
  }
}

function traverseJson(
  value: JsonValue,
  runtimePath: string,
  index: Record<string, OutputPathEntry>,
): number {
  let nodeCount = 1;

  if (Array.isArray(value)) {
    if (runtimePath.length > 0) {
      registerPath(
        index,
        runtimePath,
        createOutputPathEntry({
          runtimePath,
          targetSchemaPath: runtimePath,
          owningRuleTargetPath: runtimePath,
          nodeKind: 'array-item',
        }),
      );
    }

    for (let i = 0; i < value.length; i += 1) {
      const childPath = `${runtimePath}[${i}]`;
      registerPath(
        index,
        childPath,
        createOutputPathEntry({
          runtimePath: childPath,
          targetSchemaPath: childPath,
          owningRuleTargetPath: runtimePath || childPath,
          nodeKind: 'array-item',
        }),
      );
      nodeCount += traverseJson(value[i], childPath, index);
    }

    return nodeCount;
  }

  if (isJsonObject(value)) {
    if (runtimePath.length > 0) {
      registerPath(
        index,
        runtimePath,
        createOutputPathEntry({
          runtimePath,
          targetSchemaPath: runtimePath,
          owningRuleTargetPath: runtimePath,
          nodeKind: 'property',
        }),
      );
    }

    for (const key of Object.keys(value)) {
      const childPath = runtimePath.length > 0 ? `${runtimePath}.${key}` : key;
      registerPath(
        index,
        childPath,
        createOutputPathEntry({
          runtimePath: childPath,
          targetSchemaPath: childPath,
          owningRuleTargetPath: childPath,
          nodeKind: 'property',
        }),
      );

      nodeCount += traverseJson(value[key], childPath, index);
    }

    return nodeCount;
  }

  if (runtimePath.length > 0) {
    registerPath(
      index,
      runtimePath,
      createOutputPathEntry({
        runtimePath,
        targetSchemaPath: runtimePath,
        owningRuleTargetPath: runtimePath,
        nodeKind: 'text',
      }),
    );
  }

  return nodeCount;
}

export function buildRenderableOutput(output: unknown): RenderableOutput {
  const value = normalizeToJsonValue(output);
  const serializedText = JSON.stringify(value, null, 2);
  const pathIndexMutable: Record<string, OutputPathEntry> = {};
  const nodeCount = traverseJson(value, '', pathIndexMutable);
  const pathIndex: OutputPathIndex = pathIndexMutable;

  return {
    format: 'json',
    value,
    serializedText,
    pathIndex,
    nodeCount,
    serializedSizeBytes: textEncoder.encode(serializedText).byteLength,
  };
}
