import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules/', '.next/', 'dist/', 'next-env.d.ts', '*.tgz', 'public/sw.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['error', { selector: "CallExpression[callee.property.name='eval']", message: 'No eval.' }],
    },
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: { ...reactHooks.configs.recommended.rules, ...nextPlugin.configs.recommended.rules },
  },
  {
    // The browser bundle must never import server-only modules (tokens, keys, GitHub client).
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [{ group: ['**/core/auth/**', '**/core/github/**', '**/core/config/**', '**/core/runtime*', '**/server/**'], message: 'Server-only module: keep keys and tokens off the client.', allowTypeImports: true }] }],
    },
  },
);
