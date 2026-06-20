import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

const noUnusedVars = 'off';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/target/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      'frontend/output.txt',
      'load-tests/results/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Backend
  {
    files: ['backend/**/*.js', 'scripts/**/*.js', 'load-tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      'no-unused-vars': noUnusedVars,
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Root scripts/config files
  {
    files: ['*.js', '*.cjs', '*.mjs', '.*.js', '.*/**/*.{js,cjs,mjs}'],
    ignores: ['frontend/**/*', 'backend/**/*', 'mobile/**/*', 'scripts/**/*'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      'no-unused-vars': noUnusedVars,
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Load test scripts
  {
    files: ['load-tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // CommonJS files
  {
    files: ['**/*.{cjs}', 'mobile/babel.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.es2022, ...globals.jest, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['frontend/jest.setup.cjs', 'push_issues.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Frontend
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

  // Tests
  {
    files: [
      '**/*.test.{js,jsx}',
      '**/*.spec.{js,jsx}',
      'backend/tests/**/*.js',
      'frontend/jest.setup.cjs',
      'frontend/jest.config.cjs',
      '**/__mocks__/**/*.js',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022, ...globals.jest, ...globals.browser },
    },
    rules: {
      'no-unused-vars': noUnusedVars,
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // TypeScript
  {
    files: ['frontend/**/*.{ts,tsx}', 'backend/**/*.{ts,tsx}', 'mobile/**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-require-imports': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  // ── TypeScript rules — mobile (own tsconfig, relaxed project-aware rules) ─
  {
    files: ['mobile/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // React Native uses require() for dynamic imports in some patterns
      '@typescript-eslint/no-require-imports': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  prettier,
];
