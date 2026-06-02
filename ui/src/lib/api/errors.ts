export class FeatureNotEnabledError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(featureName: string) {
    super(`"${featureName}" is not enabled in this mode.`);
    this.name = 'FeatureNotEnabledError';
    this.code = 'FEATURE_NOT_ENABLED';
    this.retryable = false;
  }
}

/**
 * @deprecated Use FeatureNotEnabledError.
 */
export class AdapterMethodNotImplementedError extends FeatureNotEnabledError {
  constructor(methodName: string) {
    super(methodName);
    this.name = 'AdapterMethodNotImplementedError';
  }
}
