export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    statusCode: number;
    retryable: boolean;
    requestId: string;
  };
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface SeedPayload {
  projects?: unknown[];
  mappings?: unknown[];
  schemas?: unknown[];
}
