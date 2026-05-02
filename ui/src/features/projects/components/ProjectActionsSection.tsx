import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Copy, Trash2, Settings, Upload, Download, ArrowDownToLine } from 'lucide-react';

import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProjectActionsSectionProps {
  projectId: string;
  mappingCount: number;
  schemaCount: number;
  onCreateMapping: () => void;
  onAddSchema: () => void;
  onDuplicateProject: () => Promise<void>;
  onDeleteProject: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Section D — Project-level action buttons.
 * Grouped into primary actions, placeholders, navigation, and danger zone.
 */
export function ProjectActionsSection({
  projectId,
  mappingCount,
  schemaCount,
  onCreateMapping,
  onAddSchema,
  onDuplicateProject,
  onDeleteProject,
}: ProjectActionsSectionProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  async function handleDuplicate() {
    setIsDuplicating(true);
    try {
      await onDuplicateProject();
    } finally {
      setIsDuplicating(false);
    }
  }

  async function handleDeleteConfirm() {
    setShowDeleteConfirm(false);
    await onDeleteProject();
  }

  const deleteMessage = `This will delete ${mappingCount} mapping${mappingCount !== 1 ? 's' : ''} and unlink ${schemaCount} schema${schemaCount !== 1 ? 's' : ''}. This action cannot be undone.`;

  return (
    <section aria-label="Project actions" className="flex flex-col gap-4">
      {/* Primary actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={onCreateMapping}>
          <Plus size={14} aria-hidden="true" />
          Create Mapping
        </Button>

        <Button variant="secondary" size="sm" onClick={onAddSchema}>
          <Upload size={14} aria-hidden="true" />
          Add Schema
        </Button>

        <Button
          variant="secondary"
          size="sm"
          loading={isDuplicating}
          onClick={() => void handleDuplicate()}
        >
          <Copy size={14} aria-hidden="true" />
          Duplicate Project
        </Button>
      </div>

      {/* Placeholder actions */}
      <div className="flex flex-wrap gap-2">
        <div className="relative group">
          <Button variant="ghost" size="sm" disabled aria-label="Export Project (coming soon)">
            <Download size={14} aria-hidden="true" />
            Export Project
          </Button>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Coming in Phase 1
          </span>
        </div>

        <div className="relative group">
          <Button variant="ghost" size="sm" disabled aria-label="Import Mapping (coming soon)">
            <ArrowDownToLine size={14} aria-hidden="true" />
            Import Mapping
          </Button>
          <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Coming in Phase 1
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div>
        <Link
          to={`/projects/${projectId}/settings`}
          className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Project Settings"
        >
          <Settings size={14} aria-hidden="true" />
          Project Settings
        </Link>
      </div>

      {/* Danger zone */}
      <div className="border-t border-slate-700 pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Danger Zone
        </p>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete Project
        </Button>
      </div>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete project?"
        message={deleteMessage}
        confirmLabel="Delete Project"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </section>
  );
}
