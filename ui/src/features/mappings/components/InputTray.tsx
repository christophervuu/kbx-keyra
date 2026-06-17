import type { BuilderInput } from '../lib/smart-builder-state';

interface InputTrayProps {
  readonly inputs: readonly BuilderInput[];
  readonly className?: string;
  readonly onRemoveInput?: (inputId: string) => void;
}

const SOURCE_KIND_BADGES: Record<BuilderInput['sourceKind'], { short: string; tone: string; label: string }> = {
  primary: { short: 'SRC', tone: 'bg-blue-900/50 text-blue-200', label: 'Primary source' },
  enrichment: { short: 'ENR', tone: 'bg-violet-900/50 text-violet-200', label: 'Enrichment input' },
  constant: { short: 'CST', tone: 'bg-emerald-900/50 text-emerald-200', label: 'Constant' },
  static: { short: 'VAL', tone: 'bg-amber-900/50 text-amber-200', label: 'Static value' },
  item: { short: 'ITM', tone: 'bg-slate-700 text-slate-200', label: 'Array item' },
  parent: { short: 'PAR', tone: 'bg-slate-700 text-slate-200', label: 'Array parent' },
  expression: { short: 'EXPR', tone: 'bg-fuchsia-900/50 text-fuchsia-200', label: 'Expression input' },
};

export function InputTray({ inputs, className = '', onRemoveInput }: InputTrayProps) {
  const resolveSummary = (input: BuilderInput): string => {
    switch (input.sourceKind) {
      case 'enrichment':
        return input.path ? `${input.externalName ?? 'alias'}.${input.path}` : (input.externalName ?? '—');
      case 'constant':
        return input.constantName ?? '—';
      case 'static':
        return input.staticValue === undefined ? '—' : JSON.stringify(input.staticValue);
      case 'expression':
        return input.rawExpression ?? '—';
      default:
        return input.path ?? input.externalName ?? '—';
    }
  };

  return (
    <section className={className} data-testid="smart-input-tray" aria-label="Selected inputs">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Input tray</p>
        <p className="text-xs text-slate-500" data-testid="smart-input-tray-count">{inputs.length} selected</p>
      </div>

      {inputs.length === 0 ? (
        <div
          className="rounded border border-dashed border-slate-700 bg-slate-900/40 px-3 py-3 text-xs text-slate-400"
          data-testid="smart-input-tray-empty"
        >
          Click an input field on the left to start mapping this target.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="smart-input-tray-list">
          {inputs.map((input) => {
            const badge = SOURCE_KIND_BADGES[input.sourceKind];
            return (
              <li
                key={input.id}
                className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/60 px-2.5 py-2"
                data-testid={`smart-input-tray-item-${input.id}`}
              >
                <span
                  className={`inline-flex min-w-[2.7rem] justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.tone}`}
                  aria-label={badge.label}
                >
                  {badge.short}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-100" title={input.label}>{input.label}</p>
                  <p className="truncate font-mono text-[11px] text-slate-400" title={resolveSummary(input)}>
                    {resolveSummary(input)}
                  </p>
                </div>
                {onRemoveInput && (
                  <button
                    type="button"
                    data-testid={`smart-input-tray-remove-${input.id}`}
                    onClick={() => onRemoveInput(input.id)}
                    aria-label={`Remove input ${input.label}`}
                    className="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
