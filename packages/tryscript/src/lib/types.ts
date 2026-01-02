import { z } from 'zod';

export const TestConfigSchema = z.object({
  bin: z.string().optional().describe('Path to the binary to test'),
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
  /** Expected exit code (default: 0) */
  expectedExitCode: number;
  /** Line number where this block starts (1-indexed, for error reporting) */
  lineNumber: number;
  /** Raw content of the block for update mode */
  rawContent: string;
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
  actualExitCode: number;
  /** Diff if test failed (unified diff format) */
  diff?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if execution failed */
  error?: string;
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
