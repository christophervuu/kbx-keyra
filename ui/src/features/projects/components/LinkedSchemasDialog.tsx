import { useEffect, useRef } from 'react';

import type { SchemaCardData } from '../types';

import { Button } from '@/components/Button';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function normalizeFormatLabel(format: string, isInferred: boolean): string {
  const normalized = format.toLowerCase();

  if (isInferred) {
    if (normalized.includes('xml')) return 'Inferred XML';
    return 'Inferred JSON';
  }

  if (normalized === 'json-schema' || normalized === 'json') return 'JSON';
  if (normalized === 'xsd') return 'XSD';
  if (normalized === 'xml') return 'XML';

  return format.toUpperCase();
}

function normalizeOriginLabel(origin: string): string {
  if (origin === 'cdm') return 'CDM';
  if (origin === 'published' || origin === 'library') return 'Uploaded';
  return 'Uploaded';
}

interface LinkedSchemasDialogProps {
  open: boolean;
  onClose: () => void;
  schemas: SchemaCardData[];
  usageBySchemaId: Record<string, number>;
  labelledById?: string;
  descriptionId?: string;
  dialogId?: string;
}

export function LinkedSchemasDialog({
  open,
  onClose,
  schemas,
  usageBySchemaId,
  labelledById = 'linked-schemas-dialog-title',
  descriptionId = 'linked-schemas-dialog-description',
  dialogId,
}: LinkedSchemasDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    requestAnimationFrame(() => {
      if (!dialogRef.current) return;
      const focusables = getFocusableElements(dialogRef.current);
      focusables[0]?.focus();
    });

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusables = getFocusableElements(dialogRef.current);
      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="linked-schemas-dialog-overlay"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        aria-describedby={descriptionId}
        className="relative z-10 flex w-full max-w-2xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
        style={{ maxHeight: '85vh' }}
        data-testid="linked-schemas-dialog"
      >
        <div className="border-b border-slate-700 px-5 py-4">
          <h2 id={labelledById} className="text-sm font-semibold text-slate-100">
            Linked Schemas
          </h2>
          <p id={descriptionId} className="mt-1 text-xs text-slate-400">
            {schemas.length} schema{schemas.length === 1 ? '' : 's'} linked to this project
          </p>
        </div>

        <div className="overflow-auto px-5 py-4" data-testid="linked-schemas-list-container">
          {schemas.length === 0 ? (
            <p className="text-sm text-slate-400" data-testid="linked-schemas-empty">
              No linked schemas yet.
            </p>
          ) : (
            <ul className="space-y-3" data-testid="linked-schemas-list">
              {schemas.map((schema) => {
                const usageCount = usageBySchemaId[schema.schemaId] ?? 0;
                return (
                  <li
                    key={schema.schemaId}
                    className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2"
                    data-testid={`linked-schema-row-${schema.schemaId}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="truncate text-sm font-medium text-slate-100">{schema.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {normalizeOriginLabel(schema.origin)} · {normalizeFormatLabel(schema.format, schema.isInferred)} ·{' '}
                      {schema.fieldCount} field{schema.fieldCount === 1 ? '' : 's'} ·{' '}
                      {usageCount === 0
                        ? 'Not used'
                        : `Used by ${usageCount} mapping${usageCount === 1 ? '' : 's'}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="linked-schemas-close">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
