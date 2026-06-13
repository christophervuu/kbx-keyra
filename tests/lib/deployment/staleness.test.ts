import { describe, expect, it } from 'vitest';

import {
  computeAllEnvironments,
  computeStaleness,
  type DeploymentStalenessInput,
  type MappingStalenessInput,
} from '../../../src/lib/deployment/index.js';

function deployment(overrides: Partial<DeploymentStalenessInput> = {}): DeploymentStalenessInput {
  return {
    sourceType: 'revision',
    sourceNumber: 5,
    ...overrides,
  };
}

function mapping(overrides: Partial<MappingStalenessInput> = {}): MappingStalenessInput {
  return {
    revision: 5,
    latestVersion: 3,
    ...overrides,
  };
}

describe('lib/deployment staleness', () => {
  it('returns stale when deployed revision is less than current revision (AE-04)', () => {
    const result = computeStaleness(
      deployment({
        sourceType: 'revision',
        sourceNumber: 4,
      }),
      mapping({
        revision: 5,
      }),
    );

    expect(result).toBe('stale');
  });

  it('returns current when deployed revision equals current revision', () => {
    const result = computeStaleness(
      deployment({
        sourceType: 'revision',
        sourceNumber: 5,
      }),
      mapping({
        revision: 5,
      }),
    );

    expect(result).toBe('current');
  });

  it('returns current when deployed version equals latest version', () => {
    const result = computeStaleness(
      deployment({
        sourceType: 'version',
        sourceNumber: 7,
      }),
      mapping({
        latestVersion: 7,
      }),
    );

    expect(result).toBe('current');
  });

  it('returns stale when deployed version is less than latest version (AE-05)', () => {
    const result = computeStaleness(
      deployment({
        sourceType: 'version',
        sourceNumber: 6,
      }),
      mapping({
        latestVersion: 7,
      }),
    );

    expect(result).toBe('stale');
  });

  it('returns not-deployed when current deployment is null', () => {
    const result = computeStaleness(null, mapping());

    expect(result).toBe('not-deployed');
  });

  it('treats version deployment as current when latestVersion is not set yet', () => {
    const result = computeStaleness(
      deployment({
        sourceType: 'version',
        sourceNumber: 2,
      }),
      mapping({
        latestVersion: null,
      }),
    );

    expect(result).toBe('current');
  });

  it('computes status for all environments in one call', () => {
    const result = computeAllEnvironments(
      {
        DEV: deployment({ sourceType: 'revision', sourceNumber: 3 }),
        PREPROD: deployment({ sourceType: 'version', sourceNumber: 1 }),
        PROD: null,
      },
      mapping({ revision: 4, latestVersion: 2 }),
    );

    expect(result).toEqual({
      DEV: 'stale',
      PREPROD: 'stale',
      PROD: 'not-deployed',
    });
  });
});
