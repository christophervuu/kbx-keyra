import { Copy, Download, MoreHorizontal, Plus, Settings, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { InlineEditableTags } from './InlineEditableTags';
import { InlineEditableText } from './InlineEditableText';

import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ProjectDetail } from '@/lib/types/domain';
import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProjectHeaderProps {
  project: ProjectDetail;
  mappingCount: number;
  schemaCount: number;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateDescription: (description: string) => Promise<void>;
  onUpdateTags: (tags: string[]) => Promise<void>;
  onCreateMapping: () => void;
  onAddSchema: () => void;
  onDuplicateProject: () => Promise<void>;
  onDeleteProject: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Overflow menu
// ---------------------------------------------------------------------------

interface OverflowMenuProps {
  projectId: string;
  mappingCount: number;
  schemaCount: number;
  onDuplicateProject: () => Promise<void>;
  onDeleteProject: () => Promise<void>;
}

function OverflowMenu({
  projectId,
  mappingCount,
  schemaCount,
  onDuplicateProject,
  onDeleteProject,
}: OverflowMenuProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  async function handleDuplicate() {
    setOpen(false);
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
    <div ref={menuRef} className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        aria-label="More project actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="project-overflow-menu-trigger"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Project actions menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl"
          data-testid="project-overflow-menu"
        >
          {/* Open Deployments */}
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:bg-slate-800 focus-visible:outline-none"
            onClick={() => {
              setOpen(false);
              navigate(`/projects/${projectId}/deployments`);
            }}
          >
            Open Deployments
          </button>

          {/* Project Settings */}
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:bg-slate-800 focus-visible:outline-none"
            onClick={() => {
              setOpen(false);
              navigate(PATHS.PROJECT_SETTINGS.replace(':projectId', projectId));
            }}
          >
            <Settings size={14} aria-hidden="true" />
            Project Settings
          </button>

          {/* Duplicate Project */}
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 focus-visible:bg-slate-800 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            disabled={isDuplicating}
            onClick={() => void handleDuplicate()}
          >
            <Copy size={14} aria-hidden="true" />
            {isDuplicating ? 'Duplicating…' : 'Duplicate Project'}
          </button>

          {/* Export Project — disabled, coming Phase 1 */}
          <div className="group relative">
            <button
              role="menuitem"
              aria-disabled="true"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-500 focus-visible:outline-none cursor-not-allowed"
              tabIndex={-1}
            >
              <Download size={14} aria-hidden="true" />
              Export Project
              <span className="ml-auto text-xs text-slate-600">Phase 1</span>
            </button>
          </div>

          {/* Separator */}
          <div className="my-1 border-t border-slate-700" role="separator" />

          {/* Delete Project — danger */}
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-950 hover:text-red-300 focus-visible:bg-red-950 focus-visible:outline-none"
            onClick={() => {
              setOpen(false);
              setShowDeleteConfirm(true);
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            Delete Project
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete project?"
        message={deleteMessage}
        confirmLabel="Delete Project"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectHeader
// ---------------------------------------------------------------------------

/**
 * Unified project header — replaces the separate ProjectMetadataSection and
 * ProjectActionsSection components (FS-050 T-02).
 *
 * Layout:
 *   Title row:    [Project name (h1, inline-editable)]  [Create Mapping] [Add Schema] [...]
 *   Metadata row: [Description (inline-editable)]  [Created / Updated dates]  [Tags]
 */
export function ProjectHeader({
  project,
  mappingCount,
  schemaCount,
  onUpdateName,
  onUpdateDescription,
  onUpdateTags,
  onCreateMapping,
  onAddSchema,
  onDuplicateProject,
  onDeleteProject,
}: ProjectHeaderProps) {
  return (
    <header className="space-y-3 border-b border-slate-800 pb-4">
      {/* Title row */}
      <div className="flex items-start gap-3">
        {/* Project name — takes remaining space */}
        <div className="min-w-0 flex-1">
          <InlineEditableText
            value={project.name}
            onSave={onUpdateName}
            placeholder="Untitled Project"
            as="h1"
            ariaLabel="Project name"
            className="text-2xl font-bold text-slate-100"
          />
        </div>

        {/* Primary actions */}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onCreateMapping}
            data-testid="header-create-mapping-btn"
          >
            <Plus size={14} aria-hidden="true" />
            Create Mapping
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onAddSchema}
            data-testid="header-add-schema-btn"
          >
            <Upload size={14} aria-hidden="true" />
            Add Schema
          </Button>

          <OverflowMenu
            projectId={project.projectId}
            mappingCount={mappingCount}
            schemaCount={schemaCount}
            onDuplicateProject={onDuplicateProject}
            onDeleteProject={onDeleteProject}
          />
        </div>
      </div>

      {/* Metadata row */}
      <div className="space-y-2">
        {/* Description */}
        <InlineEditableText
          value={project.description}
          onSave={onUpdateDescription}
          placeholder="Add a description…"
          as="p"
          multiline
          ariaLabel="Project description"
          className="text-sm text-slate-300"
        />

        {/* Dates */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          <span>
            Created:{' '}
            <time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time>
          </span>
          <span>
            Last modified:{' '}
            <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time>
          </span>
        </div>

        {/* Tags */}
        <InlineEditableTags tags={project.tags} onSave={onUpdateTags} />
      </div>
    </header>
  );
}
