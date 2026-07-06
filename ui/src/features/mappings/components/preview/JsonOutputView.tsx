import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { JsonValue, RenderableOutput } from '@/lib/types/domain';

interface JsonOutputViewProps {
  renderableOutput: RenderableOutput;
  highlightPath?: string | null;
  onPathClick?: (path: string) => void;
  onPathKeyDown?: (path: string, event: KeyboardEvent<HTMLButtonElement>) => void;
  onHighlightRef?: (el: HTMLSpanElement | null) => void;
}

const INDENT_SIZE = 2;

function indentStr(level: number): string {
  return ' '.repeat(level * INDENT_SIZE);
}

function isJsonObject(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContainer(value: JsonValue): boolean {
  return isJsonObject(value) || Array.isArray(value);
}

function leafName(path: string): string {
  if (!path) return '';
  const bracketIndex = path.lastIndexOf('[');
  const dotIndex = path.lastIndexOf('.');
  if (bracketIndex > dotIndex) {
    return path.slice(bracketIndex);
  }
  return dotIndex >= 0 ? path.slice(dotIndex + 1) : path;
}

function parentPath(path: string): string | null {
  if (path.length === 0) return null;
  if (path.endsWith(']')) {
    const indexStart = path.lastIndexOf('[');
    if (indexStart > 0) {
      return path.slice(0, indexStart);
    }
  }
  const dotIndex = path.lastIndexOf('.');
  if (dotIndex >= 0) {
    return path.slice(0, dotIndex);
  }
  return null;
}

function collectMatchPaths(value: JsonValue, path: string, query: string, output: Set<string>): void {
  if (path.length > 0) {
    const pathText = path.toLowerCase();
    const leafText = leafName(path).toLowerCase();
    if (pathText.includes(query) || leafText.includes(query)) {
      output.add(path);
    }
  }

  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      const childPath = `${path}[${index}]`;
      collectMatchPaths(child, childPath, query, output);
    });
    return;
  }

  if (isJsonObject(value)) {
    Object.entries(value).forEach(([key, child]) => {
      const childPath = path.length > 0 ? `${path}.${key}` : key;
      collectMatchPaths(child, childPath, query, output);
    });
  }
}

function collectAncestorPaths(paths: Iterable<string>): Set<string> {
  const ancestors = new Set<string>();
  for (const path of paths) {
    let cursor: string | null = path;
    while (cursor) {
      const parent = parentPath(cursor);
      if (!parent) break;
      ancestors.add(parent);
      cursor = parent;
    }
  }
  return ancestors;
}

function pathInSearchScope(path: string, matches: Set<string>): boolean {
  if (path.length === 0) return true;
  if (matches.has(path)) return true;
  for (const candidate of matches) {
    if (candidate.startsWith(`${path}.`) || candidate.startsWith(`${path}[`)) {
      return true;
    }
  }
  return false;
}

