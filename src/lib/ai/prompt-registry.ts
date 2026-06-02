import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, type QueryCommandOutput } from '@aws-sdk/lib-dynamodb';

import type { AIRuntimeConfig } from './config.js';
import type { CanonicalPromptId, PromptRecord, PromptRegistryAdapter } from './types.js';

const CACHE_TTL_MS = 300_000;

interface PromptCacheEntry {
  readonly record: PromptRecord | null;
  readonly fetchedAt: number;
}

interface ActivePointerRecord {
  readonly promptId: string;
  readonly environment: string;
  readonly activeVersion: number;
}

type PromptFileReader = (filePath: string) => Promise<string>;

function isCacheFresh(entry: PromptCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

function mapPromptRecordFromItem(item: Record<string, unknown>): PromptRecord {
  const promptId = String(item.promptId);
  const statusValue = typeof item.status === 'string' ? item.status : undefined;
  const status =
    statusValue === 'active' || statusValue === 'inactive' || statusValue === 'deprecated'
      ? statusValue
      : undefined;

  return {
    promptId: promptId as CanonicalPromptId,
    version: Number(item.version),
    ...(status ? { status } : {}),
    systemMessage: String(item.systemMessage),
    userMessageTemplate: String(item.userMessageTemplate),
    model: String(item.model),
    temperature: Number(item.temperature),
    responseSchema: String(item.responseSchema),
    maxTokens: Number(item.maxTokens),
    updatedAt: String(item.updatedAt),
    updatedBy: String(item.updatedBy),
    ...(typeof item.notes === 'string' ? { notes: item.notes } : {}),
  };
}

async function defaultPromptFileReader(filePath: string): Promise<string> {
  const readFile = Function(
    'targetPath',
    'return import("node:fs/promises").then((m) => m.readFile(targetPath, "utf8"));',
  ) as (targetPath: string) => Promise<string>;

  return readFile(filePath);
}

export class DynamoPromptRegistryAdapter implements PromptRegistryAdapter {
  private readonly cache = new Map<string, PromptCacheEntry>();
  private readonly activePointerEnv: string | undefined;
  private readonly client: Pick<DynamoDBDocumentClient, 'send'>;

  constructor(
    private readonly tableName: string,
    activePointerEnvOrClient?: string | Pick<DynamoDBDocumentClient, 'send'>,
    clientArg?: Pick<DynamoDBDocumentClient, 'send'>,
  ) {
    if (
      activePointerEnvOrClient &&
      typeof activePointerEnvOrClient === 'object' &&
      'send' in activePointerEnvOrClient
    ) {
      this.activePointerEnv = undefined;
      this.client = activePointerEnvOrClient;
      return;
    }

    this.activePointerEnv = activePointerEnvOrClient;
    this.client = clientArg ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async getLatestPrompt(promptId: string): Promise<PromptRecord | null> {
    const cached = this.cache.get(promptId);
    if (cached && isCacheFresh(cached)) {
      return cached.record;
    }

    try {
      if (this.activePointerEnv) {
        const pointerRecord = await this.queryActivePointerRecord(promptId, this.activePointerEnv);

        if (pointerRecord) {
          const pointerSelected = await this.queryPromptByVersion(promptId, pointerRecord.activeVersion);
          if (!pointerSelected) {
            throw new Error(
              `Active pointer selected missing prompt version ${pointerRecord.activeVersion} for promptId '${promptId}' in environment '${this.activePointerEnv}'`,
            );
          }

          const record: PromptRecord = {
            ...pointerSelected,
            selectionSource: 'active-pointer',
            selectionEnvironment: this.activePointerEnv,
          };

          this.cache.set(promptId, {
            record,
            fetchedAt: Date.now(),
          });

          return record;
        }
      }

      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'promptId = :pk',
          ExpressionAttributeValues: {
            ':pk': promptId,
            ':active': 'active',
          },
          FilterExpression: '#status = :active',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ScanIndexForward: false,
          Limit: 25,
        }),
      );

      const activeRecord = this.extractPromptRecord(result);

      const latestRecord = activeRecord ? null : await this.queryLatestPromptVersion(promptId);

      const record = activeRecord
        ? {
            ...activeRecord,
            selectionSource: 'latest-active' as const,
            selectionEnvironment: this.activePointerEnv,
          }
        : latestRecord
          ? {
              ...latestRecord,
              selectionSource: 'latest-version' as const,
              selectionEnvironment: this.activePointerEnv,
            }
          : null;

      this.cache.set(promptId, {
        record,
        fetchedAt: Date.now(),
      });
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown DynamoDB error';
      throw new Error(`Failed to query PromptRegistry for promptId '${promptId}': ${message}`);
    }
  }

  private async queryActivePointerRecord(promptId: string, environment: string): Promise<ActivePointerRecord | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'promptId = :pk',
        ExpressionAttributeValues: {
          ':pk': promptId,
          ':pointerType': 'active-pointer',
          ':env': environment,
        },
        FilterExpression: '#recordType = :pointerType AND #env = :env',
        ExpressionAttributeNames: {
          '#recordType': 'recordType',
          '#env': 'environment',
        },
        ScanIndexForward: false,
        Limit: 25,
      }),
    );

    const first = result.Items?.[0] as Record<string, unknown> | undefined;
    if (!first) {
      return null;
    }

    const activeVersion = Number(first.activeVersion);
    if (!Number.isFinite(activeVersion) || activeVersion <= 0) {
      throw new Error(
        `Active pointer record has invalid activeVersion for promptId '${promptId}' in environment '${environment}'`,
      );
    }

    return {
      promptId,
      environment,
      activeVersion,
    };
  }

  private async queryPromptByVersion(promptId: string, version: number): Promise<PromptRecord | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'promptId = :pk AND version = :version',
        ExpressionAttributeValues: {
          ':pk': promptId,
          ':version': version,
        },
        Limit: 1,
      }),
    );

    return this.extractPromptRecord(result);
  }

  private async queryLatestPromptVersion(promptId: string): Promise<PromptRecord | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'promptId = :pk',
        ExpressionAttributeValues: {
          ':pk': promptId,
        },
        ScanIndexForward: false,
        Limit: 1,
      }),
    );

    return this.extractPromptRecord(result);
  }

  private extractPromptRecord(result: QueryCommandOutput): PromptRecord | null {
    const firstItem = result.Items?.[0] as Record<string, unknown> | undefined;
    if (!firstItem) {
      return null;
    }

    return mapPromptRecordFromItem(firstItem);
  }
}

