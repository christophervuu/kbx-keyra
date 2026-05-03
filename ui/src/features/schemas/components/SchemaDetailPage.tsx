import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/Button';
import { InlineEditableText } from '@/components/InlineEditableText';
import { PATHS } from '@/routes/paths';
import type { ParsedSchema, SchemaMetadata, UpdateSchemaInput } from '@/lib/types';

import { useSchemaDetail } from '../hooks/use-schema-detail';
import { useSchemaEditor } from '../hooks/use-schema-editor';
import { useSchemaUsage } from '../hooks/use-schema-usage';
import { SchemaActions } from './SchemaActions';
import { SchemaGitStatus } from './SchemaGitStatus';
import { SchemaTreeView } from './SchemaTreeView';
import { SchemaUsageSection } from './SchemaUsageSection';
import { InferredSchemaBanner } from './InferredSchemaBanner';
import { ViewRawModal } from './ViewRawModal';
import { ReplaceFileDialog } from './ReplaceFileDialog';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaDetailPageProps {
  schemaId: string;
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function OriginBadge({ origin }: { origin: SchemaMetadata['origin'] }) {
  const styles: Record<SchemaMetadata['origin'], string> = {
    cdm: 'bg-purple-900/50 text-purple-300 border border-purple-700',
    published: 'bg-blue-900/50 text-blue-300 border border-blue-700',
    local: 'bg-slate-700 text-slate-300 border border-slate-600',
  };
  const labels: Record<SchemaMetadata['origin'], string> = {
    cdm: 'CDM',
    published: 'Published',
    local: 'Local',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[origin]}`}
    >
      {labels[origin]}
    </span>
  );
}

function ScopeBadge({ scope }: { scope: SchemaMetadata['scope'] }) {
  const styles: Record<SchemaMetadata['scope'], string> = {
    global: 'bg-green-900/50 text-green-300 border border-green-700',
    project: 'bg-amber-900/50 text-amber-300 border border-amber-700',
  };
  const labels: Record<SchemaMetadata['scope'], string> = {
    global: 'Global',
    project: 'Project-Level',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[scope]}`}
    >
      {labels[scope]}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SchemaDetailSkeleton() {
  return (
    <div data-testid="schema-detail-skeleton" className="animate-pulse space-y-6 p-6">
      {/* Metadata area */}
      <div className="space-y-3">
        <div className="h-8 w-1/3 rounded bg-slate-700" />
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded-full bg-slate-700" />
          <div className="h-5 w-24 rounded-full bg-slate-700" />
        </div>
        <div className="h-4 w-2/3 rounded bg-slate-700" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-4 w-full rounded bg-slate-700" />
          <div className="h-4 w-full rounded bg-slate-700" />
          <div className="h-4 w-full rounded bg-slate-700" />
        </div>
      </div>
      {/* Tree area */}
      <div className="h-64 rounded-lg bg-slate-800" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function SchemaDetailError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="schema-detail-error"
      className="flex flex-col items-center gap-4 py-16 text-center"
    >
      <p className="text-slate-300">Failed to load schema</p>
      <p className="text-sm text-slate-500">{message}</p>
      <Button variant="secondary" onClick={onRetry} data-testid="retry-button">
        Retry
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not-found state
// ---------------------------------------------------------------------------

function SchemaDetailNotFound() {
  return (
    <div
      data-testid="schema-detail-not-found"
      className="flex flex-col items-center gap-4 py-16 text-center"
    >
      <p className="text-lg text-slate-300">Schema not found</p>
      <p className="text-sm text-slate-500">
        This schema doesn&apos;t exist or may have been deleted.
      </p>
      <Link
        to={PATHS.SCHEMA_LIBRARY}
        data-testid="back-to-library-link"
        className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
      >
        ← Back to Schema Library
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata section
// ---------------------------------------------------------------------------

interface MetadataSectionProps {
  metadata: SchemaMetadata;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateDescription: (description: string) => Promise<void>;
}

function MetadataSection({ metadata, onUpdateName, onUpdateDescription }: MetadataSectionProps) {
  const isEditable = metadata.origin !== 'cdm';
  const formatLabel = metadata.format === 'json-schema' ? 'JSON Schema' : 'XSD';

  return (
    <section
      data-testid="schema-detail-metadata"
      className="border-b border-slate-800 bg-slate-900 px-6 py-6"
    >
      {/* Name */}
      <div className="mb-2">
        {isEditable ? (
          <InlineEditableText
            value={metadata.name}
            onSave={onUpdateName}
            as="h1"
            ariaLabel="Edit schema name"
            className="text-2xl font-semibold text-slate-100"
          />
        ) : (
          <h1 className="text-2xl font-semibold text-slate-100">{metadata.name}</h1>
        )}
      </div>

      {/* Badges */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <OriginBadge origin={metadata.origin} />
        <ScopeBadge scope={metadata.scope} />
        <span className="text-xs text-slate-500">{formatLabel}</span>
        <span className="text-xs text-slate-500">{metadata.fieldCount} fields</span>
      </div>

      {/* Description */}
      <div className="mb-6">
        {isEditable ? (
          <InlineEditableText
            value={metadata.description ?? ''}
            onSave={onUpdateDescription}
            multiline
            placeholder="Add a description…"
            ariaLabel="Edit schema description"
            className="text-sm text-slate-400"
          />
        ) : (
          <p className="text-sm text-slate-400">
            {metadata.description || <span className="italic text-slate-600">No description</span>}
          </p>
        )}
      </div>

      {/* Date / author metadata */}
      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">Created</dt>
          <dd className="text-slate-300">{formatDate(metadata.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Modified</dt>
          <dd className="text-slate-300">{formatDate(metadata.updatedAt)}</dd>
        </div>
        {metadata.updatedBy && (
          <div>
            <dt className="text-slate-500">Updated by</dt>
            <dd className="text-slate-300">{metadata.updatedBy}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

/**
 * Schema Detail feature page. Receives schemaId as a prop (extracted by the
 * route wrapper), loads the schema, and renders the full detail layout.
 *
 * Placeholder slots for T-03 (git status), T-04 (tree), T-06 (usage), and
 * T-07 (actions) are stubbed with data-testid anchors so later tasks can
 * slot content in predictably.
 */
export function SchemaDetailPage({ schemaId }: SchemaDetailPageProps) {
  const { schema, parsedSchema, isLoading, error, notFound, retry, updateMetadata, setParsedSchema } =
    useSchemaDetail(schemaId);

  const handleSaved = useCallback(
    (refreshed: ParsedSchema) => {
      setParsedSchema(refreshed);
    },
    [setParsedSchema],
  );

  const { isEditing, editedParsedSchema, startEditing, cancelEditing, saveEdits, editCallbacks } =
    useSchemaEditor(
      parsedSchema,
      schemaId,
      schema?.content ?? null,
      handleSaved,
    );

  const { mappings: usageMappings } = useSchemaUsage(schemaId);

  const [isSaving, setIsSaving] = useState(false);
  const [showViewRaw, setShowViewRaw] = useState(false);
  const [showReplace, setShowReplace] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await saveEdits();
    } finally {
      setIsSaving(false);
    }
  }

  // ---- Loading ----
  if (isLoading) {
    return (
      <div data-testid="page-schema-detail">
        <SchemaDetailSkeleton />
      </div>
    );
  }

  // ---- Error ----
  if (error) {
    return (
      <div data-testid="page-schema-detail">
        <SchemaDetailError message={error.message} onRetry={retry} />
      </div>
    );
  }

  // ---- Not found ----
  if (notFound || !schema) {
    return (
      <div data-testid="page-schema-detail">
        <SchemaDetailNotFound />
      </div>
    );
  }

  // ---- Loaded ----
  const { metadata } = schema;

  // Edit mode is only available for non-CDM, json-schema format schemas
  const canEdit = metadata.origin !== 'cdm' && metadata.format === 'json-schema';

  return (
    <div data-testid="page-schema-detail" className="flex flex-col">
      {/* Inferred schema banner */}
      <InferredSchemaBanner schemaId={schemaId} inferred={parsedSchema?.inferred ?? false} />

      {/* Section: Metadata */}
      <MetadataSection
        metadata={metadata}
        onUpdateName={(name) => updateMetadata({ name })}
        onUpdateDescription={(description) => updateMetadata({ description })}
      />

      {/* Section: Git Status */}
      <SchemaGitStatus
        source={metadata.source}
        origin={metadata.origin}
        hasLocalChanges={metadata.syncStatus === 'local-changes'}
        lastSyncedAt={metadata.updatedAt}
      />

      {/* Section: Schema Tree */}
      <section
        data-testid="schema-detail-tree"
        className="flex-1 border-b border-slate-800 px-6 py-4"
      >
        {/* Edit mode toolbar */}
        {isEditing && (
          <div
            role="status"
            data-testid="editing-banner"
            className="mb-3 flex items-center justify-between rounded-md border border-amber-700 bg-amber-900/30 px-4 py-2 text-sm text-amber-300"
          >
            <span>Editing mode — changes are local until saved</span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                data-testid="cancel-edit-button"
                onClick={cancelEditing}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                data-testid="save-edit-button"
                loading={isSaving}
                onClick={() => void handleSave()}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Edit button (read-only mode) */}
        {canEdit && !isEditing && (
          <div className="mb-3 flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              data-testid="edit-schema-button"
              onClick={startEditing}
            >
              Edit Schema
            </Button>
          </div>
        )}

        {/* Tree or unavailable message */}
        {(isEditing ? editedParsedSchema : parsedSchema) ? (
          <SchemaTreeView
            schema={(isEditing ? editedParsedSchema : parsedSchema)!}
            variant="source"
            editable={isEditing}
            onNodeEdit={isEditing ? editCallbacks : undefined}
          />
        ) : (
          <p data-testid="tree-parse-unavailable" className="text-sm text-slate-500 italic">
            Schema structure could not be parsed.
          </p>
        )}
      </section>

      {/* Section: Usage */}
      <SchemaUsageSection schemaId={schemaId} />

      {/* Section: Actions */}
      <SchemaActions
        schema={schema}
        onEdit={startEditing}
        onReplace={() => setShowReplace(true)}
        onViewRaw={() => setShowViewRaw(true)}
        usageMappings={usageMappings}
        isEditing={isEditing}
        onScopePromoted={() => void retry()}
      />

      {/* View Raw modal */}
      <ViewRawModal
        open={showViewRaw}
        onClose={() => setShowViewRaw(false)}
        content={schema.content}
        format={metadata.format}
      />

      {/* Replace file dialog */}
      <ReplaceFileDialog
        open={showReplace}
        onClose={() => setShowReplace(false)}
        schemaId={schemaId}
        currentFormat={metadata.format}
        onReplaced={(_newDetail) => {
          setShowReplace(false);
          void retry();
        }}
      />
    </div>
  );
}
