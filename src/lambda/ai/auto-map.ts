import { parse } from '../../engine/dsl/index.js';
import { registerAllFunctions } from '../../engine/functions/index.js';
import { defaultRegistry } from '../../engine/registry/function-registry.js';
import type { Diagnostic } from '../../engine/types/index.js';
import { invokeAI, normalizeAIError } from '../../lib/ai/index.js';
import {
  ERROR_CODES,
  errorResponse,
  generateRequestId,
  jsonResponse,
  parseBody,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../shared/index.js';

const AUTO_MAP_LOG_PREFIX = '[auto-map lambda]';
const LOG_TEXT_LIMIT = 400;
let functionsInitialized = false;

function ensureEngineFunctionsRegistered(): void {
  if (functionsInitialized) {
    return;
  }

  const registryLike = defaultRegistry as unknown as { registerFunction?: unknown };
  if (typeof registryLike.registerFunction !== 'function') {
    console.info(`${AUTO_MAP_LOG_PREFIX} skipped function registration: registry is not initialized`);
    return;
  }

  registerAllFunctions(defaultRegistry);
  functionsInitialized = true;
}

ensureEngineFunctionsRegistered();

function truncateForLog(value: string): string {
  if (value.length <= LOG_TEXT_LIMIT) {
    return value;
  }

  return `${value.slice(0, LOG_TEXT_LIMIT)}... (truncated ${value.length - LOG_TEXT_LIMIT} chars)`;
}

function summarizeTextField(value: unknown):
  | {
      length: number;
      preview: string;
    }
  | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return {
    length: value.length,
    preview: truncateForLog(value),
  };
}

function autoMapJsonResponse(statusCode: number, payload: unknown, requestId?: string): APIGatewayProxyResult {
  const base = jsonResponse(statusCode, payload, requestId);
  return {
    ...base,
    headers: {
      ...(base.headers ?? {}),
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  };
}

function parseTargetListing(targetSection: string): Set<string> | null {
  const lines = targetSection.split('\n');
  const allowedTargets = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }

    const match = /^-\s+(.+?)\s+\(.+\)$/.exec(trimmed);
    if (match?.[1]) {
      allowedTargets.add(match[1]);
    }
  }

  return allowedTargets.size > 0 ? allowedTargets : null;
}

function validateExpression(expression: string): { valid: boolean; diagnostics: string[] } {
  try {
    const parseResult = parse(expression, {
      registry: defaultRegistry,
    });

    const errorDiagnostics = parseResult.diagnostics.filter(
      (diagnostic: Diagnostic) => diagnostic.severity === 'error',
    );

    return {
      valid: errorDiagnostics.length === 0,
      diagnostics: errorDiagnostics.map((diagnostic) => diagnostic.message),
    };
  } catch {
    return {
      valid: false,
      diagnostics: ['Validation failed'],
    };
  }
}

function normalizeValidationDiagnostics(diagnostics: string[]): Array<{
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}> {
  return diagnostics.map((message) => ({
    code: 'PARSE_ERROR',
    severity: 'error',
    message,
  }));
}

