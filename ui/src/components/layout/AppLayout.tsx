import { Outlet, useMatch } from 'react-router-dom';

import { Breadcrumbs } from './Breadcrumbs';
import { NavBar } from './NavBar';

export function AppLayout() {
  const isMappingEditorRoute = useMatch('/projects/:projectId/mappings/:mappingId') !== null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <NavBar />
      {/* Breadcrumbs are suppressed on the Mapping Editor route — the editor's
          own context bar (EditorTopBar) provides project/mapping navigation. */}
      {!isMappingEditorRoute && <Breadcrumbs />}
      {isMappingEditorRoute ? (
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
  );
}
