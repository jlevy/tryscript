import { z } from 'zod';

/** Schema for fixture configuration */
export const FixtureSchema = z.union([
  z.string().describe('Source path (copied to same name in temp)'),
  z.object({
    source: z.string().describe('Source path (relative to test file)'),
    dest: z.string().optional().describe('Destination path (relative to temp dir)'),
  }),
]);

export const TestConfigSchema = z.object({
  cwd: z.string().optional().describe('Working directory (default: test file directory)'),
  sandbox: z
    .union([z.boolean(), z.string()])
    .optional()
    .describe('Run in isolated sandbox: true = empty temp, path = copy to temp'),
  fixtures: z.array(FixtureSchema).optional().describe('Files to copy to sandbox before tests'),
  before: z.string().optional().describe('Script to run before first test'),
  after: z.string().optional().describe('Script to run after all tests'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  timeout: z.number().optional().describe('Timeout per command in ms'),
  patterns: z
    .record(z.union([z.string(), z.instanceof(RegExp)]))
    .optional()
    .describe('Custom elision patterns'),
  tests: z.array(z.string()).optional().describe('Test file glob patterns'),
  path: z
    .array(z.string())
    .optional()
    .describe('Directories to prepend to PATH (resolved relative to test file)'),
});

/**
 * Configuration for a test file or global config.
 */
export type TestConfig = z.infer<typeof TestConfigSchema>;

/**
 * A single command block within a test file.
 */
export interface TestBlock {
  /** Optional test name from preceding markdown heading */
  name?: string;
  /** The command to execute (may span multiple lines with > continuation) */
  command: string;
  /** Expected output (may include elision patterns) */
  expectedOutput: string;
  /** Expected stderr output (lines starting with ! in expected output) */
  expectedStderr?: string;
  /** Expected exit code (default: 0) */
  expectedExitCode: number;
  /** Line number where this block starts (1-indexed, for error reporting) */
  lineNumber: number;
  /** Raw content of the block for update mode */
  rawContent: string;
  /** Skip this test (from <!-- skip --> annotation) */
  skip?: boolean;
  /** Run only this test (from <!-- only --> annotation) */
  only?: boolean;
}

/**
 * A parsed test file with all its blocks.
 */
export interface TestFile {
  /** Absolute path to the test file */
  path: string;
  /** Merged configuration (global + frontmatter) */
  config: TestConfig;
  /** Parsed test blocks in order */
  blocks: TestBlock[];
  /** Raw file content for update mode */
  rawContent: string;
}

/**
 * Result of running a single test block.
 */
export interface TestBlockResult {
  block: TestBlock;
  passed: boolean;
  actualOutput: string;
  /** Separate stdout (when stderr is captured separately) */
  actualStdout?: string;
  /** Separate stderr (when stderr is captured separately) */
  actualStderr?: string;
  actualExitCode: number;
  /** Diff if test failed (unified diff format) */
  diff?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if execution failed */
  error?: string;
  /** Test was skipped */
  skipped?: boolean;
}

/**
 * Result of running all blocks in a test file.
 */
export interface TestFileResult {
  file: TestFile;
  results: TestBlockResult[];
  passed: boolean;
  /** Total duration in milliseconds */
  duration: number;
}

/**
 * Summary of running multiple test files.
 */
export interface TestRunSummary {
  files: TestFileResult[];
  totalPassed: number;
  totalFailed: number;
  totalBlocks: number;
  duration: number;
}

/**
 * Schema for coverage configuration.
 * Options mirror c8's CLI flags for maximum flexibility.
 * @see https://github.com/bcoe/c8 for c8 documentation
 */
export const CoverageConfigSchema = z.object({
  /** Output directory for coverage reports (default: 'coverage-tryscript') */
  reportsDir: z.string().optional(),
  /** Coverage reporters to use (default: ['text', 'html']) */
  reporters: z.array(z.string()).optional(),
  /** File patterns to include in coverage (default: ['dist/**']) */
  include: z.array(z.string()).optional(),
  /** File patterns to exclude from coverage (c8 --exclude) */
  exclude: z.array(z.string()).optional(),
  /** Exclude all node_modules folders (c8 --exclude-node-modules, default: true) */
  excludeNodeModules: z.boolean().optional(),
  /** Apply exclude logic after sourcemap remapping (c8 --exclude-after-remap) */
  excludeAfterRemap: z.boolean().optional(),
  /** Hide files with 100% coverage (c8 --skip-full) */
  skipFull: z.boolean().optional(),
  /** Allow files from outside cwd (c8 --allowExternal) */
  allowExternal: z.boolean().optional(),
  /** Source directory for sourcemap mapping (default: 'src') */
  src: z.string().optional(),
  /** Use monocart for more accurate line counts (c8 --experimental-monocart) */
  monocart: z.boolean().optional(),
  /** Path to external LCOV file to merge (e.g., vitest coverage output) */
  mergeLcov: z.string().optional(),
});

/**
 * Coverage configuration options.
 */
export type CoverageConfig = z.infer<typeof CoverageConfigSchema>;

/**
 * Runtime context for coverage collection during test execution.
 * Note: options type uses Omit to make mergeLcov remain optional (no default value).
 */
export interface CoverageContext {
  /** Temporary directory for V8 coverage data files */
  tempDir: string;
  /** Resolved coverage options with defaults applied */
  options: Omit<Required<CoverageConfig>, 'mergeLcov'> & { mergeLcov?: string };
}

/**
 * Categories of wildcards, forming a hierarchy for expansion flags.
 *
 * - `unknown`: `???` (multi-line) and `[??]` (single-line) — temporary scaffolding
 * - `generic`: `...` (multi-line) and `[..]` (single-line) — intentional omission
 * - `named`: `[HASH]`, `[CWD]`, etc. — typed dynamic values
 */
export type WildcardCategory = 'unknown' | 'generic' | 'named';

/**
 * Which wildcards each `--expand*` flag targets.
 *
 * - `unknown`: only `???` and `[??]`
 * - `generic`: unknown + `...` and `[..]`
 * - `all`: everything including named patterns
 */
export type ExpandLevel = 'unknown' | 'generic' | 'all';

/**
 * A single wildcard capture from matching actual output against expected pattern.
 */
export interface WildcardCapture {
  category: WildcardCategory;
  /** For named patterns, the pattern name (e.g., 'HASH') */
  name?: string;
  /** True for multi-line wildcards (`...`/`???`), false for single-line (`[..]`/`[??]`) */
  multiline: boolean;
  /** The actual text that the wildcard matched */
  captured: string;
}

/**
 * Result of expanding wildcards in expected output.
 */
export interface ExpansionResult {
  expandedOutput: string;
  captures: WildcardCapture[];
  expandedCount: number;
}
