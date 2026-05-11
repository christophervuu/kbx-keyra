import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import type { AIRuntimeConfig } from './config.js';
import type { DslAssetLoader } from './types.js';

const CACHE_TTL_MS = 300_000;

interface DslCacheEntry {
  readonly content: string;
  readonly fetchedAt: number;
}

type DslFileReader = (filePath: string) => Promise<string>;

interface S3BodyLike {
  transformToString?: () => Promise<string>;
}

function isCacheFresh(entry: DslCacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function defaultDslFileReader(filePath: string): Promise<string> {
  const readFile = Function(
    'targetPath',
    'return import("node:fs/promises").then((m) => m.readFile(targetPath, "utf8"));',
  ) as (targetPath: string) => Promise<string>;

  return readFile(filePath);
}

export class S3DslAssetLoader implements DslAssetLoader {
  private cache: DslCacheEntry | null = null;

  constructor(
    private readonly bucket: string,
    private readonly key: string,
    private readonly client: Pick<S3Client, 'send'> = new S3Client({}),
  ) {}

  async loadDslReference(): Promise<string> {
    if (this.cache && isCacheFresh(this.cache)) {
      return this.cache.content;
    }

    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.key,
        }),
      );

      const body = result.Body as S3BodyLike | undefined;
      if (!body?.transformToString) {
        throw new Error('S3 object body is empty');
      }

      const content = await body.transformToString();
      this.cache = {
        content,
        fetchedAt: Date.now(),
      };

      return content;
    } catch (error) {
      const s3Error = error as { name?: string; Code?: string; message?: string } | undefined;
      const code = s3Error?.name ?? s3Error?.Code;
      const message = error instanceof Error ? error.message : 'Unknown S3 error';

      if (code === 'NoSuchKey') {
        throw new Error(`DSL asset not found in S3: s3://${this.bucket}/${this.key}`);
      }

      throw new Error(`Failed to load DSL asset from S3 (s3://${this.bucket}/${this.key}): ${message}`);
    }
  }
}

export class LocalDslAssetLoader implements DslAssetLoader {
  private cache: DslCacheEntry | null = null;

  constructor(
    private readonly filePath: string,
    private readonly readDslFile: DslFileReader = defaultDslFileReader,
  ) {}

  async loadDslReference(): Promise<string> {
    if (this.cache && isCacheFresh(this.cache)) {
      return this.cache.content;
    }

    try {
      const content = await this.readDslFile(this.filePath);
      this.cache = {
        content,
        fetchedAt: Date.now(),
      };

      return content;
    } catch (error) {
      const maybeError = error as { code?: string } | undefined;
      if (maybeError?.code === 'ENOENT') {
        throw new Error(`Local DSL asset not found at path: ${this.filePath}`);
      }

      const message = error instanceof Error ? error.message : 'Unknown local file error';
      throw new Error(`Failed to load local DSL asset from '${this.filePath}': ${message}`);
    }
  }
}

export function createDslAssetLoader(config: AIRuntimeConfig): DslAssetLoader {
  if (config.mode === 'local' && config.dslAssetLocalPath) {
    return new LocalDslAssetLoader(config.dslAssetLocalPath);
  }

  return new S3DslAssetLoader(config.dslAssetBucket, config.dslAssetKey);
}
