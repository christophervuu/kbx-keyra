import { describe, expect, it } from 'vitest';

import {
  assertExpectedSuggestionVersion,
  autoMapTransitions,
  buildHistoryIndexAttributes,
  buildInsertIfAbsentConditionExpression,
  buildOpenSessionIndexAttributes,
  buildRunNotSupersededCondition,
  buildSessionNotSupersededCondition,
  buildSuggestionExpectedVersionCondition,
  canTransitionRunStatus,
  canTransitionSessionStatus,
  canTransitionSuggestionReviewStatus,
  canTransitionWorkUnitStatus,
  createRequestFingerprint,
  mappingHistoryGsiSk,
  nextSuggestionVersion,
  runSk,
  sessionMetaSk,
  sessionPk,
  suggestionSk,
  workUnitSk,
} from '../../../src/lib/persistence/auto-map.js';

describe('persistence auto-map domain contracts', () => {
  it('builds deterministic session/run/suggestion keys', () => {
    expect(sessionPk('ses-1')).toBe('SESSION#ses-1');
    expect(sessionMetaSk()).toBe('META');
    expect(runSk('2026-06-26T10:00:00.000Z', 'run-1')).toBe('RUN#2026-06-26T10:00:00.000Z#run-1');
    expect(workUnitSk('run-1', 17, 'wu-1')).toBe('WORK_UNIT#run-1#000017#wu-1');
    expect(suggestionSk(4, 12, 'sg-1')).toBe('SUGGESTION#000004#000012#sg-1');
  });

  it('builds history/open index attributes', () => {
    expect(mappingHistoryGsiSk('2026-06-26T10:00:00.000Z', 'ses-1')).toBe('CREATED#2026-06-26T10:00:00.000Z#ses-1');
    expect(buildHistoryIndexAttributes('map-1', '2026-06-26T10:00:00.000Z', 'ses-1')).toEqual({
      GSI1PK: 'MAPPING#map-1',
      GSI1SK: 'CREATED#2026-06-26T10:00:00.000Z#ses-1',
    });

    expect(buildOpenSessionIndexAttributes('map-1', '2026-06-26T10:01:00.000Z', 'ses-1')).toEqual({
      GSI2PK: 'MAPPING#map-1',
      GSI2SK: 'OPEN#2026-06-26T10:01:00.000Z#ses-1',
    });
  });

  it('enforces status transitions deterministically', () => {
    expect(canTransitionSessionStatus('open', 'generating')).toBe(true);
    expect(canTransitionSessionStatus('resolved', 'open')).toBe(false);

    expect(canTransitionRunStatus('validating', 'partial')).toBe(true);
    expect(canTransitionRunStatus('completed', 'queued')).toBe(false);

    expect(canTransitionWorkUnitStatus('queued', 'retrieving')).toBe(true);
    expect(canTransitionWorkUnitStatus('completed', 'failed')).toBe(false);

    expect(canTransitionSuggestionReviewStatus('pending', 'accepted')).toBe(true);
    expect(canTransitionSuggestionReviewStatus('accepted', 'dismissed')).toBe(false);
  });

  it('provides canonical transition maps', () => {
    expect(autoMapTransitions.run.validating).toEqual(['completed', 'partial', 'failed', 'superseded']);
    expect(autoMapTransitions.session.superseded).toEqual(['expired']);
  });

  it('creates stable request fingerprints from canonicalized payload', async () => {
    const first = await createRequestFingerprint({
      mappingId: 'map-1',
      baseMappingRevision: 4,
      sourceSchemaVersion: 'source-v1',
      targetSchemaVersion: 'target-v1',
      enrichmentSchemaVersions: [
        { inputId: 'tax', version: 'v3' },
        { inputId: 'crm', version: 'v2' },
      ],
      scopeMode: 'visible',
      targetPaths: ['Order.Id', 'Order.Customer.Id'],
      promptVersion: 'prompt-7',
      model: 'gpt-4.1-mini',
    });

    const reordered = await createRequestFingerprint({
      mappingId: 'map-1',
      baseMappingRevision: 4,
      sourceSchemaVersion: 'source-v1',
      targetSchemaVersion: 'target-v1',
      enrichmentSchemaVersions: [
        { inputId: 'crm', version: 'v2' },
        { inputId: 'tax', version: 'v3' },
      ],
      scopeMode: 'visible',
      targetPaths: ['Order.Id', 'Order.Customer.Id'],
      promptVersion: 'prompt-7',
      model: 'gpt-4.1-mini',
    });

    const changed = await createRequestFingerprint({
      mappingId: 'map-1',
      baseMappingRevision: 5,
      sourceSchemaVersion: 'source-v1',
      targetSchemaVersion: 'target-v1',
      enrichmentSchemaVersions: [
        { inputId: 'crm', version: 'v2' },
        { inputId: 'tax', version: 'v3' },
      ],
      scopeMode: 'visible',
      targetPaths: ['Order.Id', 'Order.Customer.Id'],
      promptVersion: 'prompt-7',
      model: 'gpt-4.1-mini',
    });

    expect(first).toBe(reordered);
    expect(changed).not.toBe(first);
  });

  it('supports suggestion version increment and optimistic concurrency checks', () => {
    expect(nextSuggestionVersion(0)).toBe(1);
    expect(nextSuggestionVersion(7)).toBe(8);

    expect(() => assertExpectedSuggestionVersion(5, 5)).not.toThrow();
    expect(() => assertExpectedSuggestionVersion(5, 4)).toThrow(/Suggestion version mismatch/);
  });

  it('builds conditional write helper expressions', () => {
    expect(buildInsertIfAbsentConditionExpression()).toEqual({
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    });

    expect(buildSessionNotSupersededCondition()).toEqual({
      ConditionExpression: '#sessionStatus <> :superseded',
      ExpressionAttributeNames: { '#sessionStatus': 'status' },
      ExpressionAttributeValues: { ':superseded': 'superseded' },
    });

    expect(buildRunNotSupersededCondition()).toEqual({
      ConditionExpression: '#runStatus <> :runSuperseded AND #sessionStatus <> :sessionSuperseded',
      ExpressionAttributeNames: {
        '#runStatus': 'status',
        '#sessionStatus': 'sessionStatus',
      },
      ExpressionAttributeValues: {
        ':runSuperseded': 'superseded',
        ':sessionSuperseded': 'superseded',
      },
    });

    expect(buildSuggestionExpectedVersionCondition(12)).toEqual({
      ConditionExpression: '#version = :expectedVersion',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':expectedVersion': 12 },
    });
  });

  it('rejects invalid order/version inputs deterministically', () => {
    expect(() => workUnitSk('run-1', -1, 'wu-1')).toThrow(/non-negative integer/);
    expect(() => suggestionSk(-1, 0, 'sg-1')).toThrow(/non-negative integer/);
    expect(() => suggestionSk(0, -1, 'sg-1')).toThrow(/non-negative integer/);
    expect(() => nextSuggestionVersion(-1)).toThrow(/non-negative integer/);
    expect(() => buildSuggestionExpectedVersionCondition(-1)).toThrow(/non-negative integer/);
  });
});
