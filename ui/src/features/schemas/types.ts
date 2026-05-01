import type { MappingNodeStatus, ParsedSchema, SchemaFormat, SchemaTreeNode } from '@/lib/types';

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
  /** Placeholder for future edit mode (default: false) */
  readonly editable?: boolean;
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
