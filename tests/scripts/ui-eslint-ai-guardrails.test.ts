import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('ui eslint ai guardrails', () => {
  it('declares restricted provider imports for browser-side code', async () => {
    const configPath = resolve(process.cwd(), 'ui/eslint.config.js');
    const content = await readFile(configPath, 'utf8');

    expect(content).toContain("'no-restricted-imports'");
    expect(content).toContain("name: 'openai'");
    expect(content).toContain("name: '@azure/openai'");
    expect(content).toContain("patterns: ['openai/*', '@azure/openai/*']");
    expect(content).toContain('Use ApiAdapter/HttpAdapter to call backend AI endpoints.');
  });
});
