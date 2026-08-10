import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const typedSourceFiles = ['**/*.{ts,tsx,mts,cts}'];
const typedScriptFiles = ['scripts/**/*.mjs', 'packages/*/scripts/**/*.mjs'];
const typedFiles = [...typedSourceFiles, ...typedScriptFiles];
const sourceFiles = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];

const typedStrict = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: typedSourceFiles,
  languageOptions: {
    ...(config.languageOptions ?? {}),
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

const typedStylistic = tseslint.configs.stylisticTypeChecked.map((config) => ({
  ...config,
  files: typedSourceFiles,
  languageOptions: {
    ...(config.languageOptions ?? {}),
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

const scriptStrict = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: typedScriptFiles,
  languageOptions: {
    ...(config.languageOptions ?? {}),
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      project: './tsconfig.scripts.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

const scriptStylistic = tseslint.configs.stylisticTypeChecked.map((config) => ({
  ...config,
  files: typedScriptFiles,
  languageOptions: {
    ...(config.languageOptions ?? {}),
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      project: './tsconfig.scripts.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
}));

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.pnpm-store/**', 'eslint.config.*'],
  },
  js.configs.recommended,
  ...typedStrict,
  ...typedStylistic,
  ...scriptStrict,
  ...scriptStylistic,
  prettier,
  {
    files: sourceFiles,
    rules: {
      curly: ['error', 'all'],
    },
  },
  {
    files: typedFiles,
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: true,
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
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
  {
    files: typedScriptFiles,
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
];
