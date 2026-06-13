import type { SchemaOrigin } from '@/lib/types/domain';

export type SchemaActionSurface = 'project-overview' | 'schema-detail' | 'schema-library';

export type SchemaUiAction =
  | 'view'
  | 'resync'
  | 'unlink'
  | 'edit'
  | 'replace'
  | 'remove'
  | 'publish';

const CDM_ALLOWED_ACTIONS: Record<SchemaActionSurface, readonly SchemaUiAction[]> = {
  'project-overview': ['view', 'resync', 'unlink'],
  'schema-detail': ['view'],
  'schema-library': ['view'],
};

export function isSchemaActionAllowed(
  origin: SchemaOrigin | string,
  surface: SchemaActionSurface,
  action: SchemaUiAction,
): boolean {
  if (origin !== 'cdm') return true;
  return CDM_ALLOWED_ACTIONS[surface].includes(action);
}
