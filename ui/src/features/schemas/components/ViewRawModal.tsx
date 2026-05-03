import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Button } from '@/components/Button';
import type { SchemaFormat } from '@/lib/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ViewRawModalProps {
  open: boolean;
  onClose: () => void;
  content: string | Readonly<Record<string, unknown>>;
  format: SchemaFormat;
}

// ---------------------------------------------------------------------------
// Syntax highlighting helpers (lightweight regex-based — no external library)
// ---------------------------------------------------------------------------

function highlightJson(raw: string): string {
  // Escape HTML entities first
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'text-cyan-300'; // number
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'text-blue-300' : 'text-green-300'; // key vs string value
      } else if (/true|false/.test(match)) {
        cls = 'text-yellow-300';
      } else if (/null/.test(match)) {
        cls = 'text-slate-400';
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

function highlightXsd(raw: string): string {
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Color tag names
  let result = escaped.replace(
    /(&lt;\/?)([\w:]+)/g,
    '$1<span class="text-blue-300">$2</span>',
  );
  // Color attribute names
  result = result.replace(
    /([\w:]+)(=&quot;)/g,
    '<span class="text-amber-300">$1</span>$2',
  );
  // Color attribute values (already escaped quotes appear as &quot;)
  result = result.replace(
    /(&quot;[^&]*&quot;)/g,
    '<span class="text-green-300">$1</span>',
  );
  return result;
}

function toRawString(content: string | Readonly<Record<string, unknown>>): string {
  if (typeof content === 'string') return content;
  return JSON.stringify(content, null, 2);
}

// ---------------------------------------------------------------------------
// Focus trap helper
// ---------------------------------------------------------------------------

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal that displays raw schema content with lightweight syntax highlighting
 * and a clipboard copy button.
 */
export function ViewRawModal({ open, onClose, content, format }: ViewRawModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const raw = toRawString(content);
  const highlighted = format === 'xsd' ? highlightXsd(raw) : highlightJson(raw);

  // Focus management
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        const els = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        els?.[0]?.focus();
      });
    } else {
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
      setCopyState('idle');
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const els = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(raw);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }

  if (!open) return null;

  const copyLabel =
    copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Failed' : 'Copy';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="view-raw-overlay"
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
        aria-label="View raw schema content"
        data-testid="view-raw-modal"
        className="relative z-10 flex w-full max-w-3xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
        style={{ maxHeight: '85vh' }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Raw Schema Content</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="view-raw-copy"
              onClick={() => void handleCopy()}
            >
              {copyLabel}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close"
              data-testid="view-raw-close"
              onClick={onClose}
            >
              ✕
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-auto p-4">
          <pre
            data-testid="view-raw-content"
            className="font-mono text-xs leading-relaxed text-slate-200"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </div>
      </div>
    </div>
  );
}
