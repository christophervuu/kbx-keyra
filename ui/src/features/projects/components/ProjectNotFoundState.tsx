import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '@/routes/paths';

/**
 * Not-found state for the Project Overview page. Shows a descriptive message
 * and a link back to the Home Dashboard.
 */
export function ProjectNotFoundState() {
  return (
    <div
      className="flex flex-col items-center gap-4 rounded-lg border border-slate-700 bg-slate-900 p-8 text-center"
      data-testid="project-not-found-state"
    >
      <FileQuestion size={40} className="text-slate-500" aria-hidden="true" />
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Project not found</h2>
        <p className="mt-1 text-xs text-slate-400">
          The project you're looking for doesn't exist or was deleted.
        </p>
      </div>
      <Link
        to={PATHS.HOME}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        data-testid="not-found-home-link"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
