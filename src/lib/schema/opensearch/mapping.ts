export const SCHEMA_NODES_INDEX = 'keyra-schema-nodes';

/**
 * OpenSearch index definition for schema node documents.
 *
 * Includes a placeholder `embedding` knn_vector field for future vector ingestion.
 */
export const SCHEMA_NODES_INDEX_MAPPING = {
  settings: {
    index: {
      knn: true,
    },
  },
  mappings: {
    properties: {
      schemaId: { type: 'keyword' },
      path: {
        type: 'text',
        fields: {
          keyword: { type: 'keyword' },
        },
      },
      fieldName: {
        type: 'text',
        fields: {
          keyword: { type: 'keyword' },
        },
      },
      embeddingText: { type: 'text' },
      embedding: {
        type: 'knn_vector',
        dimension: 1536,
        method: {
          name: 'hnsw',
          engine: 'faiss',
          space_type: 'l2',
          parameters: {
            ef_construction: 128,
            m: 16,
          },
        },
      },
      type: { type: 'keyword' },
      depth: { type: 'integer' },
      parentPath: { type: 'keyword' },
      isArray: { type: 'boolean' },
    },
  },
} as const;
