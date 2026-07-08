import { beforeEach, describe, expect, it, vi } from 'vitest';

const mappingVersionsMocks = vi.hoisted(() => ({
  get: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock('../../../src/lib/persistence/mapping-versions.js', () => mappingVersionsMocks);

async function importModule() {
  return import('../../../src/lambda/deployment/version-eligibility.js');
}

describe('deployment version eligibility', () => {
  beforeEach(() => {
    vi.resetModules();
    mappingVersionsMocks.get.mockReset();
    mappingVersionsMocks.getConfig.mockReset();
  });

  it('returns VERSION_NOT_FOUND when version is absent', async () => {
    mappingVersionsMocks.get.mockResolvedValueOnce(null);
    const mod = await importModule();

    const result = await mod.evaluateVersionEligibility({ mappingId: 'map-1', version: 4 });
    expect(result).toEqual({
      eligible: false,
      reason: 'VERSION_NOT_FOUND',
      message: 'Version source not found: map-1:4',
      statusCode: 404,
    });
  });

  it('returns VERSION_CONFIG_NOT_FOUND when immutable config is absent', async () => {
    mappingVersionsMocks.get.mockResolvedValueOnce({ version: 4 });
    mappingVersionsMocks.getConfig.mockResolvedValueOnce(null);
    const mod = await importModule();

    const result = await mod.evaluateVersionEligibility({ mappingId: 'map-1', version: 4 });
    expect(result).toEqual({
      eligible: false,
      reason: 'VERSION_CONFIG_NOT_FOUND',
      message: 'Version config snapshot unavailable: map-1:4',
      statusCode: 500,
    });
  });

  it('returns UNRESOLVED_VALUE_MAP_BINDINGS when project refs are unresolved', async () => {
    mappingVersionsMocks.get.mockResolvedValueOnce({ version: 4 });
    mappingVersionsMocks.getConfig.mockResolvedValueOnce({
      name: 'Map',
      version: 4,
      engineVersion: '1.0.0',
      config: {},
      rules: [
        {
          target: 'x',
          type: 'string',
          expression: 'valueMap(...)',
          valueTableRef: {
            scope: 'project',
          },
        },
      ],
    });
    const mod = await importModule();

    const result = await mod.evaluateVersionEligibility({ mappingId: 'map-1', version: 4 });
    expect(result).toEqual({
      eligible: false,
      reason: 'UNRESOLVED_VALUE_MAP_BINDINGS',
      message: 'Deployment blocked: unresolved value-map bindings in source config (map-1:version:4)',
      statusCode: 409,
    });
  });

  it('returns eligible result when immutable version config is valid', async () => {
    mappingVersionsMocks.get.mockResolvedValueOnce({ version: 4 });
    mappingVersionsMocks.getConfig.mockResolvedValueOnce({
      name: 'Map',
      version: 4,
      engineVersion: '1.0.0',
      config: {},
      rules: [],
    });
    const mod = await importModule();

    const result = await mod.evaluateVersionEligibility({ mappingId: 'map-1', version: 4 });
    expect(result).toEqual({
      eligible: true,
      normalizedVersion: 4,
      mappingConfig: {
        name: 'Map',
        version: 4,
        engineVersion: '1.0.0',
        config: {},
        rules: [],
      },
    });
  });
});
