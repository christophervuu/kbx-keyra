import { describe, expect, it } from 'vitest';

import { resolveActorFromEvent } from '../../../src/lambda/deployment/actor-context.js';

describe('deployment actor context', () => {
  it('resolves USER actor from user headers', () => {
    const actor = resolveActorFromEvent({
      body: null,
      headers: {
        'x-user-id': 'user-1',
        'x-user-display-name': 'User One',
        'x-user-email': 'user1@example.com',
      },
    });

    expect(actor).toEqual({
      actorType: 'USER',
      actorId: 'user-1',
      actorDisplayName: 'User One',
      actorEmail: 'user1@example.com',
    });
  });

  it('resolves SERVICE actor when service id header is present', () => {
    const actor = resolveActorFromEvent({
      body: null,
      headers: {
        'x-service-id': 'service:reconcile',
      },
    });

    expect(actor).toEqual({
      actorType: 'SERVICE',
      actorId: 'service:reconcile',
      actorDisplayName: 'service:reconcile',
    });
  });

  it('falls back to DEVELOPMENT actor when no actor headers exist', () => {
    const actor = resolveActorFromEvent({ body: null, headers: {} });
    expect(actor).toEqual({
      actorType: 'DEVELOPMENT',
      actorId: 'development:system',
      actorDisplayName: 'Development',
    });
  });
});
