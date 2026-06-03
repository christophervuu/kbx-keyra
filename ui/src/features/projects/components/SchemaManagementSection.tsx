
import { Database, Link2, Upload } from 'lucide-react';
import { useState } from 'react';


import type { SchemaCardData } from '../types';
import { SchemaCard } from './SchemaCard';
import { SchemaLinkPicker } from './SchemaLinkPicker';

import { Button } from '@/components/Button';
import type { SchemaRef } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Inline remove-confirm dialog (self-contained, avoids cross-feature import)
// ---------------------------------------------------------------------------

interface RemoveConfirmProps {
  schemaName: string;
  referencedBy: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

function RemoveConfirmDialog({
  schemaName,
  referencedBy,
  onConfirm,
  onCancel,
}: RemoveConfirmProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="remove-confirm-overlay"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-confirm-title"
        aria-describedby="remove-confirm-message"
        className="relative z-10 w-full max-w-sm rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl"
        data-testid="remove-confirm-dialog"
      >
        <h2 id="remove-confirm-title" className="text-sm font-semibold text-slate-100">
          Remove schema?
        </h2>
        <div id="remove-confirm-message" className="mt-2 text-sm text-slate-400">
          {referencedBy.length > 0 ? (
            <>
              <p className="mb-2 text-amber-400">
                ⚠ The following mappings reference <strong className="text-amber-300">{schemaName}</strong>:
              </p>
              <ul className="mb-2 list-disc pl-4 space-y-0.5">
                {referencedBy.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <p>Removing it will not delete those mappings, but their schema references will become unresolved.</p>
            </>
          ) : (
            <p>
              Remove <strong className="text-slate-200">{schemaName}</strong> from this project?
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            data-testid="remove-confirm-button"
          >
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaManagementSectionProps {
  projectId: string;
  schemas: SchemaCardData[];
  onUpload: () => void;
  onLink: (ref: SchemaRef) => Promise<void>;
  onRemove: (schemaId: string) => Promise<void>;
  onView: (schemaId: string) => void;
  mappingsReferencingSchema: (schemaId: string) => string[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Section B — Schema Management: cards, upload/link actions, remove with confirm.
 */
export function SchemaManagementSection({
  projectId,
  schemas,
  onUpload,
  onLink,
  onRemove,
  onView,
  mappingsReferencingSchema,
}: SchemaManagementSectionProps) {
  const [removeTarget, setRemoveTarget] = useState<SchemaCardData | null>(null);
  const [showLinkPicker, setShowLinkPicker] = useState(false);

  function handleRemoveClick(schemaId: string) {
    const schema = schemas.find((s) => s.schemaId === schemaId) ?? null;
    setRemoveTarget(schema);
  }

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    await onRemove(removeTarget.schemaId);
    setRemoveTarget(null);
  }

  async function handleLinkConfirm(ref: SchemaRef) {
    setShowLinkPicker(false);
    await onLink(ref);
  }

  const attachedIds = schemas.map((s) => s.schemaId);

  return (
    <section aria-label="Schema management">
      {/* Section header — lighter weight than mappings (text-lg font-medium, AE-13) */}
      {/* Structure supports future collapse toggle: title + count + reserved chevron space */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-medium text-slate-100">Schemas</h2>
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-400">
            {schemas.length}
          </span>
          {/* Reserved space for future collapse chevron */}
          <span className="w-4" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onUpload}>
            <Upload size={14} aria-hidden="true" />
            Upload Schema
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowLinkPicker(true)}>
            <Link2 size={14} aria-hidden="true" />
            Link Schema
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {schemas.length === 0 ? (
        <div
          className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-slate-700 bg-slate-900/50 py-10 text-center"
          data-testid="schema-empty-state"
        >
          <Database size={36} className="text-slate-600" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-slate-400">No schemas attached</p>
            <p className="text-xs text-slate-500">
              Upload a schema or link an existing one from the Schema Library to get started.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onUpload}>
              <Upload size={14} aria-hidden="true" />
              Upload Schema
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowLinkPicker(true)}>
              <Link2 size={14} aria-hidden="true" />
              Link Schema
            </Button>
          </div>
        </div>
      ) : (
        /* Schema grid */
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
          data-testid="schema-cards-container"
        >
          {schemas.map((schema) => (
            <SchemaCard
              key={schema.schemaId}
              schema={schema}
              usageCount={mappingsReferencingSchema(schema.schemaId).length}
              onView={onView}
              onRemove={handleRemoveClick}
            />
          ))}
        </div>
      )}

      {/* Remove confirmation */}
      {removeTarget && (
        <RemoveConfirmDialog
          schemaName={removeTarget.name}
          referencedBy={mappingsReferencingSchema(removeTarget.schemaId)}
          onConfirm={() => void handleRemoveConfirm()}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

      {/* Link schema picker */}
      {showLinkPicker && (
        <SchemaLinkPicker
          projectId={projectId}
          attachedSchemaIds={attachedIds}
          onConfirm={(ref) => void handleLinkConfirm(ref)}
          onClose={() => setShowLinkPicker(false)}
        />
      )}
    </section>
  );
}
