import type { SchemaNodeIdentity } from '../../persistence/types.js';

export interface SchemaIdentityDiffSummary {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly renamed: readonly Array<{
    readonly fieldId: string;
    readonly fromJsonPointer: string;
    readonly toJsonPointer: string;
  }>;
  readonly moved: readonly Array<{
    readonly fieldId: string;
    readonly fromJsonPointer: string;
    readonly toJsonPointer: string;
  }>;
}

function parentPointer(pointer: string): string | undefined {
  if (pointer === '') {
    return undefined;
  }

  const lastSlash = pointer.lastIndexOf('/');
  if (lastSlash <= 0) {
    return '';
  }

  return pointer.slice(0, lastSlash);
}

function pointerName(pointer: string): string {
  if (pointer === '') {
    return '';
  }

  return pointer.slice(pointer.lastIndexOf('/') + 1);
}

export function computeSchemaIdentityDiff(
  prior: readonly SchemaNodeIdentity[],
  current: readonly SchemaNodeIdentity[],
): SchemaIdentityDiffSummary {
  const priorByFieldId = new Map(prior.map((item) => [item.fieldId, item]));
  const currentByFieldId = new Map(current.map((item) => [item.fieldId, item]));

  const added: string[] = [];
  const removed: string[] = [];
  const renamed: Array<{ fieldId: string; fromJsonPointer: string; toJsonPointer: string }> = [];
  const moved: Array<{ fieldId: string; fromJsonPointer: string; toJsonPointer: string }> = [];

  for (const [fieldId, priorNode] of priorByFieldId.entries()) {
    const currentNode = currentByFieldId.get(fieldId);
    if (!currentNode) {
      removed.push(priorNode.jsonPointer);
      continue;
    }

    if (priorNode.jsonPointer === currentNode.jsonPointer) {
      continue;
    }

    const priorParent = parentPointer(priorNode.jsonPointer);
    const currentParent = parentPointer(currentNode.jsonPointer);
    const priorName = pointerName(priorNode.jsonPointer);
    const currentName = pointerName(currentNode.jsonPointer);

    if (priorParent === currentParent && priorName !== currentName) {
      renamed.push({
        fieldId,
        fromJsonPointer: priorNode.jsonPointer,
        toJsonPointer: currentNode.jsonPointer,
      });
    } else {
      moved.push({
        fieldId,
        fromJsonPointer: priorNode.jsonPointer,
        toJsonPointer: currentNode.jsonPointer,
      });
    }
  }

  for (const [fieldId, currentNode] of currentByFieldId.entries()) {
    if (!priorByFieldId.has(fieldId)) {
      added.push(currentNode.jsonPointer);
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    renamed: renamed.sort((a, b) => a.toJsonPointer.localeCompare(b.toJsonPointer)),
    moved: moved.sort((a, b) => a.toJsonPointer.localeCompare(b.toJsonPointer)),
  };
}
