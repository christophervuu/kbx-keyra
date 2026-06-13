import { Outlet, useMatch } from 'react-router-dom';

import { BreadcrumbProvider } from './BreadcrumbContext';
import { Breadcrumbs } from './Breadcrumbs';
import { NavBar } from './NavBar';

export function AppLayout() {
  const isCreateMappingRoute = useMatch('/projects/:projectId/mappings/new') !== null;
  const isMappingEditorRoute = useMatch('/projects/:projectId/mappings/:mappingId') !== null;
  const isTestLabRoute = useMatch('/projects/:projectId/mappings/:mappingId/test-lab') !== null;
  const isFocusedWorkspace = !isCreateMappingRoute && (isMappingEditorRoute || isTestLabRoute);

  return (
    <BreadcrumbProvider>
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <NavBar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Breadcrumbs are suppressed on focused workspace routes (Mapping Editor,
              Test Lab) — each provides its own context bar for project/mapping navigation. */}
          {!isFocusedWorkspace && <Breadcrumbs />}
          {isFocusedWorkspace ? (
            <main className="flex-1">
              <Outlet />
            </main>
          ) : (
            <main className="flex-1 px-6 py-6">
              <div className="mx-auto max-w-7xl">
                <Outlet />
              </div>
            </main>
          )}
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
