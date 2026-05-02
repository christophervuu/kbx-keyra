// DashboardTabs — Three-tab shell for the Home Dashboard (FS-014 T-10)
// Projects tab renders children; Deployments and Activity are Phase 0 placeholders.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, Rocket } from 'lucide-react';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabKey = 'projects' | 'deployments' | 'activity';

interface TabDef {
  key: TabKey;
  label: string;
}

const TABS: TabDef[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'deployments', label: 'Deployments' },
  { key: 'activity', label: 'Activity' },
];

// ---------------------------------------------------------------------------
// Placeholder panel
// ---------------------------------------------------------------------------

interface PlaceholderPanelProps {
  icon: ReactNode;
  message: string;
}

function PlaceholderPanel({ icon, message }: PlaceholderPanelProps) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
      {icon}
      <p className="max-w-sm text-sm text-slate-400">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardTabs
// ---------------------------------------------------------------------------

export interface DashboardTabsProps {
  children: ReactNode;
}

export function DashboardTabs({ children }: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('projects');

  return (
    <div>
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="flex border-b border-slate-700"
      >
        {TABS.map(({ key, label }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              id={`tab-${key}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(key)}
              className={`px-5 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                isActive
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div className="pt-6">
        {/* Projects */}
        <div
          role="tabpanel"
          id="tabpanel-projects"
          aria-labelledby="tab-projects"
          hidden={activeTab !== 'projects'}
        >
          {children}
        </div>

        {/* Deployments */}
        <div
          role="tabpanel"
          id="tabpanel-deployments"
          aria-labelledby="tab-deployments"
          hidden={activeTab !== 'deployments'}
        >
          <PlaceholderPanel
            icon={<Rocket size={40} className="text-slate-500" aria-hidden="true" />}
            message="Deployment tracking available when backend is connected (Phase 4)."
          />
        </div>

        {/* Activity */}
        <div
          role="tabpanel"
          id="tabpanel-activity"
          aria-labelledby="tab-activity"
          hidden={activeTab !== 'activity'}
        >
          <PlaceholderPanel
            icon={<Activity size={40} className="text-slate-500" aria-hidden="true" />}
            message="Activity feed available when backend is connected (Phase 1+)."
          />
        </div>
      </div>
    </div>
  );
}
