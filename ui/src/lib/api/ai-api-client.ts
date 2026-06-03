import type {
  AutoMapSectionInput,
  AutoMapSectionResult,
  ExplainRuleInput,
  ExplainRuleResult,
  SuggestExpressionInput,
  SuggestExpressionResult,
} from '@/lib/types';

const EXPLAIN_NETWORK_ERROR_MESSAGE =
  'Could not reach the Explain service. Check your connection and try again.';
const SUGGEST_NETWORK_ERROR_MESSAGE =
  'Could not reach the Suggest service. Check your connection and try again.';
const AUTO_MAP_SECTION_NETWORK_ERROR_MESSAGE =
  'Could not reach the Auto-Map service. Check your connection and try again.';
const MALFORMED_RESPONSE_MESSAGE = 'Received an unexpected response from the server.';
const AUTO_MAP_LOG_PREFIX = '[auto-map client]';
const LOG_TEXT_LIMIT = 400;

function truncateForLog(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  if (value.length <= LOG_TEXT_LIMIT) {
    return value;
  }

  return `${value.slice(0, LOG_TEXT_LIMIT)}... (truncated ${value.length - LOG_TEXT_LIMIT} chars)`;
}

function summarizeBodyForLog(body: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(body)) {
    if (typeof rawValue === 'string') {
      summary[key] = {
        length: rawValue.length,
        preview: truncateForLog(rawValue),
      };
      continue;
    }

    summary[key] = rawValue;
  }

  return summary;
}

function summarizeEnvelopeForLog(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return {
      kind: typeof value,
      value,
    };
  }

  const record = value as Record<string, unknown>;
  const data = typeof record.data === 'object' && record.data !== null
    ? (record.data as Record<string, unknown>)
    : null;

  const suggestions = Array.isArray(data?.suggestions) ? data?.suggestions : undefined;

  return {
    success: record.success,
    hasData: data !== null,
    dataKeys: data ? Object.keys(data) : [],
    suggestionCount: Array.isArray(suggestions) ? suggestions.length : undefined,
    hasError: typeof record.error === 'object' && record.error !== null,
    errorCode:
      typeof record.error === 'object' && record.error !== null
        ? (record.error as { code?: unknown }).code
        : undefined,
  };
}

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
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const typed = value as {
    explanation?: unknown;
    confidence?: unknown;
    limitations?: unknown;
  };

  if (typeof typed.explanation !== 'string') {
    return false;
  }

  if (
    typed.confidence !== undefined &&
    typed.confidence !== 'high' &&
    typed.confidence !== 'medium' &&
    typed.confidence !== 'low'
  ) {
    return false;
  }

  if (
    typed.limitations !== undefined &&
    (!Array.isArray(typed.limitations) || typed.limitations.some((item) => typeof item !== 'string'))
  ) {
    return false;
  }

  return true;
}

function mapSuggestHttpStatusToMessage(status: number): string {
  if (status === 400) {
    return 'Invalid request — check the instruction and try again.';
  }

  if (status === 429) {
    return 'The AI service is temporarily busy. Please try again in a moment.';
  }

  return 'The Suggest service encountered an error. Please try again.';
}

function mapSuggestErrorCodeToMessage(code: unknown): string {
  if (code === 'VALIDATION_ERROR') {
    return mapSuggestHttpStatusToMessage(400);
  }

  if (code === 'MODEL_RATE_LIMITED') {
    return mapSuggestHttpStatusToMessage(429);
  }

  return mapSuggestHttpStatusToMessage(500);
}

