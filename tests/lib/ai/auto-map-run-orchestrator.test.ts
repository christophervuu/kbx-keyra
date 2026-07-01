import { describe, expect, it, vi } from 'vitest';

import { orchestrateAutoMapRun } from '../../../src/lib/ai/auto-map-run-orchestrator.js';
import { planAutoMapWorkUnits } from '../../../src/lib/ai/auto-map-work-unit-planner.js';
import type {
  AutoMapRunItem,
  AutoMapSessionItem,
  AutoMapWorkUnitItem,
} from '../../../src/lib/persistence/auto-map.js';
import type { SchemaNode } from '../../../src/lib/schema/types.js';

const TARGET_SCHEMA_NODES: readonly SchemaNode[] = [
  {
    schemaId: 'target',
    path: 'Order',
    fieldName: 'Order',
    type: 'object',
    depth: 0,
    isArray: false,
    isRequired: true,
    childCount: 3,
    subtreeFieldCount: 3,
    embeddingText: 'Order object',
  },
  {
    schemaId: 'target',
    path: 'Order.Header',
    fieldName: 'Header',
    type: 'object',
    depth: 1,
    isArray: false,
    isRequired: true,
    parentPath: 'Order',
    childCount: 2,
    subtreeFieldCount: 2,
    embeddingText: 'Header object',
  },
  {
    schemaId: 'target',
    path: 'Order.Header.DocumentType',
    fieldName: 'DocumentType',
    type: 'string',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Header',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Document type',
  },
  {
    schemaId: 'target',
    path: 'Order.Items',
    fieldName: 'Items',
    type: 'array',
    depth: 1,
    isArray: true,
    isRequired: false,
    parentPath: 'Order',
    childCount: 1,
    subtreeFieldCount: 1,
    embeddingText: 'Items array',
  },
  {
    schemaId: 'target',
    path: 'Order.Items.Id',
    fieldName: 'Id',
    type: 'string',
    depth: 2,
    isArray: false,
    isRequired: true,
    parentPath: 'Order.Items',
    childCount: 0,
    subtreeFieldCount: 0,
    embeddingText: 'Item id',
  },
];

function baseSession(): AutoMapSessionItem {
  return {
    PK: 'SESSION#s_1',
    SK: 'META',
    entityType: 'AutoMapSession',
    sessionId: 's_1',
    mappingId: 'm_1',
    projectId: 'p_1',
    status: 'open',
    baseMappingRevision: 3,
    generationFingerprint: {
      sourceSchema: { id: 'src', version: '1' },
      targetSchema: { id: 'tgt', version: '1' },
      enrichmentSchemas: [],
      engineVersion: '1',
      dslVersion: '1',
      promptId: 'auto-map',
      promptVersion: '1',
      model: 'gpt',
    },
    reviewCounts: {
      pending: 0,
      editing: 0,
      accepted: 0,
      acceptedEdited: 0,
      dismissed: 0,
      keptCurrent: 0,
      stale: 0,
      conflict: 0,
      invalid: 0,
    },
    createdAt: '2026-06-29T00:00:00.000Z',
    updatedAt: '2026-06-29T00:00:00.000Z',
    GSI1PK: 'MAPPING#m_1',
    GSI1SK: 'CREATED#2026-06-29T00:00:00.000Z#s_1',
    GSI2PK: 'MAPPING#m_1',
    GSI2SK: 'OPEN#2026-06-29T00:00:00.000Z#s_1',
  };
}

