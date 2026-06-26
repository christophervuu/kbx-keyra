import type { ApiAdapter } from './types';

import type { CreateMappingInput, MappingConfig, MappingRule, MappingRuleValueTableRef, MappingRuleNoMatchBehavior, SchemaRef } from '@/lib/types';

const LOCAL_MAPPINGS_KEY = 'keyra:mappings';
const IMPORT_MANIFEST_KEY = 'keyra:backend-mapping-import-manifest:v1';

const VALID_RULE_TYPES = new Set<MappingRule['type']>(['string', 'number', 'boolean', 'object', 'array', 'null', 'any']);
const VALID_SCHEMA_REF_TYPES = new Set<SchemaRef['type']>(['github', 'local', 'published']);

interface StoredMappingRecord {
  readonly metadata?: {
    readonly mappingId?: unknown;
    readonly projectId?: unknown;
    readonly name?: unknown;
  };
  readonly config?: unknown;
}

interface ImportManifest {
  readonly [projectId: string]: {
    readonly [localMappingId: string]: string;
  };
}

export type ImportIssueCode =
  | 'PROJECT_MISMATCH'
  | 'INVALID_RECORD'
  | 'INVALID_RULE'
  | 'ALREADY_IMPORTED'
  | 'IMPORT_FAILED';

export interface LocalMappingImportIssue {
  readonly localMappingId?: string;
  readonly remoteMappingId?: string;
  readonly mappingName?: string;
  readonly code: ImportIssueCode;
  readonly message: string;
}

export interface LocalMappingImportSummary {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly issues: readonly LocalMappingImportIssue[];
}

