// DashboardEmptyState — Shown when no projects exist (FS-014 T-08)

import { FolderOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/Button';
import { PATHS } from '@/routes/paths';

export function DashboardEmptyState() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
      <FolderOpen
        className="text-slate-500"
        size={64}
        strokeWidth={1.25}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-slate-100">No projects yet</h2>
        <p className="text-sm text-slate-400">
          Create your first project to start mapping data.
        </p>
      </div>
      <Button
        variant="primary"
        size="lg"
        onClick={() => navigate(PATHS.CREATE_PROJECT)}
      >
        Create Your First Project
      </Button>
    </div>
  );
}
