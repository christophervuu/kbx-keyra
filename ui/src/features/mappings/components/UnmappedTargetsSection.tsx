import type { MappingConfigOptions } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnmappedTargetsSectionProps {
  /** Current config options — reads `unmappedTargets` field. */
  configOptions: MappingConfigOptions;
  /** Callback to update config; called with `{ unmappedTargets: value }`. */
  onUpdateConfig: (partial: Partial<MappingConfigOptions>) => void;
}

type UnmappedTargetsValue = 'null' | 'omit' | 'error';

// ---------------------------------------------------------------------------
// Option definitions
// ---------------------------------------------------------------------------

interface StrategyOption {
  value: UnmappedTargetsValue;
  label: string;
  description: string;
}

const STRATEGY_OPTIONS: StrategyOption[] = [
  {
    value: 'null',
    label: 'Null (default)',
    description: 'Set unmapped fields to null in output',
  },
  {
    value: 'omit',
    label: 'Omit',
    description: 'Exclude unmapped fields from output entirely',
  },
  {
    value: 'error',
    label: 'Error',
    description: 'Produce validation errors for unmapped fields',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * "Unmapped Targets Strategy" section content for ConfigurationPanel.
 *
 * Renders a compact vertical radio group with three options: null, omit, error.
 * The current selection is derived from `configOptions.unmappedTargets`; when
 * undefined the engine default ("null") is shown as selected.
 */
export function UnmappedTargetsSection({
  configOptions,
  onUpdateConfig,
}: UnmappedTargetsSectionProps) {
  // undefined → engine default is "null"
  const selected: UnmappedTargetsValue = configOptions.unmappedTargets ?? 'null';

  function handleChange(value: UnmappedTargetsValue) {
    onUpdateConfig({ unmappedTargets: value });
  }

  return (
    <fieldset data-testid="unmapped-targets-fieldset">
      <legend className="sr-only">Unmapped targets strategy</legend>

      <div className="flex flex-col gap-2">
        {STRATEGY_OPTIONS.map((option) => {
          const inputId = `unmapped-targets-${option.value}`;
          const isChecked = selected === option.value;

          return (
            <label
              key={option.value}
              htmlFor={inputId}
              className="flex cursor-pointer items-start gap-2.5"
              data-testid={`unmapped-targets-option-${option.value}`}
            >
              <input
                type="radio"
                id={inputId}
                name="unmapped-targets"
                value={option.value}
                checked={isChecked}
                onChange={() => handleChange(option.value)}
                className="mt-0.5 shrink-0 accent-blue-500"
                aria-describedby={`${inputId}-desc`}
              />
              <span className="flex flex-col">
                <span className="text-xs font-medium text-slate-200">
                  {option.label}
                </span>
                <span
                  id={`${inputId}-desc`}
                  className="text-xs text-slate-500"
                >
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
