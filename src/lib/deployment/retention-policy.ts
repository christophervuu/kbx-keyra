import type { DeploymentEnvironment } from '../persistence/types.js';

const RETENTION_COUNTS: Record<DeploymentEnvironment, number> = {
  DEV: 20,
  PREPROD: 20,
  PROD: 50,
};

export interface RetentionPolicy {
  readonly retainSuccessfulActivations: number;
}

export function getRetentionPolicy(environment: DeploymentEnvironment): RetentionPolicy {
  return {
    retainSuccessfulActivations: RETENTION_COUNTS[environment],
  };
}