function isSuggestExpressionResult(value: unknown): value is SuggestExpressionResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const typed = value as {
    expression?: unknown;
    explanation?: unknown;
    validation?: unknown;
    readyToApply?: unknown;
    context?: unknown;
  };

  if (typeof typed.expression !== 'string') {
    return false;
  }

  if (typed.explanation !== undefined && typeof typed.explanation !== 'string') {
    return false;
  }

  if (typeof typed.readyToApply !== 'boolean') {
    return false;
  }

  if (typeof typed.validation !== 'object' || typed.validation === null) {
    return false;
  }

  const validation = typed.validation as { valid?: unknown; diagnostics?: unknown };
  if (typeof validation.valid !== 'boolean' || !Array.isArray(validation.diagnostics)) {
    return false;
  }

  const diagnosticsAreValid = validation.diagnostics.every((diagnostic) => {
    if (typeof diagnostic !== 'object' || diagnostic === null) {
      return false;
    }

    const typedDiagnostic = diagnostic as {
      code?: unknown;
      severity?: unknown;
      message?: unknown;
      path?: unknown;
    };

    return (
      typeof typedDiagnostic.code === 'string' &&
      (typedDiagnostic.severity === 'error' ||
        typedDiagnostic.severity === 'warning' ||
        typedDiagnostic.severity === 'info') &&
      typeof typedDiagnostic.message === 'string' &&
      (typedDiagnostic.path === undefined || typeof typedDiagnostic.path === 'string')
    );
  });

  if (!diagnosticsAreValid) {
    return false;
  }

  if (typeof typed.context !== 'object' || typed.context === null) {
    return false;
  }

  const context = typed.context as {
    sourceNodeCount?: unknown;
    includedNodeCount?: unknown;
    truncated?: unknown;
    approxTokenCount?: unknown;
    byteLength?: unknown;
  };

  return (
    typeof context.sourceNodeCount === 'number' &&
    typeof context.includedNodeCount === 'number' &&
    typeof context.truncated === 'boolean' &&
    typeof context.approxTokenCount === 'number' &&
    typeof context.byteLength === 'number'
  );
}

function mapAutoMapSectionHttpStatusToMessage(status: number): string {
  if (status === 400) {
    return 'Invalid request — check the selected section and try again.';
  }

  if (status === 429) {
    return 'The AI service is temporarily busy. Please try again in a moment.';
  }

  return 'The Auto-Map service encountered an error. Please try again.';
}

function mapAutoMapSectionErrorCodeToMessage(code: unknown): string {
  if (code === 'VALIDATION_ERROR') {
    return mapAutoMapSectionHttpStatusToMessage(400);
  }

  if (code === 'MODEL_RATE_LIMITED') {
    return mapAutoMapSectionHttpStatusToMessage(429);
  }

  return mapAutoMapSectionHttpStatusToMessage(500);
}

