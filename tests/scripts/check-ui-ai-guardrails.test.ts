import { describe, expect, it } from 'vitest';

import { findGuardrailViolationsInText } from '../../scripts/check-ui-ai-guardrails.js';

describe('check-ui-ai-guardrails static policy', () => {
  it('reports forbidden provider import and provider domain usage in ui/browser code', () => {
    const source = [
      "import OpenAI from 'openai';",
      "const provider = 'https://models.inference.ai.azure.com';",
    ].join('\n');

    const violations = findGuardrailViolationsInText(source, 'ui/src/lib/example.ts');

    expect(violations.some((violation) => violation.ruleId === 'provider-import-openai')).toBe(true);
    expect(violations.some((violation) => violation.ruleId === 'provider-domain-github-models')).toBe(true);
  });

  it('allows canonical backend-only invocation path through ApiAdapter/HttpAdapter', () => {
    const source = [
      "import { useApiAdapter } from '../providers/api-adapter-context';",
      "const adapter = useApiAdapter();",
      'await adapter.explainRule({ targetPath: "Order.Id", expression: "source(\\"id\\")" });',
    ].join('\n');

    const violations = findGuardrailViolationsInText(source, 'ui/src/features/mappings/hooks/use-explain-rule.ts');

    expect(violations).toEqual([]);
  });
});
