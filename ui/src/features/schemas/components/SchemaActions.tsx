import { MoreVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { UsageMapping } from '../hooks/use-schema-usage';

import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAdapter } from '@/lib/api';
import type { SchemaDetail } from '@/lib/types';
import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaActionsProps {
  schema: SchemaDetail;
  /** Called to open View-Raw modal */
  onViewRaw: () => void;
  /** Mappings referencing this schema — used for remove-blocking check */
  usageMappings: UsageMapping[];
  /** Called to activate edit mode */
  onEdit: () => void;
  /** Whether edit mode is currently active */
  isEditing: boolean;
  /** Controls whether top-level Edit Schema action is shown */
  showEditButton?: boolean;
  /** Renders section chrome (title/padding) when true */
  withSectionChrome?: boolean;
  /** Optional className applied to root wrapper */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Context-dependent action buttons for the Schema Detail page.
 *
 * Visibility rules (FS-090 T-08):
 * - User schemas: top-level Edit Schema + overflow(View raw, Delete schema)
 * - CDM schemas: overflow(View raw) only
 */
export function SchemaActions({
  schema,
  onViewRaw,
  usageMappings,
  onEdit,
  isEditing,
  showEditButton = true,
  withSectionChrome = true,
  className = '',
}: SchemaActionsProps) {
  const adapter = useAdapter();
  const navigate = useNavigate();

  const { metadata } = schema;
  const isCdm = metadata.origin === 'cdm' || metadata.ownership === 'cdm' || metadata.readonly;
  const isJsonSchema = metadata.format === 'json-schema';
  const canEdit = showEditButton && !isCdm && isJsonSchema && !isEditing;
  const canRemove = !isCdm;

  // --- Modal states ---
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showRemoveBlocked, setShowRemoveBlocked] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    function onPointerDown(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [isMenuOpen]);

  function handleViewRaw() {
    setIsMenuOpen(false);
    onViewRaw();
  }

  // --- Remove ---
  function handleRemoveClick() {
    if (!canRemove) return;
    setIsMenuOpen(false);

    if (usageMappings.length > 0) {
      setShowRemoveBlocked(true);
    } else {
      setShowRemoveConfirm(true);
    }
  }

  async function handleRemoveConfirm() {
    if (!canRemove) return;

    setIsRemoving(true);
    try {
      await adapter.deleteSchema(metadata.schemaId);
      setShowRemoveConfirm(false);
      void navigate(PATHS.SCHEMA_LIBRARY);
    } catch {
      // Leave modal open on failure — user can retry or cancel
      setIsRemoving(false);
    }
  }

  const actionsContent = (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && (
        <Button
          variant="secondary"
          size="sm"
          data-testid="action-edit"
          onClick={onEdit}
        >
          Edit Schema
        </Button>
      )}

      <div className="relative" ref={menuRef}>
        <Button
          variant="ghost"
          size="sm"
          aria-label="More schema actions"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls="schema-actions-menu"
          data-testid="action-overflow-trigger"
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <MoreVertical size={14} aria-hidden="true" />
        </Button>

        {isMenuOpen && (
          <div
            id="schema-actions-menu"
            role="menu"
            data-testid="action-overflow-menu"
            className="absolute right-0 z-20 mt-1 min-w-44 rounded-md border border-slate-700 bg-slate-900 p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              data-testid="action-view-raw"
              className="block w-full rounded px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
              onClick={handleViewRaw}
            >
              View raw
            </button>

            {canRemove && (
              <button
                type="button"
                role="menuitem"
                data-testid="action-remove"
                className="block w-full rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-red-900/40"
                onClick={handleRemoveClick}
              >
                Delete schema
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section
      data-testid="schema-detail-actions"
      aria-label="Schema actions"
      className={className}
    >
      {withSectionChrome ? (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Actions
          </h2>

          {actionsContent}
        </>
      ) : actionsContent}

      {/* ---- Remove confirmation (no blockers) ---- */}
      <ConfirmDialog
        open={showRemoveConfirm}
        title="Remove schema?"
        message="Are you sure you want to remove this schema? This action cannot be undone."
        confirmLabel={isRemoving ? 'Removing…' : 'Remove'}
        cancelLabel="Cancel"
        onConfirm={() => void handleRemoveConfirm()}
        onCancel={() => setShowRemoveConfirm(false)}
      />

      {/* ---- Remove blocked dialog ---- */}
      <ConfirmDialog
        open={showRemoveBlocked}
        title="Cannot remove schema"
        message={
          <span>
            <span className="block">
              Cannot remove this schema because it is referenced by:
            </span>
            <ul
              data-testid="remove-blocked-mappings"
              className="mt-2 list-inside list-disc space-y-0.5 text-slate-300"
            >
              {usageMappings.map((m) => (
                <li key={`${m.projectId}-${m.mappingId}`}>{m.name}</li>
              ))}
            </ul>
          </span>
        }
        confirmLabel="OK"
        cancelLabel="Close"
        onConfirm={() => setShowRemoveBlocked(false)}
        onCancel={() => setShowRemoveBlocked(false)}
      />
    </section>
  );
}
