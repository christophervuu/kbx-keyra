import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function ConfigurationModal({ isOpen, onClose, children }: ConfigurationModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configuration"
        data-testid="configuration-modal"
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
      >
        <div className="flex h-[min(80vh,720px)] w-[min(1080px,95vw)] flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-100">Configuration</h2>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close configuration"
              data-testid="configuration-modal-close"
              onClick={onClose}
              className="rounded px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </>
  );
}
