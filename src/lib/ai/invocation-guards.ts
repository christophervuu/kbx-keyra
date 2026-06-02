import type { AIError, PromptRecord } from './types.js';
import type { AIInvocationProfile } from './routing.js';

export interface InvokePayloadValidationInput {
  readonly promptId: string;
  readonly variables: Record<string, string>;
  readonly profile: AIInvocationProfile;
}

export interface PromptContractValidationInput {
  readonly promptId: string;
  readonly promptRecord: PromptRecord;
}

function createValidationError(promptId: string, message: string): AIError {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message,
    },
    promptId,
  };
}

export function validateInvokePayload(input: InvokePayloadValidationInput): AIError | null {
  const { promptId, variables, profile } = input;

  if (promptId.trim().length === 0) {
    return createValidationError(promptId, 'promptId must be a non-empty string');
  }

  if (typeof variables !== 'object' || variables === null || Array.isArray(variables)) {
    return createValidationError(promptId, 'variables must be an object map of string values');
  }

  for (const [key, value] of Object.entries(variables)) {
    if (key.trim().length === 0) {
      return createValidationError(promptId, 'variables cannot contain empty keys');
    }

    if (typeof value !== 'string') {
      return createValidationError(promptId, `variables['${key}'] must be a string`);
    }
  }

  if (!Number.isFinite(profile.timeoutMs) || profile.timeoutMs <= 0) {
    return createValidationError(promptId, 'resolved timeoutMs must be a positive finite number');
  }

  if (!Number.isFinite(profile.maxOutputTokens) || profile.maxOutputTokens <= 0) {
    return createValidationError(promptId, 'resolved maxOutputTokens must be a positive finite number');
  }

  if (profile.model.trim().length === 0) {
    return createValidationError(promptId, 'resolved model must be a non-empty string');
  }

  return null;
}

export function validatePromptContract(input: PromptContractValidationInput): AIError | null {
  const { promptId, promptRecord } = input;

  if (!Number.isFinite(promptRecord.temperature) || promptRecord.temperature < 0 || promptRecord.temperature > 2) {
    return createValidationError(promptId, 'prompt temperature must be a finite number in range [0, 2]');
  }

  if (promptRecord.systemMessage.trim().length === 0) {
    return createValidationError(promptId, 'prompt systemMessage must be a non-empty string');
  }

  if (promptRecord.userMessageTemplate.trim().length === 0) {
    return createValidationError(promptId, 'prompt userMessageTemplate must be a non-empty string');
  }

  return null;
}
