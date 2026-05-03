// Re-export shared domain types for convenience
export type {
  MappingNodeStatus,
  ParsedSchema,
  SchemaNodeType,
  SchemaTreeNode,
} from '@/lib/types';

// Feature-specific types
export { SchemaParseError } from './types';
export type {
  EditNodeCallbacks,
  ParseInferredSchemaFn,
  ParseJsonSchemaFn,
  ParseXsdFn,
  SchemaTreeViewProps,
} from './types';

// Parser and filter functions
export { filterTree, parseInferredSchema, parseJsonSchema, parseXsd } from './lib';
export type { TreeFilterResult } from './lib';

// Hooks
export { flattenTree, useFlattenedTree, useTreeSearch } from './hooks';
export type { UseTreeSearchReturn } from './hooks';

// Components
export { SchemaSearchInput, SchemaTreeNodeIcon, SchemaTreeNodeRow, SchemaTreeView } from './components';
export type { SchemaTreeViewHandle } from './components';
