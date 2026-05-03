import type { MappingConfigOptions, ParsedSchema } from '@/lib/types/domain';
import { InheritanceIndicator } from './InheritanceIndicator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigurationPanelProps {
  /** Current (potentially unsaved) config options */
  configOptions: MappingConfigOptions;
  /** Callback to merge partial config option changes */
  onUpdateConfig: (partial: Partial<MappingConfigOptions>) => void;
  /** Parsed target schema, used by the null-subtree section for autocomplete */
  parsedTargetSchema: ParsedSchema | null;

  // ---------------------------------------------------------------------------
  // Section content slots — filled by T-03 through T-06.
  // Each slot receives a ReactNode so the panel shell doesn't need to know about
  // section internals. Until those tasks run, the panel renders a placeholder.
  // ---------------------------------------------------------------------------
  unmappedTargetsContent?: React.ReactNode;
  nullSubtreesContent?: React.ReactNode;
  constantsContent?: React.ReactNode;
  externalSourcesContent?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  testId: string;
  isCustom: boolean;
  onReset: () => void;
  children: React.ReactNode;
}

function ConfigSection({ title, testId, isCustom, onReset, children }: SectionProps) {
  return (
    <section
      className="border-b border-slate-800 last:border-b-0"
      data-testid={testId}
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-medium text-slate-200">{title}</h3>
        <InheritanceIndicator isCustom={isCustom} onReset={onReset} />
      </div>

      {/* Section body */}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Default placeholder for unfilled slots
// ---------------------------------------------------------------------------

function SectionPlaceholder({ label }: { label: string }) {
  return (
    <p className="text-xs text-slate-600 italic" data-testid={`section-placeholder-${label}`}>
      {label} — content coming soon
    </p>
  );
}

// ---------------------------------------------------------------------------
// ConfigurationPanel
// ---------------------------------------------------------------------------

/**
 * Panel 7 — Configuration Panel shell.
 *
 * Renders a scrollable column of 4 config sections. Each section has a header
 * with a title and an inheritance indicator. Section content is provided via
 * slot props (filled in by T-03 through T-06). Until those tasks run, each
 * section renders a placeholder.
 */
export function ConfigurationPanel({
  configOptions,
  onUpdateConfig,
  unmappedTargetsContent,
  nullSubtreesContent,
  constantsContent,
  externalSourcesContent,
}: ConfigurationPanelProps) {
  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-slate-950"
      data-testid="configuration-panel"
    >
      {/* Panel header */}
      <div className="flex shrink-0 items-center border-b border-slate-800 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-100">Configuration</h2>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Unmapped Targets Strategy */}
        <ConfigSection
          title="Unmapped Targets Strategy"
          testId="config-section-unmapped-targets"
          isCustom={configOptions.unmappedTargets !== undefined}
          onReset={() => onUpdateConfig({ unmappedTargets: undefined })}
        >
          {unmappedTargetsContent ?? (
            <SectionPlaceholder label="unmapped-targets" />
          )}
        </ConfigSection>

        {/* Null-out Subtrees */}
        <ConfigSection
          title="Null-out Subtrees"
          testId="config-section-null-subtrees"
          isCustom={
            configOptions.nullSubtrees !== undefined &&
            configOptions.nullSubtrees.length > 0
          }
          onReset={() => onUpdateConfig({ nullSubtrees: undefined })}
        >
          {nullSubtreesContent ?? (
            <SectionPlaceholder label="null-subtrees" />
          )}
        </ConfigSection>

        {/* Constants */}
        <ConfigSection
          title="Constants"
          testId="config-section-constants"
          isCustom={
            configOptions.constants !== undefined &&
            Object.keys(configOptions.constants).length > 0
          }
          onReset={() => onUpdateConfig({ constants: undefined })}
        >
          {constantsContent ?? (
            <SectionPlaceholder label="constants" />
          )}
        </ConfigSection>

        {/* External Sources */}
        <ConfigSection
          title="External Sources"
          testId="config-section-external-sources"
          isCustom={
            configOptions.externalSources !== undefined &&
            configOptions.externalSources.length > 0
          }
          onReset={() => onUpdateConfig({ externalSources: undefined })}
        >
          {externalSourcesContent ?? (
            <SectionPlaceholder label="external-sources" />
          )}
        </ConfigSection>
      </div>
    </div>
  );
}
