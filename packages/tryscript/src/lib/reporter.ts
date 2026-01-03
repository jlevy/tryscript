/**
 * Test result reporting utilities.
 *
 * Handles output formatting for test results, diffs, and summaries.
 */

import pc from 'picocolors';
import { createPatch } from 'diff';
import type { TestFileResult, TestRunSummary } from './types.js';

export interface ReporterOptions {
  diff: boolean;
  verbose: boolean;
  quiet: boolean;
}

// Status indicators for consistent output
const statusIcon = {
  pass: pc.green('✓'),
  fail: pc.red('✗'),
};

/**
 * Format a duration in milliseconds for display.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Create a unified diff between expected and actual output.
 */
export function createDiff(expected: string, actual: string, filename: string): string {
  const patch = createPatch(filename, expected, actual, 'expected', 'actual');
  // Remove the header lines (first 4 lines)
  const lines = patch.split('\n').slice(4);
  return lines
    .map((line) => {
      if (line.startsWith('+')) {
        return pc.green(line);
      }
      if (line.startsWith('-')) {
        return pc.red(line);
      }
      if (line.startsWith('@')) {
        return pc.cyan(line);
      }
      return line;
    })
    .join('\n');
}

/**
 * Report results for a single file.
 */
export function reportFile(result: TestFileResult, options: ReporterOptions): void {
  const filename = result.file.path;
  const status = result.passed ? pc.green(pc.bold('PASS')) : pc.red(pc.bold('FAIL'));

  if (options.quiet && result.passed) {
    return;
  }

  // File header
  console.error(`${status} ${filename}`);

  // Individual block results
  for (const blockResult of result.results) {
    const name = blockResult.block.name ?? `Line ${blockResult.block.lineNumber}`;

    if (blockResult.passed) {
      if (!options.quiet) {
        console.error(`  ${statusIcon.pass} ${name}`);
      }
    } else {
      console.error(`  ${statusIcon.fail} ${name}`);

      // Show error details
      if (blockResult.error) {
        console.error(`    ${pc.red(blockResult.error)}`);
      } else {
        // Exit code mismatch
        if (blockResult.actualExitCode !== blockResult.block.expectedExitCode) {
          console.error(
            `    Expected exit code ${blockResult.block.expectedExitCode}, got ${blockResult.actualExitCode}`,
          );
        }

        // Output mismatch with diff
        if (options.diff && blockResult.diff) {
          console.error('');
          console.error(blockResult.diff);
        }
      }
    }
  }

  console.error('');
}

/**
 * Report final summary.
 */
export function reportSummary(summary: TestRunSummary, _options: ReporterOptions): void {
  const parts: string[] = [];

  if (summary.totalPassed > 0) {
    parts.push(pc.green(`${summary.totalPassed} passed`));
  }
  if (summary.totalFailed > 0) {
    parts.push(pc.red(`${summary.totalFailed} failed`));
  }

  const duration = formatDuration(summary.duration);
  const line = `${parts.join(', ')} (${duration})`;

  // Summary goes to stdout (can be piped/parsed)
  console.log(line);
}
