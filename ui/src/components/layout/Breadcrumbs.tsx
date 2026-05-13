import { Link, useLocation, useParams } from 'react-router-dom';

import { useBreadcrumbLabels } from './BreadcrumbContext';

interface BreadcrumbSegment {
  label: string;
  path: string;
}

function formatSegment(
  segment: string,
  params: Record<string, string | undefined>,
  labels: ReadonlyMap<string, string>,
): string {
  // Check context-registered labels first (human-readable name resolution)
  if (labels.has(segment)) {
    return labels.get(segment)!;
  }

  // If the segment matches a param value, show the param value directly
  for (const value of Object.values(params)) {
    if (value === segment) {
      return segment;
    }
  }

  // Convert kebab-case or path segments to title case
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildBreadcrumbs(
  pathname: string,
  params: Record<string, string | undefined>,
  labels: ReadonlyMap<string, string>,
): BreadcrumbSegment[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: BreadcrumbSegment[] = [{ label: 'Home', path: '/' }];

  let currentPath = '';
  for (const segment of segments) {
    currentPath += `/${segment}`;
    crumbs.push({
      label: formatSegment(segment, params, labels),
      path: currentPath,
    });
  }

  return crumbs;
}

export function Breadcrumbs() {
  const location = useLocation();
  const params = useParams();
  const labels = useBreadcrumbLabels();

  // Don't render breadcrumbs on home page
  if (location.pathname === '/') {
    return null;
  }

  const crumbs = buildBreadcrumbs(location.pathname, params, labels);

  return (
    <nav
      className="flex items-center gap-1.5 border-b border-slate-800 bg-slate-950 px-6 py-2 text-sm"
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center gap-1.5">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <li key={crumb.path} className="flex items-center gap-1.5">
              {index > 0 && (
                <span className="text-slate-600" aria-hidden="true">
                  /
                </span>
              )}
              {isLast ? (
                <span className="text-slate-300" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link to={crumb.path} className="text-slate-400 hover:text-slate-200">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
