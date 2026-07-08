import type { APIGatewayProxyEvent } from '../shared/types.js';

export interface DeploymentActor {
  readonly actorType: 'USER' | 'SERVICE' | 'DEVELOPMENT';
  readonly actorId: string;
  readonly actorDisplayName?: string;
  readonly actorEmail?: string;
}

const DEVELOPMENT_ACTOR: DeploymentActor = {
  actorType: 'DEVELOPMENT',
  actorId: 'development:system',
  actorDisplayName: 'Development',
};

function getHeader(event: APIGatewayProxyEvent, ...names: string[]): string | null {
  const headers = event.headers ?? {};
  for (const name of names) {
    const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

export function resolveActorFromEvent(event: APIGatewayProxyEvent): DeploymentActor {
  const actorTypeHeader = getHeader(event, 'x-actor-type');
  const userId = getHeader(event, 'x-user-id', 'x-actor-id');
  const userEmail = getHeader(event, 'x-user-email');
  const userDisplayName = getHeader(event, 'x-user-display-name', 'x-user-name');

  if (actorTypeHeader !== 'SERVICE' && actorTypeHeader !== 'DEVELOPMENT' && (userId || userEmail || userDisplayName)) {
    const actorId = userId ?? (userEmail ? `user:${userEmail.toLowerCase()}` : 'user:unknown');
    return {
      actorType: 'USER',
      actorId: actorId === 'system' ? 'user:unknown' : actorId,
      ...(userDisplayName ? { actorDisplayName: userDisplayName } : {}),
      ...(userEmail ? { actorEmail: userEmail } : {}),
    };
  }

  const serviceId = getHeader(event, 'x-service-id', 'x-service-name');
  if (actorTypeHeader === 'SERVICE' || serviceId) {
    return {
      actorType: 'SERVICE',
      actorId: serviceId ?? 'service:unknown',
      ...(serviceId ? { actorDisplayName: serviceId } : {}),
    };
  }

  return DEVELOPMENT_ACTOR;
}

export function serviceActor(actorId: string, actorDisplayName?: string): DeploymentActor {
  return {
    actorType: 'SERVICE',
    actorId,
    ...(actorDisplayName ? { actorDisplayName } : {}),
  };
}
