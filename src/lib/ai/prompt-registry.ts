import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, type QueryCommandOutput } from '@aws-sdk/lib-dynamodb';

import type { AIRuntimeConfig } from './config.js';
import type { PromptRecord, PromptRegistryAdapter } from './types.js';

const CACHE_TTL_MS = 300_000;

interface PromptCacheEntry {
  readonly record: PromptRecord | null;
  readonly fetchedAt: number;
}

type PromptFileReader = (filePath: string) => Promise<string>;

function isCacheFresh(entry: PromptCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

function mapPromptRecordFromItem(item: Record<string, unknown>): PromptRecord {
  return {
    promptId: String(item.promptId),
    version: Number(item.version),
    systemMessage: String(item.systemMessage),
    userMessageTemplate: String(item.userMessageTemplate),
    model: String(item.model),
    temperature: Number(item.temperature),
    responseSchema: String(item.responseSchema),
    maxTokens: Number(item.maxTokens),
    updatedAt: String(item.updatedAt),
    updatedBy: String(item.updatedBy),
    notes: typeof item.notes === 'string' ? item.notes : undefined,
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

  constructor(
    private readonly tableName: string,
    private readonly client: Pick<DynamoDBDocumentClient, 'send'> = DynamoDBDocumentClient.from(new DynamoDBClient({})),
  ) {}

  async getLatestPrompt(promptId: string): Promise<PromptRecord | null> {
    const cached = this.cache.get(promptId);
    if (cached && isCacheFresh(cached)) {
      return cached.record;
    }

    try {
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

      const record = this.extractPromptRecord(result);
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

  constructor(
    private readonly directoryPath: string,
    private readonly readPromptFile: PromptFileReader = defaultPromptFileReader,
  ) {}

  async getLatestPrompt(promptId: string): Promise<PromptRecord | null> {
    const cached = this.cache.get(promptId);
    if (cached && isCacheFresh(cached)) {
      return cached.record;
    }

    const normalizedDir = this.directoryPath.endsWith('/') ? this.directoryPath.slice(0, -1) : this.directoryPath;
    const filePath = `${normalizedDir}/${promptId}.json`;

    try {
      const rawContent = await this.readPromptFile(filePath);
      const parsed = JSON.parse(rawContent) as Record<string, unknown>;
      const record = mapPromptRecordFromItem(parsed);
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
}

export function createPromptRegistryAdapter(config: AIRuntimeConfig): PromptRegistryAdapter {
  if (config.mode === 'local' && config.promptRegistryLocalDir) {
    return new LocalPromptRegistryAdapter(config.promptRegistryLocalDir);
  }

  return new DynamoPromptRegistryAdapter(config.promptRegistryTable);
}
