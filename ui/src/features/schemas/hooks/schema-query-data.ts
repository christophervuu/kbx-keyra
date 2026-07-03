import { parseInferredSchema, parseJsonSchema, parseXsd } from '../lib';
import type { UsageMapping, UsageProject } from './use-schema-usage';
import type {
  DisplayFormat,
  FilterDataFormat,
  FilterOwnership,
  FilterStatus,
  SchemaLibraryItem,
  SyncStatus,
} from '../types';

import type { ApiAdapter } from '@/lib/api';
import {
  normalizeSchemaOwnership,
  normalizeSchemaStatus,
  schemaDataFormatFromSourceKind,
  type ParsedSchema,
  type SchemaDetail,
  type SchemaMetadata,
} from '@/lib/types/domain';


function deriveSyncStatus(schema: SchemaMetadata): SyncStatus {
  if (schema.inferred === true) return 'inferred';
  if (schema.source.type === 'github') {
    return schema.syncStatus ?? 'synced';
  }
  return 'local';
}

function deriveDisplayFormat(schema: SchemaMetadata): DisplayFormat {
  if (schema.inferred === true) return 'Inferred';
  if (schema.format === 'xsd') return 'XSD';
  return 'JSON';
}

function deriveDataFormat(schema: SchemaMetadata): FilterDataFormat {
  if (schema.dataFormat != null) {
    return schema.dataFormat.toUpperCase() as FilterDataFormat;
  }

  const sourceKind = schema.sourceKind
    ?? (schema.inferred ? (schema.format === 'xsd' ? 'inferred_from_xml' : 'inferred_from_json') : undefined)
    ?? (schema.format === 'xsd' ? 'xsd' : 'json_schema');

  return schemaDataFormatFromSourceKind(sourceKind).toUpperCase() as FilterDataFormat;
}

function deriveOwnership(schema: SchemaMetadata): FilterOwnership {
  return normalizeSchemaOwnership({
    ownership: schema.ownership,
    origin: schema.origin,
  });
}

function deriveStatus(schema: SchemaMetadata): FilterStatus {
  const normalized = normalizeSchemaStatus({
    status: schema.status,
    inferred: schema.inferred,
    reviewedAt: schema.reviewedAt,
  });

  if (normalized === 'processing' || normalized === 'error') {
    return normalized;
  }

  if (normalized === 'needs_review') {
    return 'ready';
  }

  return 'ready';
}

export interface SchemaLibraryQueryData {
  items: SchemaLibraryItem[];
}

export async function loadSchemaLibraryData(adapter: ApiAdapter): Promise<SchemaLibraryQueryData> {
  const [schemas, projectList] = await Promise.all([
    adapter.listSchemas(),
    adapter.listProjects(),
  ]);

  const projectDetails = await Promise.all(projectList.map((p) => adapter.getProject(p.projectId)));

  const usageMap = new Map<string, { count: number; names: string[] }>();
  for (const project of projectDetails) {
    for (const ref of project.schemaRefs) {
      const existing = usageMap.get(ref.schemaId);
      if (existing) {
        existing.count += 1;
        existing.names.push(project.name);
      } else {
        usageMap.set(ref.schemaId, { count: 1, names: [project.name] });
      }
    }
  }

  const parsedCountBySchemaId = new Map<string, number>();
  const countBackfillCandidates = schemas.filter((schema) => {
    const metadataFieldCount = schema.fieldCount > 0
      ? schema.fieldCount
      : (schema as { totalFieldCount?: number }).totalFieldCount ?? 0;
    const normalizedStatus = deriveStatus(schema);
    return metadataFieldCount <= 0 && normalizedStatus !== 'processing';
  });

  await Promise.all(
    countBackfillCandidates.map(async (schema) => {
      try {
        const detail = await adapter.getSchema(schema.schemaId);
        const content = detail.content;

        const parsed = schema.inferred
          ? parseInferredSchema(
            typeof content === 'string' ? content : JSON.stringify(content),
            schema.format === 'xsd' ? 'xml' : 'json',
          )
          : schema.format === 'xsd'
            ? parseXsd(typeof content === 'string' ? content : JSON.stringify(content))
            : parseJsonSchema(content);

        if (parsed.totalFieldCount > 0) {
          parsedCountBySchemaId.set(schema.schemaId, parsed.totalFieldCount);
        }
      } catch {
        // Non-fatal best-effort parse backfill.
      }
    }),
  );

  const items: SchemaLibraryItem[] = schemas.map((schema) => {
    const usage = usageMap.get(schema.schemaId);
    return {
      schemaId: schema.schemaId,
      name: schema.name,
      description: schema.description,
      disambiguator: schema.disambiguator,
      origin: schema.origin,
      ownership: deriveOwnership(schema),
      dataFormat: deriveDataFormat(schema),
      status: deriveStatus(schema),
      format: schema.format,
      displayFormat: deriveDisplayFormat(schema),
      fieldCount: parsedCountBySchemaId.get(schema.schemaId)
        ?? (schema.fieldCount > 0
          ? schema.fieldCount
          : (schema as { totalFieldCount?: number }).totalFieldCount ?? 0),
      syncStatus: deriveSyncStatus(schema),
      projectCount: usage?.count ?? 0,
      projectNames: usage?.names ?? [],
      updatedAt: schema.updatedAt,
      createdAt: schema.createdAt,
    };
  });

  return { items };
}

