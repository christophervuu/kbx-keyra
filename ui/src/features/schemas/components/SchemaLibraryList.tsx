import { useNavigate } from 'react-router-dom';

import type { SchemaLibraryItem } from '../types';
import { getSchemaOriginLabel } from './SchemaPresentationPrimitives';
import { SchemaStatusBadge } from './SchemaStatusBadge';

import { PATHS } from '@/routes/paths';

export interface SchemaLibraryListProps {
  items: SchemaLibraryItem[];
}

function formatFieldCount(item: SchemaLibraryItem): string {
  if (item.fieldCount > 0) {
    return `${item.fieldCount}`;
  }

  if (item.status === 'processing') return 'No fields yet';
  if (item.status === 'needs_review') return 'No fields yet';
  if (item.status === 'error') return 'No fields (error)';
  return 'No fields';
}

export function SchemaLibraryList({ items }: SchemaLibraryListProps) {
  const navigate = useNavigate();

  return (
    <div className="overflow-hidden rounded-md border border-slate-800" data-testid="schema-library-list">
      <table className="min-w-full divide-y divide-slate-800 text-sm">
        <thead className="bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">Schema</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Format</th>
            <th className="px-4 py-3"># of Fields</th>
            <th className="px-4 py-3">Used by # of Projects</th>
            <th className="px-4 py-3">Updated on</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 bg-slate-900/40">
          {items.map((item) => (
            <tr
              key={item.schemaId}
              tabIndex={0}
              role="row"
              className="cursor-pointer text-slate-200 hover:bg-slate-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => navigate(PATHS.SCHEMA_DETAIL.replace(':schemaId', item.schemaId))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(PATHS.SCHEMA_DETAIL.replace(':schemaId', item.schemaId));
                }
              }}
              data-testid="schema-library-list-row"
            >
              <td className="px-4 py-3 font-medium text-slate-100">
                <div className="flex items-center gap-2">
                  {item.ownership === 'cdm' ? (
                    <span
                      className="inline-flex items-center rounded-full border border-purple-700 bg-purple-900/40 px-2 py-0.5 text-xs font-medium text-purple-200"
                      data-testid="schema-list-cdm-badge"
                    >
                      {getSchemaOriginLabel('cdm')}
                    </span>
                  ) : null}
                  <span>{item.name}</span>
                </div>
                {item.disambiguator ? (
                  <p className="mt-0.5 text-xs font-normal text-slate-400" data-testid="schema-list-disambiguator">
                    {item.disambiguator}
                  </p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <SchemaStatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3">{item.dataFormat}</td>
              <td className="px-4 py-3">{formatFieldCount(item)}</td>
              <td className="px-4 py-3">{item.projectCount}</td>
              <td className="px-4 py-3">{new Date(item.updatedAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
