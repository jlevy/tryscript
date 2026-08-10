import { z } from 'zod';

/** Custom-pattern names occupied by built-in tryscript tokens. */
export const BUILT_IN_PATTERN_NAMES: ReadonlySet<string> = new Set([
  '..',
  '??',
  'EXE',
  'ROOT',
  'CWD',
]);

/**
 * Schema for coverage configuration.
 * Options mirror c8's CLI flags for maximum flexibility.
 * @see https://github.com/bcoe/c8 for c8 documentation
 */
export const CoverageConfigSchema = z
  .object({
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
    /** Use monocart's AST-aware line counts (c8 --experimental-monocart) */
    monocart: z.boolean().optional(),
    /** Path to external LCOV file to merge (e.g., vitest coverage output) */
    mergeLcov: z.string().optional(),
  })
  .strict();

/** Coverage configuration options. */
export type CoverageConfig = z.infer<typeof CoverageConfigSchema>;

/** Coverage options after applying runtime defaults. */
export type ResolvedCoverageConfig = {
  [Key in Exclude<keyof CoverageConfig, 'mergeLcov'>]-?: Exclude<CoverageConfig[Key], undefined>;
} & { mergeLcov?: string };

/**
 * The v0.1.7 shape of `CoverageContext.options`, preserved exactly.
 *
 * Keep `undefined` explicit so validation-schema strictness cannot narrow the public
 * API under `exactOptionalPropertyTypes`.
 */
type PublicCoverageContextOptions = {
  [Key in Exclude<keyof CoverageConfig, 'mergeLcov'>]-?: CoverageConfig[Key] | undefined;
} & {
  mergeLcov?: string;
};

/** Schema for fixture configuration */
export const FixtureSchema = z.union([
  z.string().describe('Source path (copied to same name in temp)'),
  z
    .object({
      source: z.string().describe('Source path (relative to test file)'),
      dest: z.string().optional().describe('Destination path (relative to temp dir)'),
    })
    .strict(),
]);

/** Object-form fixture configuration. */
export type Fixture = Exclude<z.infer<typeof FixtureSchema>, string>;

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
    .describe('Directories to prepend to PATH (relative entries resolve from the test file)'),
  coverage: CoverageConfigSchema.optional().describe('Coverage options used with --coverage'),
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
  /**
   * Offset of this block's opening fence in the raw file content.
   *
   * The parser always provides this metadata. It remains optional so code written
   * against v0.1.7 can still construct `TestBlock`; rewrites use ordered content lookup
   * for those legacy values.
   */
  startOffset?: number;
  /** Offset just past this block's closing fence; paired with `startOffset` when parsed. */
  endOffset?: number;
  /** Fence info string as written; legacy values default to `console` during rewrites. */
  infoString?: string;
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
  /** Configuration parsed from this file's frontmatter */
  config: TestConfig;
  /** Non-fatal problems found in this file's frontmatter */
  configWarnings?: { path: string; message: string }[];
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
  /** Diff of stderr, when the block asserts stderr separately and it did not match */
  stderrDiff?: string;
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
  /** Files that could not be parsed, and so produced no block results */
  parseErrors?: number;
  duration: number;
}

/**
 * Runtime context for coverage collection during test execution.
 */
export interface CoverageContext {
  /** Temporary directory for V8 coverage data files */
  tempDir: string;
  /**
   * Resolved coverage options with defaults applied.
   *
   * Required properties retain their v0.1.7 `undefined` unions for source compatibility.
   * Contexts created by tryscript contain concrete runtime values.
   */
  options: PublicCoverageContextOptions;
}

/** Internal coverage context after runtime defaults eliminate `undefined`. */
export interface ResolvedCoverageContext {
  tempDir: string;
  options: ResolvedCoverageConfig;
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
