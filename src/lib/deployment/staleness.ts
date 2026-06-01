export type DeploymentSourceType = 'revision' | 'version';

export type DeploymentStatus = 'current' | 'stale' | 'not-deployed';

export interface DeploymentStalenessInput {
  readonly sourceType: DeploymentSourceType;
  readonly sourceNumber: number;
}

export interface MappingStalenessInput {
  readonly revision: number;
  readonly latestVersion: number | null;
}

export interface CurrentDeploymentsInput {
  readonly DEV?: DeploymentStalenessInput | null;
  readonly QA?: DeploymentStalenessInput | null;
  readonly PROD?: DeploymentStalenessInput | null;
}

export interface EnvironmentDeploymentStatus {
  readonly DEV: DeploymentStatus;
  readonly QA: DeploymentStatus;
  readonly PROD: DeploymentStatus;
}

export function computeStaleness(
  deployment: DeploymentStalenessInput | null,
  mapping: MappingStalenessInput,
): DeploymentStatus {
  if (!deployment) {
    return 'not-deployed';
  }

  if (deployment.sourceType === 'revision') {
    return mapping.revision > deployment.sourceNumber ? 'stale' : 'current';
  }

  const latestVersion = mapping.latestVersion ?? deployment.sourceNumber;
  return latestVersion > deployment.sourceNumber ? 'stale' : 'current';
}

export function computeAllEnvironments(
  currentDeployments: CurrentDeploymentsInput,
  mapping: MappingStalenessInput,
): EnvironmentDeploymentStatus {
  return {
    DEV: computeStaleness(currentDeployments.DEV ?? null, mapping),
    QA: computeStaleness(currentDeployments.QA ?? null, mapping),
    PROD: computeStaleness(currentDeployments.PROD ?? null, mapping),
  };
}
