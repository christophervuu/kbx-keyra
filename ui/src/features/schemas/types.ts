import type {
  SchemaDataFormat,
  MappingNodeStatus,
  ParsedSchema,
  SchemaFormat,
  SchemaOwnership,
  SchemaStatus,
  SchemaNodeType,
  SchemaOrigin,
  SchemaTreeNode,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export interface SchemaTreeViewProps {
  /** The parsed schema to render as a tree */
  readonly schema: ParsedSchema;
  /** Whether this tree represents the source or target schema */
  readonly variant: 'source' | 'target';
  /** Mapping status per field path (target variant only) */
  readonly mappingStatus?: Map<string, MappingNodeStatus>;
  /** Callback when a tree node is selected */
  readonly onSelectNode?: (node: SchemaTreeNode) => void;
  /** Path of the currently selected node (controlled selection) */
  readonly selectedPath?: string;
  /** Whether to show the search/filter input (default: true) */
  readonly searchable?: boolean;
  /** Whether the tree is in editable mode (default: false) */
  readonly editable?: boolean;
  /** Edit operation callbacks — required when editable is true */
  readonly onNodeEdit?: EditNodeCallbacks;
  /** Optional per-field sample value text displayed at row right side */
  readonly sampleValueByPath?: ReadonlyMap<string, string>;
}

// ---------------------------------------------------------------------------
// Edit mode callbacks
// ---------------------------------------------------------------------------

/**
 * Callbacks for all in-place tree editing operations.
 * Passed from `useSchemaEditor` through `SchemaTreeView` to individual rows.
 */
export interface EditNodeCallbacks {
  onToggleRequired: (path: string) => void;
  onChangeType: (path: string, newType: SchemaNodeType) => void;
  onRenameField: (path: string, newName: string) => void;
  onUpdateDescription: (path: string, description: string) => void;
  /** Add a plain field as a child of `parentPath` (null = root level) */
  onAddField: (parentPath: string | null) => void;
  onRemoveField: (path: string) => void;
  /** Add a nested object with a placeholder child */
  onAddNestedObject: (parentPath: string | null) => void;
  /** Add an array field */
  onAddArrayField: (parentPath: string | null) => void;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class SchemaParseError extends Error {
  readonly format: SchemaFormat;
  readonly details?: string;

  constructor(message: string, format: SchemaFormat, details?: string) {
    super(message);
    this.name = 'SchemaParseError';
    this.format = format;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// Parser Function Signatures
// ---------------------------------------------------------------------------

export type ParseJsonSchemaFn = (content: string | object) => ParsedSchema;
export type ParseXsdFn = (content: string) => ParsedSchema;
export type ParseInferredSchemaFn = (content: string, format: 'json' | 'xml') => ParsedSchema;

// ---------------------------------------------------------------------------
// Schema Library Types (FS-016)
// ---------------------------------------------------------------------------

export type SyncStatus = 'synced' | 'update-available' | 'sync-failed' | 'local' | 'inferred';
export type DisplayFormat = 'JSON' | 'XSD' | 'Inferred';
export type FilterDataFormat = Uppercase<SchemaDataFormat>;
export type FilterOwnership = SchemaOwnership;
export type FilterStatus = Extract<SchemaStatus, 'ready' | 'processing' | 'needs_review' | 'error'>;
export type SchemaLibraryViewMode = 'card' | 'list';

export interface SchemaLibraryItem {
  schemaId: string;
  name: string;
  description?: string;
  disambiguator?: string;
  origin: SchemaOrigin;
  ownership: FilterOwnership;
  dataFormat: FilterDataFormat;
  status: FilterStatus;
  format: SchemaFormat;
  displayFormat: DisplayFormat;
  fieldCount: number;
  syncStatus: SyncStatus;
  projectCount: number;
  projectNames: string[];
  updatedAt: string;
  createdAt: string;
}

export interface SchemaLibraryFilters {
  search: string;
  ownerships: FilterOwnership[];
  dataFormats: FilterDataFormat[];
  statuses: FilterStatus[];
}

export type SortField =
  | 'name'
  | 'status'
  | 'dataFormat'
  | 'fieldCount'
  | 'projectCount'
  | 'updatedAt'
  | 'ownership';
export type SortDirection = 'asc' | 'desc';

export interface SchemaLibrarySort {
  field: SortField;
  direction: SortDirection;
}
