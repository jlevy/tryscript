/**
 * Run command - executes golden tests against CLI applications.
 *
 * Supports filtering, update mode, and detailed diff output for failures.
 */

import type { Command } from 'commander';

import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import { loadConfig, mergeConfig } from '../../lib/config.js';
import type { TryscriptConfig } from '../../lib/config.js';
import { logWarn, logError, colors, status as statusIndicators } from '../lib/shared.js';
import { parseTestFile, TestParseError, validateConfig } from '../../lib/parser.js';
import {
  runBlock,
  createExecutionContext,
  cleanupExecutionContext,
  runAfterHook,
} from '../../lib/runner.js';
import { matchOutput } from '../../lib/matcher.js';
import { createDiff, reportFile, reportSummary } from '../../lib/reporter.js';
import { updateTestFile } from '../../lib/updater.js';
import { expandTestFile } from '../../lib/expander.js';
import { writeCaptureLog } from '../../lib/capture-log.js';
import {
  isC8Available,
  createCoverageContext,
  getCoverageEnv,
  generateCoverageReport,
  cleanupCoverageContext,
  mergeExternalCoverage,
} from '../../lib/coverage.js';
import type {
  TestBlockResult,
  TestFileResult,
  TestRunSummary,
  CoverageContext,
  CoverageConfig,
  ExpandLevel,
} from '../../lib/types.js';

interface RunOptions {
  update?: boolean;
  diff?: boolean;
  failFast?: boolean;
  filter?: string;
  verbose?: boolean;
  quiet?: boolean;
  expand?: boolean;
  expandGeneric?: boolean;
  expandAll?: boolean;
  captureLog?: string;
  coverage?: boolean;
  coverageDir?: string;
  coverageReporter?: string[];
  coverageExclude?: string[];
  coverageExcludeNodeModules?: boolean;
  coverageExcludeAfterRemap?: boolean;
  coverageSkipFull?: boolean;
  coverageAllowExternal?: boolean;
  coverageMonocart?: boolean;
  mergeLcov?: string;
}

/**
 * Register the run command.
 */
export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run Markdown golden tests')
    .argument('[files...]', 'Files or glob patterns (default: **/*.tryscript.md)')
    .option('--update', 'Replace expected output with actual output')
    .option('--diff', 'Show diff on failure (default: true)')
    .option('--no-diff', 'Hide diff on failure')
    .option('--fail-fast', 'Stop on first failure')
    .option('--filter <pattern>', 'Run named tests matching a regular expression')
    .option('--verbose', 'Include captured output for passing tests')
    .option('--quiet', 'Show only failures and the final summary')
    .option('--expand', 'Replace unknown wildcards (??? and [??]) with actual output')
    .option('--expand-generic', 'Replace unknown and generic wildcards with actual output')
    .option('--expand-all', 'Replace all wildcards, including named patterns')
    .option('--capture-log <path>', 'Write wildcard captures to a YAML file')
    .option('--coverage', 'Collect V8 coverage with an installed c8 package')
    .option('--coverage-dir <dir>', 'Coverage output directory (default: coverage-tryscript)')
    .option(
      '--coverage-reporter <reporter>',
      'Coverage reporter; repeat for multiple values (default: text, html)',
      collectOption,
    )
    .option(
      '--coverage-exclude <pattern>',
      'Exclude pattern; repeat for multiple values (c8 --exclude)',
      collectOption,
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
    .option('--coverage-monocart', 'Use monocart AST-aware line counts when merging with Vitest')
    .option('--merge-lcov <path>', 'Merge an existing LCOV file into the generated report')
    .action(runCommand);
}

