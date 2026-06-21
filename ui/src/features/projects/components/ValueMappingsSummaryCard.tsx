import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useAdapter } from '@/lib/api';
import { PATHS } from '@/routes/paths';

export interface ValueMappingsSummaryCardProps {
  projectId: string;
}

interface SummaryState {
  activeTableCount: number;
  mappingsUsingCount: number;
}

export function ValueMappingsSummaryCard({ projectId }: ValueMappingsSummaryCardProps) {
  const adapter = useAdapter();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryState>({
    activeTableCount: 0,
    mappingsUsingCount: 0,
  });

  const managePath = useMemo(
    () => PATHS.PROJECT_VALUE_MAPPINGS.replace(':projectId', projectId),
    [projectId],
  );

  const fetchSummary = useCallback(async (): Promise<SummaryState> => {
    const tables = await adapter.listProjectValueTables(projectId, {
      status: 'active',
      sortBy: 'updatedAt',
      sortDirection: 'desc',
    });

    const usageEntries = await Promise.all(
      tables.map(async (table) => {
        try {
          return await adapter.listProjectValueTableUsage(table.id);
        } catch {
          return [];
        }
      }),
    );

    const mappingsUsing = new Set<string>();
    for (const usage of usageEntries) {
      for (const entry of usage) {
        mappingsUsing.add(entry.mappingId);
      }
    }

    return {
      activeTableCount: tables.length,
      mappingsUsingCount: mappingsUsing.size,
    };
  }, [adapter, projectId]);

  useEffect(() => {
    let cancelled = false;

    void fetchSummary()
      .then((nextSummary) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setErrorMessage(null);
        setIsLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load value mappings summary.');
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchSummary]);

  return (
    <Card
      title="Value Mappings"
      description="Reusable project value tables for map-values rules."
      data-testid="project-value-mappings-summary"
      className="p-5"
    >
      {isLoading ? (
        <div role="status" className="space-y-2" data-testid="project-value-mappings-summary-loading">
          <p className="text-sm text-slate-400">Loading value mappings summary…</p>
        </div>
      ) : errorMessage ? (
        <div className="space-y-3" data-testid="project-value-mappings-summary-error">
          <p className="text-sm text-red-300">Failed to load value mappings summary.</p>
          <p className="text-xs text-slate-400">{errorMessage}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsLoading(true);
              setErrorMessage(null);
              void fetchSummary()
                .then((nextSummary) => {
                  setSummary(nextSummary);
                  setErrorMessage(null);
                })
                .catch((error) => {
                  setErrorMessage(error instanceof Error ? error.message : 'Failed to load value mappings summary.');
                })
                .finally(() => {
                  setIsLoading(false);
                });
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4" data-testid="project-value-mappings-summary-loaded">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Active tables</p>
              <p className="mt-1 text-xl font-semibold text-slate-100" data-testid="value-mappings-active-count">
                {summary.activeTableCount}
              </p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Mappings using tables</p>
              <p className="mt-1 text-xl font-semibold text-slate-100" data-testid="value-mappings-usage-count">
                {summary.mappingsUsingCount}
              </p>
            </div>
          </div>

          {summary.activeTableCount === 0 ? (
            <p className="text-sm text-slate-400" data-testid="value-mappings-empty-guidance">
              No value tables yet. Create a table to reuse lookup mappings across rules.
            </p>
          ) : null}

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate(managePath)}
              data-testid="value-mappings-manage-action"
            >
              Manage Value Mappings
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
