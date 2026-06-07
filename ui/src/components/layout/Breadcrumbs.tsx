import { Link, useLocation, useParams } from 'react-router-dom';

import { useBreadcrumbLabels } from './BreadcrumbContext';

interface BreadcrumbSegment {
  label: string;
  path?: string;
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

function buildProjectHierarchyBreadcrumbs(
  segments: string[],
  params: Record<string, string | undefined>,
  labels: ReadonlyMap<string, string>,
): BreadcrumbSegment[] {
  const crumbs: BreadcrumbSegment[] = [{ label: 'Home', path: '/' }];

  // Structural segment must exist even without a /projects route.
  crumbs.push({ label: 'Projects' });

  const projectId = params.projectId ?? segments[1];
  if (!projectId) return crumbs;

  const projectLabel = formatSegment(projectId, params, labels);
  const projectPath = `/projects/${projectId}`;

  // /projects/:projectId
  if (segments.length === 2) {
    crumbs.push({ label: projectLabel });
    return crumbs;
  }

  crumbs.push({ label: projectLabel, path: projectPath });

  const section = segments[2];

  // /projects/:projectId/deployments
  if (section === 'deployments') {
    crumbs.push({ label: 'Deployments' });
    return crumbs;
  }

  // /projects/:projectId/mappings/:mappingId[/deploy]
  if (section === 'mappings') {
    crumbs.push({ label: 'Mappings' });

    const mappingId = params.mappingId ?? segments[3];
    if (!mappingId) return crumbs;

    const mappingLabel = formatSegment(mappingId, params, labels);
    const mappingPath = `/projects/${projectId}/mappings/${mappingId}`;

    if (segments.length === 4) {
      crumbs.push({ label: mappingLabel });
      return crumbs;
    }

    crumbs.push({ label: mappingLabel, path: mappingPath });

    if (segments[4] === 'deploy') {
      crumbs.push({ label: 'Deployment' });
      return crumbs;
    }
  }

  return crumbs;
}

function buildBreadcrumbs(
  pathname: string,
  params: Record<string, string | undefined>,
  labels: ReadonlyMap<string, string>,
): BreadcrumbSegment[] {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 'projects') {
    return buildProjectHierarchyBreadcrumbs(segments, params, labels);
  }

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
              ) : !crumb.path ? (
                <span className="text-slate-500" aria-disabled="true">
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
