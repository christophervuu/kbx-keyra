// Feature barrel — re-exports types, hooks, and components for the Projects feature

// Feature-local types
export type {
  CreateMappingFormData,
  CreateMappingStep,
  CreateProjectFormData,
  MappingRowData,
  ProjectLoadState,
  SchemaCardData,
  SchemaScope,
} from './types';

// Hooks (populated by subsequent tasks)
export * from './hooks';

// Components (populated by subsequent tasks)
export * from './components';
