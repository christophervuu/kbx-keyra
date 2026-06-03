// ---------------------------------------------------------------------------
// Feature-local types for the Projects feature (FS-013)
// ---------------------------------------------------------------------------

import type { DeployStatus } from '@/lib/types/domain';

/** Whether a schema is global (shared across projects) or project-scoped. */
export type SchemaScope = 'global' | 'project-level';

/** Load state for a project detail page. */
export type ProjectLoadState = 'loading' | 'loaded' | 'error' | 'not-found';

/**
 * Derived view model for schema cards shown in the project schema list.
 * Collapses domain SchemaMetadata + project-scope info into a flat display model.
 */
export interface SchemaCardData {
  readonly schemaId: string;
  readonly name: string;
  readonly format: string;
  readonly origin: string;
  readonly sourceType: 'github' | 'upload';
  readonly scope: SchemaScope;
  readonly fieldCount: number;
  readonly syncStatus: string;
  readonly isInferred: boolean;
}

/**
 * Derived view model for rows in the mapping table on the Project Overview page.
 * Collapses domain MappingMetadata + deploy status info into a flat display model.
 */
export interface MappingRowData {
  readonly mappingId: string;
  readonly name: string;
  readonly sourceSchemaName: string | null;
  readonly targetSchemaName: string | null;
  readonly ruleCount: number;
  readonly coverage: number;
  readonly status: string;
  readonly devDeploy: DeployStatus;
  readonly qaDeploy: DeployStatus;
  readonly prodDeploy: DeployStatus;
  readonly updatedAt: string;
}

/** Form data for the Create Project flow. */
export interface CreateProjectFormData {
  readonly name: string;
  readonly description: string;
  readonly tags: string[];
}

/** Form data for the Create Mapping flow. */
export interface CreateMappingFormData {
  readonly name: string;
  readonly sourceSchemaId: string | null;
  readonly targetSchemaId: string | null;
}

/** Step identifiers for the multi-step Create Mapping wizard. */
export type CreateMappingStep = 'name' | 'source-schema' | 'target-schema' | 'confirm';
