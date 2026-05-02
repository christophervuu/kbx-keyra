import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAdapter } from '@/lib/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { PATHS } from '@/routes/paths';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Create Project wizard page — single-step form for name, description, tags.
 */
export function CreateProjectPage() {
  const navigate = useNavigate();
  const adapter = useAdapter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Project name is required');
      return;
    }

    setNameError(null);
    setSubmitError(null);
    setSubmitting(true);

    try {
      const result = await adapter.createProject({
        name: trimmedName,
        description: description.trim() || undefined,
        slug: toSlug(trimmedName),
        tags: parseTags(tagsRaw),
        schemaRefs: [],
      });
      navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', result.projectId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setSubmitError(msg);
      setSubmitting(false);
    }
  }

  function handleCancel() {
    navigate(PATHS.HOME);
  }

  return (
    <div data-testid="page-create-project">
      <PageHeader title="Create New Project" />

      <div className="max-w-lg">
        <Card>
          <form onSubmit={(e) => void handleSubmit(e)} noValidate>
            {/* Name */}
            <div className="mb-4">
              <label
                htmlFor="project-name"
                className="mb-1 block text-sm font-medium text-slate-300"
              >
                Project Name <span className="text-red-400" aria-hidden="true">*</span>
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Enter project name"
                aria-required="true"
                aria-invalid={nameError ? 'true' : 'false'}
                aria-describedby={nameError ? 'project-name-error' : undefined}
                className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  nameError ? 'border-red-500' : 'border-slate-600'
                }`}
              />
              {nameError && (
                <p
                  id="project-name-error"
                  role="alert"
                  className="mt-1 text-xs text-red-400"
                  data-testid="name-error"
                >
                  {nameError}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="mb-4">
              <label
                htmlFor="project-description"
                className="mb-1 block text-sm font-medium text-slate-300"
              >
                Description
              </label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your project (optional)"
                rows={3}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Tags */}
            <div className="mb-6">
              <label
                htmlFor="project-tags"
                className="mb-1 block text-sm font-medium text-slate-300"
              >
                Tags
              </label>
              <input
                id="project-tags"
                type="text"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="Enter tags separated by commas"
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Submit error */}
            {submitError && (
              <p
                role="alert"
                className="mb-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-400"
                data-testid="submit-error"
              >
                {submitError}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
                data-testid="submit-button"
              >
                Create Project
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                data-testid="cancel-button"
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
