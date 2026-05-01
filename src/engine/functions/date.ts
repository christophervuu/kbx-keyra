import { DIAGNOSTIC_CODES } from '../diagnostics/codes.js';
import { formatDiagnosticMessage } from '../diagnostics/format.js';
import type { EvaluationContext } from '../dsl/types.js';
import type { FunctionRegistry } from '../registry/function-registry.js';
import type { FunctionImplementation, FunctionSignature } from '../types/index.js';

type DateToken = 'YYYY' | 'MM' | 'DD' | 'HH' | 'mm' | 'ss';

interface DateParts {
  readonly year?: number;
  readonly month?: number;
  readonly day?: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly second?: number;
}

const TOKENS: readonly DateToken[] = ['YYYY', 'MM', 'DD', 'HH', 'mm', 'ss'];

const TOKEN_WIDTHS: Readonly<Record<DateToken, number>> = {
  YYYY: 4,
  MM: 2,
  DD: 2,
  HH: 2,
  mm: 2,
  ss: 2,
};

const formatDateSignature: FunctionSignature = {
  parameters: [
    { name: 'value', type: 'string', required: true },
    { name: 'inputFormat', type: 'string', required: true },
    { name: 'outputFormat', type: 'string', required: true },
  ],
  returnType: 'string',
};

function tokenAt(format: string, index: number): DateToken | null {
  for (const token of TOKENS) {
    if (format.startsWith(token, index)) {
      return token;
    }
  }

  return null;
}

function parseByFormat(value: string, format: string): DateParts | null {
  const parsed: Partial<Record<DateToken, number>> = {};

  let formatIndex = 0;
  let valueIndex = 0;

  while (formatIndex < format.length) {
    const token = tokenAt(format, formatIndex);

    if (token !== null) {
      const width = TOKEN_WIDTHS[token];
      const part = value.slice(valueIndex, valueIndex + width);

      if (part.length !== width || /^\d+$/.test(part) === false) {
        return null;
      }

      parsed[token] = Number(part);
      formatIndex += token.length;
      valueIndex += width;
      continue;
    }

    const expectedLiteral = format[formatIndex];
    const actual = value[valueIndex];

    if (expectedLiteral !== actual) {
      return null;
    }

    formatIndex += 1;
    valueIndex += 1;
  }

  if (valueIndex !== value.length) {
    return null;
  }

  return {
    year: parsed.YYYY,
    month: parsed.MM,
    day: parsed.DD,
    hour: parsed.HH,
    minute: parsed.mm,
    second: parsed.ss,
  };
}

function parseIso8601(value: string): DateParts | null {
  const isoPattern =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

  const match = value.match(isoPattern);
  if (match === null) {
    return null;
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] === undefined ? 0 : Number(match[4]),
    minute: match[5] === undefined ? 0 : Number(match[5]),
    second: match[6] === undefined ? 0 : Number(match[6]),
  };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function withDefaults(parts: DateParts): Required<DateParts> {
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function formatByTokens(parts: DateParts, outputFormat: string): string {
  const resolved = withDefaults(parts);

  let result = '';
  let index = 0;

  while (index < outputFormat.length) {
    const token = tokenAt(outputFormat, index);

    if (token === null) {
      result += outputFormat[index];
      index += 1;
      continue;
    }

    if (token === 'YYYY') {
      result += pad(resolved.year, 4);
    } else if (token === 'MM') {
      result += pad(resolved.month, 2);
    } else if (token === 'DD') {
      result += pad(resolved.day, 2);
    } else if (token === 'HH') {
      result += pad(resolved.hour, 2);
    } else if (token === 'mm') {
      result += pad(resolved.minute, 2);
    } else if (token === 'ss') {
      result += pad(resolved.second, 2);
    }

    index += token.length;
  }

  return result;
}

function emitE040(context: EvaluationContext, value: string, inputFormat: string): null {
  context.addDiagnostic({
    code: DIAGNOSTIC_CODES['KEYRA-E040'].code,
    severity: DIAGNOSTIC_CODES['KEYRA-E040'].severity,
    message: formatDiagnosticMessage('KEYRA-E040', {
      value,
      format: inputFormat,
    }),
    location: { function: 'formatDate', argumentIndex: 0 },
  });

  return null;
}

const formatDateImplementation: FunctionImplementation = (
  args: readonly unknown[],
  context: EvaluationContext,
): unknown => {
  const value = args[0] as string;
  const inputFormat = args[1] as string;
  const outputFormat = args[2] as string;

  if (value.length === 0) {
    return emitE040(context, value, inputFormat);
  }

  const inputHasIsoToken = inputFormat.includes('ISO8601');
  const outputHasIsoToken = outputFormat.includes('ISO8601');

  if ((inputHasIsoToken && inputFormat !== 'ISO8601') || (outputHasIsoToken && outputFormat !== 'ISO8601')) {
    return emitE040(context, value, inputFormat);
  }

  const parsed = inputFormat === 'ISO8601' ? parseIso8601(value) : parseByFormat(value, inputFormat);

  if (parsed === null) {
    return emitE040(context, value, inputFormat);
  }

  if (outputFormat === 'ISO8601') {
    const resolved = withDefaults(parsed);
    return `${pad(resolved.year, 4)}-${pad(resolved.month, 2)}-${pad(resolved.day, 2)}T${pad(resolved.hour, 2)}:${pad(resolved.minute, 2)}:${pad(resolved.second, 2)}Z`;
  }

  return formatByTokens(parsed, outputFormat);
};

export function registerDateFunctions(registry: FunctionRegistry): void {
  registry.registerFunction('formatDate', formatDateSignature, formatDateImplementation);
}
