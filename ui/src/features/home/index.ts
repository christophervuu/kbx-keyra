// Feature barrel — re-exports types, hooks, and components for the Home feature

// Feature-local types
export type {
  DashboardLoadState,
  DashboardMetrics,
  ProjectListItem,
  ProjectWorstStatus,
  RecentActivityEntry,
  SortDirection,
  SortField,
  StatusFilter,
  ViewMode,
} from './types';

// Hooks (populated by subsequent tasks)
export * from './hooks';

// Components (populated by subsequent tasks)
export * from './components';
