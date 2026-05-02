import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { useAdapter } from '@/lib/api';
import { Button } from '@/components/Button';
import type { SchemaRef } from '@/lib/types/domain';
import { detectSchemaFormat } from '../lib/detect-schema-format';
import type { DetectedFormat } from '../lib/detect-schema-format';
import { parseJsonSchema, parseXsd, parseInferredSchema } from '@/features/schemas';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function formatLabel(fmt: DetectedFormat): string {
  switch (fmt) {
    case 'json-schema': return 'JSON Schema';
    case 'xsd': return 'XSD';
    case 'sample-json': return 'Sample JSON';
    case 'sample-xml': return 'Sample XML';
    default: return 'Unknown';
  }
}

function isInferred(fmt: DetectedFormat): boolean {
  return fmt === 'sample-json' || fmt === 'sample-xml';
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SchemaScope = 'global' | 'project-level';

export interface SchemaUploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after schema is created and ref is ready to be added to the project */
  onSchemaCreated: (ref: SchemaRef) => Promise<void>;
}

interface ParsedFileInfo {
  filename: string;
  content: string;
  format: DetectedFormat;
  parsedContent: unknown;
  fieldCount: number;
  parseError: boolean;
  isInferredFlag: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal dialog for uploading a schema file, detecting its format, and
 * persisting it via the adapter.
 */
export function SchemaUploadDialog({ open, onClose, onSchemaCreated }: SchemaUploadDialogProps) {
  const adapter = useAdapter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const [fileInfo, setFileInfo] = useState<ParsedFileInfo | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [scope, setScope] = useState<SchemaScope>('project-level');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Focus management
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        if (dialogRef.current) {
          const el = getFocusable(dialogRef.current)[0];
          el?.focus();
        }
      });
    } else {
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusable(dialogRef.current);
        if (!focusable.length) return;
        if (e.shiftKey) {
          if (document.activeElement === focusable[0]) {
            e.preventDefault();
            focusable[focusable.length - 1].focus();
          }
        } else {
          if (document.activeElement === focusable[focusable.length - 1]) {
            e.preventDefault();
            focusable[0].focus();
          }
        }
      }
    },
    [onClose],
  );

  // -------------------------------------------------------------------------
  // File selection
  // -------------------------------------------------------------------------

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileInfo(null);
    setFileError(null);
    setUploadError(null);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;

      if (!text || text.trim().length === 0) {
        setFileError('File is empty');
        return;
      }

      const detection = detectSchemaFormat(text);

      if (detection.format === 'unknown') {
        setFileError(
          'Could not determine file format. Supported: JSON Schema (.json), XSD (.xsd), sample JSON/XML.',
        );
        return;
      }

      let fieldCount = 0;
      let parseError = false;
      const inferredFlag = isInferred(detection.format);

      try {
        if (detection.format === 'json-schema') {
          const parsed = parseJsonSchema(detection.parsedContent as object);
          fieldCount = parsed.nodes.length;
        } else if (detection.format === 'xsd') {
          const parsed = parseXsd(text);
          fieldCount = parsed.nodes.length;
        } else {
          // sample-json or sample-xml — use inferred schema parser
          const parsed = parseInferredSchema(
            detection.format === 'sample-json'
              ? JSON.stringify(detection.parsedContent)
              : text,
          );
          fieldCount = parsed.nodes.length;
        }
      } catch {
        parseError = true;
        fieldCount = 0;
      }

      setFileInfo({
        filename: file.name,
        content: text,
        format: detection.format,
        parsedContent: detection.parsedContent,
        fieldCount,
        parseError,
        isInferredFlag: inferredFlag,
      });
    };

    reader.onerror = () => {
      setFileError('Could not read file. Please try again.');
    };

    reader.readAsText(file);
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  async function handleUpload() {
    if (!fileInfo) return;

    setUploadError(null);
    setUploading(true);

    try {
      // Determine schema format for adapter
      const adapterFormat =
        fileInfo.format === 'json-schema'
          ? 'json-schema'
          : fileInfo.format === 'xsd'
            ? 'xsd'
            : 'json-schema'; // inferred sample data stored as json-schema

      const content =
        fileInfo.format === 'xsd' || fileInfo.format === 'sample-xml'
          ? fileInfo.content
          : (fileInfo.parsedContent as Record<string, unknown>);

      const created = await adapter.createSchema({
        name: stripExtension(fileInfo.filename),
        format: adapterFormat,
        origin: scope === 'global' ? 'library' : 'local',
        content: content as Record<string, unknown>,
        source: { type: 'upload' },
      });

      const ref: SchemaRef = { schemaId: created.schemaId, type: 'local' };
      await onSchemaCreated(ref);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="schema-upload-dialog-overlay"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schema-upload-title"
        className="relative z-10 w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
        onKeyDown={handleKeyDown}
        data-testid="schema-upload-dialog"
      >
        <h2 id="schema-upload-title" className="mb-4 text-sm font-semibold text-slate-100">
          Upload Schema
        </h2>

        {/* File picker */}
        <div className="mb-4">
          <label htmlFor="schema-file-input" className="mb-1 block text-xs font-medium text-slate-400">
            Select file
          </label>
          <input
            id="schema-file-input"
            type="file"
            accept=".json,.xsd,.xml"
            onChange={handleFileChange}
            className="w-full text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-xs file:text-slate-200 hover:file:bg-slate-600"
            data-testid="file-input"
          />
        </div>

        {/* File error */}
        {fileError && (
          <p
            role="alert"
            className="mb-3 text-xs text-red-400"
            data-testid="file-error"
          >
            {fileError}
          </p>
        )}

        {/* File info */}
        {fileInfo && (
          <div className="mb-4 rounded-md border border-slate-700 bg-slate-800 p-3" data-testid="file-info">
            <p className="mb-1 text-xs text-slate-300">
              <span className="font-medium">File:</span> {fileInfo.filename}
            </p>

            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs text-slate-400">Format:</span>
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                  fileInfo.isInferredFlag
                    ? 'bg-yellow-900 text-yellow-300'
                    : 'bg-blue-900 text-blue-300'
                }`}
                data-testid="format-badge"
              >
                {formatLabel(fileInfo.format)}
              </span>
            </div>

            {fileInfo.isInferredFlag && (
              <p className="mb-1 text-xs text-yellow-400" data-testid="inferred-warning">
                ⚠ This file will be treated as sample data. Schema structure will be inferred.
              </p>
            )}

            {fileInfo.parseError ? (
              <p className="text-xs text-yellow-400" data-testid="parse-warning">
                ⚠ Could not parse schema structure. Field count will be estimated.
              </p>
            ) : (
              <p className="text-xs text-slate-400" data-testid="field-count">
                {fileInfo.fieldCount} field{fileInfo.fieldCount !== 1 ? 's' : ''} detected
              </p>
            )}
          </div>
        )}

        {/* Scope selection */}
        <fieldset className="mb-4">
          <legend className="mb-2 text-xs font-medium text-slate-400">Schema Scope</legend>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="schema-scope"
                value="global"
                checked={scope === 'global'}
                onChange={() => setScope('global')}
                className="accent-blue-500"
                data-testid="scope-global"
              />
              Global — available to all projects
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="schema-scope"
                value="project-level"
                checked={scope === 'project-level'}
                onChange={() => setScope('project-level')}
                className="accent-blue-500"
                data-testid="scope-project-level"
              />
              Project-Level — only available in this project
            </label>
          </div>
        </fieldset>

        {/* Upload error */}
        {uploadError && (
          <p
            role="alert"
            className="mb-3 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-xs text-red-400"
            data-testid="upload-error"
          >
            {uploadError}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="cancel-button"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={uploading}
            disabled={!fileInfo}
            onClick={() => void handleUpload()}
            data-testid="upload-button"
          >
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}
