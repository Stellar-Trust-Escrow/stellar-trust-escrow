import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

const noUnusedVars = [
  'error',
  {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrorsIgnorePattern: '^_',
  },
];

export default [
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/target/**', '**/dist/**', '**/out/**'],
  },

  js.configs.recommended,

  // ── Backend ────────────────────────────────────────────────────────────────
  {
    files: ['backend/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      'no-unused-vars': noUnusedVars,
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // ── Frontend ───────────────────────────────────────────────────────────────
  {
    files: ['frontend/**/*.{jsx,js}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true }, ecmaVersion: 'latest', sourceType: 'module' },
      globals: { ...globals.browser, ...globals.es2022, ...globals.node },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': noUnusedVars,
      '@typescript-eslint/no-unused-vars': 'off',
    },
    settings: { react: { version: 'detect' } },
  },

  // ── Tests ──────────────────────────────────────────────────────────────────
  {
    files: [
      '**/*.test.{js,jsx}',
      '**/*.spec.{js,jsx}',
      'backend/tests/**/*.js',
      '**/__mocks__/**/*.js',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022, ...globals.jest },
    },
    rules: {
      'no-unused-vars': noUnusedVars,
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // ── TypeScript ─────────────────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { parserOptions: { project: true } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  prettier,
];
