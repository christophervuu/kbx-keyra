import { describe, expect, it } from 'vitest';

import {
  findSecretViolationsInText,
  type SecretViolation,
} from '../../scripts/check-ui-no-browser-secrets.js';

function byRule(violations: SecretViolation[], ruleId: string): boolean {
  return violations.some((violation) => violation.ruleId === ruleId);
}

describe('check-ui-no-browser-secrets policy', () => {
  it('detects forbidden provider/env secret references', () => {
    const source = [
      'const token = import.meta.env.GITHUB_TOKEN;',
      'const key = process.env.OPENAI_API_KEY;',
      'const direct = "https://api.openai.com/v1";',
      'const literal = "sk-abcdef1234567890";',
    ].join('\n');

    const violations = findSecretViolationsInText(source, 'ui/src/features/mappings/hooks/use-test.ts');

    expect(byRule(violations, 'forbidden-env-github-token')).toBe(true);
    expect(byRule(violations, 'forbidden-env-openai-api-key')).toBe(true);
    expect(byRule(violations, 'forbidden-provider-domain-openai')).toBe(true);
    expect(byRule(violations, 'forbidden-provider-token-literal')).toBe(true);
  });

  it('allows canonical public env and adapter usage', () => {
    const source = [
      'const apiUrl = import.meta.env.VITE_API_URL;',
      'const adapter = createAdapter(apiUrl);',
      'await adapter.explainRule({ targetPath: "Order.Id", expression: "source(\\"id\\")" });',
    ].join('\n');

    const violations = findSecretViolationsInText(source, 'ui/src/lib/api/bootstrap.ts');

    expect(violations).toEqual([]);
  });
});
