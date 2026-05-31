import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';

type CliArgs = {
  endpoint: string;
  indexName: string;
};

const INDEX_MAPPING = {
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
          engine: 'nmslib',
          space_type: 'cosinesimil',
        },
      },
      type: { type: 'keyword' },
      depth: { type: 'integer' },
      parentPath: { type: 'keyword' },
      isArray: { type: 'boolean' },
    },
  },
} as const;

function parseArgs(argv: readonly string[]): CliArgs {
  const args = argv.slice(2);

  let endpoint = '';
  let indexName = '';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--endpoint') {
      endpoint = args[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (arg === '--index-name') {
      indexName = args[index + 1] ?? '';
      index += 1;
    }
  }

  if (!endpoint || !indexName) {
    throw new Error('Usage: tsx scripts/create-opensearch-index.ts --endpoint <url> --index-name <name>');
  }

  return {
    endpoint,
    indexName,
  };
}

async function main(): Promise<void> {
  const { endpoint, indexName } = parseArgs(process.argv);

  const client = new Client({
    ...AwsSigv4Signer({
      region: process.env.AWS_REGION ?? 'us-east-1',
      service: 'aoss',
      getCredentials: () => {
        const provider = defaultProvider();
        return provider();
      },
    }),
    node: endpoint,
  });

  const existsResult = await client.indices.exists({ index: indexName });
  if (existsResult.body === true) {
    console.log(`Index already exists: ${indexName}`);
    return;
  }

  await client.indices.create({
    index: indexName,
    body: INDEX_MAPPING,
  });

  console.log(`Created index: ${indexName}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Failed to create OpenSearch index: ${message}`);
  process.exitCode = 1;
});
