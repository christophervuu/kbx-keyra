import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { loadSchemaDetailData } from './schema-query-data';

import { useOptimisticMutation } from '@/hooks';
import { useAdapter } from '@/lib/api';
import {
  cancelSchemaDetailReads,
  invalidateSchemaDependents,
  queryKeys,
  queryPolicies,
} from '@/lib/query';
import type { AppError } from '@/lib/state/app-error';
import { toAppError } from '@/lib/state/app-error';
import type {
  AddSchemaSampleInput,
  AddSchemaSampleResult,
  ParsedSchema,
  SchemaDetail,
  SchemaSamplePayloadContent,
  UpdateSchemaInput,
} from '@/lib/types';

export interface UseSchemaDetailResult {
  schema: SchemaDetail | null;
  parsedSchema: ParsedSchema | null;
  setParsedSchema: (parsed: ParsedSchema) => void;
  isLoading: boolean;
  error: AppError | null;
  mutationError: AppError | null;
  notFound: boolean;
  retry: () => void;
  clearMutationError: () => void;
  updateMetadata: (input: Partial<UpdateSchemaInput>) => Promise<void>;
  markReviewed: () => Promise<void>;
  addSample: (input: AddSchemaSampleInput) => Promise<AddSchemaSampleResult>;
  deleteSample: (sampleId: string) => Promise<void>;
  getSamplePayload: (sampleId: string) => Promise<SchemaSamplePayloadContent>;
}

interface SchemaDetailQueryData {
  schema: SchemaDetail;
  parsedSchema: ParsedSchema | null;
}

export function useSchemaDetail(schemaId: string): UseSchemaDetailResult {
  const adapter = useAdapter();
  const queryClient = useQueryClient();

  const detailQueryKey = queryKeys.schemas.detail(schemaId);

  const detailQuery = useQuery<SchemaDetailQueryData>({
    queryKey: detailQueryKey,
    staleTime: queryPolicies.schemaDetail.staleTime,
    gcTime: queryPolicies.schemaDetail.gcTime,
    retry: false,
    queryFn: () => loadSchemaDetailData(adapter, schemaId),
  });

  const patchDetailData = useCallback(
    (updater: (current: SchemaDetailQueryData) => SchemaDetailQueryData) => {
      queryClient.setQueryData<SchemaDetailQueryData | undefined>(detailQueryKey, (current) => {
        if (!current) {
          return current;
        }

        return updater(current);
      });
    },
    [detailQueryKey, queryClient],
  );

  const schema = detailQuery.data?.schema ?? null;
  const parsedSchema = detailQuery.data?.parsedSchema ?? null;

  const isLoading = !detailQuery.data && detailQuery.isPending;
  const appError = detailQuery.isError ? toAppError(detailQuery.error) : null;
  const notFound = Boolean(appError && (appError.code === 'NOT_FOUND' || appError.statusCode === 404));
  const error = appError && !notFound ? appError : null;

  const setParsedSchema = useCallback(
    (parsed: ParsedSchema) => {
      patchDetailData((current) => ({
        ...current,
        parsedSchema: parsed,
      }));
    },
    [patchDetailData],
  );

  const metadataMutation = useOptimisticMutation<
    Partial<UpdateSchemaInput>,
    SchemaDetail['metadata'] | null,
    Awaited<ReturnType<typeof adapter.updateSchema>>
  >({
    captureSnapshot: () => schema?.metadata ?? null,
    applyOptimistic: (input) => {
      patchDetailData((current) => ({
        ...current,
        schema: {
          ...current.schema,
          metadata: { ...current.schema.metadata, ...input },
        },
      }));
    },
    rollback: (snapshot) => {
      if (!snapshot) return;
      patchDetailData((current) => ({
        ...current,
        schema: {
          ...current.schema,
          metadata: snapshot,
        },
      }));
    },
    mutate: async (input) => {
      await cancelSchemaDetailReads(queryClient, schemaId);
      return adapter.updateSchema(schemaId, input as UpdateSchemaInput);
    },
    onSuccess: () => {
      invalidateSchemaDependents(queryClient, schemaId);
    },
  });

  const updateMetadata = useCallback(
    async (input: Partial<UpdateSchemaInput>) => {
      await metadataMutation.run(input);
    },
    [metadataMutation],
  );

  const markReviewed = useCallback(async () => {
    if (typeof adapter.markSchemaReviewed === 'function') {
      await cancelSchemaDetailReads(queryClient, schemaId);
      const updated = await adapter.markSchemaReviewed(schemaId);
      patchDetailData((current) => ({
        ...current,
        schema: {
          ...current.schema,
          metadata: updated,
        },
      }));
      invalidateSchemaDependents(queryClient, schemaId);
      return;
    }

    await metadataMutation.run({
      status: 'ready',
      reviewedAt: new Date().toISOString(),
    });
  }, [adapter, metadataMutation, patchDetailData, queryClient, schemaId]);

  const addSample = useCallback(async (input: AddSchemaSampleInput) => {
    if (typeof adapter.addSchemaSample !== 'function') {
      throw new Error('Adding schema samples is not available in this mode.');
    }

    await cancelSchemaDetailReads(queryClient, schemaId);
    const result = await adapter.addSchemaSample(schemaId, input);
    invalidateSchemaDependents(queryClient, schemaId);
    return result;
  }, [adapter, queryClient, schemaId]);

  const deleteSample = useCallback(async (sampleId: string) => {
    if (typeof adapter.deleteSchemaSample !== 'function') {
      throw new Error('Deleting schema samples is not available in this mode.');
    }

    await cancelSchemaDetailReads(queryClient, schemaId);
    await adapter.deleteSchemaSample(schemaId, sampleId);
    invalidateSchemaDependents(queryClient, schemaId);
  }, [adapter, queryClient, schemaId]);

  const getSamplePayload = useCallback(async (sampleId: string) => {
    if (typeof adapter.getSchemaSamplePayload !== 'function') {
      throw new Error('Loading schema sample payloads is not available in this mode.');
    }

    return adapter.getSchemaSamplePayload(schemaId, sampleId);
  }, [adapter, schemaId]);

  const retry = useCallback(() => {
    void detailQuery.refetch();
  }, [detailQuery]);

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
    markReviewed,
    addSample,
    deleteSample,
    getSamplePayload,
  };
}
