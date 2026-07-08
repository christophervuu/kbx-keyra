import { describe, expect, it } from 'vitest';

import {
  buildDeploymentArtifactBundle,
  computeArtifactHashFromBundlePayload,
} from '../../../src/lib/deployment/artifact-bundle.js';
import type { MappingConfig } from '../../../src/lib/persistence/types.js';

function makeConfig(): MappingConfig {
  return {
    id: 'mapping-1',
    projectId: 'project-1',
    name: 'Order Mapping',
    version: 4,
    engineVersion: '1.0.0',
    sourceSchemaRef: {
      schemaId: 'schema-source',
      type: 'local',
      schemaVersion: 2,
      schemaVersionId: 'schema-source-v2',
      contentHash: 'source-hash',
    },
    targetSchemaRef: {
      schemaId: 'schema-target',
      type: 'local',
      schemaVersion: 3,
      schemaVersionId: 'schema-target-v3',
      contentHash: 'target-hash',
    },
    enrichmentSources: [
      {
        alias: 'customer',
        schemaId: 'schema-customer',
        schemaVersion: 1,
        schemaVersionId: 'schema-customer-v1',
        contentHash: 'customer-hash',
      },
    ],
    config: {
      constants: {
        country: 'US',
      },
    },
    rules: [
      {
        target: 'customerName',
        type: 'string',
        expression: 'source("name")',
      },
      {
        target: 'statusLabel',
        type: 'string',
        expression: 'valueMap(source("status"), valueTable("order-status", "code", "label"))',
        valueTableRef: {
          scope: 'project',
          valueTableId: 'value-table-1',
          tableKey: 'order-status',
          revision: 3,
          inputSideKey: 'code',
          outputSideKey: 'label',
          inputType: 'string',
          outputType: 'string',
          resolvedEntries: [],
        },
      },
    ],
  };
}

describe('deployment artifact bundle', () => {
  it('builds deterministic artifactId/hash for identical immutable content', () => {
    const config = makeConfig();

    const first = buildDeploymentArtifactBundle({
      mappingId: 'map-1',
      sourceType: 'version',
      sourceNumber: 4,
      mappingConfig: config,
    });
    const second = buildDeploymentArtifactBundle({
      mappingId: 'map-1',
      sourceType: 'version',
      sourceNumber: 4,
      mappingConfig: {
        ...config,
        config: {
          constants: {
            country: 'US',
          },
        },
      },
    });

    expect(first.artifactHash).toBe(second.artifactHash);
    expect(first.artifactId).toBe(second.artifactId);
  });

  it('excludes deployment metadata from hash input', () => {
    const bundle = buildDeploymentArtifactBundle({
      mappingId: 'map-1',
      sourceType: 'version',
      sourceNumber: 4,
      mappingConfig: makeConfig(),
    });

    const withMetadata = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        createdAt: '2026-07-07T12:00:00.000Z',
        createdByActor: 'user-1',
        actorType: 'USER',
        actorId: 'user-1',
        actorDisplayName: 'Demo User',
        reason: 'release',
        environment: 'PROD',
      },
    };

    const recomputedHash = computeArtifactHashFromBundlePayload(withMetadata);
    expect(recomputedHash).toBe(bundle.artifactHash);
  });
});
