import type { ProjectDetail } from '@/lib/types/domain';
import { Card } from '@/components/Card';
import { InlineEditableText } from './InlineEditableText';
import { InlineEditableTags } from './InlineEditableTags';

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

export interface ProjectMetadataSectionProps {
  project: ProjectDetail;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateDescription: (description: string) => Promise<void>;
  onUpdateTags: (tags: string[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Section A — Project metadata with inline editing for name, description, and tags.
 * Dates and "updated by" are read-only.
 */
export function ProjectMetadataSection({
  project,
  onUpdateName,
  onUpdateDescription,
  onUpdateTags,
}: ProjectMetadataSectionProps) {
  return (
    <Card className="space-y-4">
      {/* Name */}
      <div>
        <InlineEditableText
          value={project.name}
          onSave={onUpdateName}
          placeholder="Untitled Project"
          as="h1"
          ariaLabel="Project name"
          className="text-2xl font-bold text-slate-100"
        />
      </div>

      {/* Description */}
      <div>
        <InlineEditableText
          value={project.description}
          onSave={onUpdateDescription}
          placeholder="Add a description…"
          as="p"
          multiline
          ariaLabel="Project description"
          className="text-sm text-slate-300"
        />
      </div>

      {/* Tags */}
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          Tags
        </p>
        <InlineEditableTags
          tags={project.tags}
          onSave={onUpdateTags}
        />
      </div>

      {/* Read-only metadata */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-700 pt-3 text-sm text-slate-500">
        <span>
          Created:{' '}
          <time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time>
        </span>
        <span>
          Last modified:{' '}
          <time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time>
        </span>
        <span>Updated by: Local User</span>
      </div>
    </Card>
  );
}
