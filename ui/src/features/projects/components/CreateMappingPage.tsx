import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { SchemaUploadDialog } from './SchemaUploadDialog';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useBreadcrumbLabel } from '@/components/layout/BreadcrumbContext';
import { PageHeader } from '@/components/PageHeader';
import { deriveEligibleTargets, saveAutoMapSuggestions } from '@/features/mappings/lib';
import type { PersistedSuggestionItem } from '@/features/mappings/types';
import { parseInferredSchema, parseJsonSchema, parseXsd } from '@/features/schemas';
import { useAdapter } from '@/lib/api';
import type { AutoMapSectionResult, SchemaMetadata, SchemaRef } from '@/lib/types/domain';
import { normalizeProjectLinkedSchemaIds } from '@/lib/types/domain';
import { PATHS } from '@/routes/paths';

interface CreateMappingValidationErrors {
  name?: string;
  sourceSchemaId?: string;
  targetSchemaId?: string;
  startMode?: string;
}

type AddSchemaTarget = 'source' | 'target' | null;

export function CreateMappingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const adapter = useAdapter();

  const [name, setName] = useState('');
  const [sourceSchemaId, setSourceSchemaId] = useState<string | null>(null);
  const [targetSchemaId, setTargetSchemaId] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<'blank' | 'auto-map' | null>('blank');
  const [validationErrors, setValidationErrors] = useState<CreateMappingValidationErrors>({});
  const [schemas, setSchemas] = useState<SchemaMetadata[]>([]);
  const [projectNameLabel, setProjectNameLabel] = useState<string | undefined>(undefined);
  const [linkedSchemaIds, setLinkedSchemaIds] = useState<string[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(true);
  const [addSchemaTarget, setAddSchemaTarget] = useState<AddSchemaTarget>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedSourceSchema = schemas.find((schema) => schema.schemaId === sourceSchemaId) ?? null;
  const selectedTargetSchema = schemas.find((schema) => schema.schemaId === targetSchemaId) ?? null;

  const sourceRequiredFields = getRequiredFieldCount(selectedSourceSchema);
  const targetRequiredFields = getRequiredFieldCount(selectedTargetSchema);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let cancelled = false;

    async function loadSchemas() {
      setSchemasLoading(true);
      try {
        const [allSchemas, project] = await Promise.all([
          adapter.listSchemas(),
          adapter.getProject(projectId),
        ]);

        if (cancelled) {
          return;
        }

        const linkedIds = [...normalizeProjectLinkedSchemaIds(project)];
        const sortedSchemas = [...allSchemas].sort((left, right) => {
          const leftLinked = linkedIds.includes(left.schemaId);
          const rightLinked = linkedIds.includes(right.schemaId);

          if (leftLinked !== rightLinked) {
            return leftLinked ? -1 : 1;
          }

          return left.name.localeCompare(right.name);
        });

        setProjectNameLabel(project.name);
        setLinkedSchemaIds(linkedIds);
        setSchemas(sortedSchemas);
      } catch {
        if (!cancelled) {
          setProjectNameLabel(undefined);
          setLinkedSchemaIds([]);
          setSchemas([]);
        }
      } finally {
        if (!cancelled) {
          setSchemasLoading(false);
        }
      }
    }

    void loadSchemas();

    return () => {
      cancelled = true;
    };
  }, [adapter, projectId]);

  useBreadcrumbLabel(projectId ?? '', projectNameLabel);

  function validate(): CreateMappingValidationErrors {
    const errors: CreateMappingValidationErrors = {};

    if (!name.trim()) {
      errors.name = 'Mapping name is required';
    }

    // Future required fields wired in follow-up tasks (T-03/T-05).
    if (!sourceSchemaId) {
      errors.sourceSchemaId = 'Source Schema is required';
    }

    if (!targetSchemaId) {
      errors.targetSchemaId = 'Target Schema is required';
    }

    if (!startMode) {
      errors.startMode = 'Start From option is required';
    }

    return errors;
  }

  async function handleSubmitAttempt() {
    const nextErrors = validate();
    setValidationErrors(nextErrors);

    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    if (!projectId) {
      return;
    }

    const selectedSourceSchema = schemas.find((schema) => schema.schemaId === sourceSchemaId);
    const selectedTargetSchema = schemas.find((schema) => schema.schemaId === targetSchemaId);

    if (!selectedSourceSchema || !selectedTargetSchema) {
      setSubmitError('Please select both Source and Target schemas.');
      return;
    }

    setSubmitError(null);
    setSubmitting(true);

    try {
      const sourceSchemaRef = schemaRefForSelection(selectedSourceSchema);
      const targetSchemaRef = schemaRefForSelection(selectedTargetSchema);

      const selectedIds = [sourceSchemaRef.schemaId, targetSchemaRef.schemaId];
      const missingLinked = selectedIds.filter((schemaId) => !linkedSchemaIds.includes(schemaId));

      if (missingLinked.length > 0) {
        try {
          const nextLinked = [...new Set([...linkedSchemaIds, ...missingLinked])];
          await adapter.updateProject(projectId, { linkedSchemaIds: nextLinked });
          setLinkedSchemaIds(nextLinked);
        } catch {
          // Best-effort relevance update only; explicit mapping refs remain canonical.
        }
      }

      const mapping = await adapter.createMapping({
        projectId,
        name: name.trim(),
        sourceSchemaRef,
        targetSchemaRef,
      });

      if (startMode === 'auto-map') {
        let navigationNotice: string | null = null;

        try {
          const targetSchemaDetail = await adapter.getSchema(targetSchemaRef.schemaId);
          const parsedTargetSchema = parseSchemaForAutoMapTargets(targetSchemaDetail);
          const targetSection = deriveEligibleTargets(parsedTargetSchema, null);

          if (!targetSection) {
            navigationNotice = 'Mapping created, but no eligible target fields were found for Auto-Map review.';
          } else {
            const autoMapResult = await adapter.autoMapSection({
              projectId,
              mappingId: mapping.mappingId,
              mode: 'whole',
              targetSection,
            });

            persistCreateTimeAutoMapSuggestions(mapping.mappingId, autoMapResult);
          }
        } catch (error: unknown) {
          navigationNotice = mapCreateTimeAutoMapFailure(error);
        }

        navigate(
          PATHS.MAPPING_EDITOR.replace(':projectId', projectId).replace(':mappingId', mapping.mappingId),
          {
            state: {
              autoMapCreate: true,
              autoMapCreateNotice: navigationNotice,
            },
          },
        );
        return;
      }

      navigate(
        PATHS.MAPPING_EDITOR.replace(':projectId', projectId).replace(':mappingId', mapping.mappingId),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create mapping.';
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  function handleSourceSchemaChange(nextSchemaId: string) {
    setSourceSchemaId(nextSchemaId || null);
    setSubmitError(null);
    if (validationErrors.sourceSchemaId) {
      setValidationErrors((previous) => ({ ...previous, sourceSchemaId: undefined }));
    }
  }

  function handleTargetSchemaChange(nextSchemaId: string) {
    setTargetSchemaId(nextSchemaId || null);
    setSubmitError(null);
    if (validationErrors.targetSchemaId) {
      setValidationErrors((previous) => ({ ...previous, targetSchemaId: undefined }));
    }
  }

  function handleStartModeChange(mode: 'blank' | 'auto-map') {
    setStartMode(mode);
    setSubmitError(null);
    if (validationErrors.startMode) {
      setValidationErrors((previous) => ({ ...previous, startMode: undefined }));
    }
  }

  function handleCancel() {
    if (projectId) {
      navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', projectId));
    } else {
      navigate(PATHS.HOME);
    }
  }

  function sortSchemasByLinked(allSchemas: SchemaMetadata[], linkedIds: string[]): SchemaMetadata[] {
    return [...allSchemas].sort((left, right) => {
      const leftLinked = linkedIds.includes(left.schemaId);
      const rightLinked = linkedIds.includes(right.schemaId);

      if (leftLinked !== rightLinked) {
        return leftLinked ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
  }

  async function refreshSchemasAndLinks(): Promise<void> {
    if (!projectId) {
      return;
    }

    setSchemasLoading(true);
    try {
      const [allSchemas, project] = await Promise.all([
        adapter.listSchemas(),
        adapter.getProject(projectId),
      ]);

      const linkedIds = [...normalizeProjectLinkedSchemaIds(project)];
      setLinkedSchemaIds(linkedIds);
      setSchemas(sortSchemasByLinked(allSchemas, linkedIds));
    } catch {
      setLinkedSchemaIds([]);
      setSchemas([]);
    } finally {
      setSchemasLoading(false);
    }
  }

  function openAddSchema(target: Exclude<AddSchemaTarget, null>) {
    setAddSchemaTarget(target);
  }

  function closeAddSchema() {
    setAddSchemaTarget(null);
  }

  async function handleSchemaCreated(ref: SchemaRef): Promise<void> {
    if (!projectId) {
      closeAddSchema();
      return;
    }

    if (!linkedSchemaIds.includes(ref.schemaId)) {
      const nextLinked = [...new Set([...linkedSchemaIds, ref.schemaId])];

      try {
        await adapter.updateProject(projectId, { linkedSchemaIds: nextLinked });
      } catch {
        // Best effort relevance update only.
      }

      setLinkedSchemaIds(nextLinked);
    }

    const target = addSchemaTarget;
    await refreshSchemasAndLinks();

    if (target === 'source') {
      setSourceSchemaId(ref.schemaId);
      setValidationErrors((previous) => ({ ...previous, sourceSchemaId: undefined }));
    }

    if (target === 'target') {
      setTargetSchemaId(ref.schemaId);
      setValidationErrors((previous) => ({ ...previous, targetSchemaId: undefined }));
    }
  }

  if (!projectId) {
    return (
      <div data-testid="page-create-mapping">
        <p className="text-slate-400">No project ID provided.</p>
      </div>
    );
  }

  return (
    <div data-testid="page-create-mapping" className="flex flex-col gap-6">
      <PageHeader
        title="Create Mapping"
        description="Set up the mapping details and choose the schemas you want to map between."
      />

      <Card data-testid="mapping-details-section">
        <div>
          <label htmlFor="mapping-name" className="mb-1 block text-sm font-medium text-slate-300">
            Mapping Name <span className="text-red-400" aria-hidden="true">*</span>
          </label>
          <input
            id="mapping-name"
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSubmitError(null);
              if (validationErrors.name) {
                setValidationErrors((previous) => ({ ...previous, name: undefined }));
              }
            }}
            placeholder="Customer Order to ShipmentOrder"
            aria-required="true"
            aria-invalid={validationErrors.name ? 'true' : 'false'}
            aria-describedby={validationErrors.name ? 'mapping-name-error' : undefined}
            className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              validationErrors.name ? 'border-red-500' : 'border-slate-600'
            }`}
          />
          {validationErrors.name && (
            <p id="mapping-name-error" role="alert" className="mt-1 text-xs text-red-400" data-testid="name-error">
              {validationErrors.name}
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2" data-testid="schema-selection-section">
        <Card title="Source Schema" data-testid="source-schema-card">
          <SchemaSelector
            label="Source Schema"
            value={sourceSchemaId ?? ''}
            onChange={handleSourceSchemaChange}
            schemas={schemas}
            linkedSchemaIds={linkedSchemaIds}
            loading={schemasLoading}
            testId="schema-select-source-schema"
          />

          <SchemaDetailsCardContent
            schema={selectedSourceSchema}
            requiredFieldCount={sourceRequiredFields}
            testIdPrefix="source"
          />

          <div className="mt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openAddSchema('source')}
              data-testid="add-source-schema-button"
            >
              + Add new source schema
            </Button>
          </div>

          {validationErrors.sourceSchemaId && (
            <p role="alert" className="mt-2 text-xs text-red-400" data-testid="source-schema-error">
              {validationErrors.sourceSchemaId}
            </p>
          )}
        </Card>
        <Card title="Target Schema" data-testid="target-schema-card">
          <SchemaSelector
            label="Target Schema"
            value={targetSchemaId ?? ''}
            onChange={handleTargetSchemaChange}
            schemas={schemas}
            linkedSchemaIds={linkedSchemaIds}
            loading={schemasLoading}
            testId="schema-select-target-schema"
          />

          <SchemaDetailsCardContent
            schema={selectedTargetSchema}
            requiredFieldCount={targetRequiredFields}
            testIdPrefix="target"
          />

          <div className="mt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openAddSchema('target')}
              data-testid="add-target-schema-button"
            >
              + Add new target schema
            </Button>
          </div>

          {validationErrors.targetSchemaId && (
            <p role="alert" className="mt-2 text-xs text-red-400" data-testid="target-schema-error">
              {validationErrors.targetSchemaId}
            </p>
          )}
        </Card>
      </div>

      <Card title="Start From" data-testid="start-from-section">
        <fieldset className="space-y-3" aria-label="Start From options">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-700 bg-slate-900/60 p-3">
            <input
              type="radio"
              name="start-mode"
              value="blank"
              checked={startMode === 'blank'}
              onChange={() => handleStartModeChange('blank')}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-slate-100">Blank mapping</span>
              <span className="block text-xs text-slate-400">
                Start with no rules and build the mapping manually in the editor.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-700 bg-slate-900/60 p-3">
            <input
              type="radio"
              name="start-mode"
              value="auto-map"
              checked={startMode === 'auto-map'}
              onChange={() => handleStartModeChange('auto-map')}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-slate-100">
                Auto-map suggestions
              </span>
              <span className="block text-xs text-slate-400">
                Generate suggested rules after the mapping is created. Suggestions must be reviewed before they become mapping rules.
              </span>
            </span>
          </label>

          {validationErrors.startMode && (
            <p role="alert" className="text-xs text-red-400" data-testid="start-mode-error">
              {validationErrors.startMode}
            </p>
          )}
        </fieldset>
      </Card>

      <div data-testid="footer-actions-section" className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-transparent px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-900 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          data-testid="cancel-button"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() => void handleSubmitAttempt()}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-60"
          data-testid="create-button"
        >
          {submitting
            ? 'Creating...'
            : startMode === 'auto-map'
              ? 'Create & Generate Suggestions'
              : 'Create Mapping'}
        </button>
      </div>

      {submitError && (
        <p role="alert" className="text-xs text-red-400" data-testid="submit-error">
          {submitError}
        </p>
      )}

      <SchemaUploadDialog
        open={addSchemaTarget !== null}
        onClose={closeAddSchema}
        onSchemaCreated={handleSchemaCreated}
      />
    </div>
  );
}

function parseSchemaForAutoMapTargets(schema: { metadata: SchemaMetadata; content: Readonly<Record<string, unknown>> | string }) {
  if (typeof schema.content === 'string') {
    if (schema.metadata.format === 'xsd') {
      return parseXsd(schema.content);
    }

    if (schema.metadata.origin === 'inferred') {
      return parseInferredSchema(schema.content, 'xml');
    }

    return parseJsonSchema(schema.content);
  }

  return parseJsonSchema(schema.content);
}

function persistCreateTimeAutoMapSuggestions(mappingId: string, result: AutoMapSectionResult): void {
  const persistedItems: PersistedSuggestionItem[] = result.suggestions.map((suggestion) => ({
    targetPath: suggestion.target,
    suggestedExpression: suggestion.expression,
    explanation: suggestion.explanation,
    confidence: suggestion.confidence,
    validation: suggestion.validation,
    status: 'suggested',
    isNew: true,
    existingExpressionAtGeneration: null,
  }));

  saveAutoMapSuggestions(mappingId, '', persistedItems, {
    generatedAt: new Date().toISOString(),
  });
}

function mapCreateTimeAutoMapFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('offline mode') || message.includes('not enabled in this mode')) {
    return 'Mapping created. Auto-Map suggestions are not available in this mode.';
  }

  return 'Mapping created. Auto-Map suggestions could not be generated right now.';
}

function schemaRefForSelection(schema: SchemaMetadata): SchemaRef {
  if (schema.source.type === 'github') {
    return {
      schemaId: schema.schemaId,
      type: 'github',
      commitSha: schema.source.commitSha,
    };
  }

  return {
    schemaId: schema.schemaId,
    type: 'published',
  };
}

function SchemaSelector({
  label,
  value,
  onChange,
  schemas,
  linkedSchemaIds,
  loading,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  schemas: SchemaMetadata[];
  linkedSchemaIds: string[];
  loading: boolean;
  testId: string;
}) {
  const linkedSchemas = schemas.filter((schema) => linkedSchemaIds.includes(schema.schemaId));
  const otherSchemas = schemas.filter((schema) => !linkedSchemaIds.includes(schema.schemaId));

  return (
    <div className="space-y-2">
      <label htmlFor={testId} className="block text-sm font-medium text-slate-300">
        {label}
      </label>

      {loading ? (
        <div className="h-9 w-full animate-pulse rounded-md bg-slate-800" aria-busy="true" />
      ) : (
        <select
          id={testId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid={testId}
        >
          <option value="">Select a schema</option>

          {linkedSchemas.length > 0 && (
            <optgroup label="Linked schemas">
              {linkedSchemas.map((schema) => (
                <option
                  key={schema.schemaId}
                  value={schema.schemaId}
                  disabled={!isSchemaSelectable(schema)}
                >
                  {buildSchemaOptionLabel(schema)}
                </option>
              ))}
            </optgroup>
          )}

          {otherSchemas.length > 0 && (
            <optgroup label="Other available schemas">
              {otherSchemas.map((schema) => (
                <option
                  key={schema.schemaId}
                  value={schema.schemaId}
                  disabled={!isSchemaSelectable(schema)}
                >
                  {buildSchemaOptionLabel(schema)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </div>
  );
}

function SchemaDetailsCardContent({
  schema,
  requiredFieldCount,
  testIdPrefix,
}: {
  schema: SchemaMetadata | null;
  requiredFieldCount: number | undefined;
  testIdPrefix: 'source' | 'target';
}) {
  if (!schema) {
    return <p className="mt-4 text-sm text-slate-400">No schema selected.</p>;
  }

  return (
    <>
      <dl className="mt-4 space-y-2 text-sm">
        <SummaryItem label="Schema name" value={schema.name} testId={`${testIdPrefix}-schema-name`} />
        <SummaryItem label="Total fields" value={schema.fieldCount} testId={`${testIdPrefix}-total-fields`} />
        <SummaryItem label="Required fields" value={formatMetricValue(requiredFieldCount)} testId={`${testIdPrefix}-required-fields`} />
        <SummaryItem label="Format" value={formatSchemaFormat(schema.format, schema.dataFormat)} testId={`${testIdPrefix}-format`} />
        <SummaryItem label="Origin" value={formatSchemaOrigin(schema.origin)} testId={`${testIdPrefix}-origin`} />
        <SummaryItem label="Status" value={formatSchemaStatus(schema.status)} testId={`${testIdPrefix}-status`} />
      </dl>

      {schema.status === 'needs_review' && (
        <p
          role="status"
          className="mt-2 text-xs text-amber-300"
          data-testid={`${testIdPrefix}-needs-review-warning`}
        >
          Needs review: this schema is selectable, but validate inferred fields before use.
        </p>
      )}
    </>
  );
}

function SummaryItem({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | number;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3" data-testid={testId}>
      <dt className="text-slate-400">{label}</dt>
      <dd className="font-medium text-slate-100">{value}</dd>
    </div>
  );
}

function formatSchemaFormat(format: SchemaMetadata['format'], dataFormat?: SchemaMetadata['dataFormat']): string {
  if (dataFormat === 'xml') {
    return 'XML';
  }

  if (dataFormat === 'json') {
    return 'JSON';
  }

  if (format === 'xsd') {
    return 'XML';
  }

  return String(format).toUpperCase();
}

function formatSchemaStatus(status: SchemaMetadata['status']): string {
  if (status === 'needs_review') {
    return 'Needs review';
  }

  return status[0].toUpperCase() + status.slice(1);
}

function isSchemaSelectable(schema: SchemaMetadata): boolean {
  return schema.status !== 'error';
}

function buildSchemaOptionLabel(schema: SchemaMetadata): string {
  const ownership = schema.origin === 'cdm' ? 'CDM' : 'User';
  const status = formatSchemaStatus(schema.status);
  const format = formatSchemaFormat(schema.format, schema.dataFormat);
  const fields = `${schema.fieldCount} field${schema.fieldCount === 1 ? '' : 's'}`;

  return `${schema.name} • ${ownership} • ${status} • ${format} • ${fields}`;
}

function formatSchemaOrigin(origin: SchemaMetadata['origin']): string {
  if (origin === 'cdm') {
    return 'CDM';
  }

  if (origin === 'inferred') {
    return 'Inferred';
  }

  return 'Uploaded';
}

function formatMetricValue(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return String(value);
}

function getRequiredFieldCount(schema: SchemaMetadata | null): number | undefined {
  if (!schema) {
    return undefined;
  }

  const normalized = schema as unknown as {
    requiredFieldCount?: unknown;
    requiredLeafCount?: unknown;
    summary?: { requiredFieldCount?: unknown; requiredLeafCount?: unknown };
    parsedSummary?: { requiredLeafCount?: unknown };
  };

  const metadataCount = toNonNegativeNumber(
    normalized.requiredFieldCount ?? normalized.summary?.requiredFieldCount,
  );

  if (metadataCount !== undefined) {
    return metadataCount;
  }

  const parsedNodeCount = toNonNegativeNumber(
    normalized.parsedSummary?.requiredLeafCount ??
      normalized.requiredLeafCount ??
      normalized.summary?.requiredLeafCount,
  );

  if (parsedNodeCount !== undefined) {
    return parsedNodeCount;
  }

  return undefined;
}

function toNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  return undefined;
}
