import type { BuilderInput } from '../lib/smart-builder-state';

interface InputTrayProps {
  readonly inputs: readonly BuilderInput[];
  readonly className?: string;
  readonly onRemoveInput?: (inputId: string) => void;
  readonly onToggleAddInput?: () => void;
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

const TYPE_BADGES: Record<BuilderInput['valueType'], { short: string; tone: string; label: string }> = {
  string: { short: 'STR', tone: 'bg-blue-900/60 text-blue-300', label: 'String' },
  number: { short: 'NUM', tone: 'bg-green-900/60 text-green-300', label: 'Number' },
  integer: { short: 'INT', tone: 'bg-green-900/60 text-green-300', label: 'Integer' },
  boolean: { short: 'BOL', tone: 'bg-purple-900/60 text-purple-300', label: 'Boolean' },
  object: { short: 'OBJ', tone: 'bg-slate-700/80 text-slate-300', label: 'Object' },
  array: { short: 'ARR', tone: 'bg-amber-900/60 text-amber-300', label: 'Array' },
  null: { short: 'NUL', tone: 'bg-slate-800/60 text-slate-400', label: 'Null' },
  any: { short: 'ANY', tone: 'bg-slate-700/80 text-slate-300', label: 'Any' },
  union: { short: 'UNI', tone: 'bg-slate-700/80 text-slate-300', label: 'Union' },
  unknown: { short: 'UNK', tone: 'bg-slate-700/80 text-slate-300', label: 'Unknown' },
};

export function InputTray({
  inputs,
  className = '',
  onRemoveInput,
  onToggleAddInput,
}: InputTrayProps) {
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
        {onToggleAddInput && (
          <button
            type="button"
            data-testid="smart-add-input-toggle"
            className="rounded border border-slate-700 px-2 py-1.5 text-xs text-slate-200 hover:border-slate-500"
            onClick={onToggleAddInput}
          >
            Add Input
          </button>
        )}
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
            const sourceBadge = SOURCE_KIND_BADGES[input.sourceKind];
            const typeBadge = TYPE_BADGES[input.valueType] ?? TYPE_BADGES.unknown;
            return (
              <li
                key={input.id}
                className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900/60 px-2.5 py-2"
                data-testid={`smart-input-tray-item-${input.id}`}
              >
                <span
                  data-testid={`smart-input-tray-type-${input.id}`}
                  className={`inline-flex min-w-[2.7rem] justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeBadge.tone}`}
                  aria-label={`Type: ${typeBadge.label}`}
                >
                  {typeBadge.short}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-100" title={input.label}>{input.label}</p>
                  <p className="truncate font-mono text-[11px] text-slate-400" title={resolveSummary(input)}>
                    {resolveSummary(input)}
                  </p>
                </div>
                <span
                  data-testid={`smart-input-tray-source-kind-${input.id}`}
                  className={`inline-flex min-w-[2.7rem] shrink-0 justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadge.tone}`}
                  aria-label={sourceBadge.label}
                >
                  {sourceBadge.short}
                </span>
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