/** Collect one value from each occurrence of a repeatable Commander option. */
function collectOption(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

/**
 * Count unknown wildcard tokens (`???` and `[??]`) in expected output.
 */
function countUnknownWildcards(expectedOutput: string): number {
  const singleLine = (expectedOutput.match(/\[\?\?]/g) ?? []).length;
  const multiLine = (expectedOutput.match(/\?\?\?\n/g) ?? []).length;
  return singleLine + multiLine;
}

async function runCommand(files: string[], options: RunOptions): Promise<void> {
  const startTime = Date.now();

  // Validate mutual exclusivity of expand flags
  const expandFlags = [options.expand, options.expandGeneric, options.expandAll].filter(Boolean);
  if (expandFlags.length > 1) {
    logError('Options --expand, --expand-generic, and --expand-all cannot be combined');
    process.exit(1);
  }

  // Determine expand level
  let expandLevel: ExpandLevel | undefined;
  if (options.expand) {
    expandLevel = 'unknown';
  } else if (options.expandGeneric) {
    expandLevel = 'generic';
  } else if (options.expandAll) {
    expandLevel = 'all';
  }

  // Expand and update are mutually exclusive
  if (expandLevel && options.update) {
    logError('Expansion options cannot be combined with --update');
    process.exit(1);
  }

  // Default options
  const opts = {
    diff: options.diff !== false,
    verbose: options.verbose ?? false,
    quiet: options.quiet ?? false,
    update: options.update ?? false,
    failFast: options.failFast ?? false,
    filter: options.filter,
  };

  // Load global config before discovery so its default test patterns take effect.
  const loadedGlobalConfig = await loadConfig(process.cwd());
  for (const warning of validateConfig(loadedGlobalConfig, { allowEmpty: false })) {
    const warningPath = warning.path ? `:${warning.path}` : '';
    logWarn(`project config${warningPath}: ${warning.message}`);
  }
  const globalConfig: TryscriptConfig =
    typeof loadedGlobalConfig === 'object' &&
    loadedGlobalConfig !== null &&
    !Array.isArray(loadedGlobalConfig)
      ? loadedGlobalConfig
      : {};

  // Find test files. fast-glob returns matches in arbitrary order, so sort the unique
  // absolute paths before execution to keep reports and --fail-fast deterministic.
  const patterns = files.length > 0 ? files : (globalConfig.tests ?? ['**/*.tryscript.md']);
  const testFiles = (
    await fg(patterns, {
      ignore: ['**/node_modules/**', '**/dist/**'],
      absolute: true,
      dot: false,
    })
  ).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  if (testFiles.length === 0) {
    logError(`No test files matched: ${patterns.join(', ')} (working directory: ${process.cwd()})`);
    process.exit(1);
  }

  // Setup coverage if enabled
  let coverageCtx: CoverageContext | undefined;
  let coverageEnv: Record<string, string> = {};

  if (options.coverage) {
    // Check if c8 is available
    const c8Available = await isC8Available();
    if (!c8Available) {
      logError('Coverage requires the optional c8 package. Install it with: pnpm add -D c8');
      process.exit(1);
    }

    const mergeLcov = options.mergeLcov ?? globalConfig.coverage?.mergeLcov;

    // An effective merge path always requires c8 to produce an LCOV report first.
    let reporters = options.coverageReporter ?? globalConfig.coverage?.reporters;
    if (mergeLcov) {
      // If no explicit reporters, use defaults plus lcov
      if (!reporters) {
        reporters = ['text', 'html', 'lcov'];
      } else if (!reporters.includes('lcov')) {
        reporters = [...reporters, 'lcov'];
      }
    }

    // Create coverage context with CLI options overriding config
    const coverageConfig: CoverageConfig = { ...globalConfig.coverage };
    const reportsDir = options.coverageDir ?? globalConfig.coverage?.reportsDir;
    const exclude = options.coverageExclude ?? globalConfig.coverage?.exclude;
    const excludeNodeModules =
      options.coverageExcludeNodeModules ?? globalConfig.coverage?.excludeNodeModules;
    const excludeAfterRemap =
      options.coverageExcludeAfterRemap ?? globalConfig.coverage?.excludeAfterRemap;
    const skipFull = options.coverageSkipFull ?? globalConfig.coverage?.skipFull;
    const allowExternal = options.coverageAllowExternal ?? globalConfig.coverage?.allowExternal;
    const monocart = options.coverageMonocart ?? globalConfig.coverage?.monocart;
    if (reportsDir !== undefined) {
      coverageConfig.reportsDir = reportsDir;
    }
    if (reporters !== undefined) {
      coverageConfig.reporters = reporters;
    }
    if (exclude !== undefined) {
      coverageConfig.exclude = exclude;
    }
    if (excludeNodeModules !== undefined) {
      coverageConfig.excludeNodeModules = excludeNodeModules;
    }
    if (excludeAfterRemap !== undefined) {
      coverageConfig.excludeAfterRemap = excludeAfterRemap;
    }
    if (skipFull !== undefined) {
      coverageConfig.skipFull = skipFull;
    }
    if (allowExternal !== undefined) {
      coverageConfig.allowExternal = allowExternal;
    }
    if (monocart !== undefined) {
      coverageConfig.monocart = monocart;
    }
    if (mergeLcov !== undefined) {
      coverageConfig.mergeLcov = mergeLcov;
    }

    coverageCtx = await createCoverageContext(coverageConfig);
    coverageEnv = getCoverageEnv(coverageCtx);
  }

  try {
    // Run tests
    const fileResults: TestFileResult[] = [];
    const fileContexts = new Map<string, { root: string; cwd: string }>();
    const filePatterns = new Map<string, Record<string, string | RegExp>>();
    let shouldStop = false;
    let parseErrors = 0;
    let artifactFailures = 0;

    for (const filePath of testFiles) {
      if (shouldStop) {
        break;
      }

      const content = await readFile(filePath, 'utf-8');

      let testFile;
      try {
        testFile = parseTestFile(content, filePath);
      } catch (error) {
        // A malformed file is a failure of that file, not a crash of the whole run.
        if (error instanceof TestParseError) {
          logError(error.message);
          parseErrors++;
          if (opts.failFast) {
            break;
          }
          continue;
        }
        throw error;
      }

      for (const warning of testFile.configWarnings ?? []) {
        const warningPath = warning.path ? `:${warning.path}` : '';
        logWarn(`${filePath}${warningPath}: ${warning.message}`);
      }

      const config = mergeConfig(globalConfig, testFile.config);

      // Filter blocks by name if specified
      let blocksToRun = testFile.blocks;
      if (opts.filter) {
        const filterPattern = new RegExp(opts.filter, 'i');
        blocksToRun = blocksToRun.filter(
          (block) => block.name !== undefined && filterPattern.test(block.name),
        );
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
      let fileContext: { root: string; cwd: string } | undefined;

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
          const outputToCheck =
            block.expectedStderr !== undefined ? (result.actualStdout ?? '') : result.actualOutput;
          const outputMatches = matchOutput(
            outputToCheck,
            block.expectedOutput,
            { root: ctx.testDir, cwd: ctx.cwd },
            config.patterns ?? {},
          );

          // Check stderr if expected (using actualStderr if available)
          let stderrMatches = true;
          if (block.expectedStderr !== undefined) {
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
            // Diff the same stream that was compared, so a block asserting stderr
            // separately does not show its stderr as phantom stdout additions.
            result.diff = createDiff(
              block.expectedOutput,
              outputToCheck,
              `${filePath}:${block.lineNumber}`,
            );
            if (block.expectedStderr !== undefined && !stderrMatches) {
              result.stderrDiff = createDiff(
                block.expectedStderr,
                result.actualStderr ?? '',
                `${filePath}:${block.lineNumber} (stderr)`,
              );
            }
          }

          results.push(result);

          if (!result.passed && opts.failFast) {
            shouldStop = true;
            break;
          }
        }

        // Run after hook if configured
        await runAfterHook(ctx);

        // Save context paths before cleanup for expansion and capture log
        fileContext = { root: ctx.testDir, cwd: ctx.cwd };
        fileContexts.set(filePath, fileContext);
        filePatterns.set(filePath, config.patterns ?? {});
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

      // Expansion mode
      if (expandLevel) {
        const { expanded, expandedCount, changes } = await expandTestFile(
          testFile,
          results,
          expandLevel,
          fileContext,
          config.patterns ?? {},
        );
        if (expanded) {
          const wildcardNoun = expandedCount === 1 ? 'wildcard' : 'wildcards';
          console.error(
            colors.warn(
              `  ${statusIndicators.update} Expanded ${expandedCount} ${wildcardNoun}: ${changes.join(', ')}`,
            ),
          );
        }
      }
    }

    // Unknown wildcard warning (unconditional, always shown)
    let totalUnknownWildcards = 0;
    for (const fr of fileResults) {
      for (const block of fr.file.blocks) {
        totalUnknownWildcards += countUnknownWildcards(block.expectedOutput);
        totalUnknownWildcards += countUnknownWildcards(block.expectedStderr ?? '');
      }
    }
    if (totalUnknownWildcards > 0) {
      const wildcardNoun = totalUnknownWildcards === 1 ? 'wildcard' : 'wildcards';
      logWarn(
        `${totalUnknownWildcards} unknown ${wildcardNoun} found (??? or [??]). ` +
          'Run with --expand, then review the replacement before committing.',
      );
    }

    // Summary
    const summary: TestRunSummary = {
      files: fileResults,
      totalPassed: fileResults.reduce(
        (sum, f) => sum + f.results.filter((r) => r.passed).length,
        0,
      ),
      totalFailed: fileResults.reduce(
        (sum, f) => sum + f.results.filter((r) => !r.passed).length,
        0,
      ),
      totalBlocks: fileResults.reduce((sum, f) => sum + f.results.length, 0),
      parseErrors,
      duration: Date.now() - startTime,
    };

    reportSummary(summary);

    // Write capture log if requested
    if (options.captureLog) {
      try {
        await writeCaptureLog(
          options.captureLog,
          fileResults,
          (file) => fileContexts.get(file.path) ?? { root: process.cwd(), cwd: process.cwd() },
          (file) => filePatterns.get(file.path) ?? {},
        );
        console.error(colors.info(`Capture log written to ${options.captureLog}`));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Failed to write capture log: ${message}`);
        artifactFailures++;
      }
    }

    // Generate coverage report if enabled
    if (coverageCtx) {
      console.error('\nGenerating coverage report...');
      try {
        await generateCoverageReport(coverageCtx);
        console.error(
          colors.success(`Coverage report written to ${coverageCtx.options.reportsDir}/`),
        );

        // Merge with external LCOV if specified
        const mergeLcovPath = coverageCtx.options.mergeLcov;
        if (mergeLcovPath) {
          console.error(`Merging with external coverage: ${mergeLcovPath}`);
          const merged = mergeExternalCoverage(coverageCtx.options.reportsDir, mergeLcovPath);
          console.error(
            colors.success(
              `Merged coverage: ${merged.lines}% lines, ${merged.functions}% functions`,
            ),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Failed to generate coverage report: ${message}`);
        artifactFailures++;
      }
    }

    // Exit code. A file that failed to parse never produced results, so it has to be
    // counted here or a malformed suite would exit 0.
    process.exitCode = summary.totalFailed > 0 || parseErrors > 0 || artifactFailures > 0 ? 1 : 0;
  } finally {
    if (coverageCtx) {
      await cleanupCoverageContext(coverageCtx);
    }
  }
}
