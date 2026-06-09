import { useRef, useState, type ChangeEvent } from 'react';

import { parseJsonSchema, parseXsd } from '../lib';
import { countAllNodes } from '../lib/tree-to-json-schema';

import { Button } from '@/components/Button';
import { useAdapter } from '@/lib/api';
import type { SchemaDetail, SchemaFormat } from '@/lib/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReplaceFileDialogProps {
  open: boolean;
  onClose: () => void;
  schemaId: string;
  currentFormat: SchemaFormat;
  /** Called after a successful replace with the updated SchemaDetail */
  onReplaced: (newDetail: SchemaDetail) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferFormatFromExtension(filename: string): SchemaFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'json-schema';
  if (lower.endsWith('.xsd')) return 'xsd';
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Two-step dialog for replacing schema content:
 *   Step 1: Confirmation message
 *   Step 2: File picker → parse → save → callback
 *
 * If parse fails, an inline error is shown and no save occurs.
 */
export function ReplaceFileDialog({
  open,
  onClose,
  schemaId,
  currentFormat,
  onReplaced,
}: ReplaceFileDialogProps) {
  const adapter = useAdapter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'confirm' | 'pick'>('confirm');
  const [isSaving, setIsSaving] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  function handleClose() {
    setStep('confirm');
    setParseError(null);
    onClose();
  }

  function handleConfirm() {
    setStep('pick');
    // Trigger the hidden file input immediately after step transition
    requestAnimationFrame(() => {
      fileInputRef.current?.click();
    });
  }

  async function handleFile(file: File) {
    setParseError(null);
    setIsSaving(true);

    try {
      const text = await file.text();
      const format = inferFormatFromExtension(file.name) ?? currentFormat;

      let content: Readonly<Record<string, unknown>> | string;
      let fieldCount: number;

      if (format === 'json-schema') {
        let parsed: Readonly<Record<string, unknown>>;
        try {
          parsed = JSON.parse(text) as Readonly<Record<string, unknown>>;
        } catch {
          throw new Error('File is not valid JSON.');
        }
        const tree = parseJsonSchema(parsed);
        fieldCount = countAllNodes(tree.nodes);
        content = parsed;
      } else {
        // xsd — parse to validate, derive field count from tree
        const tree = parseXsd(text);
        fieldCount = countAllNodes(tree.nodes);
        content = text;
      }

      const updatedMeta = await adapter.updateSchema(schemaId, { content, fieldCount, format });

      // Re-fetch the full detail (updatedMeta has metadata but not content)
      // We'll call getSchema to get the full SchemaDetail for onReplaced
      const updated = await adapter.getSchema(schemaId);

      // Suppress unused warning — updatedMeta is used implicitly via getSchema refresh
      void updatedMeta;

      onReplaced(updated);
      handleClose();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    // Reset input so the same file can be re-selected after an error
    e.target.value = '';
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="replace-schema-overlay"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-schema-dialog-title"
        data-testid="replace-schema-dialog"
        className="relative z-10 w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
      >
        <h2
          id="replace-schema-dialog-title"
          className="text-sm font-semibold text-slate-100"
        >
          Replace schema
        </h2>

        {step === 'confirm' ? (
          <>
            <p
              data-testid="replace-confirm-message"
              className="mt-2 text-sm text-slate-400"
            >
              This will replace the current schema content. Existing mappings will need
              re-validation.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                data-testid="replace-schema-confirm-button"
                onClick={handleConfirm}
              >
                Choose schema file
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-400">
              Select a <code>.json</code> or <code>.xsd</code> file to replace the
              schema content.
            </p>

            {parseError && (
              <p
                role="alert"
                data-testid="replace-parse-error"
                className="mt-2 text-sm text-red-400"
              >
                {parseError}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={isSaving}
                data-testid="replace-schema-pick-button"
                onClick={() => fileInputRef.current?.click()}
              >
                {isSaving ? 'Saving…' : 'Choose schema file'}
              </Button>
            </div>
          </>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.xsd"
          className="hidden"
          data-testid="replace-schema-file-input"
          onChange={handleFileInputChange}
        />
      </div>
    </div>
  );
}
