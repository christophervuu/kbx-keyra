/**
 * BottomArea — full-width collapsible tabbed container below the three columns.
 *
 * Hosts: Preview, Diagnostics, Trace, Test Cases tabs.
 * Tab content uses `visibility` / `display:none` to preserve state when switching.
 * Collapse state is local (session-only, not persisted).
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import type { TestCase } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BottomTabId = 'preview' | 'diagnostics' | 'trace' | 'test-cases';

interface BottomTab {
  id: BottomTabId;
  label: string;
}

const TABS: readonly BottomTab[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'trace', label: 'Trace' },
  { id: 'test-cases', label: 'Test Cases' },
];

export interface BottomAreaProps {
  /** Content for the Preview tab */
  previewContent?: ReactNode;
  /** Content for the Diagnostics tab */
  diagnosticsContent?: ReactNode;
  /** Content for the Trace tab */
  traceContent?: ReactNode;
  /** Content for the Test Cases tab */
  testCasesContent?: ReactNode;
  /** Initial collapsed state (default: false) */
  defaultCollapsed?: boolean;
  /** Saved test cases available for loading into the source textarea */
  testCases?: readonly TestCase[];
  /** Fired when a test case is selected from the dropdown */
  onLoadTestCase?: (id: string) => void;
  /** Optional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * BottomArea — collapsible tabbed panel spanning the full editor width.
 *
 * All tab panels remain mounted (display:none when inactive) to preserve state.
 */
export function BottomArea({
  previewContent,
  diagnosticsContent,
  traceContent,
  testCasesContent,
  defaultCollapsed = false,
  testCases,
  onLoadTestCase,
  className = '',
}: BottomAreaProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [activeTab, setActiveTab] = useState<BottomTabId>('preview');
  const [selectorValue, setSelectorValue] = useState('');

  const tabContent: Record<BottomTabId, ReactNode> = {
    preview: previewContent,
    diagnostics: diagnosticsContent,
    trace: traceContent,
    'test-cases': testCasesContent,
  };

  const hasTestCases = testCases && testCases.length > 0;

  const handleTestCaseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    onLoadTestCase?.(id);
    setSelectorValue('');
  };

  return (
    <div
      data-testid="bottom-area"
      className={[
        'flex flex-col border-t border-slate-700 bg-slate-950',
        className,
      ].join(' ')}
    >
      {/* Tab bar + collapse toggle */}
      <div className="flex shrink-0 items-center border-b border-slate-700 bg-slate-900/80">
        {/* Tabs */}
        <div role="tablist" aria-label="Bottom panel tabs" className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`bottom-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`bottom-panel-${tab.id}`}
              data-testid={`bottom-tab-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                if (collapsed) setCollapsed(false);
              }}
              className={[
                'px-4 py-2 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-500',
                activeTab === tab.id && !collapsed
                  ? 'border-b-2 border-blue-500 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Test case selector */}
        <select
          aria-label="Load test case"
          data-testid="bottom-test-case-selector"
          value={selectorValue}
          onChange={handleTestCaseChange}
          className="mr-2 h-6 rounded border border-slate-700 bg-slate-800 px-1.5 text-xs text-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {hasTestCases ? (
            <>
              <option value="" disabled>
                Load test case…
              </option>
              {testCases.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.name}
                </option>
              ))}
            </>
          ) : (
            <option value="" disabled>
              No saved test cases
            </option>
          )}
        </select>

        {/* Collapse toggle */}
        <button
          type="button"
          data-testid="bottom-collapse-toggle"
          aria-label={collapsed ? 'Expand bottom panel' : 'Collapse bottom panel'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
          className="mr-2 rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
        >
          {collapsed ? (
            <ChevronUp size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Tab panels — all mounted, hidden via style when inactive or collapsed */}
      {TABS.map((tab) => (
        <div
          key={tab.id}
          id={`bottom-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`bottom-tab-${tab.id}`}
          data-testid={`bottom-panel-${tab.id}`}
          style={{
            display: collapsed || activeTab !== tab.id ? 'none' : undefined,
          }}
          className="min-h-0 flex-1 overflow-auto"
        >
          {tabContent[tab.id]}
        </div>
      ))}
    </div>
  );
}
