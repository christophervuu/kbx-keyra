import { ChevronLeft, ChevronRight, Home, Layout, Library, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { PATHS } from '@/routes';

const NAV_ITEMS = [
  { to: PATHS.HOME, label: 'Home', icon: Home },
  { to: PATHS.SCHEMA_LIBRARY, label: 'Schemas', icon: Library },
  { to: PATHS.TEMPLATE_LIBRARY, label: 'Templates', icon: Layout },
  { to: PATHS.SETTINGS, label: 'Settings', icon: Settings },
] as const;

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'keyra:app-sidebar-collapsed';

function readCollapsedPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function NavBar() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsedPreference);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? 'true' : 'false');
    } catch {
      // Ignore persistence failures (private mode/quota/security settings)
    }
  }, [collapsed]);

  return (
    <aside
      data-testid="app-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={`flex min-h-screen shrink-0 flex-col border-r border-slate-800 bg-slate-950 transition-[width] duration-200 ease-out ${
        collapsed ? 'w-14' : 'w-48'
      }`}
      aria-label="App sidebar"
    >
      <div className="flex h-14 items-center justify-between border-b border-slate-800 px-3">
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight text-slate-100">
            Key<span className="text-blue-400">Ra</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          data-testid="sidebar-toggle"
        >
          {collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
        </button>
      </div>

      <nav className="px-2 py-3" aria-label="Sidebar navigation">
        {!collapsed && (
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
            Workspace
          </p>
        )}
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                aria-label={label}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `group flex min-h-10 items-center rounded-md border-l-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    collapsed ? 'justify-center px-1.5' : 'gap-2 px-2.5'
                  } ${
                    isActive
                      ? 'border-l-blue-400 bg-blue-500/10 font-semibold text-slate-100'
                      : 'border-l-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`
                }
                data-testid={`sidebar-link-${label.toLowerCase()}`}
              >
                <Icon size={16} aria-hidden="true" className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export { SIDEBAR_COLLAPSED_STORAGE_KEY };
