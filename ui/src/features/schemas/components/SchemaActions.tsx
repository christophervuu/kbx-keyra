import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { UsageMapping } from '../hooks/use-schema-usage';
import { isSchemaActionAllowed } from '../lib';

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
  /** Called to activate edit mode (wired to useSchemaEditor.startEditing) */
  onEdit: () => void;
  /** Called to open Replace-file flow (T-08) */
  onReplace: () => void;
  /** Called to open View-Raw modal (T-08) */
  onViewRaw: () => void;
  /** Mappings referencing this schema — used for remove-blocking check */
  usageMappings: UsageMapping[];
  /** Whether edit mode is currently active */
  isEditing: boolean;
  /** Called after scope is successfully updated to 'global' */
  onScopePromoted?: () => void;
  /** Called after successful re-sync to refresh Schema Detail state */
  onResynced?: () => void;
}

// ---------------------------------------------------------------------------
// Tooltip wrapper
// ---------------------------------------------------------------------------

function PlaceholderButton({
  label,
  tooltip,
  testId,
}: {
  label: string;
  tooltip: string;
  testId: string;
}) {
  return (
    <div className="relative group">
      <Button
        variant="ghost"
        size="sm"
        disabled
        aria-label={label}
        data-testid={testId}
        className="opacity-50 cursor-not-allowed"
        title={tooltip}
      >
        {label}
      </Button>
      {/* Tooltip on hover */}
      <div
        role="tooltip"
        data-testid={`${testId}-tooltip`}
        className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden w-56 -translate-x-1/2 rounded bg-slate-700 px-2 py-1 text-center text-xs text-slate-200 shadow-lg group-hover:block"
      >
        {tooltip}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Context-dependent action buttons for the Schema Detail page.
 *
 * Visibility rules:
 * - CDM schemas: Re-sync (placeholder), View Raw
 * - Non-CDM schemas: Edit (json-schema only), Auto-describe (placeholder),
 *   Sync to GitHub (placeholder), Replace file, Remove, View Raw
 * - Project-scoped schemas: additionally Promote to Global
 *
 * Confirmation modals are shown for Promote and Remove.
 * Remove is blocked when mappings reference the schema.
 */
export function SchemaActions({
  schema,
  onEdit,
  onReplace,
  onViewRaw,
  usageMappings,
  isEditing,
  onScopePromoted,
  onResynced,
}: SchemaActionsProps) {
  const adapter = useAdapter();
  const navigate = useNavigate();

  const { metadata } = schema;
  const isCdm = metadata.origin === 'cdm';
  const isJsonSchema = metadata.format === 'json-schema';
  const isProjectScoped = metadata.scope === 'project';
  const canResync = isSchemaActionAllowed(metadata.origin, 'schema-detail', 'resync');
  const canEdit = isSchemaActionAllowed(metadata.origin, 'schema-detail', 'edit') && isJsonSchema && !isEditing;
  const canReplace = isSchemaActionAllowed(metadata.origin, 'schema-detail', 'replace');
  const canPromote = isSchemaActionAllowed(metadata.origin, 'schema-detail', 'promote-global') && isProjectScoped;
  const canRemove = isSchemaActionAllowed(metadata.origin, 'schema-detail', 'remove');

  // --- Modal states ---
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showRemoveBlocked, setShowRemoveBlocked] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [resyncError, setResyncError] = useState<string | null>(null);
  const [resyncMessage, setResyncMessage] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  async function handleResync() {
    if (!canResync) return;

    setIsResyncing(true);
    setResyncError(null);
    setResyncMessage(null);
    try {
      const result = await adapter.syncCdmSchema(metadata.schemaId);
      setResyncMessage(result.message || 'Schema re-synced from CDM source.');
      onResynced?.();
    } catch {
      setResyncError('Unable to re-sync right now. Please verify repository access and try again.');
    } finally {
      setIsResyncing(false);
    }
  }

  // --- Promote to Global ---
  async function handlePromoteConfirm() {
    if (!canPromote) return;

    setIsPromoting(true);
    setPromoteError(null);
    try {
      await adapter.updateSchema(metadata.schemaId, { scope: 'global' });
      setShowPromoteConfirm(false);
      onScopePromoted?.();
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : 'Failed to promote schema');
    } finally {
      setIsPromoting(false);
    }
  }

  // --- Remove ---
  function handleRemoveClick() {
    if (!canRemove) return;

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

  return (
    <section
      data-testid="schema-detail-actions"
      aria-label="Schema actions"
      className="px-6 py-4"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Actions
      </h2>

      <div className="flex flex-wrap gap-2">
        {/* --- CDM: Re-sync action --- */}
        {canResync && (
          <Button
            variant="secondary"
            size="sm"
            data-testid="action-resync"
            onClick={() => void handleResync()}
            loading={isResyncing}
          >
            Re-sync
          </Button>
        )}

        {/* --- Non-CDM actions --- */}
        {!isCdm && (
          <>
            {/* Edit (json-schema only, not while editing) */}
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="action-edit"
                onClick={onEdit}
              >
                Edit
              </Button>
            )}

            {/* Auto-describe placeholder */}
            <PlaceholderButton
              label="Auto-describe fields"
              tooltip="AI-generated field descriptions available in a future release"
              testId="action-auto-describe"
            />

            {/* Sync to GitHub placeholder */}
            <PlaceholderButton
              label="Sync to GitHub"
              tooltip="GitHub sync available when backend is connected"
              testId="action-sync-github"
            />

            {/* Replace file (T-08) */}
            {canReplace && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="action-replace"
                onClick={onReplace}
              >
                Replace file
              </Button>
            )}

            {/* Promote to Global (project-scoped only) */}
            {canPromote && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="action-promote"
                onClick={() => setShowPromoteConfirm(true)}
              >
                Promote to Global
              </Button>
            )}

            {/* Remove */}
            {canRemove && (
              <Button
                variant="danger"
                size="sm"
                data-testid="action-remove"
                onClick={handleRemoveClick}
              >
                Remove
              </Button>
            )}
          </>
        )}

        {/* View Raw (all schemas) */}
        <Button
          variant="ghost"
          size="sm"
          data-testid="action-view-raw"
          onClick={onViewRaw}
        >
          View Raw
        </Button>
      </div>

      {canResync && resyncError && (
        <div
          role="alert"
          data-testid="resync-error"
          className="mt-3 rounded border border-amber-600/30 bg-amber-950/40 p-3 text-sm text-amber-200"
        >
          <p>{resyncError}</p>
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleResync()}
              disabled={isResyncing}
            >
              Retry re-sync
            </Button>
          </div>
        </div>
      )}

      {canResync && !resyncError && resyncMessage && (
        <p
          role="status"
          data-testid="resync-success"
          className="mt-3 text-sm text-slate-300"
        >
          {resyncMessage}
        </p>
      )}

      {/* ---- Promote confirmation ---- */}
      <ConfirmDialog
        open={showPromoteConfirm}
        title="Promote schema to Global?"
        message={
          <span>
            This will make the schema available to all projects. This action cannot be
            undone.
            {promoteError && (
              <span
                role="alert"
                data-testid="promote-error"
                className="mt-2 block text-red-400"
              >
                {promoteError}
              </span>
            )}
          </span>
        }
        confirmLabel={isPromoting ? 'Promoting…' : 'Promote'}
        cancelLabel="Cancel"
        onConfirm={() => void handlePromoteConfirm()}
        onCancel={() => {
          setShowPromoteConfirm(false);
          setPromoteError(null);
        }}
      />

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