function ScalarValue({ value }: { value: JsonValue }) {
  if (value === null) {
    return <span className="text-gray-400">null</span>;
  }
  if (typeof value === 'string') {
    return <span className="text-green-400">{JSON.stringify(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-amber-400">{String(value)}</span>;
  }
  if (typeof value === 'boolean') {
    return <span className="text-purple-400">{String(value)}</span>;
  }
  return <span className="text-zinc-400">{String(value)}</span>;
}

interface JsonNodeProps {
  value: JsonValue;
  path: string;
  indent: number;
  isLast: boolean;
  highlightPath: string | null | undefined;
  onPathClick: ((path: string) => void) | undefined;
  onPathKeyDown: ((path: string, event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
  onHighlightRef: ((el: HTMLSpanElement | null) => void) | undefined;
  collapsedPaths: ReadonlySet<string>;
  onTogglePath: (path: string) => void;
  searchMatches: ReadonlySet<string>;
  hasActiveSearch: boolean;
  searchExpandedPaths: ReadonlySet<string>;
  parentHighlighted?: boolean;
}

function JsonNode({
  value,
  path,
  indent,
  isLast,
  highlightPath,
  onPathClick,
  onPathKeyDown,
  onHighlightRef,
  collapsedPaths,
  onTogglePath,
  searchMatches,
  hasActiveSearch,
  searchExpandedPaths,
  parentHighlighted = false,
}: JsonNodeProps) {
  const trailing = isLast ? '' : ',';
  const isHighlighted = highlightPath != null && highlightPath !== '' && path === highlightPath;
  const isCollapsed =
    path.length > 0
    && collapsedPaths.has(path)
    && !searchExpandedPaths.has(path);

  if (Array.isArray(value)) {
    if (isCollapsed) {
      return (
        <>
          <span className="text-zinc-400">[{value.length > 0 ? '…' : ''}]</span>
          {trailing}
        </>
      );
    }

    const visibleItems = hasActiveSearch
      ? value
        .map((item, i) => ({ item, index: i, childPath: `${path}[${i}]` }))
        .filter(({ childPath }) => pathInSearchScope(childPath, searchMatches))
      : value.map((item, i) => ({ item, index: i, childPath: `${path}[${i}]` }));

    return (
      <>
        <span className="text-zinc-400">[</span>
        {'\n'}
        {visibleItems.map(({ item, childPath }, itemIndex) => {
          const childIsLast = itemIndex === visibleItems.length - 1;
          return (
            <span key={childPath} className="block">
              {indentStr(indent + 1)}
              <JsonNode
                value={item}
                path={childPath}
                indent={indent + 1}
                isLast={childIsLast}
                highlightPath={highlightPath}
                onPathClick={onPathClick}
                onPathKeyDown={onPathKeyDown}
                onHighlightRef={onHighlightRef}
                collapsedPaths={collapsedPaths}
                onTogglePath={onTogglePath}
                searchMatches={searchMatches}
                hasActiveSearch={hasActiveSearch}
                searchExpandedPaths={searchExpandedPaths}
              />
              {'\n'}
            </span>
          );
        })}
        {indentStr(indent)}
        <span className="text-zinc-400">]</span>
        {trailing}
      </>
    );
  }

  if (isJsonObject(value)) {
    if (isCollapsed) {
      return (
        <>
          <span className="text-zinc-400">{'{'}{Object.keys(value).length > 0 ? '…' : ''}{'}'}</span>
          {trailing}
        </>
      );
    }

    const visibleEntries = Object.entries(value)
      .map(([key, child]) => ({
        key,
        child,
        childPath: path.length > 0 ? `${path}.${key}` : key,
      }))
      .filter(({ childPath }) => !hasActiveSearch || pathInSearchScope(childPath, searchMatches));

    return (
      <>
        <span className="text-zinc-400">{'{'}</span>
        {'\n'}
        {visibleEntries.map(({ key, child, childPath }, index) => {
          const childIsLast = index === visibleEntries.length - 1;
          const childIsContainer = isContainer(child);
          const childCollapsed =
            childPath.length > 0
            && collapsedPaths.has(childPath)
            && !searchExpandedPaths.has(childPath);
          const childHighlighted =
            highlightPath != null && highlightPath !== '' && childPath === highlightPath;
          const childSearchMatch = hasActiveSearch && searchMatches.has(childPath);

          const keyNode = onPathClick ? (
            <button
              type="button"
              onClick={() => onPathClick(childPath)}
              onKeyDown={(event) => onPathKeyDown?.(childPath, event)}
              className="text-blue-400 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
              data-testid={`output-key-${childPath}`}
              aria-label={`Select path ${childPath}`}
            >
              {JSON.stringify(key)}:
            </button>
          ) : (
            <span className="text-blue-400" data-testid={`output-key-${childPath}`}>
              {JSON.stringify(key)}:
            </span>
          );

          return (
            <span
              key={childPath}
              ref={childHighlighted ? onHighlightRef : undefined}
              className={[
                'block rounded',
                childHighlighted ? 'bg-blue-500/20 ring-1 ring-blue-500/40' : '',
                childSearchMatch ? 'bg-amber-500/20' : '',
              ].join(' ').trim()}
              data-testid={
                childHighlighted
                  ? 'output-highlighted'
                  : childSearchMatch
                    ? `output-search-match-${childPath}`
                    : undefined
              }
            >
              {indentStr(indent + 1)}
              {childIsContainer ? (
                <button
                  type="button"
                  onClick={() => onTogglePath(childPath)}
                  data-testid={`output-toggle-${childPath}`}
                  aria-label={`${childCollapsed ? 'Expand' : 'Collapse'} path ${childPath}`}
                  aria-expanded={!childCollapsed}
                  className="mr-1 text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
                >
                  {childCollapsed ? '▸' : '▾'}
                </button>
              ) : (
                <span className="mr-1 inline-block w-3" aria-hidden="true" />
              )}
              {keyNode} <JsonNode
                value={child}
                path={childPath}
                indent={indent + 1}
                isLast={childIsLast}
                highlightPath={highlightPath}
                onPathClick={onPathClick}
                onPathKeyDown={onPathKeyDown}
                onHighlightRef={onHighlightRef}
                collapsedPaths={collapsedPaths}
                onTogglePath={onTogglePath}
                searchMatches={searchMatches}
                hasActiveSearch={hasActiveSearch}
                searchExpandedPaths={searchExpandedPaths}
                parentHighlighted={childHighlighted}
              />
              {'\n'}
            </span>
          );
        })}
        {indentStr(indent)}
        <span className="text-zinc-400">{'}'}</span>
        {trailing}
      </>
    );
  }

  if (isHighlighted && !parentHighlighted) {
    return (
      <span
        ref={onHighlightRef}
        className="rounded bg-blue-500/20 ring-1 ring-blue-500/40"
        data-testid="output-highlighted"
      >
        <ScalarValue value={value} />
        {trailing}
      </span>
    );
  }

  return (
    <>
      <ScalarValue value={value} />
      {trailing}
    </>
  );
}

export function JsonOutputView({
  renderableOutput,
  highlightPath,
  onPathClick,
  onPathKeyDown,
  onHighlightRef,
}: JsonOutputViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const hasActiveSearch = normalizedSearchQuery.length > 0;

  const searchMatches = useMemo(() => {
    if (!hasActiveSearch) return new Set<string>();
    const nextMatches = new Set<string>();
    collectMatchPaths(renderableOutput.value, '', normalizedSearchQuery, nextMatches);
    return nextMatches;
  }, [hasActiveSearch, normalizedSearchQuery, renderableOutput.value]);

  const searchExpandedPaths = useMemo(
    () => collectAncestorPaths(searchMatches),
    [searchMatches],
  );

  const hasSearchMatches = !hasActiveSearch || searchMatches.size > 0;

  const onTogglePath = (path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const searchablePathCount = useMemo(
    () => Object.keys(renderableOutput.pathIndex).length,
    [renderableOutput.pathIndex],
  );

  return (
    <div data-testid="output-json-view">
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor="output-search-input" className="text-[10px] uppercase tracking-wide text-zinc-500">
          Search
        </label>
        <input
          id="output-search-input"
          data-testid="output-search-input"
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search output paths"
          aria-label="Search output"
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        />
        <span className="text-[10px] text-zinc-500" data-testid="output-searchable-path-count">
          {searchablePathCount} paths
        </span>
      </div>

      {hasActiveSearch && !hasSearchMatches ? (
        <p className="mb-2 text-xs text-amber-300" data-testid="output-search-no-results" role="status">
          No matching output nodes
        </p>
      ) : null}

      <pre className="whitespace-pre font-mono text-xs" aria-label="Execution output">
        {hasSearchMatches ? (
          <JsonNode
            value={renderableOutput.value}
            path=""
            indent={0}
            isLast={true}
            highlightPath={highlightPath}
            onPathClick={onPathClick}
            onPathKeyDown={onPathKeyDown}
            onHighlightRef={onHighlightRef}
            collapsedPaths={collapsedPaths}
            onTogglePath={onTogglePath}
            searchMatches={searchMatches}
            hasActiveSearch={hasActiveSearch}
            searchExpandedPaths={searchExpandedPaths}
          />
        ) : null}
        {'\n'}
      </pre>
    </div>
  );
}
