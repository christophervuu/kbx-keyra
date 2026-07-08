import type { DeploymentActor } from './actor-context.js';

export type DeploymentMetricEvent =
  | 'deployment.operation.queued'
  | 'deployment.operation.finalized'
  | 'deployment.reconciliation'
  | 'deployment.cleanup';

interface MetricFields {
  readonly metricName: DeploymentMetricEvent;
  readonly mappingId?: string;
  readonly projectId?: string;
  readonly artifactId?: string;
  readonly operationId?: string;
  readonly operationType?: string;
  readonly operationStatus?: string;
  readonly environment?: string;
  readonly durationMs?: number;
  readonly value?: number;
  readonly actor?: DeploymentActor;
  readonly details?: Record<string, unknown>;
}

export function emitDeploymentMetric(fields: MetricFields): void {
  console.info(JSON.stringify({
    eventType: 'deployment-metric',
    metricName: fields.metricName,
    ...(fields.mappingId ? { mappingId: fields.mappingId } : {}),
    ...(fields.projectId ? { projectId: fields.projectId } : {}),
    ...(fields.artifactId ? { artifactId: fields.artifactId } : {}),
    ...(fields.operationId ? { operationId: fields.operationId } : {}),
    ...(fields.operationType ? { operationType: fields.operationType } : {}),
    ...(fields.operationStatus ? { operationStatus: fields.operationStatus } : {}),
    ...(fields.environment ? { environment: fields.environment } : {}),
    ...(typeof fields.durationMs === 'number' ? { durationMs: fields.durationMs } : {}),
    ...(typeof fields.value === 'number' ? { value: fields.value } : {}),
    ...(fields.actor
      ? {
          actorType: fields.actor.actorType,
          actorId: fields.actor.actorId,
          ...(fields.actor.actorDisplayName ? { actorDisplayName: fields.actor.actorDisplayName } : {}),
          ...(fields.actor.actorEmail ? { actorEmail: fields.actor.actorEmail } : {}),
        }
      : {}),
    ...(fields.details ? { details: fields.details } : {}),
  }));
}