function isAutoMapSectionResult(value: unknown): value is AutoMapSectionResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (!('suggestions' in value) || !Array.isArray((value as { suggestions?: unknown }).suggestions)) {
    return false;
  }

  const typedValue = value as {
    suggestions: unknown[];
    retrievalMeta?: unknown;
    validationMeta?: unknown;
    dedupMeta?: unknown;
  };

  const suggestionsValid = typedValue.suggestions.every((suggestion) => {
    if (typeof suggestion !== 'object' || suggestion === null) {
      return false;
    }

    const typed = suggestion as {
      target?: unknown;
      expression?: unknown;
      explanation?: unknown;
      confidence?: unknown;
      validation?: unknown;
    };

    if (
      typeof typed.target !== 'string' ||
      typeof typed.expression !== 'string' ||
      typeof typed.explanation !== 'string' ||
      (typed.confidence !== 'high' && typed.confidence !== 'medium' && typed.confidence !== 'low')
    ) {
      return false;
    }

    if (typed.validation === undefined) {
      return true;
    }

    if (typeof typed.validation !== 'object' || typed.validation === null) {
      return false;
    }

    const validation = typed.validation as { valid?: unknown; diagnostics?: unknown };
    if (typeof validation.valid !== 'boolean' || !Array.isArray(validation.diagnostics)) {
      return false;
    }

    return validation.diagnostics.every((diagnostic) => {
      if (typeof diagnostic !== 'object' || diagnostic === null) {
        return false;
      }

      const typedDiagnostic = diagnostic as {
        code?: unknown;
        severity?: unknown;
        message?: unknown;
        path?: unknown;
      };

      return (
        typeof typedDiagnostic.code === 'string' &&
        (typedDiagnostic.severity === 'error' ||
          typedDiagnostic.severity === 'warning' ||
          typedDiagnostic.severity === 'info') &&
        typeof typedDiagnostic.message === 'string' &&
        (typedDiagnostic.path === undefined || typeof typedDiagnostic.path === 'string')
      );
    });
  });

  if (!suggestionsValid) {
    return false;
  }

  if (typedValue.retrievalMeta !== undefined) {
    const retrievalMeta = typedValue.retrievalMeta as {
      mode?: unknown;
      retrievalCandidatesCount?: unknown;
      retrievalSelectedCount?: unknown;
      chunkCount?: unknown;
      noContext?: unknown;
      noContextReason?: unknown;
    };

    if (typeof retrievalMeta !== 'object' || retrievalMeta === null) {
      return false;
    }

    if (
      retrievalMeta.mode !== undefined &&
      retrievalMeta.mode !== 'section' &&
      retrievalMeta.mode !== 'whole'
    ) {
      return false;
    }

    if (
      (retrievalMeta.retrievalCandidatesCount !== undefined && typeof retrievalMeta.retrievalCandidatesCount !== 'number') ||
      (retrievalMeta.retrievalSelectedCount !== undefined && typeof retrievalMeta.retrievalSelectedCount !== 'number') ||
      (retrievalMeta.chunkCount !== undefined && typeof retrievalMeta.chunkCount !== 'number') ||
      (retrievalMeta.noContext !== undefined && typeof retrievalMeta.noContext !== 'boolean') ||
      (retrievalMeta.noContextReason !== undefined && typeof retrievalMeta.noContextReason !== 'string')
    ) {
      return false;
    }
  }

  if (typedValue.validationMeta !== undefined) {
    const validationMeta = typedValue.validationMeta as {
      validationPassCount?: unknown;
      validationFailCount?: unknown;
    };

    if (typeof validationMeta !== 'object' || validationMeta === null) {
      return false;
    }

    if (
      (validationMeta.validationPassCount !== undefined && typeof validationMeta.validationPassCount !== 'number') ||
      (validationMeta.validationFailCount !== undefined && typeof validationMeta.validationFailCount !== 'number')
    ) {
      return false;
    }
  }

  if (typedValue.dedupMeta !== undefined) {
    const dedupMeta = typedValue.dedupMeta as { duplicatesCollapsed?: unknown };

    if (typeof dedupMeta !== 'object' || dedupMeta === null) {
      return false;
    }

    if (
      dedupMeta.duplicatesCollapsed !== undefined &&
      typeof dedupMeta.duplicatesCollapsed !== 'number'
    ) {
      return false;
    }
  }

  return true;
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

    return {
      explanation: parsed.data.explanation,
      confidence: parsed.data.confidence,
      limitations: parsed.data.limitations,
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError'
    ) {
      throw new Error(EXPLAIN_NETWORK_ERROR_MESSAGE);
    }

    if (error instanceof Error) {
      if (error instanceof TypeError) {
        throw new Error(EXPLAIN_NETWORK_ERROR_MESSAGE);
      }

      throw error;
    }

    throw new Error(MALFORMED_RESPONSE_MESSAGE);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function suggestExpressionHttp(
  apiUrl: string,
  input: SuggestExpressionInput,
): Promise<SuggestExpressionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  const body: Record<string, unknown> = {
    mappingId: input.mappingId,
    instruction: input.instruction,
    targetPath: input.targetPath,
    targetType: input.targetType,
  };

  if (input.targetDescription !== undefined && input.targetDescription !== null) {
    body.targetDescription = input.targetDescription;
  }


  try {
    const response = await fetch(`${trimTrailingSlash(apiUrl)}/ai/suggest-expression`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(mapSuggestHttpStatusToMessage(response.status));
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
      throw new Error(mapSuggestErrorCodeToMessage(parsed.error?.code));
    }

    if (!isSuggestExpressionResult(parsed.data)) {
      throw new Error(MALFORMED_RESPONSE_MESSAGE);
    }

    return {
      expression: parsed.data.expression,
      explanation: parsed.data.explanation,
      validation: parsed.data.validation,
      readyToApply: parsed.data.readyToApply,
      context: parsed.data.context,
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError'
    ) {
      throw new Error(SUGGEST_NETWORK_ERROR_MESSAGE);
    }

    if (error instanceof Error) {
      if (error instanceof TypeError) {
        throw new Error(SUGGEST_NETWORK_ERROR_MESSAGE);
      }

      throw error;
    }

    throw new Error(MALFORMED_RESPONSE_MESSAGE);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function autoMapSectionHttp(
  apiUrl: string,
  input: AutoMapSectionInput,
): Promise<AutoMapSectionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  const body: Record<string, unknown> = {
    projectId: input.projectId,
    mappingId: input.mappingId,
  };

  if (input.sectionPath !== undefined && input.sectionPath !== null) {
    body.sectionPath = input.sectionPath;
  }

  if (input.mode !== undefined) {
    body.mode = input.mode;
  }

  if (input.targetSection !== undefined && input.targetSection !== null) {
    body.targetSection = input.targetSection;
  }

  if (input.sourceContext !== undefined && input.sourceContext !== null) {
    body.sourceContext = input.sourceContext;
  }

  const endpoint = `${trimTrailingSlash(apiUrl)}/ai/auto-map`;

  console.info(`${AUTO_MAP_LOG_PREFIX} request`, {
    endpoint,
    method: 'POST',
    body: summarizeBodyForLog(body),
  });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    console.info(`${AUTO_MAP_LOG_PREFIX} response metadata`, {
      status: response.status,
      ok: response.ok,
      contentType:
        response.headers && typeof response.headers.get === 'function'
          ? response.headers.get('Content-Type')
          : undefined,
    });

    if (!response.ok) {
      throw new Error(mapAutoMapSectionHttpStatusToMessage(response.status));
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      console.error(`${AUTO_MAP_LOG_PREFIX} failed to parse json response`);
      throw new Error(MALFORMED_RESPONSE_MESSAGE);
    }

    console.info(`${AUTO_MAP_LOG_PREFIX} response envelope`, summarizeEnvelopeForLog(parsed));

    if (!isAIEnvelope(parsed)) {
      console.error(`${AUTO_MAP_LOG_PREFIX} invalid envelope shape`, summarizeEnvelopeForLog(parsed));
      throw new Error(MALFORMED_RESPONSE_MESSAGE);
    }

    if (parsed.success === false) {
      console.error(`${AUTO_MAP_LOG_PREFIX} server returned error envelope`, summarizeEnvelopeForLog(parsed));
      throw new Error(mapAutoMapSectionErrorCodeToMessage(parsed.error?.code));
    }

    if (!isAutoMapSectionResult(parsed.data)) {
      console.error(`${AUTO_MAP_LOG_PREFIX} invalid auto-map data shape`, summarizeEnvelopeForLog(parsed));
      throw new Error(MALFORMED_RESPONSE_MESSAGE);
    }

    console.info(`${AUTO_MAP_LOG_PREFIX} parsed suggestions`, {
      suggestionCount: parsed.data.suggestions.length,
    });

    return {
      suggestions: parsed.data.suggestions,
      diagnostics: parsed.data.diagnostics,
      retrievalMeta: parsed.data.retrievalMeta,
      validationMeta: parsed.data.validationMeta,
      dedupMeta: parsed.data.dedupMeta,
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: unknown }).name === 'AbortError'
    ) {
      console.error(`${AUTO_MAP_LOG_PREFIX} request aborted`, {
        reason: 'timeout or abort',
      });
      throw new Error(AUTO_MAP_SECTION_NETWORK_ERROR_MESSAGE);
    }

    if (error instanceof Error) {
      if (error instanceof TypeError) {
        console.error(`${AUTO_MAP_LOG_PREFIX} network/type error`, {
          message: error.message,
        });
        throw new Error(AUTO_MAP_SECTION_NETWORK_ERROR_MESSAGE);
      }

      console.error(`${AUTO_MAP_LOG_PREFIX} request failed`, {
        message: error.message,
      });

      throw error;
    }

    console.error(`${AUTO_MAP_LOG_PREFIX} request failed with unknown error`, {
      error,
    });

    throw new Error(MALFORMED_RESPONSE_MESSAGE);
  } finally {
    clearTimeout(timeoutId);
  }
}
