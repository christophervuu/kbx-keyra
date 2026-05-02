export interface PanelPlaceholderProps {
  /** Display name for the placeholder panel */
  name: string;
}

/**
 * Generic placeholder component for inactive editor panels.
 * Shows the panel name in a bordered, labeled container.
 * These will be replaced by real panel components in future tasks.
 */
export function PanelPlaceholder({ name }: PanelPlaceholderProps) {
  return (
    <div
      className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-700 bg-slate-900/50 p-4"
      data-testid={`panel-placeholder-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`}
    >
      <span className="text-sm text-slate-500">{name}</span>
    </div>
  );
}
