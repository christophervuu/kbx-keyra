type PathSegment = string | number;

function tokenizePath(path: string): PathSegment[] | null {
  if (path.length === 0) {
    return [];
  }

  const segments: PathSegment[] = [];
  let index = 0;

  while (index < path.length) {
    const char = path[index];

    if (char === '.') {
      return null;
    }

    if (char === '[') {
      index += 1;

      if (index >= path.length) {
        return null;
      }

      if (path[index] === "'") {
        index += 1;
        const keyStart = index;

        while (index < path.length && path[index] !== "'") {
          index += 1;
        }

        if (index >= path.length) {
          return null;
        }

        const key = path.slice(keyStart, index);
        index += 1;

        if (path[index] !== ']') {
          return null;
        }

        segments.push(key);
        index += 1;
      } else {
        const numberStart = index;

        while (index < path.length && /[0-9]/.test(path[index] ?? '')) {
          index += 1;
        }

        if (numberStart === index) {
          return null;
        }

        if (path[index] !== ']') {
          return null;
        }

        const raw = path.slice(numberStart, index);
        segments.push(Number(raw));
        index += 1;
      }

      if (index < path.length && path[index] === '.') {
        index += 1;
        if (index >= path.length) {
          return null;
        }
      }

      continue;
    }

    const keyStart = index;
    while (index < path.length && path[index] !== '.' && path[index] !== '[') {
      index += 1;
    }

    if (keyStart === index) {
      return null;
    }

    segments.push(path.slice(keyStart, index));

    if (index < path.length && path[index] === '.') {
      index += 1;
      if (index >= path.length) {
        return null;
      }
    }
  }

  return segments;
}

function getSegmentValue(current: unknown, segment: PathSegment): unknown {
  if (current === null || current === undefined) {
    return null;
  }

  if (typeof segment === 'number') {
    if (!Array.isArray(current)) {
      return null;
    }

    return current[segment];
  }

  if (typeof current !== 'object') {
    return null;
  }

  return (current as Record<string, unknown>)[segment];
}

export function resolvePath(obj: unknown, path: string): unknown {
  if (path.length === 0) {
    return obj;
  }

  if (obj === null || obj === undefined) {
    return null;
  }

  const segments = tokenizePath(path);

  if (segments === null) {
    return null;
  }

  let current: unknown = obj;

  for (const segment of segments) {
    current = getSegmentValue(current, segment);

    if (current === null) {
      return null;
    }
  }

  return current;
}
