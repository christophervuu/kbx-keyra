import { Eye, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/Button';
import type {
  AddSchemaSampleResult,
  SchemaDataFormat,
  SchemaMetadata,
  SchemaSamplePayloadContent,
  SchemaSamplePayloadMetadata,
} from '@/lib/types';

interface SchemaSamplePayloadsSectionProps {
  metadata: SchemaMetadata;
  onAddSample: (input: { sampleName?: string; sampleContent: unknown; applySuggestedUpdates?: boolean }) => Promise<AddSchemaSampleResult>;
  onDeleteSample?: (sampleId: string) => Promise<void>;
  onLoadSamplePayload?: (sampleId: string) => Promise<SchemaSamplePayloadContent>;
  initialSamplePayload?: unknown;
  onSelectedSamplePayloadChange?: (sampleId: string | null, payload: unknown | null) => void;
}

interface CachedSamplePayload {
  readonly parsed: unknown;
  readonly raw: string;
  readonly dataFormat: SchemaDataFormat;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function toPrettyRaw(content: unknown, dataFormat: SchemaDataFormat): string {
  if (typeof content === 'string') return content;
  if (dataFormat === 'xml') return String(content);
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

export function SchemaSamplePayloadsSection({
  metadata,
  onAddSample,
  onDeleteSample,
  onLoadSamplePayload,
  initialSamplePayload,
  onSelectedSamplePayloadChange,
}: SchemaSamplePayloadsSectionProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [sampleName, setSampleName] = useState('');
  const [sampleContent, setSampleContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [cachedSamplePayloads, setCachedSamplePayloads] = useState<Record<string, CachedSamplePayload>>({});
  const [viewingSampleId, setViewingSampleId] = useState<string | null>(null);
  const [deleteConfirmSample, setDeleteConfirmSample] = useState<SchemaSamplePayloadMetadata | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadingSampleIds, setLoadingSampleIds] = useState<Set<string>>(new Set());
  const [viewError, setViewError] = useState<string | null>(null);

  const samples = useMemo(() => metadata.samplePayloads ?? [], [metadata.samplePayloads]);

  const visibleSamples = samples;

  const effectiveSelectedSampleId = useMemo(() => {
    if (!selectedSampleId) return null;
    return visibleSamples.some((sample) => sample.sampleId === selectedSampleId) ? selectedSampleId : null;
  }, [visibleSamples, selectedSampleId]);

  const selectedSample = useMemo(
    () => visibleSamples.find((sample) => sample.sampleId === effectiveSelectedSampleId) ?? null,
    [visibleSamples, effectiveSelectedSampleId],
  );

  const resolvedSelectedPayload = useMemo(() => {
    if (!selectedSample) return null;

    const cached = cachedSamplePayloads[selectedSample.sampleId];
    if (cached) {
      return cached.parsed;
    }

    if (selectedSample.source === 'initial_upload' && initialSamplePayload !== undefined) {
      return initialSamplePayload;
    }

    return null;
  }, [selectedSample, cachedSamplePayloads, initialSamplePayload]);

  useEffect(() => {
    onSelectedSamplePayloadChange?.(selectedSample?.sampleId ?? null, resolvedSelectedPayload);
  }, [selectedSample, resolvedSelectedPayload, onSelectedSamplePayloadChange]);

  const resolvedViewingPayload = useMemo(() => {
    if (!viewingSampleId) return null;

    const sample = visibleSamples.find((entry) => entry.sampleId === viewingSampleId);
    if (!sample) return null;

    const cached = cachedSamplePayloads[sample.sampleId];
    if (cached) {
      return {
        raw: cached.raw,
        dataFormat: cached.dataFormat,
      } as const;
    }

    if (sample.source === 'initial_upload' && initialSamplePayload !== undefined) {
      const dataFormat = sample.dataFormat ?? metadata.dataFormat ?? 'json';
      return {
        raw: toPrettyRaw(initialSamplePayload, dataFormat),
        dataFormat,
      } as const;
    }

    return null;
  }, [viewingSampleId, visibleSamples, cachedSamplePayloads, initialSamplePayload, metadata.dataFormat]);

  async function ensureSamplePayloadCached(sample: SchemaSamplePayloadMetadata): Promise<void> {
    if (cachedSamplePayloads[sample.sampleId]) {
      return;
    }

    if (sample.source === 'initial_upload' && initialSamplePayload !== undefined) {
      return;
    }

    if (typeof onLoadSamplePayload !== 'function') {
      return;
    }

    setLoadingSampleIds((prev) => new Set(prev).add(sample.sampleId));

    try {
      const payload = await onLoadSamplePayload(sample.sampleId);
      setCachedSamplePayloads((prev) => ({
        ...prev,
        [sample.sampleId]: {
          parsed: payload.parsed,
          raw: payload.raw,
          dataFormat: payload.dataFormat,
        },
      }));
    } catch {
      // Keep compatibility with offline/local modes where payload fetch may be unavailable.
    } finally {
      setLoadingSampleIds((prev) => {
        const next = new Set(prev);
        next.delete(sample.sampleId);
        return next;
      });
    }
  }

  async function confirmDelete() {
    if (!deleteConfirmSample) {
      return;
    }

    if (typeof onDeleteSample !== 'function') {
      setError('Deleting schema samples is not available in this mode.');
      setDeleteConfirmSample(null);
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await onDeleteSample(deleteConfirmSample.sampleId);
      setCachedSamplePayloads((prev) => {
        const next = { ...prev };
        delete next[deleteConfirmSample.sampleId];
        return next;
      });

      if (selectedSampleId === deleteConfirmSample.sampleId) {
        setSelectedSampleId(null);
      }

      if (viewingSampleId === deleteConfirmSample.sampleId) {
        setViewingSampleId(null);
      }

      setDeleteConfirmSample(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete sample payload.');
    } finally {
      setIsDeleting(false);
    }
  }

  async function submit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const asXml = metadata.dataFormat === 'xml';
      const payload = asXml ? sampleContent : JSON.parse(sampleContent);

      const result = await onAddSample({
        sampleName: sampleName.trim() || undefined,
        sampleContent: payload,
        applySuggestedUpdates: false,
      });

      setCachedSamplePayloads((prev) => ({
        ...prev,
        [result.sample.sampleId]: {
          parsed: payload,
          raw: sampleContent,
          dataFormat: result.sample.dataFormat,
        },
      }));

      setSelectedSampleId(result.sample.sampleId);
      setIsAddOpen(false);
      setSampleName('');
      setSampleContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add sample payload.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      data-testid="schema-detail-samples"
      className="rounded-lg border border-slate-800 bg-slate-900 p-4"
      aria-label="Sample payloads"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Sample Payloads</h2>
        <Button variant="secondary" size="sm" data-testid="add-sample-button" onClick={() => setIsAddOpen(true)}>
          Add sample
        </Button>
      </div>

      {visibleSamples.length === 0 ? (
        <p data-testid="sample-empty" className="text-sm text-slate-500">
          No sample payloads yet.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="sample-list">
          {visibleSamples.map((sample) => {
            const isSelected = effectiveSelectedSampleId === sample.sampleId;
            return (
              <li
                key={sample.sampleId}
                className={`rounded border px-3 py-2 transition-colors ${
                  isSelected
                    ? 'border-blue-700/70 bg-blue-950/30'
                    : 'border-slate-700 bg-slate-950/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    data-testid={`sample-row-${sample.sampleId}`}
                    onClick={() => {
                      if (effectiveSelectedSampleId === sample.sampleId) {
                        setSelectedSampleId(null);
                        return;
                      }

                      setSelectedSampleId(sample.sampleId);
                      void ensureSamplePayloadCached(sample).catch((err) => {
                        setError(err instanceof Error ? err.message : 'Failed to load sample payload.');
                      });
                    }}
                  >
                    <p className="truncate text-sm font-medium text-slate-200">{sample.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDate(sample.createdAt)}</p>
                  </button>

                  <div className="flex items-center gap-2">
                    {loadingSampleIds.has(sample.sampleId) && (
                      <span
                        data-testid={`sample-loading-${sample.sampleId}`}
                        className="text-[10px] text-slate-500"
                      >
                        Loading…
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`sample-view-${sample.sampleId}`}
                      onClick={() => {
                        setViewError(null);
                        setViewingSampleId(sample.sampleId);
                        void ensureSamplePayloadCached(sample).catch((err) => {
                          setViewError(err instanceof Error ? err.message : 'Failed to load raw sample payload.');
                        });
                      }}
                      aria-label={`View raw payload for ${sample.name}`}
                      title="View raw payload"
                    >
                      <Eye size={14} aria-hidden="true" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`sample-delete-${sample.sampleId}`}
                      onClick={() => {
                        setDeleteConfirmSample(sample);
                      }}
                      aria-label={`Delete ${sample.name}`}
                      title="Delete sample"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>

                    {sample.usedForInference && (
                      <span
                        data-testid="sample-ready-tag"
                        className="rounded border border-emerald-700/80 bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200"
                      >
                        Ready
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-rose-300" role="alert" data-testid="add-sample-error">{error}</p>}

      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation" data-testid="add-sample-overlay">
          <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={() => !isSubmitting && setIsAddOpen(false)} />

          <div className="relative z-10 w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="Add sample payload">
            <div className="space-y-3" data-testid="add-sample-form">
              <h3 className="text-2 font-semibold text-slate-100">Add sample payload</h3>
              <p className="text-xs text-slate-400">
                Expected format: {metadata.dataFormat === 'xml' ? 'XML' : 'JSON'}
              </p>
              <input
                data-testid="sample-name-input"
                value={sampleName}
                onChange={(e) => setSampleName(e.target.value)}
                placeholder="Sample name (optional)"
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
              <textarea
                data-testid="sample-content-input"
                value={sampleContent}
                onChange={(e) => setSampleContent(e.target.value)}
                placeholder={metadata.dataFormat === 'xml' ? '<root>...</root>' : '{ "example": true }'}
                rows={6}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="add-sample-cancel"
                  onClick={() => setIsAddOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  data-testid="add-sample-save"
                  onClick={() => void submit()}
                  disabled={isSubmitting || !sampleContent.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmSample && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation" data-testid="delete-sample-overlay">
          <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={() => !isDeleting && setDeleteConfirmSample(null)} />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete sample payload"
            data-testid="delete-sample-modal"
            className="relative z-10 w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl"
          >
            <h3 className="text-sm font-semibold text-slate-100">Delete sample payload?</h3>
            <p className="mt-2 text-sm text-slate-400">
              This will permanently remove <span className="font-medium text-slate-200">{deleteConfirmSample.name}</span>.
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                data-testid="delete-sample-cancel"
                onClick={() => setDeleteConfirmSample(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                data-testid="delete-sample-confirm"
                onClick={() => void confirmDelete()}
                disabled={isDeleting}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewingSampleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="presentation" data-testid="view-sample-overlay">
          <div className="absolute inset-0 bg-black/60" aria-hidden="true" onClick={() => setViewingSampleId(null)} />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="View sample payload"
            data-testid="view-sample-modal"
            className="relative z-10 flex w-full max-w-3xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
            style={{ maxHeight: '85vh' }}
          >
            <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-100">Raw sample payload</h3>
              <Button variant="ghost" size="sm" data-testid="view-sample-close" onClick={() => setViewingSampleId(null)}>
                ✕
              </Button>
            </div>

            <div className="overflow-auto p-4">
              {viewError ? (
                <p data-testid="view-sample-error" className="text-sm text-rose-300">
                  {viewError}
                </p>
              ) : resolvedViewingPayload ? (
                <pre data-testid="view-sample-content" className="font-mono text-xs leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                  {resolvedViewingPayload.raw}
                </pre>
              ) : loadingSampleIds.has(viewingSampleId) ? (
                <p data-testid="view-sample-loading" className="text-sm text-slate-400">
                  Loading sample payload…
                </p>
              ) : (
                <p data-testid="view-sample-unavailable" className="text-sm text-slate-400">
                  Raw payload is not available for this sample in the current mode.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
