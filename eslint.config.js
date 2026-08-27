import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  { ignores: ['dist', 'node_modules', 'coverage', '*.tsbuildinfo'] },

  js.configs.recommended,

  // Application source. TypeScript needs its own parser — without it every
  // `interface` and type annotation is a syntax error.
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
  })),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // TypeScript already resolves identifiers; the base rule double-reports.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The booth deliberately swallows some failures (a video frame that is not
      // decodable yet, storage that is unavailable). Those blocks are commented.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Build and tooling files run in Node, not the browser.
  {
    files: ['vite.config.ts', 'eslint.config.js', 'tools/**/*.{js,cjs,mjs}'],
    languageOptions: {
      parser: tseslint.parser,
      globals: { ...globals.node },
      sourceType: 'module',
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
];
