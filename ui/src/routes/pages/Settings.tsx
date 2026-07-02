import { useEditorPanelLayoutPreference } from '@/features/mappings/lib';

export default function Settings() {
  const { panelLayout, setPanelLayout } = useEditorPanelLayoutPreference();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-6" data-testid="page-settings">
      <h1 className="text-2xl font-semibold text-slate-100">Settings</h1>

      <section className="mt-8 rounded border border-slate-800 bg-slate-900/40 p-5" data-testid="editor-preferences-section">
        <h2 className="text-base font-semibold text-slate-100">Editor preferences</h2>
        <div className="mt-2 border-t border-slate-800" />

        <div className="mt-4 max-w-xl space-y-2">
          <label htmlFor="editor-panel-layout" className="block text-sm font-medium text-slate-200">
            Panel layout
          </label>
          <select
            id="editor-panel-layout"
            data-testid="editor-panel-layout-select"
            value={panelLayout}
            onChange={(event) => {
              const next = event.target.value === 'input-first' ? 'input-first' : 'target-first';
              setPanelLayout(next);
            }}
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
          >
            <option value="target-first">Target first</option>
            <option value="input-first">Input first</option>
          </select>
          <p className="text-sm text-slate-400" data-testid="editor-panel-layout-help">
            Choose how the Mapping Editor arranges the Target Mapping Fields and Input Fields panels.
            You can also change this from the Mapping Editor.
          </p>
        </div>
      </section>
    </div>
  );
}
