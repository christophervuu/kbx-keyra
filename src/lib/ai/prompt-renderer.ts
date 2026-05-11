import type { PromptRecord } from './types.js';

export interface RenderedPrompt {
  readonly systemMessage: string;
  readonly userMessage: string;
}

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(PLACEHOLDER_REGEX, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] ?? '' : match;
  });
}

export function renderPrompt(promptRecord: PromptRecord, variables: Record<string, string>): RenderedPrompt {
  return {
    systemMessage: renderTemplate(promptRecord.systemMessage, variables),
    userMessage: renderTemplate(promptRecord.userMessageTemplate, variables),
  };
}