export interface SchemaDetailQueryData {
  schema: SchemaDetail;
  parsedSchema: ParsedSchema | null;
}

export async function loadSchemaDetailData(
  adapter: ApiAdapter,
  schemaId: string,
): Promise<SchemaDetailQueryData> {
  const detail = await adapter.getSchema(schemaId);

  let parsed: ParsedSchema | null = null;
  try {
    const { format, inferred } = detail.metadata;
    const content = detail.content;
    if (inferred) {
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      const inferredFmt = format === 'xsd' ? 'xml' : 'json';
      parsed = parseInferredSchema(contentStr, inferredFmt);
    } else if (format === 'json-schema') {
      parsed = parseJsonSchema(content);
    } else if (format === 'xsd') {
      const xsdStr = typeof content === 'string' ? content : JSON.stringify(content);
      parsed = parseXsd(xsdStr);
    }
  } catch {
    // non-fatal parse path
  }

  let resolvedDetail = detail;
  if (detail.metadata.origin === 'cdm') {
    try {
      await adapter.syncCdmSchema(schemaId, { statusOnly: true });
      resolvedDetail = await adapter.getSchema(schemaId);
    } catch {
      // best effort only
    }
  }

  return {
    schema: resolvedDetail,
    parsedSchema: parsed,
  };
}

export interface SchemaUsageQueryData {
  projects: UsageProject[];
  mappings: UsageMapping[];
}

export async function loadSchemaUsageData(
  adapter: ApiAdapter,
  schemaId: string,
): Promise<SchemaUsageQueryData> {
  const projectMetas = await adapter.listProjects();
  const fullProjects = await Promise.all(projectMetas.map((pm) => adapter.getProject(pm.projectId)));

  const referencingProjects = fullProjects.filter((p) => p.schemaRefs.some((ref) => ref.schemaId === schemaId));

  const projects: UsageProject[] = referencingProjects.map((p) => ({
    projectId: p.projectId,
    name: p.name,
  }));

  const mappingArrays = await Promise.all(referencingProjects.map((p) => adapter.listMappings(p.projectId)));

  const projectNameById = new Map(referencingProjects.map((p) => [p.projectId, p.name] as const));

  const mappings: UsageMapping[] = [];
  mappingArrays.forEach((projectMappings) => {
    for (const mapping of projectMappings) {
      if (mapping.sourceSchemaId === schemaId) {
        mappings.push({
          mappingId: mapping.mappingId,
          projectId: mapping.projectId,
          projectName: projectNameById.get(mapping.projectId) ?? mapping.projectId,
          name: mapping.name,
          role: 'source',
          updatedAt: mapping.updatedAt,
        });
      } else if (mapping.targetSchemaId === schemaId) {
        mappings.push({
          mappingId: mapping.mappingId,
          projectId: mapping.projectId,
          projectName: projectNameById.get(mapping.projectId) ?? mapping.projectId,
          name: mapping.name,
          role: 'target',
          updatedAt: mapping.updatedAt,
        });
      }
    }
  });

  return {
    projects,
    mappings,
  };
}