interface NormalizedCandidate {
  readonly localMappingId: string;
  readonly mappingName: string;
  readonly config: MappingConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readJsonArray(storage: Storage, key: string): readonly unknown[] {
  const raw = storage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readManifest(storage: Storage): ImportManifest {
  const raw = storage.getItem(IMPORT_MANIFEST_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    const next: Record<string, Record<string, string>> = {};
    for (const [projectId, value] of Object.entries(parsed)) {
      if (!isRecord(value)) {
        continue;
      }

      const mappings: Record<string, string> = {};
      for (const [localId, remoteId] of Object.entries(value)) {
        if (typeof localId !== 'string' || localId.trim().length === 0) {
          continue;
        }

        if (typeof remoteId !== 'string' || remoteId.trim().length === 0) {
          continue;
        }

        mappings[localId] = remoteId;
      }

      next[projectId] = mappings;
    }

    return next;
  } catch {
    return {};
  }
}

function writeManifest(storage: Storage, manifest: ImportManifest): void {
  storage.setItem(IMPORT_MANIFEST_KEY, JSON.stringify(manifest));
}

function toSchemaRef(value: unknown): SchemaRef | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const schemaId = typeof value.schemaId === 'string' ? value.schemaId.trim() : '';
  const type = typeof value.type === 'string' ? value.type.trim() : '';
  if (!schemaId || !VALID_SCHEMA_REF_TYPES.has(type as SchemaRef['type'])) {
    return undefined;
  }

  const commitSha = typeof value.commitSha === 'string' ? value.commitSha.trim() : '';
  return {
    schemaId,
    type: type as SchemaRef['type'],
    ...(commitSha ? { commitSha } : {}),
  };
}

function toMappingRule(value: unknown): MappingRule | null {
  if (!isRecord(value)) {
    return null;
  }

  const target = typeof value.target === 'string' ? value.target.trim() : '';
  const expression = typeof value.expression === 'string' ? value.expression : '';
  const type = typeof value.type === 'string' ? value.type : '';

  if (!target || !expression || !VALID_RULE_TYPES.has(type as MappingRule['type'])) {
    return null;
  }

  const description = typeof value.description === 'string' && value.description.trim().length > 0
    ? value.description.trim()
    : undefined;

  const valueTableRef = isRecord(value.valueTableRef)
    ? (value.valueTableRef as MappingRuleValueTableRef)
    : undefined;
  const noMatchBehavior = isRecord(value.noMatchBehavior)
    ? (value.noMatchBehavior as MappingRuleNoMatchBehavior)
    : undefined;

  return {
    target,
    expression,
    type: type as MappingRule['type'],
    ...(description ? { description } : {}),
    ...(valueTableRef ? { valueTableRef } : {}),
    ...(noMatchBehavior ? { noMatchBehavior } : {}),
  };
}

function normalizeConfigOptions(value: unknown): MappingConfig['config'] {
  if (!isRecord(value)) {
    return {};
  }

  const options = value as MappingConfig['config'];
  const externalSources = Array.isArray(options.externalSources)
    ? options.externalSources
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
    : [];

  return {
    ...options,
    externalSources,
  };
}

function normalizeMappingRecord(record: unknown, projectId: string): { candidate?: NormalizedCandidate; issue?: LocalMappingImportIssue } {
  if (!isRecord(record)) {
    return {
      issue: {
        code: 'INVALID_RECORD',
        message: 'Invalid local mapping record shape: expected object.',
      },
    };
  }

  const stored = record as StoredMappingRecord;
  const configRaw = stored.config;
  if (!isRecord(configRaw)) {
    return {
      issue: {
        code: 'INVALID_RECORD',
        message: 'Missing local mapping config payload.',
      },
    };
  }

  const metadata = isRecord(stored.metadata) ? stored.metadata : {};
  const config = configRaw as Record<string, unknown>;

  const localMappingId = typeof config.id === 'string' && config.id.trim().length > 0
    ? config.id.trim()
    : (typeof metadata.mappingId === 'string' && metadata.mappingId.trim().length > 0 ? metadata.mappingId.trim() : '');
  if (!localMappingId) {
    return {
      issue: {
        code: 'INVALID_RECORD',
        message: 'Missing mapping ID in local record.',
      },
    };
  }

  const mappingName = typeof config.name === 'string' && config.name.trim().length > 0
    ? config.name.trim()
    : (typeof metadata.name === 'string' ? metadata.name.trim() : '');
  if (!mappingName) {
    return {
      issue: {
        localMappingId,
        code: 'INVALID_RECORD',
        message: 'Missing mapping name in local record.',
      },
    };
  }

  const sourceProjectId = typeof config.projectId === 'string' && config.projectId.trim().length > 0
    ? config.projectId.trim()
    : (typeof metadata.projectId === 'string' && metadata.projectId.trim().length > 0 ? metadata.projectId.trim() : '');

  if (!sourceProjectId || sourceProjectId !== projectId) {
    return {
      issue: {
        localMappingId,
        mappingName,
        code: 'PROJECT_MISMATCH',
        message: `Local mapping belongs to project '${sourceProjectId || 'unknown'}', expected '${projectId}'.`,
      },
    };
  }

  const rulesRaw = Array.isArray(config.rules) ? config.rules : [];
  const rules: MappingRule[] = [];
  for (const ruleRaw of rulesRaw) {
    const normalizedRule = toMappingRule(ruleRaw);
    if (!normalizedRule) {
      return {
        issue: {
          localMappingId,
          mappingName,
          code: 'INVALID_RULE',
          message: 'Local mapping contains invalid rule shape (requires target/type/expression).',
        },
      };
    }

    rules.push(normalizedRule);
  }

  const businessContext = typeof config.businessContext === 'string' && config.businessContext.trim().length > 0
    ? config.businessContext.trim()
    : undefined;

  const sourceSchemaRef = toSchemaRef(config.sourceSchemaRef);
  const targetSchemaRef = toSchemaRef(config.targetSchemaRef);

  const version = typeof config.version === 'number' && Number.isInteger(config.version) && config.version > 0
    ? config.version
    : 1;
  const engineVersion = typeof config.engineVersion === 'string' && config.engineVersion.trim().length > 0
    ? config.engineVersion.trim()
    : '1.0.0';

  const configOptions = normalizeConfigOptions(config.config);

  const normalized: MappingConfig = {
    id: localMappingId,
    projectId,
    name: mappingName,
    ...(businessContext ? { businessContext } : {}),
    version,
    engineVersion,
    ...(sourceSchemaRef ? { sourceSchemaRef } : {}),
    ...(targetSchemaRef ? { targetSchemaRef } : {}),
    config: configOptions,
    rules,
  };

  return {
    candidate: {
      localMappingId,
      mappingName,
      config: normalized,
    },
  };
}

function isNotFoundError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code = typeof error.code === 'string' ? error.code : '';
  const statusCode = typeof error.statusCode === 'number' ? error.statusCode : null;
  const message = typeof error.message === 'string' ? error.message : '';

