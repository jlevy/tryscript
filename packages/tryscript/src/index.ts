// Public API exports

// Version constant (injected at build time)
declare const __VERSION__: string;
export const VERSION: string = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'development';

// Config helper
export { defineConfig } from './lib/config.js';
export type { TryscriptConfig } from './lib/config.js';

// Types
export type {
  TestConfig,
  TestBlock,
  TestFile,
  TestBlockResult,
  TestFileResult,
  TestRunSummary,
  CoverageConfig,
  CoverageContext,
} from './lib/types.js';

// Core functions (for programmatic use)
export { parseTestFile } from './lib/parser.js';
export { runBlock, createExecutionContext, cleanupExecutionContext } from './lib/runner.js';
export type { ExecutionContext } from './lib/runner.js';
export { matchOutput, normalizeOutput } from './lib/matcher.js';
