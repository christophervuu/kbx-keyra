import type { ApiAdapter } from '@/lib/api';
import type { MappingConfig, ParsedSchema, SchemaDetail } from '@/lib/types/domain';

export interface MappingEditorSchemaWarning {
  readonly role: 'source' | 'target' | 'enrichment';
  readonly schemaId: string;
  readonly alias?: string;
  readonly code?: string;
  readonly statusCode?: number;
  readonly message: string;
}

export interface MappingEditorServerData {
  readonly mappingConfig: MappingConfig;
  readonly sourceSchema: SchemaDetail | null;
  readonly targetSchema: SchemaDetail | null;
  readonly enrichmentSchemasByAlias: Record<string, SchemaDetail | null>;
  readonly schemaLoadWarnings: MappingEditorSchemaWarning[];
}

export interface MappingEditorQueryDataLoaders {
  readonly parseTargetSchema: (schema: SchemaDetail) => ParsedSchema | null;
  readonly buildTargetTypeByPathFromSchema: (
    parsedSchema: ParsedSchema | null,
    rawSchema?: SchemaDetail | null,
  ) => ReadonlyMap<string, MappingConfig['rules'][number]['type']>;
  readonly normalizeRuleTypesByTargetSchema: (
    rules: MappingConfig['rules'],
    targetTypeByPath: ReadonlyMap<string, MappingConfig['rules'][number]['type']>,
  ) => MappingConfig['rules'];
  readonly getErrorInfo: (error: unknown) => { message: string; code?: string; statusCode?: number };
  readonly debugRuleTypeLog: (message: string, payload?: unknown) => void;
}

export async function loadMappingEditorServerData(
  adapter: ApiAdapter,
  mappingId: string,
  loaders: MappingEditorQueryDataLoaders,
): Promise<MappingEditorServerData> {
  const {
    parseTargetSchema,
    buildTargetTypeByPathFromSchema,
    normalizeRuleTypesByTargetSchema,
    getErrorInfo,
    debugRuleTypeLog,
  } = loaders;

  const mappingConfig = await adapter.getMapping(mappingId);
  debugRuleTypeLog('mapping config schema refs snapshot', {
    sourceSchemaRef: mappingConfig.sourceSchemaRef ?? null,
    targetSchemaRef: mappingConfig.targetSchemaRef ?? null,
    enrichmentSources: mappingConfig.enrichmentSources ?? [],
  });

  const schemaPromises = [
    mappingConfig.sourceSchemaRef
      ? adapter.getSchema(mappingConfig.sourceSchemaRef.schemaId)
      : Promise.reject('no source schema'),
    mappingConfig.targetSchemaRef
      ? adapter.getSchema(mappingConfig.targetSchemaRef.schemaId)
      : Promise.reject('no target schema'),
  ];
  const [sourceResult, targetResult] = await Promise.allSettled(schemaPromises);

  const nextSchemaLoadWarnings: MappingEditorSchemaWarning[] = [];

  const resolvedSourceSchema = sourceResult.status === 'fulfilled'
    ? sourceResult.value
    : null;
  const resolvedTargetSchema = targetResult.status === 'fulfilled'
    ? targetResult.value
    : null;

  if (sourceResult.status === 'rejected' && mappingConfig.sourceSchemaRef) {
    const info = getErrorInfo(sourceResult.reason);
    nextSchemaLoadWarnings.push({
      role: 'source',
      schemaId: mappingConfig.sourceSchemaRef.schemaId,
      code: info.code,
      statusCode: info.statusCode,
      message: info.message,
    });
    debugRuleTypeLog('source schema load failed', {
      schemaId: mappingConfig.sourceSchemaRef.schemaId,
      ...info,
    });
  }

  if (targetResult.status === 'rejected' && mappingConfig.targetSchemaRef) {
    const info = getErrorInfo(targetResult.reason);
    nextSchemaLoadWarnings.push({
      role: 'target',
      schemaId: mappingConfig.targetSchemaRef.schemaId,
      code: info.code,
      statusCode: info.statusCode,
      message: info.message,
    });
    debugRuleTypeLog('target schema load failed', {
      schemaId: mappingConfig.targetSchemaRef.schemaId,
      ...info,
    });
  }

  debugRuleTypeLog('loaded target schema detail', {
    schemaId: resolvedTargetSchema?.metadata.schemaId,
    format: resolvedTargetSchema?.metadata.format,
    contentType: typeof resolvedTargetSchema?.content,
    contentPreview:
      typeof resolvedTargetSchema?.content === 'string'
        ? resolvedTargetSchema.content.slice(0, 140)
        : undefined,
  });

  const normalizedRules = normalizeRuleTypesByTargetSchema(
    mappingConfig.rules,
    buildTargetTypeByPathFromSchema(
      resolvedTargetSchema ? parseTargetSchema(resolvedTargetSchema) : null,
      resolvedTargetSchema,
    ),
  );

  const normalizedConfig: MappingConfig = normalizedRules === mappingConfig.rules
    ? mappingConfig
    : {
      ...mappingConfig,
      rules: normalizedRules,
    };

  const enrichmentDefs = normalizedConfig.enrichmentSources ?? [];
  const enrichmentSchemaPromises = enrichmentDefs
    .filter((entry) => typeof entry.schemaId === 'string' && entry.schemaId.trim().length > 0)
    .map(async (entry) => {
      try {
        const schema = await adapter.getSchema(entry.schemaId!);
        return {
          alias: entry.alias,
          schemaId: entry.schemaId!,
          status: 'fulfilled' as const,
          schema,
        };
      } catch (error) {
        return {
          alias: entry.alias,
          schemaId: entry.schemaId!,
          status: 'rejected' as const,
          error,
        };
      }
    });

  const nextEnrichmentSchemasByAlias: Record<string, SchemaDetail | null> = {};
  for (const entry of enrichmentDefs) {
    nextEnrichmentSchemasByAlias[entry.alias] = null;
  }

  if (enrichmentSchemaPromises.length > 0) {
    const enrichmentResults = await Promise.all(enrichmentSchemaPromises);
    for (const result of enrichmentResults) {
      if (result.status === 'fulfilled') {
        nextEnrichmentSchemasByAlias[result.alias] = result.schema;
      } else {
        const info = getErrorInfo(result.error);
        nextSchemaLoadWarnings.push({
          role: 'enrichment',
          alias: result.alias,
          schemaId: result.schemaId,
          code: info.code,
          statusCode: info.statusCode,
          message: info.message,
        });
        debugRuleTypeLog('enrichment schema load failed', {
          alias: result.alias,
          schemaId: result.schemaId,
          ...info,
        });
      }
    }
  }

  return {
    mappingConfig: normalizedConfig,
    sourceSchema: resolvedSourceSchema,
    targetSchema: resolvedTargetSchema,
    enrichmentSchemasByAlias: nextEnrichmentSchemasByAlias,
    schemaLoadWarnings: nextSchemaLoadWarnings,
  };
}
