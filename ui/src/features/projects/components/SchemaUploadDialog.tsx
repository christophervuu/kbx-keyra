import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { useIngestionPolling } from '@/features/schemas/hooks/use-ingestion-polling';

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

function defaultPasteName(fmt: DetectedFormat): string {
  switch (fmt) {
    case 'json-schema': return 'Pasted JSON Schema';
    case 'sample-json': return 'Pasted Sample JSON';
    default: return 'Pasted Schema';
  }
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

type InputMode = 'file' | 'paste';

export interface SchemaUploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after schema is created and ref is ready to be added to the project */
  onSchemaCreated: (ref: SchemaRef) => Promise<void>;
}

interface ParsedFileInfo {
  filename?: string;
  content: string;
  format: DetectedFormat;
  parsedContent: unknown;
  fieldCount: number;
  parseError: boolean;
  isInferredFlag: boolean;
}

// ---------------------------------------------------------------------------
// Shared parse helper
// ---------------------------------------------------------------------------

function parseContentInfo(
  text: string,
  filename?: string,
): { info: ParsedFileInfo } | { error: string } {
  const detection = detectSchemaFormat(text, filename);

  if (detection.format === 'unknown') {
    return {
      error: 'Could not determine file format. Supported: JSON Schema (.json), XSD (.xsd), sample JSON/XML.',
    };
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

  return {
    info: {
      filename,
      content: text,
      format: detection.format,
      parsedContent: detection.parsedContent,
      fieldCount,
      parseError,
      isInferredFlag: inferredFlag,
    },
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ContentInfoPanelProps {
  info: ParsedFileInfo;
  testIdPrefix?: string;
}

function ContentInfoPanel({ info, testIdPrefix = '' }: ContentInfoPanelProps) {
  return (
    <div
      className="mb-4 rounded-md border border-slate-700 bg-slate-800 p-3"
      data-testid={testIdPrefix ? `${testIdPrefix}-info` : 'file-info'}
    >
      {info.filename && (
        <p className="mb-1 text-xs text-slate-300">
          <span className="font-medium">File:</span> {info.filename}
        </p>
      )}

      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs text-slate-400">Format:</span>
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
            info.isInferredFlag
              ? 'bg-yellow-900 text-yellow-300'
              : 'bg-blue-900 text-blue-300'
          }`}
          data-testid="format-badge"
        >
          {formatLabel(info.format)}
        </span>
      </div>

      {info.isInferredFlag && (
        <p className="mb-1 text-xs text-yellow-400" data-testid="inferred-warning">
          ⚠ This file will be treated as sample data. Schema structure will be inferred.
        </p>
      )}

      {info.parseError ? (
        <p className="text-xs text-yellow-400" data-testid="parse-warning">
          ⚠ Could not parse schema structure. Field count will be estimated.
        </p>
      ) : (
        <p className="text-xs text-slate-400" data-testid="field-count">
          {info.fieldCount} field{info.fieldCount !== 1 ? 's' : ''} detected
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal dialog for uploading or pasting a schema, detecting its format, and
 * persisting it via the adapter.
 */
export function SchemaUploadDialog({ open, onClose, onSchemaCreated }: SchemaUploadDialogProps) {
  const adapter = useAdapter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>('file');

  // File mode state
  const [fileInfo, setFileInfo] = useState<ParsedFileInfo | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Paste mode state
  const [pasteText, setPasteText] = useState('');
  const [pasteInfo, setPasteInfo] = useState<ParsedFileInfo | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const pasteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared state
  const [schemaName, setSchemaName] = useState('');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [scope, setScope] = useState<SchemaScope>('project-level');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Ingestion polling (202 async flow)
  const polling = useIngestionPolling();
  // Ref to the SchemaRef produced after createSchema, used by polling success handler
  const pendingSchemaRefRef = useRef<SchemaRef | null>(null);

  // Reset all state when dialog closes
  useEffect(() => {
    if (!open) {
      if (pasteDebounceRef.current !== null) {
        clearTimeout(pasteDebounceRef.current);
        pasteDebounceRef.current = null;
      }
      setInputMode('file');
      setFileInfo(null);
      setFileError(null);
      setPasteText('');
      setPasteInfo(null);
      setPasteError(null);
      setSchemaName('');
      setNameManuallyEdited(false);
      setScope('project-level');
      setUploading(false);
      setUploadError(null);
      polling.reset();
      pendingSchemaRefRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- polling.reset is stable; including `polling` object would cause infinite loop
  }, [open]);

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
    // Always reset name on new file selection
    setSchemaName('');
    setNameManuallyEdited(false);

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;

      if (!text || text.trim().length === 0) {
        setFileError('File is empty');
        return;
      }

      const result = parseContentInfo(text, file.name);
      if ('error' in result) {
        setFileError(result.error);
      } else {
        setFileInfo(result.info);
        setSchemaName(stripExtension(file.name));
      }
    };

    reader.onerror = () => {
      setFileError('Could not read file. Please try again.');
    };

    reader.readAsText(file);
  }

  // -------------------------------------------------------------------------
  // Paste analysis
  // -------------------------------------------------------------------------

  function analyzePasteContent(text: string) {
    setPasteInfo(null);
    setPasteError(null);
    setUploadError(null);

    if (!text.trim()) return;

    const result = parseContentInfo(text);
    if ('error' in result) {
      // For paste mode, reject XSD/XML formats with a clearer message
      if (result.error.includes('Supported:')) {
        setPasteError('Could not determine format. Paste valid JSON Schema or sample JSON data.');
      } else {
        setPasteError(result.error);
      }
    } else if (result.info.format === 'xsd' || result.info.format === 'sample-xml') {
      setPasteError('Could not determine format. Paste valid JSON Schema or sample JSON data.');
    } else {
      setPasteInfo(result.info);
      if (!nameManuallyEdited) {
        if (result.info.format === 'json-schema') {
          // For JSON Schema: only set name from title — fast-path already handled
          // the empty-string case, so don't overwrite with a generic fallback.
          try {
            const parsed = result.info.parsedContent as Record<string, unknown>;
            if (typeof parsed.title === 'string' && parsed.title.trim()) {
              setSchemaName(parsed.title.trim());
            }
            // No else: fast-path already set '' for no-title case
          } catch {
            // ignore
          }
        } else {
          // For non-JSON-Schema formats (sample-json), fast-path can't extract a
          // title, so apply the generic default name.
          setSchemaName(defaultPasteName(result.info.format));
        }
      }
    }
  }

  function handlePasteTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setPasteText(text);
    // Clear previous analysis when content changes
    if (pasteInfo || pasteError) {
      setPasteInfo(null);
      setPasteError(null);
    }
    // Auto-fill Schema Name from JSON Schema title immediately on change
    if (!nameManuallyEdited) {
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (typeof parsed.title === 'string' && parsed.title.trim()) {
          setSchemaName(parsed.title.trim());
        } else {
          setSchemaName('');
        }
      } catch {
        setSchemaName('');
      }
    }
    // Debounce full content analysis (format detection + field count)
    if (pasteDebounceRef.current !== null) {
      clearTimeout(pasteDebounceRef.current);
    }
    if (text.trim()) {
      pasteDebounceRef.current = setTimeout(() => {
        pasteDebounceRef.current = null;
        analyzePasteContent(text);
      }, 300);
    }
  }

  function handlePasteBlur() {
    // If debounce hasn't fired yet, run analysis immediately
    if (pasteDebounceRef.current !== null) {
      clearTimeout(pasteDebounceRef.current);
      pasteDebounceRef.current = null;
      if (pasteText.trim()) {
        analyzePasteContent(pasteText);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  async function handleUpload() {
    const activeInfo = inputMode === 'file' ? fileInfo : pasteInfo;
    if (!activeInfo) return;

    setUploadError(null);
    setUploading(true);

    try {
      const adapterFormat =
        activeInfo.format === 'json-schema'
          ? 'json-schema'
          : activeInfo.format === 'xsd'
            ? 'xsd'
            : activeInfo.format === 'sample-xml'
              ? 'xsd'
              : 'json-schema'; // inferred sample data retains engine-compatible format

      const content =
        activeInfo.format === 'xsd' || activeInfo.format === 'sample-xml'
          ? activeInfo.content
          : activeInfo.format === 'sample-json'
            ? activeInfo.content
            : (activeInfo.parsedContent as Record<string, unknown>);

      const created = await adapter.createSchema({
        name: schemaName.trim(),
        format: adapterFormat,
        origin: scope === 'global' ? 'library' : 'local',
        content: content,
        fieldCount: activeInfo.fieldCount,
        inferred: activeInfo.isInferredFlag,
        source: { type: 'upload' },
      });

      if (created.status === 'ingesting') {
        // 202 async ingestion path — start polling
        const ref: SchemaRef = { schemaId: created.schemaId, type: 'local' };
        pendingSchemaRefRef.current = ref;
        polling.startPolling(created.schemaId);
        // Don't close yet — wait for polling to resolve
      } else {
        // 201 immediate success path
        const ref: SchemaRef = { schemaId: created.schemaId, type: 'local' };
        await onSchemaCreated(ref);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  }

  // Handle polling resolution
  useEffect(() => {
    if (polling.status === 'ready' && pendingSchemaRefRef.current) {
      const ref = pendingSchemaRefRef.current;
      pendingSchemaRefRef.current = null;
      void onSchemaCreated(ref).then(() => onClose());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onSchemaCreated/onClose are stable props; polling.status is the trigger
  }, [polling.status]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const activeInfo = inputMode === 'file' ? fileInfo : pasteInfo;
  const isSubmitEnabled = activeInfo !== null && schemaName.trim().length > 0 && !uploading && polling.status === 'idle';
  const isPolling = polling.status === 'polling';
  const isPollingError = polling.status === 'error';
  const isPollingTimeout = polling.status === 'timeout';

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
          Add Schema
        </h2>

        {/* Mode toggle */}
        <div
          role="tablist"
          aria-label="Input method"
          className="mb-4 flex rounded-md border border-slate-700 bg-slate-800 p-0.5"
          data-testid="mode-toggle"
        >
          <button
            role="tab"
            type="button"
            aria-selected={inputMode === 'file'}
            onClick={() => setInputMode('file')}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
              inputMode === 'file'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-300'
            }`}
            data-testid="mode-tab-file"
          >
            Upload File
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={inputMode === 'paste'}
            onClick={() => setInputMode('paste')}
            className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
              inputMode === 'paste'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-slate-300'
            }`}
            data-testid="mode-tab-paste"
          >
            Paste Content
          </button>
        </div>

        {/* File mode */}
        {inputMode === 'file' && (
          <>
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

            {fileError && (
              <p
                role="alert"
                className="mb-3 text-xs text-red-400"
                data-testid="file-error"
              >
                {fileError}
              </p>
            )}

            {fileInfo && <ContentInfoPanel info={fileInfo} />}
          </>
        )}

        {/* Paste mode */}
        {inputMode === 'paste' && (
          <>
            <div className="mb-4">
              <label htmlFor="schema-paste-input" className="mb-1 block text-xs font-medium text-slate-400">
                Paste content
              </label>
              <textarea
                id="schema-paste-input"
                value={pasteText}
                onChange={handlePasteTextChange}
                onBlur={handlePasteBlur}
                placeholder="Paste JSON Schema or sample JSON data..."
                rows={6}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="paste-input"
              />
            </div>

            {pasteError && (
              <p
                role="alert"
                className="mb-3 text-xs text-red-400"
                data-testid="paste-error"
              >
                {pasteError}
              </p>
            )}

            {pasteInfo && <ContentInfoPanel info={pasteInfo} testIdPrefix="paste" />}
          </>
        )}

        {/* Schema Name */}
        <div className="mb-4">
          <label htmlFor="schema-name-input" className="mb-1 block text-xs font-medium text-slate-400">
            Schema Name
          </label>
          <input
            id="schema-name-input"
            type="text"
            value={schemaName}
            onChange={(e) => {
              setSchemaName(e.target.value);
              setNameManuallyEdited(true);
            }}
            placeholder="Enter a name for this schema"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            data-testid="schema-name-input"
          />
        </div>

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

        {/* Polling: processing state */}
        {isPolling && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 flex items-center gap-3 rounded-md border border-blue-800 bg-blue-950 px-3 py-3"
            data-testid="ingestion-processing"
          >
            <svg
              className="h-4 w-4 animate-spin text-blue-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-xs text-blue-300">Processing schema… This may take a moment.</p>
          </div>
        )}

        {/* Polling: error state */}
        {isPollingError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-800 bg-red-950 px-3 py-3"
            data-testid="ingestion-error"
          >
            <p className="mb-2 text-xs text-red-400">
              {polling.error?.message ?? 'Schema processing failed. Please try uploading again.'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => polling.reset()}
              data-testid="ingestion-retry-button"
            >
              Try uploading again
            </Button>
          </div>
        )}

        {/* Polling: timeout state */}
        {isPollingTimeout && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-yellow-800 bg-yellow-950 px-3 py-3"
            data-testid="ingestion-timeout"
          >
            <p className="text-xs text-yellow-400">
              Processing is taking longer than expected. Refresh to check status.
            </p>
          </div>
        )}

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
            loading={uploading || isPolling}
            disabled={!isSubmitEnabled}
            onClick={() => void handleUpload()}
            data-testid="upload-button"
          >
            Add Schema
          </Button>
        </div>
      </div>
    </div>
  );
}