export class LocalPromptRegistryAdapter implements PromptRegistryAdapter {
  private readonly cache = new Map<string, PromptCacheEntry>();
  private readonly activePointerEnv: string | undefined;
  private readonly readPromptFile: PromptFileReader;
  private readonly directoryPath: string;

  constructor(
    directoryPath: string,
    activePointerEnvOrReader?: string | PromptFileReader,
    readPromptFileArg?: PromptFileReader,
  ) {
    this.directoryPath = directoryPath;

    if (typeof activePointerEnvOrReader === 'function') {
      this.activePointerEnv = undefined;
      this.readPromptFile = activePointerEnvOrReader;
      return;
    }

    this.activePointerEnv = activePointerEnvOrReader;
    this.readPromptFile = readPromptFileArg ?? defaultPromptFileReader;
  }

  async getLatestPrompt(promptId: string): Promise<PromptRecord | null> {
    const cached = this.cache.get(promptId);
    if (cached && isCacheFresh(cached)) {
      return cached.record;
    }

    const normalizedDir = this.directoryPath.endsWith('/') ? this.directoryPath.slice(0, -1) : this.directoryPath;
    const filePath = `${normalizedDir}/${promptId}.json`;

    try {
      const rawContent = await this.readPromptFile(filePath);
      const parsed = JSON.parse(rawContent) as Record<string, unknown> | Array<Record<string, unknown>>;

      const record = this.selectRecordFromLocalPayload(parsed, promptId, this.activePointerEnv);

      this.cache.set(promptId, {
        record,
        fetchedAt: Date.now(),
      });
      return record;
    } catch (error) {
      const maybeError = error as { code?: string } | undefined;
      if (maybeError?.code === 'ENOENT') {
        this.cache.set(promptId, {
          record: null,
          fetchedAt: Date.now(),
        });
        return null;
      }

      const message = error instanceof Error ? error.message : 'Unknown local file error';
      throw new Error(`Failed to read local prompt file '${filePath}': ${message}`);
    }
  }

  private selectRecordFromLocalPayload(
    payload: Record<string, unknown> | Array<Record<string, unknown>>,
    requestedPromptId: string,
    activePointerEnv?: string,
  ): PromptRecord | null {
    if (!Array.isArray(payload)) {
      return {
        ...mapPromptRecordFromItem(payload),
        selectionSource: 'latest-version',
        selectionEnvironment: activePointerEnv,
      };
    }

    const mapped = payload
      .filter(
        (item) => !(typeof item === 'object' && item !== null && item.recordType === 'active-pointer'),
      )
      .map(mapPromptRecordFromItem)
      .filter((record) => record.promptId === requestedPromptId);

    if (mapped.length === 0) {
      return null;
    }

    if (activePointerEnv) {
      const pointer = payload.find(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          item.promptId === requestedPromptId &&
          item.recordType === 'active-pointer' &&
          item.environment === activePointerEnv,
      );

      if (pointer) {
        const activeVersion = Number(pointer.activeVersion);
        if (!Number.isFinite(activeVersion) || activeVersion <= 0) {
          throw new Error(
            `Active pointer record has invalid activeVersion for promptId '${requestedPromptId}' in environment '${activePointerEnv}'`,
          );
        }

        const selected = mapped.find((record) => record.version === activeVersion);
        if (!selected) {
          throw new Error(
            `Active pointer selected missing prompt version ${activeVersion} for promptId '${requestedPromptId}' in environment '${activePointerEnv}'`,
          );
        }

        return {
          ...selected,
          selectionSource: 'active-pointer',
          selectionEnvironment: activePointerEnv,
        };
      }
    }

    const active = mapped
      .filter((record) => record.status === 'active')
      .sort((a, b) => b.version - a.version)[0];

    if (active) {
      return {
        ...active,
        selectionSource: 'latest-active',
        selectionEnvironment: activePointerEnv,
      };
    }

    const latest = mapped.sort((a, b) => b.version - a.version)[0];
    return latest
      ? {
          ...latest,
          selectionSource: 'latest-version',
          selectionEnvironment: activePointerEnv,
        }
      : null;
  }
}

export function createPromptRegistryAdapter(config: AIRuntimeConfig): PromptRegistryAdapter {
  if (config.mode === 'local' && config.promptRegistryLocalDir) {
    return new LocalPromptRegistryAdapter(config.promptRegistryLocalDir, config.promptRegistryActivePointerEnv);
  }

  return new DynamoPromptRegistryAdapter(config.promptRegistryTable, config.promptRegistryActivePointerEnv);
}
