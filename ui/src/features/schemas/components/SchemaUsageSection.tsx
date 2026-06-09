import { Link } from 'react-router-dom';

import { PATHS } from '@/routes/paths';

import { useSchemaUsage } from '../hooks/use-schema-usage';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SchemaUsageSectionProps {
  schemaId: string;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function UsageSkeleton() {
  return (
    <div data-testid="schema-usage-skeleton" className="animate-pulse space-y-2">
      <div className="h-4 w-1/4 rounded bg-slate-700" />
      <div className="h-4 w-1/3 rounded bg-slate-700" />
      <div className="mt-3 h-4 w-1/4 rounded bg-slate-700" />
      <div className="h-4 w-2/5 rounded bg-slate-700" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Displays which projects and mappings reference the current schema.
 * Provides navigation links to Project Overview and Mapping Editor.
 */
export function SchemaUsageSection({ schemaId }: SchemaUsageSectionProps) {
  const { projects, mappings, isLoading } = useSchemaUsage(schemaId);

  return (
    <section
      data-testid="schema-detail-usage"
      aria-label="Schema usage"
      className="rounded-lg border border-slate-800 bg-slate-900 p-4"
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Usage
      </h2>

      {isLoading ? (
        <UsageSkeleton />
      ) : projects.length === 0 && mappings.length === 0 ? (
        <p
          data-testid="schema-usage-empty"
          className="text-sm italic text-slate-500"
        >
          This schema is not currently used by any projects or mappings.
        </p>
      ) : (
        <div className="space-y-5">
          {/* Projects list */}
          {projects.length > 0 && (
            <div>
              <h3
                data-testid="schema-usage-projects-heading"
                className="mb-1.5 text-xs font-medium text-slate-500"
              >
                Projects using this schema
              </h3>
              <ul
                data-testid="schema-usage-projects-list"
                className="space-y-1"
              >
                {projects.map((p) => (
                  <li key={p.projectId}>
                    <Link
                      to={PATHS.PROJECT_OVERVIEW.replace(':projectId', p.projectId)}
                      data-testid={`schema-usage-project-link-${p.projectId}`}
                      className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mappings list */}
          {mappings.length > 0 && (
            <div>
              <h3
                data-testid="schema-usage-mappings-heading"
                className="mb-1.5 text-xs font-medium text-slate-500"
              >
                Mappings referencing this schema
              </h3>
              <ul
                data-testid="schema-usage-mappings-list"
                className="space-y-1"
              >
                {mappings.map((m) => (
                  <li key={`${m.projectId}-${m.mappingId}`} className="flex items-center gap-2">
                    <Link
                      to={PATHS.MAPPING_EDITOR
                        .replace(':projectId', m.projectId)
                        .replace(':mappingId', m.mappingId)}
                      data-testid={`schema-usage-mapping-link-${m.mappingId}`}
                      className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      {m.name}
                    </Link>
                    <span
                      className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-400"
                      aria-label={`Used as ${m.role} schema`}
                    >
                      {m.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
