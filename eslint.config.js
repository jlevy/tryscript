import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Type-aware ESLint configuration using flat config.
// Uses TypeScript's project service for precise, cross-project type information.

// Apply type-checked configs only to TypeScript files
const typedRecommended = tseslint.configs.recommendedTypeChecked.map((cfg) => ({
  ...cfg,
  files: ['**/*.ts', '**/*.tsx'],
  languageOptions: {
    ...(cfg.languageOptions ?? {}),
    parserOptions: {
      ...(cfg.languageOptions?.parserOptions ?? {}),
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

const typedStylistic = tseslint.configs.stylisticTypeChecked.map((cfg) => ({
  ...cfg,
  files: ['**/*.ts', '**/*.tsx'],
  languageOptions: {
    ...(cfg.languageOptions ?? {}),
    parserOptions: {
      ...(cfg.languageOptions?.parserOptions ?? {}),
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

export default [
  // Global ignores
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.pnpm-store/**', 'eslint.config.*'],
  },

  // Base JS rules
  js.configs.recommended,

  // Type-aware TypeScript rules
  ...typedRecommended,
  ...typedStylistic,

  // Prettier config must be last to override conflicting rules
  prettier,

  // TypeScript-specific rules
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // === Code Style ===
      // Enforce curly braces for all control statements (prevents bugs)
      curly: ['error', 'all'],
      // Consistent brace style: opening on same line, closing on new line
      'brace-style': ['error', '1tbs', { allowSingleLine: false }],

      // === Unused Variables ===
      // Allow underscore prefix for intentionally unused vars/args
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // === Promise Safety (Critical for Node.js) ===
      // Catch unhandled promises (common source of silent failures)
      '@typescript-eslint/no-floating-promises': 'error',
      // Prevent passing promises where void is expected (e.g., event handlers)
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // Catch awaiting non-promise values
      '@typescript-eslint/await-thenable': 'error',
      // Prevent confusing void expressions in unexpected places
      '@typescript-eslint/no-confusing-void-expression': 'error',

      // === Type Import Consistency ===
      // Enforce `import type` for type-only imports (better tree-shaking)
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: true,
        },
      ],
      // Prevent side effects in type-only imports
      '@typescript-eslint/no-import-type-side-effects': 'error',

      // === Restricted Patterns ===
      // Forbid inline import() type expressions (prefer proper imports)
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSImportType',
          message:
            'Inline import() type expressions are not allowed. Use a proper import statement at the top of the file instead.',
        },
      ],
    },
  },

  // === File-Specific Overrides ===
  // Relax rules for test files where dynamic behavior is expected
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },

  // Node.js scripts (ESM)
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
];
