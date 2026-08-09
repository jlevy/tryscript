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
  ParsedTestBlock,
  TestFile,
  TestBlockResult,
  TestFileResult,
  TestRunSummary,
  CoverageConfig,
  CoverageContext,
  WildcardCategory,
  ExpandLevel,
  WildcardCapture,
  ExpansionResult,
} from './lib/types.js';

// Core functions (for programmatic use)
export { parseTestFile, validateConfig, TestParseError } from './lib/parser.js';
export type { ConfigWarning } from './lib/parser.js';
// `buildBlock`/`spliceBlocks`/`fenceOf` are deliberately not exported: they are
// rewrite internals with no external use case, and exporting them would add
// compatibility obligations for a shape that exists to serve the parser.
export { runBlock, createExecutionContext, cleanupExecutionContext } from './lib/runner.js';
export type { ExecutionContext } from './lib/runner.js';
export { matchOutput, normalizeOutput, matchAndCapture } from './lib/matcher.js';
export { expandExpectedOutput, expandTestFile, shouldExpandCategory } from './lib/expander.js';
export { writeCaptureLog, buildCaptureLogDoc } from './lib/capture-log.js';
export { stringifyYaml, manualKeyOrder } from './lib/yaml-utils.js';
