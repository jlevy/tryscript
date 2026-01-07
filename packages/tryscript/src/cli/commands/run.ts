/**
 * Run command - executes golden tests against CLI applications.
 *
 * Supports filtering, update mode, and detailed diff output for failures.
 */

import type { Command } from 'commander';

import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { loadConfig, mergeConfig } from '../../lib/config.js';
import { logWarn, logError, colors, status as statusIndicators } from '../lib/shared.js';
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
import {
  isC8Available,
  createCoverageContext,
  getCoverageEnv,
  generateCoverageReport,
  cleanupCoverageContext,
} from '../../lib/coverage.js';
import type {
  TestBlockResult,
  TestFileResult,
  TestRunSummary,
  CoverageContext,
} from '../../lib/types.js';

interface RunOptions {
  update?: boolean;
  diff?: boolean;
  failFast?: boolean;
  filter?: string;
  verbose?: boolean;
  quiet?: boolean;
  coverage?: boolean;
  coverageDir?: string;
  coverageReporter?: string[];
  coverageExclude?: string[];
  coverageExcludeNodeModules?: boolean;
  coverageExcludeAfterRemap?: boolean;
  coverageSkipFull?: boolean;
  coverageAllowExternal?: boolean;
}

/**
 * Register the run command.
 */
export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run golden tests')
    .argument('[files...]', 'Test files to run (default: **/*.tryscript.md)')
    .option('--update', 'Update golden files with actual output')
    .option('--diff', 'Show diff on failure (default: true)')
    .option('--no-diff', 'Hide diff on failure')
    .option('--fail-fast', 'Stop on first failure')
    .option('--filter <pattern>', 'Filter tests by name pattern')
    .option('--verbose', 'Show detailed output including passing test output')
    .option('--quiet', 'Suppress non-essential output (only show failures)')
    .option('--coverage', 'Enable code coverage collection (requires c8)')
    .option('--coverage-dir <dir>', 'Coverage output directory (default: coverage-tryscript)')
    .option(
      '--coverage-reporter <reporter...>',
      'Coverage reporters (default: text, html). Can be specified multiple times.',
    )
    .option(
      '--coverage-exclude <pattern...>',
      'Patterns to exclude from coverage (c8 --exclude). Can be specified multiple times.',
    )
    .option(
      '--coverage-exclude-node-modules',
      'Exclude node_modules from coverage (c8 --exclude-node-modules, default: true)',
    )
    .option(
      '--no-coverage-exclude-node-modules',
      'Include node_modules in coverage (c8 --no-exclude-node-modules)',
    )
    .option(
      '--coverage-exclude-after-remap',
      'Apply exclude logic after sourcemap remapping (c8 --exclude-after-remap)',
    )
    .option('--coverage-skip-full', 'Hide files with 100% coverage (c8 --skip-full)')
    .option('--coverage-allow-external', 'Allow files from outside cwd (c8 --allowExternal)')
    .action(runCommand);
}

async function runCommand(files: string[], options: RunOptions): Promise<void> {
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
    logWarn('No test files found');
    process.exit(1);
  }

  // Load global config
  const globalConfig = await loadConfig(process.cwd());

  // Setup coverage if enabled
  let coverageCtx: CoverageContext | undefined;
  let coverageEnv: Record<string, string> = {};

  if (options.coverage) {
    // Check if c8 is available
    const c8Available = await isC8Available();
    if (!c8Available) {
      logError('Coverage requires c8. Install with: npm install -D c8');
      process.exit(1);
    }

    // Create coverage context with CLI options overriding config
    coverageCtx = await createCoverageContext({
      ...globalConfig.coverage,
      reportsDir: options.coverageDir ?? globalConfig.coverage?.reportsDir,
      reporters: options.coverageReporter ?? globalConfig.coverage?.reporters,
      exclude: options.coverageExclude ?? globalConfig.coverage?.exclude,
      excludeNodeModules:
        options.coverageExcludeNodeModules ?? globalConfig.coverage?.excludeNodeModules,
      excludeAfterRemap:
        options.coverageExcludeAfterRemap ?? globalConfig.coverage?.excludeAfterRemap,
      skipFull: options.coverageSkipFull ?? globalConfig.coverage?.skipFull,
      allowExternal: options.coverageAllowExternal ?? globalConfig.coverage?.allowExternal,
    });
    coverageEnv = getCoverageEnv(coverageCtx);
  }

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

    const ctx = await createExecutionContext(config, filePath, coverageEnv);
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
        console.error(colors.warn(`  ${statusIndicators.update} Updated: ${changes.join(', ')}`));
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

  // Generate coverage report if enabled
  if (coverageCtx) {
    console.error('\nGenerating coverage report...');
    try {
      await generateCoverageReport(coverageCtx);
      console.error(
        colors.success(`Coverage report written to ${coverageCtx.options.reportsDir}/`),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`Failed to generate coverage report: ${message}`);
    } finally {
      await cleanupCoverageContext(coverageCtx);
    }
  }

  // Exit code
  process.exit(summary.totalFailed > 0 ? 1 : 0);
}
