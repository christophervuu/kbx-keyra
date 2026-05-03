import { useParams } from 'react-router-dom';

import { SchemaDetailPage } from '@/features/schemas/components/SchemaDetailPage';

export default function SchemaDetail() {
  const { schemaId } = useParams<{ schemaId: string }>();

  if (!schemaId) {
    return (
      <div data-testid="page-schema-detail">
        <p className="p-6 text-slate-400">Invalid schema URL.</p>
      </div>
    );
  }

  return <SchemaDetailPage schemaId={schemaId} />;
}
