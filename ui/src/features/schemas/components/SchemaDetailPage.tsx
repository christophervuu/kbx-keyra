import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { SchemaActions } from './SchemaActions';
import { SchemaSamplePayloadsSection } from './SchemaSamplePayloadsSection';
import { SchemaStatusBadge } from './SchemaStatusBadge';
import { SchemaTreeView } from './SchemaTreeView';
import { ViewRawModal } from './ViewRawModal';
import { useSchemaDetail } from '../hooks/use-schema-detail';
import { useSchemaEditor } from '../hooks/use-schema-editor';
import { useSchemaUsage, type UsageMapping } from '../hooks/use-schema-usage';

import { Button } from '@/components/Button';
import { getTypeBadge } from '@/features/mappings/lib/source-field-display';
import { InlineEditableText } from '@/components/InlineEditableText';
import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import type { ParsedSchema, SchemaMetadata, SchemaTreeNode } from '@/lib/types';
import { PATHS } from '@/routes/paths';

export interface SchemaDetailPageProps {
  schemaId: string;
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

function formatFieldType(node: SchemaTreeNode | null): string {
  if (!node) return 'unknown';
  if (node.type !== 'union' || !node.unionTypes || node.unionTypes.length === 0) {
    return node.type;
  }

  const normalized = Array.from(
    new Set(
      node.unionTypes
        .map((type) => type.trim().toLowerCase())
        .filter((type) => type.length > 0),
    ),
  );

  if (normalized.length !== 1) return 'union';
  if (normalized[0] === 'integer') return 'number';
  if (normalized[0] === 'unknown') return 'any';
  return normalized[0];
}

function sourceKindLabel(metadata: SchemaMetadata): string {
  const sourceKind = metadata.sourceKind;

  if (sourceKind === 'xsd' || sourceKind === 'inferred_from_xml') return 'XSD';
  return 'JSON Schema';
}

function dataFormatLabel(metadata: SchemaMetadata): string {
  if (metadata.dataFormat === 'xml') return 'XML';
  if (metadata.dataFormat === 'json') return 'JSON';
  return metadata.format === 'xsd' ? 'XML' : 'JSON';
}

function roleLabel(role: UsageMapping['role']): string {
  return role === 'source' ? 'Source' : 'Target';
}

function SchemaDetailSkeleton() {
  return (
    <div data-testid="schema-detail-skeleton" className="animate-pulse space-y-6 p-6">
      <div className="space-y-3">
        <div className="h-8 w-1/3 rounded bg-slate-700" />
        <div className="h-4 w-2/3 rounded bg-slate-700" />
        <div className="h-4 w-1/2 rounded bg-slate-700" />
      </div>
      <div className="h-64 rounded-lg bg-slate-800" />
    </div>
  );
}

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

interface UsageModalProps {
  open: boolean;
  mappings: readonly UsageMapping[];
  onClose: () => void;
}

function SchemaUsageModal({ open, mappings, onClose }: UsageModalProps) {
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      data-testid="schema-usage-modal-overlay"
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schema-usage-modal-title"
        data-testid="schema-usage-modal"
        className="relative z-10 max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h2 id="schema-usage-modal-title" className="text-sm font-semibold text-slate-100">
            Used by mappings
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="schema-usage-modal-close">
            Close
          </Button>
        </div>

        <div className="max-h-[calc(80vh-56px)] overflow-auto p-4">
          {mappings.length === 0 ? (
            <p className="text-sm italic text-slate-500" data-testid="schema-usage-modal-empty">
              This schema is not currently used by any mappings.
            </p>
          ) : (
            <table className="w-full text-left text-sm" data-testid="schema-usage-modal-table">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2">Project</th>
                  <th className="px-2 py-2">Mapping</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Last modified</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr
                    key={`${mapping.projectId}-${mapping.mappingId}-${mapping.role}`}
                    className="border-t border-slate-800 text-slate-300"
                    data-testid={`schema-usage-modal-row-${mapping.mappingId}-${mapping.role}`}
                  >
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                        data-testid={`schema-usage-modal-project-${mapping.projectId}`}
                        onClick={() => {
                          onClose();
                          void navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', mapping.projectId));
                        }}
                      >
                        {mapping.projectName}
                      </button>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <button
                        type="button"
                        className="text-blue-400 hover:text-blue-300 hover:underline"
                        data-testid={`schema-usage-modal-mapping-${mapping.mappingId}`}
                        onClick={() => {
                          onClose();
                          void navigate(
                            PATHS.MAPPING_EDITOR
                              .replace(':projectId', mapping.projectId)
                              .replace(':mappingId', mapping.mappingId),
                          );
                        }}
                      >
                        {mapping.name}
                      </button>
                    </td>
                    <td className="px-2 py-2 align-top">{roleLabel(mapping.role)}</td>
                    <td className="px-2 py-2 align-top">
                      {mapping.updatedAt ? formatDate(mapping.updatedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

interface HeaderSectionProps {
  metadata: SchemaMetadata;
  usageCount: number;
  fieldCount: number;
  onOpenUsageModal: () => void;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateDescription: (description: string) => Promise<void>;
  actionsSlot: ReactNode;
}

function HeaderSection({
  metadata,
  usageCount,
  fieldCount,
  onOpenUsageModal,
  onUpdateName,
  onUpdateDescription,
  actionsSlot,
}: HeaderSectionProps) {
  const isEditable = metadata.origin !== 'cdm';
  const sourceLabel = sourceKindLabel(metadata);

  return (
    <header
      data-testid="schema-detail-header"
      className="space-y-3 border-b border-slate-800 pb-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {(metadata.origin === 'cdm' || metadata.ownership === 'cdm' || metadata.readonly) && (
              <span className="inline-flex items-center rounded-full border border-purple-700 bg-purple-900/40 px-2 py-0.5 text-xs font-medium text-purple-200">
                CDM
              </span>
            )}

            {isEditable ? (
              <InlineEditableText
                value={metadata.name}
                onSave={onUpdateName}
                as="h1"
                ariaLabel="Edit schema name"
                className="text-2xl font-bold text-slate-100"
              />
            ) : (
              <h1 className="text-2xl font-bold text-slate-100">{metadata.name}</h1>
            )}

            <SchemaStatusBadge status={metadata.status} />
          </div>

          {isEditable ? (
            <InlineEditableText
              value={metadata.description ?? ''}
              onSave={onUpdateDescription}
              multiline
              placeholder="Add a description…"
              ariaLabel="Edit schema description"
              className="text-sm text-slate-300"
            />
          ) : (
            <p className="text-sm text-slate-300">
              {metadata.description || <span className="italic text-slate-600">No description</span>}
            </p>
          )}
        </div>

        <div className="shrink-0" data-testid="schema-detail-header-actions">
          {actionsSlot}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500" data-testid="schema-detail-header-dates">
        <span>
          Created:{' '}
          <time dateTime={metadata.createdAt} data-testid="schema-detail-created-at">
            {formatDate(metadata.createdAt)}
          </time>
        </span>
        <span>
          Last modified:{' '}
          <time dateTime={metadata.updatedAt} data-testid="schema-detail-updated-at">
            {formatDate(metadata.updatedAt)}
          </time>
        </span>
      </div>

      <p className="text-sm text-slate-400" data-testid="schema-detail-header-summary-line">
        <span data-testid="schema-detail-source-kind">{sourceLabel}</span> ·{' '}
        <span data-testid="schema-detail-field-count">{fieldCount} field{fieldCount === 1 ? '' : 's'}</span> ·{' '}
        <button
          type="button"
          onClick={onOpenUsageModal}
          className="rounded text-blue-400 underline decoration-blue-500/60 underline-offset-2 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          data-testid="schema-detail-usage-link"
        >
          Used by {usageCount} mapping{usageCount === 1 ? '' : 's'}
        </button>
      </p>

      <span className="sr-only" data-testid="schema-detail-data-format">{dataFormatLabel(metadata)}</span>
      <span className="sr-only" data-testid="schema-detail-data-format-sidebar">{dataFormatLabel(metadata)}</span>
    </header>
  );
}


function toSampleValueByPath(samplePayload: unknown): ReadonlyMap<string, string> {
  const result = new Map<string, string>();

  function add(path: string, value: unknown) {
    if (!path) return;
    if (value === null || value === undefined) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result.set(path, String(value));
      return;
    }

    if (Array.isArray(value)) {
      const primitiveValues = value.filter((entry) =>
        typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean',
      ) as Array<string | number | boolean>;
      if (primitiveValues.length > 0) {
        result.set(path, primitiveValues.join(', '));
      }
    }
  }

  function visit(value: unknown, currentPath: string | null) {
    if (currentPath) {
      add(currentPath, value);
    }

    if (Array.isArray(value)) {
      if (!currentPath) return;
      for (const entry of value) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          visit(entry, currentPath);
        }
      }
      return;
    }

    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        visit(child, nextPath);
      }
    }
  }

  if (samplePayload && typeof samplePayload === 'object') {
    visit(samplePayload, null);
  }

  return result;
}

