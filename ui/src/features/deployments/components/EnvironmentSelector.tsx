import type { KeyboardEvent } from 'react';

import type { Environment } from '@/lib/types';

export interface EnvironmentSelectorProps {
  value: Environment;
  onChange: (env: Environment) => void;
}

const ENVIRONMENTS: Environment[] = ['DEV', 'PREPROD', 'PROD'];

const envLabels: Record<Environment, string> = {
  DEV: 'DEV',
  PREPROD: 'PREPROD',
  PROD: 'PROD',
  QA: 'QA (legacy)',
  SANDBOX: 'SANDBOX',
};

/**
 * Tab-style environment selector for DEV / PREPROD / PROD.
 * Keyboard accessible: left/right arrows navigate tabs; Enter/Space selects.
 */
export function EnvironmentSelector({ value, onChange }: EnvironmentSelectorProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, env: Environment) {
    const idx = ENVIRONMENTS.indexOf(env);
    if (e.key === 'ArrowRight') {
      const next = ENVIRONMENTS[(idx + 1) % ENVIRONMENTS.length];
      if (next) onChange(next);
    } else if (e.key === 'ArrowLeft') {
      const prev = ENVIRONMENTS[(idx - 1 + ENVIRONMENTS.length) % ENVIRONMENTS.length];
      if (prev) onChange(prev);
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Deployment environment"
      className="flex gap-1 rounded-md border border-slate-700 bg-slate-900 p-0.5"
      data-testid="environment-selector"
    >
      {ENVIRONMENTS.map((env) => {
        const isSelected = env === value;
        return (
          <button
            key={env}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(env)}
            onKeyDown={(e) => handleKeyDown(e, env)}
            data-testid={`env-tab-${env}`}
            className={[
              'rounded px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              isSelected
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            {envLabels[env]}
          </button>
        );
      })}
    </div>
  );
}
