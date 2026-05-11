import { describe, expect, it } from 'vitest';

import { renderPrompt, type PromptRecord } from '../../../src/lib/ai/index.js';

function createPromptRecord(overrides: Partial<PromptRecord> = {}): PromptRecord {
  return {
    promptId: 'explain-rule',
    version: 1,
    systemMessage: 'You are a DSL expert.\n\nDSL Reference:\n{{dslReference}}',
    userMessageTemplate: 'Explain this rule:\nTarget: {{targetPath}}\nExpression: {{expression}}',
    model: 'openai/gpt-4.1-mini',
    temperature: 0,
    responseSchema: '{"type":"object"}',
    maxTokens: 500,
    updatedAt: '2026-05-11T00:00:00.000Z',
    updatedBy: 'tester',
    ...overrides,
  };
}

describe('renderPrompt', () => {
  it('replaces AE-10 placeholders in system and user messages', () => {
    const promptRecord = createPromptRecord();

    const rendered = renderPrompt(promptRecord, {
      dslReference: '# KeyRa DSL v1...',
      targetPath: 'Order.Id',
      expression: 'source("id")',
    });

    expect(rendered.systemMessage).toBe('You are a DSL expert.\n\nDSL Reference:\n# KeyRa DSL v1...');
    expect(rendered.userMessage).toBe('Explain this rule:\nTarget: Order.Id\nExpression: source("id")');
  });

  it('replaces multiple placeholders in a single template', () => {
    const promptRecord = createPromptRecord({
      userMessageTemplate: '{{a}} + {{b}} + {{c}}',
    });

    const rendered = renderPrompt(promptRecord, {
      a: 'x',
      b: 'y',
      c: 'z',
    });

    expect(rendered.userMessage).toBe('x + y + z');
  });

  it('replaces all occurrences when the same placeholder appears multiple times', () => {
    const promptRecord = createPromptRecord({
      systemMessage: '{{dslReference}} -- {{dslReference}}',
    });

    const rendered = renderPrompt(promptRecord, {
      dslReference: 'DSL-CONTENT',
    });

    expect(rendered.systemMessage).toBe('DSL-CONTENT -- DSL-CONTENT');
  });

  it('handles variable values containing special characters', () => {
    const promptRecord = createPromptRecord({
      userMessageTemplate: 'Value={{value}}',
    });

    const rendered = renderPrompt(promptRecord, {
      value: '$1 {test} [x] ^.*+?',
    });

    expect(rendered.userMessage).toBe('Value=$1 {test} [x] ^.*+?');
  });

  it('keeps unreplaced placeholders as-is when variable is missing', () => {
    const promptRecord = createPromptRecord({
      userMessageTemplate: 'Known={{known}} Missing={{missing}}',
    });

    const rendered = renderPrompt(promptRecord, {
      known: 'present',
    });

    expect(rendered.userMessage).toBe('Known=present Missing={{missing}}');
  });

  it('returns templates unchanged when variables map is empty', () => {
    const promptRecord = createPromptRecord();

    const rendered = renderPrompt(promptRecord, {});

    expect(rendered.systemMessage).toBe(promptRecord.systemMessage);
    expect(rendered.userMessage).toBe(promptRecord.userMessageTemplate);
  });

  it('returns empty template strings unchanged', () => {
    const promptRecord = createPromptRecord({
      systemMessage: '',
      userMessageTemplate: '',
    });

    const rendered = renderPrompt(promptRecord, {
      anything: 'value',
    });

    expect(rendered.systemMessage).toBe('');
    expect(rendered.userMessage).toBe('');
  });

  it('replaces placeholders that have no surrounding text', () => {
    const promptRecord = createPromptRecord({
      systemMessage: '{{dslReference}}',
      userMessageTemplate: '{{expression}}',
    });

    const rendered = renderPrompt(promptRecord, {
      dslReference: '# DSL',
      expression: 'source("foo")',
    });

    expect(rendered.systemMessage).toBe('# DSL');
    expect(rendered.userMessage).toBe('source("foo")');
  });

  it('ignores extra keys not present in templates', () => {
    const promptRecord = createPromptRecord({
      systemMessage: 'A={{a}}',
      userMessageTemplate: 'B={{b}}',
    });

    const rendered = renderPrompt(promptRecord, {
      a: 'one',
      b: 'two',
      extra: 'unused',
      another: 'also-unused',
    });

    expect(rendered.systemMessage).toBe('A=one');
    expect(rendered.userMessage).toBe('B=two');
  });
});
