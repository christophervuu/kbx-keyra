import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useAdapter } from '@/lib/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PageHeader } from '@/components/PageHeader';
import { PATHS } from '@/routes/paths';
import type { SchemaMetadata, SchemaRef } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Name', index: 1 },
  { label: 'Source Schema', index: 2 },
  { label: 'Target Schema', index: 3 },
] as const;

interface StepIndicatorProps {
  current: number;
  total: number;
}

function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <ol className="mb-6 flex items-center gap-0" aria-label="Progress">
      {STEPS.slice(0, total).map((step, i) => {
        const state =
          step.index < current ? 'completed' : step.index === current ? 'active' : 'pending';
        return (
          <li key={step.index} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-px w-8 ${state === 'pending' ? 'bg-slate-700' : 'bg-blue-500'}`}
                aria-hidden="true"
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  state === 'completed'
                    ? 'bg-blue-600 text-white'
                    : state === 'active'
                      ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                      : 'bg-slate-700 text-slate-400'
                }`}
                aria-current={state === 'active' ? 'step' : undefined}
              >
                {step.index}
              </div>
              <span
                className={`text-xs ${state === 'active' ? 'font-medium text-slate-200' : 'text-slate-500'}`}
              >
                {step.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Schema selector (Step 2 / Step 3)
// ---------------------------------------------------------------------------

const SKIP_VALUE = '__skip__';

interface SchemaSelectorProps {
  label: string;
  schemas: SchemaMetadata[];
  value: string; // schemaId or SKIP_VALUE
  onChange: (value: string) => void;
  loading: boolean;
}

const FORMAT_LABELS: Record<string, string> = {
  'json-schema': 'JSON Schema',
  xsd: 'XSD',
  'sample-json': 'Sample JSON',
  'sample-xml': 'Sample XML',
  unknown: 'Unknown',
};

function SchemaSelector({ label, schemas, value, onChange, loading }: SchemaSelectorProps) {
  return (
    <div>
      <label htmlFor={`schema-select-${label}`} className="mb-1 block text-sm font-medium text-slate-300">
        {label}
      </label>
      {loading ? (
        <div className="h-9 w-full animate-pulse rounded-md bg-slate-800" aria-busy="true" />
      ) : (
        <select
          id={`schema-select-${label}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-testid={`schema-select-${label.toLowerCase().replace(/\s+/g, '-')}`}
        >
          <option value={SKIP_VALUE}>Skip — add schema later</option>
          {schemas.map((s) => (
            <option key={s.schemaId} value={s.schemaId}>
              {s.name} [{FORMAT_LABELS[s.format] ?? s.format}]
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function CreateMappingPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const adapter = useAdapter();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [sourceSchemaId, setSourceSchemaId] = useState<string>(SKIP_VALUE);
  const [targetSchemaId, setTargetSchemaId] = useState<string>(SKIP_VALUE);

  const [schemas, setSchemas] = useState<SchemaMetadata[]>([]);
  const [schemasLoading, setSchemasLoading] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load project schemas for dropdowns
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function load() {
      setSchemasLoading(true);
      try {
        const project = await adapter.getProject(projectId!);
        const results = await Promise.allSettled(
          project.schemaRefs.map((ref) => adapter.getSchema(ref.schemaId)),
        );
        if (cancelled) return;
        const loaded = results
          .filter(
            (r): r is PromiseFulfilledResult<{ metadata: SchemaMetadata; content: unknown }> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value.metadata);
        setSchemas(loaded);
      } catch {
        // Non-fatal: dropdowns will just be empty
      } finally {
        if (!cancelled) setSchemasLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [adapter, projectId]);

  // -------------------------------------------------------------------------
  // Navigation guards
  // -------------------------------------------------------------------------

  function handleNext() {
    if (step === 1) {
      if (!name.trim()) {
        setNameError('Mapping name is required');
        return;
      }
      setNameError(null);
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setStep((s) => s - 1);
  }

  function handleCancel() {
    if (projectId) {
      navigate(PATHS.PROJECT_OVERVIEW.replace(':projectId', projectId));
    } else {
      navigate(PATHS.HOME);
    }
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  async function handleSubmit() {
    if (!projectId) return;

    setSubmitError(null);
    setSubmitting(true);

    try {
      const sourceSchemaRef: SchemaRef | undefined =
        sourceSchemaId !== SKIP_VALUE
          ? { schemaId: sourceSchemaId, type: 'local' }
          : undefined;

      const targetSchemaRef: SchemaRef | undefined =
        targetSchemaId !== SKIP_VALUE
          ? { schemaId: targetSchemaId, type: 'local' }
          : undefined;

      const result = await adapter.createMapping({
        projectId,
        name: name.trim(),
        sourceSchemaRef,
        targetSchemaRef,
      });

      navigate(
        PATHS.MAPPING_EDITOR.replace(':projectId', projectId).replace(
          ':mappingId',
          result.mappingId,
        ),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setSubmitError(msg);
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!projectId) {
    return (
      <div data-testid="page-create-mapping">
        <p className="text-slate-400">No project ID provided.</p>
      </div>
    );
  }

  return (
    <div data-testid="page-create-mapping">
      <PageHeader title="Create New Mapping" />

      <div className="max-w-lg">
        <Card>
          <StepIndicator current={step} total={3} />

          {/* Step 1 — Name */}
          {step === 1 && (
            <div data-testid="step-1">
              <div className="mb-6">
                <label
                  htmlFor="mapping-name"
                  className="mb-1 block text-sm font-medium text-slate-300"
                >
                  Mapping Name <span className="text-red-400" aria-hidden="true">*</span>
                </label>
                <input
                  id="mapping-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Enter mapping name"
                  aria-required="true"
                  aria-invalid={nameError ? 'true' : 'false'}
                  aria-describedby={nameError ? 'mapping-name-error' : undefined}
                  className={`w-full rounded-md border bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    nameError ? 'border-red-500' : 'border-slate-600'
                  }`}
                />
                {nameError && (
                  <p
                    id="mapping-name-error"
                    role="alert"
                    className="mt-1 text-xs text-red-400"
                    data-testid="name-error"
                  >
                    {nameError}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2 — Source Schema */}
          {step === 2 && (
            <div data-testid="step-2">
              <p className="mb-4 text-sm text-slate-400">
                Select the source schema for this mapping, or skip and add it later.
              </p>
              <SchemaSelector
                label="Source Schema"
                schemas={schemas}
                value={sourceSchemaId}
                onChange={setSourceSchemaId}
                loading={schemasLoading}
              />
            </div>
          )}

          {/* Step 3 — Target Schema */}
          {step === 3 && (
            <div data-testid="step-3">
              <p className="mb-4 text-sm text-slate-400">
                Select the target schema for this mapping, or skip and add it later.
              </p>
              <SchemaSelector
                label="Target Schema"
                schemas={schemas}
                value={targetSchemaId}
                onChange={setTargetSchemaId}
                loading={schemasLoading}
              />
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-400"
              data-testid="submit-error"
            >
              {submitError}
            </p>
          )}

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              data-testid="cancel-button"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-2">
              {step > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleBack}
                  data-testid="back-button"
                >
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleNext}
                  data-testid="next-button"
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={submitting}
                  onClick={() => void handleSubmit()}
                  data-testid="create-button"
                >
                  Create Mapping
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
