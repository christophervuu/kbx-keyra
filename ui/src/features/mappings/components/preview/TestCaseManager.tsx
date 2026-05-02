import { useState } from 'react';

import type { TestCase } from '@/lib/types/domain';
import { useTestCases } from '../../hooks/use-test-cases';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TestCaseManagerProps {
  /** Mapping ID used to scope localStorage persistence. */
  mappingId: string;
  /**
   * Current source data raw string (valid JSON) to include when saving.
   * If null, saving is disabled.
   */
  sourceDataRaw: string | null;
  /**
   * Current expected output raw string from the Diff tab (valid JSON), or
   * null/undefined if not provided or invalid.
   */
  expectedOutputRaw?: string | null;
  /**
   * Called when the user selects a test case to load. The parent should
   * apply `testCase.sourceData` to the source data input and
   * `testCase.expectedOutput` to the diff tab expected output field.
   */
  onLoad: (testCase: TestCase) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Test Case Manager — provides save, load, and delete operations for named
 * test cases scoped to a mapping. Sits in the PreviewPanel toolbar area.
 *
 * - Dropdown select shows saved test cases; selecting one triggers `onLoad`.
 * - "Save" button reveals an inline name input and "Confirm" button.
 * - Delete (×) button appears inline in the select via a separate control.
 * - Quota exceeded errors are displayed inline on save failure.
 */
export function TestCaseManager({
  mappingId,
  sourceDataRaw,
  expectedOutputRaw,
  onLoad,
}: TestCaseManagerProps) {
  const { testCases, saveTestCase, loadTestCase, deleteTestCase } = useTestCases(mappingId);

  // Save flow state
  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Currently selected ID in the dropdown (for load/delete)
  const [selectedId, setSelectedId] = useState('');

  function handleSaveClick() {
    setIsSaving(true);
    setSaveName('');
    setSaveError(null);
  }

  function handleSaveCancel() {
    setIsSaving(false);
    setSaveName('');
    setSaveError(null);
  }

  function handleSaveConfirm() {
    const trimmed = saveName.trim();
    if (trimmed === '' || sourceDataRaw === null) return;

    const result = saveTestCase({
      name: trimmed,
      sourceData: sourceDataRaw,
      ...(expectedOutputRaw !== null && expectedOutputRaw !== undefined
        ? { expectedOutput: expectedOutputRaw }
        : {}),
    });

    if (result.success) {
      setIsSaving(false);
      setSaveName('');
      setSaveError(null);
    } else {
      setSaveError(result.error ?? 'Unable to save test case — storage full');
    }
  }

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedId(e.target.value);
  }

  function handleLoad() {
    if (selectedId === '') return;
    const tc = loadTestCase(selectedId);
    if (tc !== null) {
      onLoad(tc);
    }
  }

  function handleDelete(id: string) {
    deleteTestCase(id);
    if (selectedId === id) {
      setSelectedId('');
    }
  }

  const canSave = sourceDataRaw !== null;
  const canLoad = selectedId !== '';

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-700 px-3 py-1.5"
      data-testid="test-case-manager"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Test case selector + Load + Delete                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <select
          value={selectedId}
          onChange={handleSelectChange}
          aria-label="Saved test cases"
          data-testid="test-case-select"
          className={[
            'min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
          ].join(' ')}
        >
          <option value="">
            {testCases.length === 0 ? 'No saved test cases' : '— select a test case —'}
          </option>
          {testCases.map((tc) => (
            <option key={tc.id} value={tc.id}>
              {tc.name}
            </option>
          ))}
        </select>

        {/* Load button */}
        <button
          type="button"
          onClick={handleLoad}
          disabled={!canLoad}
          aria-disabled={!canLoad}
          data-testid="load-test-case-button"
          className={[
            'rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            canLoad
              ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
              : 'cursor-not-allowed bg-zinc-800 text-zinc-600',
          ].join(' ')}
        >
          Load
        </button>

        {/* Delete button — only when a test case is selected */}
        {canLoad && (
          <button
            type="button"
            onClick={() => { handleDelete(selectedId); }}
            aria-label="Delete selected test case"
            data-testid="delete-test-case-button"
            className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-red-900/40 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            ×
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Save flow                                                            */}
      {/* ------------------------------------------------------------------ */}
      {!isSaving ? (
        <button
          type="button"
          onClick={handleSaveClick}
          disabled={!canSave}
          aria-disabled={!canSave}
          data-testid="save-test-case-button"
          className={[
            'rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            canSave
              ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
              : 'cursor-not-allowed bg-zinc-800 text-zinc-600',
          ].join(' ')}
          title={!canSave ? 'Enter valid source data before saving' : undefined}
        >
          Save
        </button>
      ) : (
        <div className="flex flex-col gap-1" data-testid="save-name-form">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={saveName}
              onChange={(e) => { setSaveName(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveConfirm();
                if (e.key === 'Escape') handleSaveCancel();
              }}
              placeholder="Test case name…"
              aria-label="Test case name"
              data-testid="save-name-input"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            />
            <button
              type="button"
              onClick={handleSaveConfirm}
              disabled={saveName.trim() === '' || !canSave}
              aria-disabled={saveName.trim() === '' || !canSave}
              data-testid="save-confirm-button"
              className={[
                'rounded px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                saveName.trim() !== '' && canSave
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'cursor-not-allowed bg-zinc-700 text-zinc-500',
              ].join(' ')}
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={handleSaveCancel}
              aria-label="Cancel save"
              data-testid="save-cancel-button"
              className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              ✕
            </button>
          </div>

          {/* Quota / save error */}
          {saveError !== null && (
            <p
              role="alert"
              data-testid="save-error-message"
              className="text-xs text-red-400"
            >
              {saveError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