interface FieldDetailsEditorSectionProps {
  selectedNode: SchemaTreeNode | null;
  editable: boolean;
  sampleValue?: string;
  onSave: (updates: {
    name: string;
    description: string;
    type: SchemaTreeNode['type'];
    isRequired: boolean;
  }) => void;
}

function FieldDetailsEditorSection({ selectedNode, editable, sampleValue, onSave }: FieldDetailsEditorSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<SchemaTreeNode['type']>('string');
  const [isRequired, setIsRequired] = useState(false);

  if (!selectedNode) {
    return (
      <section
        data-testid="schema-field-details"
        className="flex h-[30rem] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900"
        aria-label="Field details"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-500">Field details</h2>
        </div>
        <div className="flex min-h-0 flex-1 items-start p-4">
          <p className="text-sm italic text-slate-500" data-testid="schema-field-details-empty">
            Select a field to view type, required status, description, and review issues.
          </p>
        </div>
      </section>
    );
  }


  const typeBadge = getTypeBadge(formatFieldType(selectedNode));

  return (
    <section
      data-testid="schema-field-details"
      className="flex h-[30rem] flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900"
      aria-label="Field details"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-500">Field details</h2>
        {editable && !isEditing && (
          <Button
            variant="secondary"
            size="sm"
            data-testid="field-details-edit-button"
            className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            onClick={() => {
              setName(selectedNode.fieldName);
              setDescription(selectedNode.description ?? '');
              setType(selectedNode.type);
              setIsRequired(selectedNode.isRequired);
              setIsEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isEditing ? (
          <div className="flex min-h-full flex-col gap-3 text-sm" data-testid="field-details-edit-form">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-500">Field name</span>
              <input
                data-testid="field-details-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-[#0b1020] px-2.5 py-1.5 text-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-500">Type</span>
              <select
                data-testid="field-details-type-select"
                value={type}
                onChange={(e) => setType(e.target.value as SchemaTreeNode['type'])}
                className="w-full rounded-md border border-slate-700 bg-[#0b1020] px-2.5 py-1.5 text-slate-100"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="array">array</option>
                <option value="object">object</option>
                <option value="null">null</option>
                <option value="any">any</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 py-1 text-slate-300">
              <input
                type="checkbox"
                data-testid="field-details-required-toggle"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
              />
              Required
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-500">Description</span>
              <textarea
                data-testid="field-details-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-24 w-full rounded-md border border-slate-700 bg-[#0b1020] px-2.5 py-1.5 text-slate-100"
              />
            </label>

            <div className="mt-auto flex gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                data-testid="field-details-cancel-button"
                onClick={() => {
                  setName(selectedNode.fieldName);
                  setDescription(selectedNode.description ?? '');
                  setType(selectedNode.type);
                  setIsRequired(selectedNode.isRequired);
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                data-testid="field-details-save-button"
                onClick={() => {
                  onSave({ name, description, type, isRequired });
                  setIsEditing(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-sm text-blue-300">
                {formatFieldType(selectedNode).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100" data-testid="field-details-name">{selectedNode.fieldName}</p>
                <p className="truncate text-[11px] text-slate-500" data-testid="field-details-path">{selectedNode.path}</p>
              </div>
            </div>

            <dl className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[11px] text-slate-500">Type</dt>
                <dd className={`rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-medium ${typeBadge.className}`} data-testid="field-details-type">
                  {formatFieldType(selectedNode)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[11px] text-slate-500">Required</dt>
                <dd className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${selectedNode.isRequired ? 'border-rose-900/70 bg-rose-950/70 text-rose-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`} data-testid="field-details-required">
                  {selectedNode.isRequired ? 'Yes' : 'No'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[11px] text-slate-500">Description</dt>
                <dd className="text-right text-xs text-slate-300" data-testid="field-details-description">
                  {selectedNode.description?.trim() ? selectedNode.description : <span className="italic text-slate-500">None</span>}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[11px] text-slate-500">Value</dt>
                <dd className="max-w-[65%] truncate text-right text-xs text-slate-300" title={sampleValue ?? ''} data-testid="field-details-sample-value">
                  {sampleValue?.trim() ? sampleValue : <span className="italic text-slate-500">None</span>}
                </dd>
              </div>
            </dl>

            {!editable && (
              <p className="text-xs text-slate-500" data-testid="field-details-readonly-note">
                CDM fields are read-only.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function SchemaDetailPage({ schemaId }: SchemaDetailPageProps) {
  const {
    schema,
    parsedSchema,
    isLoading,
    error,
    notFound,
    retry,
    updateMetadata,
    setParsedSchema,
    addSample,
    deleteSample,
    getSamplePayload,
  } = useSchemaDetail(schemaId);

  const handleSaved = useCallback(
    (refreshed: ParsedSchema) => {
      setParsedSchema(refreshed);
    },
    [setParsedSchema],
  );

  const { saveFieldEdits } =
    useSchemaEditor(
      parsedSchema,
      schemaId,
      schema?.content ?? null,
      handleSaved,
    );

  const { mappings: usageMappings } = useSchemaUsage(schemaId);

  const [treeSearchQuery, setTreeSearchQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [showViewRaw, setShowViewRaw] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [selectedSamplePayload, setSelectedSamplePayload] = useState<unknown | null>(null);
  const treeRef = useRef<{ scrollToNode: (path: string) => boolean } | null>(null);

  const breadcrumbLabel = schema?.metadata.name ?? (isLoading ? 'Loading...' : schemaId);
  useBreadcrumbLabel(schemaId, breadcrumbLabel);

  const currentTree = parsedSchema;

  const allTreeNodes = useMemo(() => {
    const source = currentTree?.nodes ?? [];
    const flat: SchemaTreeNode[] = [];

    const visit = (nodes: SchemaTreeNode[]) => {
      for (const node of nodes) {
        flat.push(node);
        if (node.children.length > 0) {
          visit(node.children);
        }
      }
    };

    visit(source);
    return flat;
  }, [currentTree]);

  const selectedNode = useMemo(
    () => (selectedPath ? allTreeNodes.find((node) => node.path === selectedPath) ?? null : null),
    [allTreeNodes, selectedPath],
  );

  const leafFieldCount = useMemo(() => {
    if (allTreeNodes.length === 0) return schema?.metadata.fieldCount ?? 0;
    const leaves = allTreeNodes.filter((node) => node.childCount === 0).length;
    return leaves > 0 ? leaves : schema?.metadata.fieldCount ?? 0;
  }, [allTreeNodes, schema?.metadata.fieldCount]);

  const sampleValueByPath = useMemo(() => toSampleValueByPath(selectedSamplePayload), [selectedSamplePayload]);
  const selectedFieldSampleValue = selectedNode?.path ? sampleValueByPath.get(selectedNode.path) : undefined;

  if (isLoading) {
    return (
      <div data-testid="page-schema-detail">
        <SchemaDetailSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="page-schema-detail">
        <SchemaDetailError message={error.message} onRetry={retry} />
      </div>
    );
  }

  if (notFound || !schema) {
    return (
      <div data-testid="page-schema-detail">
        <SchemaDetailNotFound />
      </div>
    );
  }

  const { metadata } = schema;
  const isCdm = metadata.origin === 'cdm' || metadata.ownership === 'cdm' || metadata.readonly;
  const canFieldEdit = !isCdm && metadata.format === 'json-schema';
  const coercedHeaderStatus = metadata.status === 'needs_review'
    ? 'ready'
    : metadata.status;
  const headerMetadata: SchemaMetadata = { ...metadata, status: coercedHeaderStatus };

  return (
    <div
      data-testid="page-schema-detail"
      className="flex h-[calc(100vh-7rem)] min-h-[calc(100vh-7rem)] flex-col gap-4 overflow-hidden"
      data-layout="schema-detail-v2"
    >
      <HeaderSection
        metadata={headerMetadata}
        usageCount={usageMappings.length}
        fieldCount={leafFieldCount}
        onOpenUsageModal={() => setShowUsageModal(true)}
        onUpdateName={(name) => updateMetadata({ name })}
        onUpdateDescription={(description) => updateMetadata({ description })}
        actionsSlot={(
          <SchemaActions
            schema={schema}
            onEdit={() => undefined}
            onViewRaw={() => setShowViewRaw(true)}
            usageMappings={usageMappings}
            isEditing={false}
            showEditButton={false}
            withSectionChrome={false}
            className="px-0 py-0"
          />
        )}
      />

      <div
        data-testid="schema-detail-layout-grid"
        className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-stretch"
      >
        <section
          data-testid="schema-detail-tree"
          className="order-1 flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 p-4 lg:col-start-1 lg:row-start-1"
        >
          {metadata.origin === 'cdm' && (
            <div
              role="status"
              data-testid="cdm-read-only-note"
              className="mb-3 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-400"
            >
              CDM schema is read-only in Schema Detail.
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Fields</h2>
          </div>

          {currentTree ? (
            <div className="min-h-0 flex-1">
              <SchemaTreeView
                ref={treeRef}
                schema={currentTree}
                variant="source"
                editable={false}
                onNodeEdit={undefined}
                selectedPath={selectedPath}
                onSelectNode={(node) => setSelectedPath(node.path)}
                sampleValueByPath={sampleValueByPath}
                searchQuery={treeSearchQuery}
                onSearchQueryChange={setTreeSearchQuery}
                maxHeight="100%"
              />
            </div>
          ) : (
            <p data-testid="tree-parse-unavailable" className="text-sm text-slate-500 italic">
              Schema structure could not be parsed.
            </p>
          )}
        </section>

        <aside
          data-testid="schema-detail-sidebar"
          className="order-2 min-h-0 space-y-4 overflow-y-auto pr-1 lg:col-start-2 lg:row-start-1"
        >
          <FieldDetailsEditorSection
            selectedNode={selectedNode}
            editable={canFieldEdit}
            sampleValue={selectedFieldSampleValue}
            onSave={(updates) => {
              if (!selectedNode) return;
              void saveFieldEdits(selectedNode.path, updates);
            }}
          />

          <section data-testid="schema-detail-samples-slot">
            <SchemaSamplePayloadsSection
              metadata={metadata}
              initialSamplePayload={typeof schema.content === 'string' ? schema.content : schema.content}
              onAddSample={addSample}
              onDeleteSample={deleteSample}
              onLoadSamplePayload={getSamplePayload}
              onSelectedSamplePayloadChange={(_sampleId, payload) => {
                setSelectedSamplePayload(payload);
              }}
            />
          </section>
        </aside>
      </div>

      <SchemaUsageModal
        open={showUsageModal}
        mappings={usageMappings}
        onClose={() => setShowUsageModal(false)}
      />

      <ViewRawModal
        open={showViewRaw}
        onClose={() => setShowViewRaw(false)}
        content={schema.content}
        format={metadata.format}
      />

    </div>
  );
}