  return code === 'NOT_FOUND'
    || code === 'RESOURCE_NOT_FOUND'
    || statusCode === 404
    || message.toLowerCase().includes('not found');
}

async function tryGetMapping(adapter: ApiAdapter, mappingId: string): Promise<MappingConfig | null> {
  try {
    return await adapter.getMapping(mappingId);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function toCreateInput(config: MappingConfig): CreateMappingInput {
  return {
    projectId: config.projectId ?? '',
    name: config.name,
    ...(config.businessContext ? { businessContext: config.businessContext } : {}),
    ...(config.sourceSchemaRef ? { sourceSchemaRef: config.sourceSchemaRef } : {}),
    ...(config.targetSchemaRef ? { targetSchemaRef: config.targetSchemaRef } : {}),
    config: config.config,
    rules: config.rules,
  };
}

async function ensureDeployableSavedVersion(adapter: ApiAdapter, mappingId: string): Promise<boolean> {
  const versions = await adapter.listVersions(mappingId);
  if (versions.length > 0) {
    return false;
  }

  await adapter.createVersion(mappingId);
  return true;
}

export async function importLocalMappingsToBackend(
  adapter: ApiAdapter,
  projectId: string,
  storage: Storage = globalThis.localStorage,
): Promise<LocalMappingImportSummary> {
  const summary: {
    imported: number;
    skipped: number;
    failed: number;
    issues: LocalMappingImportIssue[];
  } = {
    imported: 0,
    skipped: 0,
    failed: 0,
    issues: [],
  };

  const records = readJsonArray(storage, LOCAL_MAPPINGS_KEY);
  const manifest = readManifest(storage);
  const projectManifest = { ...(manifest[projectId] ?? {}) };

  for (const record of records) {
    const normalized = normalizeMappingRecord(record, projectId);
    if (!normalized.candidate) {
      if (normalized.issue?.code === 'PROJECT_MISMATCH' || normalized.issue?.code === 'ALREADY_IMPORTED') {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
      }
      if (normalized.issue) {
        summary.issues.push(normalized.issue);
      }
      continue;
    }

    const { localMappingId, mappingName, config } = normalized.candidate;

    try {
      let remoteMappingId = projectManifest[localMappingId];
      let remoteConfig = remoteMappingId ? await tryGetMapping(adapter, remoteMappingId) : null;

      if (!remoteConfig) {
        remoteMappingId = localMappingId;
        remoteConfig = await tryGetMapping(adapter, remoteMappingId);
      }

      let remoteVersion = remoteConfig?.version ?? 1;

      if (!remoteConfig) {
        const created = await adapter.createMapping(toCreateInput(config));
        remoteMappingId = created.mappingId;
        projectManifest[localMappingId] = remoteMappingId;
        remoteVersion = created.version;
      }

      const saveResult = await adapter.saveMapping(remoteMappingId, {
        ...config,
        id: remoteMappingId,
        projectId,
        version: remoteVersion,
      });

      const createdVersion = await ensureDeployableSavedVersion(adapter, remoteMappingId);

      if (saveResult.noChange && !createdVersion) {
        summary.skipped += 1;
        summary.issues.push({
          localMappingId,
          remoteMappingId,
          mappingName,
          code: 'ALREADY_IMPORTED',
          message: 'Already imported with identical config and existing saved version.',
        });
        continue;
      }

      summary.imported += 1;
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : (isRecord(error) && typeof error.message === 'string' && error.message.trim().length > 0
            ? error.message
            : 'Unknown import error.');
      summary.failed += 1;
      summary.issues.push({
        localMappingId,
        mappingName,
        code: 'IMPORT_FAILED',
        message,
      });
    }
  }

  manifest[projectId] = projectManifest;
  writeManifest(storage, manifest);

  return {
    imported: summary.imported,
    skipped: summary.skipped,
    failed: summary.failed,
    issues: summary.issues,
  };
}