function baseRun(): AutoMapRunItem {
  return {
    PK: 'SESSION#s_1',
    SK: 'RUN#2026-06-29T00:00:00.000Z#r_1',
    entityType: 'AutoMapRun',
    sessionId: 's_1',
    runId: 'r_1',
    status: 'queued',
    scope: {
      mode: 'selected',
      targetPaths: ['Order.Header.DocumentType', 'Order.Items.Id'],
    },
    requestFingerprint: 'fp',
    idempotencyKey: 'idk',
    progress: {
      completedWorkUnits: 0,
      totalWorkUnits: 0,
      completedTargets: 0,
      totalTargets: 0,
    },
    counts: {
      generated: 0,
      ready: 0,
      warning: 0,
      invalid: 0,
      failedTargets: 0,
    },
    createdAt: '2026-06-29T00:00:00.000Z',
    updatedAt: '2026-06-29T00:00:00.000Z',
  };
}

describe('auto-map run orchestrator', () => {
  it('persists progressive results and sets partial when sibling work-unit fails', async () => {
    const putSuggestions = vi.fn().mockResolvedValue(undefined);
    const updateRunStatus = vi.fn().mockResolvedValue(undefined);
    const updateRunProgress = vi.fn().mockResolvedValue(undefined);
    const updateWorkUnitStatus = vi.fn().mockResolvedValue(undefined);

    const executeWorkUnit = vi
      .fn()
      .mockImplementationOnce(async () => ({
        suggestions: [
          {
            targetPath: 'Order.Header.DocumentType',
            sectionPath: 'Order.Header',
            expression: '"Invoice"',
            validationState: 'ready',
          },
        ],
      }))
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error('throttle'), { name: 'ServiceUnavailableException' });
      })
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error('failed after retry'), {
          code: 'WORK_UNIT_FAILED',
          retryable: false,
        });
      });

    const output = await orchestrateAutoMapRun(
      {
        listAutoMapRuns: vi.fn().mockResolvedValue([]),
        listAutoMapSuggestions: vi.fn().mockResolvedValue([]),
        listAutoMapWorkUnits: vi.fn().mockResolvedValue([]),
        putAutoMapWorkUnitIfAbsent: vi.fn().mockResolvedValue(undefined),
        updateAutoMapWorkUnitStatus: updateWorkUnitStatus,
        updateAutoMapRunStatus: updateRunStatus,
        updateAutoMapRunProgress: updateRunProgress,
        putAutoMapSuggestions: putSuggestions,
        updateAutoMapSessionSummary: vi.fn().mockResolvedValue(undefined),
        executeWorkUnit,
        sleepMs: vi.fn().mockResolvedValue(undefined),
      },
      {
        session: baseSession(),
        run: baseRun(),
        targetSchemaNodes: TARGET_SCHEMA_NODES,
        maxRetries: 1,
        retryBackoffMs: [0],
      },
    );

    expect(output.finalRunStatus).toBe('partial');
    expect(output.totalWorkUnits).toBe(2);
    expect(output.completedWorkUnits).toBe(1);
    expect(output.failedWorkUnits).toBe(1);

    expect(putSuggestions).toHaveBeenCalledTimes(1);
    expect(updateRunProgress).toHaveBeenCalledTimes(2);
    expect(updateRunStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'partial',
      }),
    );
  });

  it('merges refresh suggestions by target path and preserves out-of-scope resolved rows', async () => {
    const putSuggestions = vi.fn().mockResolvedValue(undefined);
    const updateSessionSummary = vi.fn().mockResolvedValue(undefined);
    const listSuggestions = vi
      .fn()
      .mockResolvedValueOnce([
        {
          PK: 'SESSION#s_1',
          SK: 'SUGGESTION#000000#000000#sg_refresh_target',
          entityType: 'AutoMapSuggestion',
          sessionId: 's_1',
          runId: 'run_prev',
          workUnitId: 'wu_prev',
          suggestionId: 'sg_refresh_target',
          sectionOrder: 0,
          targetOrder: 0,
          sectionPath: 'Order.Header',
          targetPath: 'Order.Header.DocumentType',
          reviewStatus: 'pending',
          validationState: 'ready',
          sourceReferences: [],
          version: 4,
        },
        {
          PK: 'SESSION#s_1',
          SK: 'SUGGESTION#000001#000000#sg_out_scope',
          entityType: 'AutoMapSuggestion',
          sessionId: 's_1',
          runId: 'run_prev',
          workUnitId: 'wu_prev_2',
          suggestionId: 'sg_out_scope',
          sectionOrder: 1,
          targetOrder: 0,
          sectionPath: 'Order.Header',
          targetPath: 'Order.Header.CurrencyCode',
          reviewStatus: 'dismissed',
          validationState: 'ready',
          sourceReferences: [],
          version: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          PK: 'SESSION#s_1',
          SK: 'SUGGESTION#000000#000000#sg_refresh_target',
          entityType: 'AutoMapSuggestion',
          sessionId: 's_1',
          runId: 'r_1',
          workUnitId: 'wu_1',
          suggestionId: 'sg_refresh_target',
          sectionOrder: 0,
          targetOrder: 0,
          sectionPath: 'Order.Header',
          targetPath: 'Order.Header.DocumentType',
          reviewStatus: 'pending',
          validationState: 'ready',
          sourceReferences: [],
          version: 5,
        },
        {
          PK: 'SESSION#s_1',
          SK: 'SUGGESTION#000001#000000#sg_out_scope',
          entityType: 'AutoMapSuggestion',
          sessionId: 's_1',
          runId: 'run_prev',
          workUnitId: 'wu_prev_2',
          suggestionId: 'sg_out_scope',
          sectionOrder: 1,
          targetOrder: 0,
          sectionPath: 'Order.Header',
          targetPath: 'Order.Header.CurrencyCode',
          reviewStatus: 'dismissed',
          validationState: 'ready',
          sourceReferences: [],
          version: 2,
        },
      ]);

    await orchestrateAutoMapRun(
      {
        listAutoMapRuns: vi.fn().mockResolvedValue([]),
        listAutoMapSuggestions: listSuggestions,
        listAutoMapWorkUnits: vi.fn().mockResolvedValue([]),
        putAutoMapWorkUnitIfAbsent: vi.fn().mockResolvedValue(undefined),
        updateAutoMapWorkUnitStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunProgress: vi.fn().mockResolvedValue(undefined),
        putAutoMapSuggestions: putSuggestions,
        updateAutoMapSessionSummary: updateSessionSummary,
        executeWorkUnit: vi.fn().mockResolvedValue({
          suggestions: [
            {
              targetPath: 'Order.Header.DocumentType',
              sectionPath: 'Order.Header',
              expression: '"Invoice"',
              validationState: 'ready',
            },
          ],
        }),
      },
      {
        session: baseSession(),
        run: {
          ...baseRun(),
          scope: {
            mode: 'refresh',
            targetPaths: ['Order.Header.DocumentType'],
            refreshOfRunId: 'run_prev',
          },
        },
        targetSchemaNodes: TARGET_SCHEMA_NODES,
      },
    );

    expect(putSuggestions).toHaveBeenCalledTimes(1);
    const mergedWrite = putSuggestions.mock.calls[0]?.[0] as Array<{ targetPath: string; suggestionId: string; version: number }>;
    expect(mergedWrite).toHaveLength(1);
    expect(mergedWrite[0]).toMatchObject({
      targetPath: 'Order.Header.DocumentType',
      suggestionId: 'sg_refresh_target',
      version: 5,
    });

    expect(updateSessionSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'reviewing',
        reviewCounts: expect.objectContaining({
          pending: 1,
          dismissed: 1,
        }),
      }),
    );
  });

  it('retry-failed plans only failed-work-unit target paths when retry ids are provided', async () => {
    const executeWorkUnit = vi.fn().mockResolvedValue({ suggestions: [] });

    const previousFailedTargets = ['Order.Header.DocumentType'];
    const previousSuccessTargets = ['Order.Items.Id'];

    await orchestrateAutoMapRun(
      {
        listAutoMapRuns: vi.fn().mockResolvedValue([
          {
            ...baseRun(),
            runId: 'r_prev',
            createdAt: '2026-06-28T00:00:00.000Z',
            updatedAt: '2026-06-28T00:00:00.000Z',
            status: 'partial',
          },
        ]),
        listAutoMapSuggestions: vi.fn().mockResolvedValue([]),
        listAutoMapWorkUnits: vi.fn().mockImplementation(async (_sessionId: string, runId: string) => {
          if (runId === 'r_prev') {
            return [
              {
                PK: 'SESSION#s_1',
                SK: 'WORK_UNIT#r_prev#000000#wu_failed',
                entityType: 'AutoMapWorkUnit',
                sessionId: 's_1',
                runId: 'r_prev',
                workUnitId: 'wu_failed',
                order: 0,
                status: 'failed',
                targetPaths: previousFailedTargets,
              },
              {
                PK: 'SESSION#s_1',
                SK: 'WORK_UNIT#r_prev#000001#wu_ok',
                entityType: 'AutoMapWorkUnit',
                sessionId: 's_1',
                runId: 'r_prev',
                workUnitId: 'wu_ok',
                order: 1,
                status: 'completed',
                targetPaths: previousSuccessTargets,
              },
            ];
          }

          return [];
        }),
        putAutoMapWorkUnitIfAbsent: vi.fn().mockResolvedValue(undefined),
        updateAutoMapWorkUnitStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunProgress: vi.fn().mockResolvedValue(undefined),
        putAutoMapSuggestions: vi.fn().mockResolvedValue(undefined),
        updateAutoMapSessionSummary: vi.fn().mockResolvedValue(undefined),
        executeWorkUnit,
      },
      {
        session: baseSession(),
        run: {
          ...baseRun(),
          scope: {
            mode: 'retry-failed',
            retryWorkUnitIds: ['wu_failed'],
          },
        },
        targetSchemaNodes: TARGET_SCHEMA_NODES,
      },
    );

    expect(executeWorkUnit).toHaveBeenCalled();
    const plannedUnit = executeWorkUnit.mock.calls[0]?.[0] as { targetPaths: string[] };
    expect(plannedUnit.targetPaths).toEqual(previousFailedTargets);
  });

  it('marks session resolved and clears open index only when all suggestions are resolved and materialized', async () => {
    const updateSessionSummary = vi.fn().mockResolvedValue(undefined);

    await orchestrateAutoMapRun(
      {
        listAutoMapRuns: vi.fn().mockResolvedValue([
          {
            ...baseRun(),
            status: 'completed',
          },
        ]),
        listAutoMapSuggestions: vi.fn().mockResolvedValue([
          {
            PK: 'SESSION#s_1',
            SK: 'SUGGESTION#000000#000000#sg_1',
            entityType: 'AutoMapSuggestion',
            sessionId: 's_1',
            runId: 'r_1',
            workUnitId: 'wu_1',
            suggestionId: 'sg_1',
            sectionOrder: 0,
            targetOrder: 0,
            sectionPath: 'Order.Header',
            targetPath: 'Order.Header.DocumentType',
            reviewStatus: 'accepted',
            validationState: 'ready',
            sourceReferences: [],
            version: 1,
            materializedMappingRevision: 4,
          },
          {
            PK: 'SESSION#s_1',
            SK: 'SUGGESTION#000001#000000#sg_2',
            entityType: 'AutoMapSuggestion',
            sessionId: 's_1',
            runId: 'r_1',
            workUnitId: 'wu_2',
            suggestionId: 'sg_2',
            sectionOrder: 1,
            targetOrder: 0,
            sectionPath: 'Order.Header',
            targetPath: 'Order.Header.CurrencyCode',
            reviewStatus: 'dismissed',
            validationState: 'ready',
            sourceReferences: [],
            version: 1,
          },
        ]),
        listAutoMapWorkUnits: vi.fn().mockResolvedValue([]),
        putAutoMapWorkUnitIfAbsent: vi.fn().mockResolvedValue(undefined),
        updateAutoMapWorkUnitStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunProgress: vi.fn().mockResolvedValue(undefined),
        putAutoMapSuggestions: vi.fn().mockResolvedValue(undefined),
        updateAutoMapSessionSummary: updateSessionSummary,
        executeWorkUnit: vi.fn().mockResolvedValue({ suggestions: [] }),
      },
      {
        session: baseSession(),
        run: {
          ...baseRun(),
          scope: {
            mode: 'refresh',
            targetPaths: [],
          },
        },
        targetSchemaNodes: TARGET_SCHEMA_NODES,
      },
    );

    expect(updateSessionSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'resolved',
        clearOpenSessionIndex: true,
        completedAt: expect.any(String),
      }),
    );
  });

  it('skips already terminal work-units for idempotent duplicate callback safety', async () => {
    const plan = planAutoMapWorkUnits({
      targetSchemaNodes: TARGET_SCHEMA_NODES,
      scope: baseRun().scope,
    });

    const existing: AutoMapWorkUnitItem[] = [
      {
        PK: 'SESSION#s_1',
        SK: `WORK_UNIT#r_1#000000#${plan.workUnits[0]?.workUnitId}`,
        entityType: 'AutoMapWorkUnit',
        sessionId: 's_1',
        runId: 'r_1',
        workUnitId: plan.workUnits[0]?.workUnitId ?? 'wu_missing',
        order: 0,
        status: 'completed',
      },
    ];

    const executeWorkUnit = vi.fn().mockResolvedValue({ suggestions: [] });

    const output = await orchestrateAutoMapRun(
      {
        listAutoMapRuns: vi.fn().mockResolvedValue([]),
        listAutoMapSuggestions: vi.fn().mockResolvedValue([]),
        listAutoMapWorkUnits: vi.fn().mockResolvedValue(existing),
        putAutoMapWorkUnitIfAbsent: vi.fn().mockResolvedValue(undefined),
        updateAutoMapWorkUnitStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunProgress: vi.fn().mockResolvedValue(undefined),
        putAutoMapSuggestions: vi.fn().mockResolvedValue(undefined),
        updateAutoMapSessionSummary: vi.fn().mockResolvedValue(undefined),
        executeWorkUnit,
      },
      {
        session: baseSession(),
        run: baseRun(),
        targetSchemaNodes: TARGET_SCHEMA_NODES,
      },
    );

    expect(output.totalWorkUnits).toBe(2);
    expect(executeWorkUnit).toHaveBeenCalledTimes(1);
  });

  it('stops as superseded when conditional-write guard rejects late write', async () => {
    const conditionalError = Object.assign(new Error('superseded'), {
      name: 'ConditionalCheckFailedException',
    });

    const output = await orchestrateAutoMapRun(
      {
        listAutoMapRuns: vi.fn().mockResolvedValue([]),
        listAutoMapSuggestions: vi.fn().mockResolvedValue([]),
        listAutoMapWorkUnits: vi.fn().mockResolvedValue([]),
        putAutoMapWorkUnitIfAbsent: vi.fn().mockResolvedValue(undefined),
        updateAutoMapWorkUnitStatus: vi.fn().mockRejectedValue(conditionalError),
        updateAutoMapRunStatus: vi.fn().mockResolvedValue(undefined),
        updateAutoMapRunProgress: vi.fn().mockResolvedValue(undefined),
        putAutoMapSuggestions: vi.fn().mockResolvedValue(undefined),
        updateAutoMapSessionSummary: vi.fn().mockResolvedValue(undefined),
        executeWorkUnit: vi.fn().mockResolvedValue({ suggestions: [] }),
      },
      {
        session: baseSession(),
        run: baseRun(),
        targetSchemaNodes: TARGET_SCHEMA_NODES,
      },
    );

    expect(output.finalRunStatus).toBe('superseded');
    expect(output.completedWorkUnits).toBe(0);
  });
});
