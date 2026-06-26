export const fs100Ae12RuntimeLifecycleFixture = {
  mappingId: 'map-fs100-ae12',
  sourceData: { amount: 5 },
  versions: {
    1: {
      name: 'FS-100 Fixture Mapping',
      version: 1,
      engineVersion: '2.0.0',
      config: {},
      rules: [{ target: 'Amount', type: 'number', expression: 'source("amount")' }],
    },
    2: {
      name: 'FS-100 Fixture Mapping',
      version: 2,
      engineVersion: '2.0.0',
      config: {},
      rules: [{ target: 'Amount', type: 'number', expression: 'source("amount") * 2' }],
    },
  },
  expected: {
    version1Output: { Amount: 5 },
    version2Output: { Amount: 10 },
  },
} as const;
