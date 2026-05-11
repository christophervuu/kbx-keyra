import type { ExplainRuleInput, ExplainRuleResult } from '@/lib/types';

const NETWORK_ERROR_MESSAGE =
  'Could not reach the Explain service. Check your connection and try again.';
const MALFORMED_RESPONSE_MESSAGE = 'Received an unexpected response from the server.';

function mapHttpStatusToMessage(status: number): string {
  if (status === 400) {
    return 'Invalid request — the rule may be malformed.';
  }

  if (status === 429) {
    return 'The AI service is temporarily busy. Please try again in a moment.';
  }

  if (status === 404) {
    return 'The Explain service is not configured on the server.';
  }

  return 'The Explain service encountered an error. Please try again.';
}

function mapErrorCodeToMessage(code: unknown): string {
  if (code === 'VALIDATION_ERROR') {
    return mapHttpStatusToMessage(400);
  }

  if (code === 'MODEL_RATE_LIMITED') {
    return mapHttpStatusToMessage(429);
  }

  if (code === 'PROMPT_NOT_FOUND') {
    return mapHttpStatusToMessage(404);
  }

  return mapHttpStatusToMessage(500);
}

function isExplainRuleResult(value: unknown): value is ExplainRuleResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'explanation' in value &&
    typeof (value as { explanation?: unknown }).explanation === 'string'
  );
}

type AIErrorEnvelope = {
  success: false;
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

type AISuccessEnvelope = {
  success: true;
  data?: unknown;
};

type AIEnvelope = AISuccessEnvelope | AIErrorEnvelope;

function isAIEnvelope(value: unknown): value is AIEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof (value as { success?: unknown }).success === 'boolean'
  );
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function explainRuleHttp(
  apiUrl: string,
  input: ExplainRuleInput,
): Promise<ExplainRuleResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${trimTrailingSlash(apiUrl)}/ai/explain-rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPath: input.targetPath,
        expression: input.expression,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(mapHttpStatusToMessage(response.status));
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new Error(MALFORMED_RESPONSE_MESSAGE);
    }

    if (!isAIEnvelope(parsed)) {
      throw new Error(MALFORMED_RESPONSE_MESSAGE);
    }

    if (parsed.success === false) {
      throw new Error(mapErrorCodeToMessage(parsed.error?.code));
    }

    if (!isExplainRuleResult(parsed.data)) {
      throw new Error(MALFORMED_RESPONSE_MESSAGE);
    }

    return { explanation: parsed.data.explanation };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError'
    ) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }

    if (error instanceof Error) {
      if (error instanceof TypeError) {
        throw new Error(NETWORK_ERROR_MESSAGE);
      }

      throw error;
    }

    throw new Error(MALFORMED_RESPONSE_MESSAGE);
  } finally {
    clearTimeout(timeoutId);
  }
}
