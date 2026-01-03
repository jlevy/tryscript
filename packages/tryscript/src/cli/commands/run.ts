import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import pc from 'picocolors';
import { loadConfig, mergeConfig } from '../../lib/config.js';
import { parseTestFile } from '../../lib/parser.js';
import {
  runBlock,
  createExecutionContext,
  cleanupExecutionContext,
  runAfterHook,
} from '../../lib/runner.js';
import { matchOutput } from '../../lib/matcher.js';
import { createDiff, reportFile, reportSummary } from '../../lib/reporter.js';
import { updateTestFile } from '../../lib/updater.js';
import type { TestBlockResult, TestFileResult, TestRunSummary } from '../../lib/types.js';

interface RunOptions {
  update?: boolean;
  diff?: boolean;
  failFast?: boolean;
  filter?: string;
  verbose?: boolean;
  quiet?: boolean;
}

export async function runCommand(files: string[], options: RunOptions): Promise<void> {
  const startTime = Date.now();

  // Default options
  const opts = {
    diff: options.diff !== false,
    verbose: options.verbose ?? false,
    quiet: options.quiet ?? false,
    update: options.update ?? false,
    failFast: options.failFast ?? false,
    filter: options.filter,
  };

  // Find test files (fast-glob respects .gitignore by default)
  const patterns = files.length > 0 ? files : ['**/*.tryscript.md'];
  const testFiles = await fg(patterns, {
    ignore: ['**/node_modules/**', '**/dist/**'],
    absolute: true,
    dot: false,
  });

  if (testFiles.length === 0) {
    console.error(pc.yellow('No test files found'));
    process.exit(1);
  }

  // Load global config
  const globalConfig = await loadConfig(process.cwd());

  // Run tests
  const fileResults: TestFileResult[] = [];
  let shouldStop = false;

  for (const filePath of testFiles) {
    if (shouldStop) {
      break;
    }

    const content = await readFile(filePath, 'utf-8');
    const testFile = parseTestFile(content, filePath);
    const config = mergeConfig(globalConfig, testFile.config);

    // Filter blocks by name if specified
    let blocksToRun = testFile.blocks;
    if (opts.filter) {
      const filterPattern = new RegExp(opts.filter, 'i');
      blocksToRun = blocksToRun.filter((b) => (b.name ? filterPattern.test(b.name) : true));
    }

    // Handle "only" mode - if any block has only=true, run only those
    const onlyBlocks = blocksToRun.filter((b) => b.only);
    if (onlyBlocks.length > 0) {
      blocksToRun = onlyBlocks;
    }

    if (blocksToRun.length === 0) {
      continue;
    }

    const ctx = await createExecutionContext(config, filePath);
    const results: TestBlockResult[] = [];

    try {
      for (const block of blocksToRun) {
        const result = await runBlock(block, ctx);

        // Skip checking for skipped tests
        if (result.skipped) {
          results.push(result);
          continue;
        }

        // Check if output matches expected
        // [ROOT] = test file directory, [CWD] = command working directory
        // If expectedStderr is set, compare stdout only (not combined output)
        const outputToCheck = block.expectedStderr
          ? (result.actualStdout ?? '')
          : result.actualOutput;
        const outputMatches = matchOutput(
          outputToCheck,
          block.expectedOutput,
          { root: ctx.testDir, cwd: ctx.cwd },
          config.patterns ?? {},
        );

        // Check stderr if expected (using actualStderr if available)
        let stderrMatches = true;
        if (block.expectedStderr) {
          stderrMatches = matchOutput(
            result.actualStderr ?? '',
            block.expectedStderr,
            { root: ctx.testDir, cwd: ctx.cwd },
            config.patterns ?? {},
          );
        }

        const exitCodeMatches = result.actualExitCode === block.expectedExitCode;
        result.passed = outputMatches && stderrMatches && exitCodeMatches && !result.error;

        if (!result.passed && opts.diff) {
          result.diff = createDiff(
            block.expectedOutput,
            result.actualOutput,
            `${filePath}:${block.lineNumber}`,
          );
        }

        results.push(result);

        if (!result.passed && opts.failFast) {
          shouldStop = true;
          break;
        }
      }

      // Run after hook if configured
      await runAfterHook(ctx);
    } finally {
      await cleanupExecutionContext(ctx);
    }

    const fileResult: TestFileResult = {
      file: testFile,
      results,
      passed: results.every((r) => r.passed),
      duration: results.reduce((sum, r) => sum + r.duration, 0),
    };

    fileResults.push(fileResult);
    reportFile(fileResult, opts);

    // Update mode
    if (opts.update && !fileResult.passed) {
      const { updated, changes } = await updateTestFile(testFile, results);
      if (updated) {
        console.error(pc.yellow(`  ↻ Updated: ${changes.join(', ')}`));
      }
    }
  }

  // Summary
  const summary: TestRunSummary = {
    files: fileResults,
    totalPassed: fileResults.reduce((sum, f) => sum + f.results.filter((r) => r.passed).length, 0),
    totalFailed: fileResults.reduce((sum, f) => sum + f.results.filter((r) => !r.passed).length, 0),
    totalBlocks: fileResults.reduce((sum, f) => sum + f.results.length, 0),
    duration: Date.now() - startTime,
  };

  reportSummary(summary, opts);

  // Exit code
  process.exit(summary.totalFailed > 0 ? 1 : 0);
}
