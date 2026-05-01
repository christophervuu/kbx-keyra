function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Sets a value on an object by dot-notation path.
 *
 * Mutates the provided root object in place.
 */
export function setAtPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  if (path.length === 0) {
    for (const key of Object.keys(root)) {
      delete root[key];
    }

    if (isObjectRecord(value)) {
      Object.assign(root, value);
      return;
    }

    root[''] = value;
    return;
  }

  const segments = path.split('.').filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return;
  }

  let current: Record<string, unknown> = root;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const next = current[segment];

    if (!isObjectRecord(next)) {
      const replacement: Record<string, unknown> = {};
      current[segment] = replacement;
      current = replacement;
      continue;
    }

    current = next;
  }

  const lastSegment = segments[segments.length - 1]!;
  current[lastSegment] = value;
}
