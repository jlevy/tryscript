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
  bin: z.string().optional().describe('Path to the binary to test'),
  binName: z.string().optional().describe('Command name alias for bin'),
  cwd: z
    .string()
    .optional()
    .describe('Working directory: "." = test file dir (default), "temp" = temp dir'),
  vars: z.record(z.string()).optional().describe('User-defined variables for $VAR expansion'),
  fixtures: z.array(FixtureSchema).optional().describe('Files to copy to temp before tests'),
  before: z.string().optional().describe('Script to run before first test'),
  after: z.string().optional().describe('Script to run after all tests'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  timeout: z.number().optional().describe('Timeout per command in ms'),
  patterns: z
    .record(z.union([z.string(), z.instanceof(RegExp)]))
    .optional()
    .describe('Custom elision patterns'),
  tests: z.array(z.string()).optional().describe('Test file glob patterns'),
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