function buildSuggestions(
  enrichedRules: unknown[],
  parsedTargetListing: Set<string> | null,
): Array<{
  target: string;
  expression: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  validation?: {
    valid: boolean;
    diagnostics: Array<{
      code: string;
      severity: 'error' | 'warning' | 'info';
      message: string;
    }>;
  };
}> {
  const normalizeConfidence = (value: unknown): 'high' | 'medium' | 'low' => {
    if (value === 'high' || value === 'medium' || value === 'low') {
      return value;
    }

    return 'low';
  };

  return enrichedRules
    .filter((rule): rule is Record<string, unknown> => typeof rule === 'object' && rule !== null)
    .map((rule) => {
      const validationRecord =
        typeof rule.validation === 'object' && rule.validation !== null
          ? (rule.validation as Record<string, unknown>)
          : null;

      const rawValidationDiagnostics =
        validationRecord && Array.isArray(validationRecord.diagnostics)
          ? validationRecord.diagnostics.filter((item): item is string => typeof item === 'string')
          : [];

      const normalizedValidation =
        validationRecord && typeof validationRecord.valid === 'boolean'
          ? {
              valid: validationRecord.valid,
              diagnostics: normalizeValidationDiagnostics(rawValidationDiagnostics),
            }
          : undefined;

      return {
        target: typeof rule.target === 'string' ? rule.target : '',
        expression: typeof rule.expression === 'string' ? rule.expression : '',
        explanation: typeof rule.explanation === 'string' ? rule.explanation : '',
        confidence: normalizeConfidence(rule.confidence),
        validation: normalizedValidation,
      };
    })
    .filter((suggestion) => suggestion.target !== '' && suggestion.expression !== '')
    .filter((suggestion) => {
      if (parsedTargetListing === null) {
        return true;
      }

      const isAllowed = parsedTargetListing.has(suggestion.target);
      if (!isAllowed) {
        console.warn(
          `[auto-map] Suggestion target not in listing, filtered: ${suggestion.target}`,
        );
      }
      return isAllowed;
    });
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const requestId = generateRequestId();

  console.info(`${AUTO_MAP_LOG_PREFIX} request received`, {
    httpMethod: event.httpMethod ?? 'UNKNOWN',
    hasBody: typeof event.body === 'string',
    bodyLength: typeof event.body === 'string' ? event.body.length : 0,
  });

  if (event.httpMethod === 'OPTIONS') {
    console.info(`${AUTO_MAP_LOG_PREFIX} options preflight`);
    return autoMapJsonResponse(200, {
      ok: true,
    }, requestId);
  }

  const requestBody = parseBody(event);
  if (!requestBody) {
    console.error(`${AUTO_MAP_LOG_PREFIX} invalid request body`, {
      bodyPreview: typeof event.body === 'string' ? truncateForLog(event.body) : null,
    });
    return autoMapJsonResponse(400, {
      error: 'Invalid request body',
    }, requestId);
  }

  const targetSectionRaw = requestBody.targetSection;
  const sectionPathRaw = requestBody.sectionPath;

  const targetSection =
    typeof targetSectionRaw === 'string' && targetSectionRaw !== ''
      ? targetSectionRaw
      : typeof sectionPathRaw === 'string' && sectionPathRaw !== ''
        ? sectionPathRaw
        : null;
  const parsedTargetListing =
    typeof targetSectionRaw === 'string' && targetSectionRaw !== ''
      ? parseTargetListing(targetSectionRaw)
      : null;

  if (targetSection === null) {
    console.error(`${AUTO_MAP_LOG_PREFIX} missing target section`, {
      hasTargetSection: typeof targetSectionRaw === 'string' && targetSectionRaw !== '',
      hasSectionPath: typeof sectionPathRaw === 'string' && sectionPathRaw !== '',
    });
    return autoMapJsonResponse(400, {
      error: 'Missing required field: targetSection or sectionPath',
    }, requestId);
  }

  const sourceContext = requestBody.sourceContext;
  if (typeof sourceContext !== 'string' || sourceContext === '') {
    console.error(`${AUTO_MAP_LOG_PREFIX} missing sourceContext`, {
      sourceContextType: typeof sourceContext,
      sourceContextLength: typeof sourceContext === 'string' ? sourceContext.length : 0,
    });
    return autoMapJsonResponse(400, {
      error: 'Missing required field: sourceContext',
    }, requestId);
  }

  const businessContext = typeof requestBody.businessContext === 'string' ? requestBody.businessContext : '';
  const isSectionRequest = typeof sectionPathRaw === 'string' && sectionPathRaw !== '';

  console.info(`${AUTO_MAP_LOG_PREFIX} validated request`, {
    isSectionRequest,
    sectionPath: typeof sectionPathRaw === 'string' ? sectionPathRaw : null,
    targetSection: summarizeTextField(targetSection),
    sourceContext: summarizeTextField(sourceContext),
    businessContext: summarizeTextField(businessContext),
    parsedTargetListingCount: parsedTargetListing ? parsedTargetListing.size : null,
  });

  try {
    console.info(`${AUTO_MAP_LOG_PREFIX} invoking ai runtime`, {
      promptId: 'auto-map',
    });

    const result = await invokeAI('auto-map', {
      targetSection,
      sourceContext,
      businessContext,
    });

    console.info(`${AUTO_MAP_LOG_PREFIX} ai runtime result`, {
      success: result.success,
      promptId: result.promptId,
      model: result.success ? result.model : undefined,
      errorCode: result.success ? undefined : result.error.code,
      hasData: result.success ? typeof result.data === 'object' && result.data !== null : false,
    });

    if (result.success) {
      const rulesValue = (result.data as Record<string, unknown>)?.rules;
      if (!Array.isArray(rulesValue)) {
        console.error(`${AUTO_MAP_LOG_PREFIX} ai success payload missing rules array`, {
          rulesType: typeof rulesValue,
        });
        return autoMapJsonResponse(200, result, requestId);
      }

      console.info(`${AUTO_MAP_LOG_PREFIX} ai rules received`, {
        ruleCount: rulesValue.length,
      });

      const enrichedRules = rulesValue.map((rule) => {
        if (typeof rule !== 'object' || rule === null) {
          return rule;
        }

        const ruleRecord = rule as Record<string, unknown>;
        const expression = ruleRecord.expression;

        const validation =
          typeof expression === 'string'
            ? validateExpression(expression)
            : { valid: false, diagnostics: ['No expression to validate'] };

        return {
          ...ruleRecord,
          validation,
        };
      });

      const suggestions = buildSuggestions(enrichedRules, parsedTargetListing);

      console.info(`${AUTO_MAP_LOG_PREFIX} suggestions prepared`, {
        enrichedRuleCount: enrichedRules.length,
        suggestionCount: suggestions.length,
        isSectionRequest,
      });

      if (isSectionRequest) {
        return autoMapJsonResponse(200, {
          ...result,
          data: {
            ...(result.data as Record<string, unknown>),
            rules: enrichedRules,
            suggestions,
          },
        }, requestId);
      }

      console.info(`${AUTO_MAP_LOG_PREFIX} returning enriched rules response`, {
        enrichedRuleCount: enrichedRules.length,
      });

      return autoMapJsonResponse(200, {
        ...result,
        data: {
          ...(result.data as Record<string, unknown>),
          rules: enrichedRules,
          suggestions,
        },
      }, requestId);
    }

    const normalized = normalizeAIError(result.error);
    console.error(`${AUTO_MAP_LOG_PREFIX} ai error response`, {
      errorCode: result.error.code,
      message: result.error.message,
      mappedStatus: normalized.statusCode,
    });

    return errorResponse(
      normalized.code,
      normalized.message,
      normalized.statusCode,
      normalized.retryable,
      requestId,
    );
  } catch {
    console.error(`${AUTO_MAP_LOG_PREFIX} unexpected handler error`);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Unexpected error while handling request',
      500,
      true,
      requestId,
    );
  }
}
