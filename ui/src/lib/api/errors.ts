export class AdapterMethodNotImplementedError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(methodName: string) {
    super(`"${methodName}" is not yet available in HTTP mode.`);
    this.name = 'AdapterMethodNotImplementedError';
    this.code = 'NOT_IMPLEMENTED';
    this.retryable = false;
  }
}
