import { Home, Layout, Library, Settings } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { PATHS } from '@/routes';

const NAV_ITEMS = [
  { to: PATHS.HOME, label: 'Home', icon: Home },
  { to: PATHS.SCHEMA_LIBRARY, label: 'Schemas', icon: Library },
  { to: PATHS.TEMPLATE_LIBRARY, label: 'Templates', icon: Layout },
  { to: PATHS.SETTINGS, label: 'Settings', icon: Settings },
] as const;

export function NavBar() {
  return (
    <nav
      className="sticky top-0 z-50 flex h-14 items-center border-b border-slate-700 bg-slate-900 px-6"
      aria-label="Main navigation"
    >
      <span className="mr-8 text-lg font-bold tracking-tight text-slate-100">KeyRa</span>

      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
