import { useCallback, useEffect, useRef, useState } from 'react';

import { parseInferredSchema, parseJsonSchema, parseXsd } from '../lib';

import { useOptimisticMutation } from '@/hooks';
import { useAdapter } from '@/lib/api';
import type { AppError } from '@/lib/state/app-error';
import { toAppError } from '@/lib/state/app-error';
import type { ParsedSchema, SchemaDetail, UpdateSchemaInput } from '@/lib/types';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseSchemaDetailResult {
  schema: SchemaDetail | null;
  parsedSchema: ParsedSchema | null;
  /** Allows external callers (e.g. after a save) to push a refreshed ParsedSchema. */
  setParsedSchema: (parsed: ParsedSchema) => void;
  isLoading: boolean;
  error: AppError | null;
  mutationError: AppError | null;
  notFound: boolean;
  retry: () => void;
  clearMutationError: () => void;
  updateMetadata: (input: Partial<UpdateSchemaInput>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Loads a schema by ID, parses its content, and exposes loading/error/not-found
 * states and an `updateMetadata` action for inline editing.
 *
 * Race-condition safe: cancels in-flight fetches when schemaId changes or the
 * component unmounts.
 */
export function useSchemaDetail(schemaId: string): UseSchemaDetailResult {
  const adapter = useAdapter();

  const [schema, setSchema] = useState<SchemaDetail | null>(null);
  const [parsedSchema, setParsedSchema] = useState<ParsedSchema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset/load state is intentionally synchronized at effect start before async fetch
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    setSchema(null);
    setParsedSchema(null);

    void (async () => {
      try {
        const detail = await adapter.getSchema(schemaId);
        if (cancelledRef.current) return;

        // Parse content (non-fatal — tree view simply won't render on failure)
        let parsed: ParsedSchema | null = null;
        try {
          const { format, inferred } = detail.metadata;
          const content = detail.content;
          if (inferred) {
            const contentStr =
              typeof content === 'string' ? content : JSON.stringify(content);
            const inferredFmt = format === 'xsd' ? 'xml' : 'json';
            parsed = parseInferredSchema(contentStr, inferredFmt);
          } else if (format === 'json-schema') {
            parsed = parseJsonSchema(content);
          } else if (format === 'xsd') {
            const xsdStr =
              typeof content === 'string' ? content : JSON.stringify(content);
            parsed = parseXsd(xsdStr);
          }
        } catch {
          // Non-fatal — parsedSchema stays null
        }

        setSchema(detail);
        setParsedSchema(parsed);
      } catch (err) {
        if (cancelledRef.current) return;
        const appErr = toAppError(err);
        if (appErr.code === 'NOT_FOUND' || appErr.statusCode === 404) {
          setNotFound(true);
        } else {
          setError(appErr);
        }
      } finally {
        if (!cancelledRef.current) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelledRef.current = true;
    };
  }, [schemaId, retryCount, adapter]);

  const retry = useCallback(() => setRetryCount((c) => c + 1), []);

  const metadataMutation = useOptimisticMutation<
    Partial<UpdateSchemaInput>,
    SchemaDetail['metadata'] | null,
    Awaited<ReturnType<typeof adapter.updateSchema>>
  >({
    captureSnapshot: () => schema?.metadata ?? null,
    applyOptimistic: (input) => {
      setSchema((prev) => (prev ? { ...prev, metadata: { ...prev.metadata, ...input } } : prev));
    },
    rollback: (snapshot) => {
      if (!snapshot) return;
      setSchema((prev) => (prev ? { ...prev, metadata: snapshot } : prev));
    },
    mutate: (input) => adapter.updateSchema(schemaId, input as UpdateSchemaInput),
    onSuccess: (updated) => {
      setSchema((prev) => (prev ? { ...prev, metadata: updated } : prev));
    },
  });

  const updateMetadata = useCallback(
    async (input: Partial<UpdateSchemaInput>) => {
      await metadataMutation.run(input);
    },
    [metadataMutation],
  );

  return {
    schema,
    parsedSchema,
    setParsedSchema,
    isLoading,
    error,
    mutationError: metadataMutation.error,
    notFound,
    retry,
    clearMutationError: metadataMutation.clearError,
    updateMetadata,
  };
}
