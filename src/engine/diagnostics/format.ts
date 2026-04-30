import { DIAGNOSTIC_CODES, type DiagnosticCode } from './codes.js';

export function formatDiagnosticMessage(
  code: DiagnosticCode,
  params: Readonly<Record<string, string>>,
): string {
  const template = DIAGNOSTIC_CODES[code].messageTemplate;

  return template.replaceAll(/\{(\w+)\}/g, (fullMatch, paramName: string) => {
    return params[paramName] ?? fullMatch;
  });
}
