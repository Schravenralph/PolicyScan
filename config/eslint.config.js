import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import security from 'eslint-plugin-security'
import customRules from './eslint-rules/index.js'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'server/dist',
      '.tmp-eslint.json',
      '.venv/**',
      'node_modules/**',
      '**/*.min.js',
      'commitlint.config.js',
      'commitlint.config.cjs',
      'config/jest.config.js',
      'config/tailwind.config.js',
      'config/tailwind.config.cjs',
      'config/postcss.config.js',
      'config/postcss.config.cjs',
      'config/postcss.config.js.cjs',
      '.stryker-tmp/**',
      '.archive/**', // Ignore archived files
      '**/*conflicted copy*', // Ignore Dropbox conflicted copy files
      'tests/**/*.test.js', // Ignore compiled JavaScript test files
      'docs/**/*.js', // Ignore external JavaScript files in docs (e.g., Rechtspraak website files)
      'tests/__mocks__/**/*.{js,cjs}', // Ignore mock files that use CommonJS
      'src/**/*.js', // Ignore compiled JavaScript files (TypeScript output)
      'scripts/**/*.js', // Ignore compiled JavaScript files in scripts (TypeScript output)
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'security': security,
      'custom-rules': customRules,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Security rules
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-pseudoRandomBytes': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      // Custom separation of concerns rules
      'custom-rules/file-size-limits': 'warn',
      'custom-rules/use-service-layer': 'warn', // Start with warning, can escalate to error later
      // Migration rules
      'custom-rules/prefer-canonical-documents': 'warn', // Encourage canonical document usage
      // i18n rules: TypeScript already enforces t() only accepts TranslationKey type
      // No custom ESLint rule needed - the type system prevents passing non-TranslationKey values
    },
  },
  {
    files: ['src/server/**/*.{ts,tsx}', 'src/shared/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        Buffer: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      'security': security,
      'custom-rules': customRules,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
      // Contract compliance rules
      'custom-rules/enforce-adapter-contract': 'warn', // Enforce IAdapter contract compliance
      // Security rules
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-pseudoRandomBytes': 'warn',
      'security/detect-possible-timing-attacks': 'warn',
      // Custom separation of concerns rules
      'custom-rules/no-direct-db-access': 'warn', // Start with warning, can escalate to error later
      'custom-rules/file-size-limits': 'warn',
      'custom-rules/no-business-logic-in-routes': 'warn',
    },
  },
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.{js,ts,cjs}', 'skills/**/*.{js,ts,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off', // Allow Node.js globals in .cjs files
      'no-unreachable': 'error', // Catch unreachable code
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // Allow require() in .cjs and .js files
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['config/**/*.{js,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off', // Allow Node.js globals in config files
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off', // Allow require() in config files
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['tests/**/*.{js,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser,
      },
    },
    plugins: {
      'custom-rules': customRules,
    },
    rules: {
      'no-undef': 'off', // Allow undefined globals like `jest` in test files
      'no-console': 'off', // Allow console logs in tests
      '@typescript-eslint/no-explicit-any': 'off', // Allow `any` in test files
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-require-imports': 'off', // Allow require in test files
      'no-case-declarations': 'off', // Allow lexical declarations in case blocks in tests
      'no-redeclare': 'off', // Allow redeclaring built-in globals in tests
      'no-empty-pattern': 'off', // Allow empty object patterns in tests
      '@typescript-eslint/no-unsafe-function-type': 'off', // Allow Function type in tests
      // Test pattern rules (initially warnings, can be escalated to errors later)
      // Temporarily disabled to reduce CI log volume and prevent runner crashes
      'custom-rules/prefer-typed-test-data': 'off',
      'custom-rules/prefer-mock-factories': 'off',
    },
  },
  {
    files: ['tests/e2e/**/*.spec.ts'],
    plugins: {
      'custom-rules': customRules,
    },
    rules: {
      // E2E tests must not use mocking - enforce strictly
      'custom-rules/no-e2e-mocking': 'error',
      // Prevent incorrect test.skip() usage that causes TypeScript errors
      'custom-rules/correct-test-skip-usage': 'error',
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      // Allow empty object types in declaration files (often generated from Zod schemas)
      '@typescript-eslint/no-empty-object-type': 'off',
      // Allow Object type in declaration files (may be from library types)
      '@typescript-eslint/no-wrapper-object-types': 'off',
    },
  },
)
