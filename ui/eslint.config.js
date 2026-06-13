import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsEslintPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...tsEslintPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'import/order': [
        'error',
        {
          alphabetize: { order: 'asc', caseInsensitive: true },
          groups: [['builtin', 'external'], ['internal'], ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'openai',
              message:
                'Do not import openai in browser/client code. Use ApiAdapter/HttpAdapter to call backend AI endpoints.',
            },
            {
              name: '@azure/openai',
              message:
                'Do not import @azure/openai in browser/client code. Use ApiAdapter/HttpAdapter to call backend AI endpoints.',
            },
          ],
          patterns: ['openai/*', '@azure/openai/*'],
        },
      ],
    },
  },
  {
    files: [
      'src/lib/api/http-adapter.ts',
      'src/lib/api/bootstrap.ts',
      'src/lib/api/http-client.ts',
      'src/lib/api/ai-api-client.ts',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'localStorage',
          property: 'getItem',
          message: 'HTTP adapter path must not read from localStorage.',
        },
        {
          object: 'localStorage',
          property: 'setItem',
          message: 'HTTP adapter path must not write to localStorage.',
        },
        {
          object: 'localStorage',
          property: 'removeItem',
          message: 'HTTP adapter path must not mutate localStorage.',
        },
        {
          object: 'sessionStorage',
          property: 'getItem',
          message: 'HTTP adapter path must not read from sessionStorage.',
        },
        {
          object: 'sessionStorage',
          property: 'setItem',
          message: 'HTTP adapter path must not write to sessionStorage.',
        },
        {
          object: 'sessionStorage',
          property: 'removeItem',
          message: 'HTTP adapter path must not mutate sessionStorage.',
        },
        {
          object: 'window',
          property: 'localStorage',
          message: 'HTTP adapter path must not access window.localStorage.',
        },
        {
          object: 'window',
          property: 'sessionStorage',
          message: 'HTTP adapter path must not access window.sessionStorage.',
        },
      ],
    },
  },
];
