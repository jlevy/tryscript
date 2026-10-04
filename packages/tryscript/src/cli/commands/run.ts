/**
 * Run command - executes golden tests against CLI applications.
 *
 * Supports filtering, update mode, and detailed diff output for failures.
 */

import type { Command } from 'commander';

import { readFile } from 'node:fs/promises';
import { loadConfig, mergeConfig } from '../../lib/config.js';
import { findTestFiles } from '../../lib/discovery.js';
import type { TryscriptConfig } from '../../lib/config.js';
import { logWarn, logError, colors, status as statusIndicators } from '../lib/shared.js';
import { parseTestFile, TestParseError, validateConfig } from '../../lib/parser.js';
import {
  runBlock,
  createExecutionContext,
  cleanupExecutionContext,
  runAfterHook,
  composeSessionEnvironment,
} from '../../lib/runner.js';
import { preflightRequires, requiresProblem } from '../../lib/requires.js';
import type { RequiresTarget } from '../../lib/requires.js';
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
  TestBlock,
  TestFile,
  TestBlockResult,
  TestFileResult,
  TestRunSummary,
  CoverageConfig,
  ExpandLevel,
  ResolvedCoverageContext,
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

/** A discovered test file, parsed before any session runs. */
type PlannedFile =
  | { filePath: string; parseError: TestParseError }
  | {
      filePath: string;
      parseError?: undefined;
      testFile: TestFile;
      config: TryscriptConfig;
      blocksToRun: TestBlock[];
    };

/** Apply --filter, then `<!-- only -->`: when any remaining block is marked only, run those. */
function selectBlocks(blocks: TestBlock[], filter: string | undefined): TestBlock[] {
  let selected = blocks;
  if (filter) {
    const filterPattern = new RegExp(filter, 'i');
    selected = selected.filter(
      (block) => block.name !== undefined && filterPattern.test(block.name),
    );
  }
  const onlyBlocks = selected.filter((b) => b.only);
  return onlyBlocks.length > 0 ? onlyBlocks : selected;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Check `requires:` for every file that will run, before any session starts, and report
 * where each command resolved. Returns false, after logging why, when the run must stop.
 */
function checkRequires(planned: PlannedFile[], projectConfig: unknown, quiet: boolean): boolean {
  const problems: string[] = [];
  const projectProblem =
    typeof projectConfig === 'object' && projectConfig !== null
      ? requiresProblem(Reflect.get(projectConfig, 'requires'))
      : undefined;
  if (projectProblem) {
    problems.push(`project config: ${projectProblem}`);
  }

  const targets: RequiresTarget[] = [];
  for (const entry of planned) {
    if (entry.parseError) {
      continue;
    }
    const fileProblem = requiresProblem(entry.testFile.config.requires);
    if (fileProblem) {
      problems.push(`${entry.filePath}: ${fileProblem}`);
      continue;
    }
    const sessions = entry.blocksToRun.filter((block) => !block.skip).length;
    const requires = entry.config.requires ?? [];
    if (sessions > 0 && requires.length > 0) {
      const { pathEntries, cwd } = composeSessionEnvironment(entry.config, entry.filePath);
      targets.push({ filePath: entry.filePath, requires, pathEntries, cwd, sessions });
    }
  }

  const { resolutions, failures } = preflightRequires(targets);
  for (const failure of failures) {
    const searched = failure.searched.length > 0 ? failure.searched : ['(PATH is empty)'];
    problems.push(
      `required command '${failure.command}' not found for ${failure.filePath}\n` +
        `  searched:\n${searched.map((dir) => `    ${dir}`).join('\n')}`,
    );
  }

  if (problems.length > 0) {
    for (const problem of problems) {
      logError(problem);
    }
    // Parse errors are otherwise reported as each file is reached; nothing runs now.
    for (const entry of planned) {
      if (entry.parseError) {
        logError(entry.parseError.message);
      }
    }
    return false;
  }

  if (!quiet) {
    for (const r of resolutions) {
      console.error(
        colors.info(
          `resolved ${r.command} -> ${r.path} (${plural(r.files, 'file')}, ${plural(r.sessions, 'session')})`,
        ),
      );
    }
  }
  return true;
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

  const patterns = files.length > 0 ? files : (globalConfig.tests ?? ['**/*.tryscript.md']);
  const testFiles = await findTestFiles(patterns);

  if (testFiles.length === 0) {
    logError(`No test files matched: ${patterns.join(', ')} (working directory: ${process.cwd()})`);
    process.exit(1);
  }

  // Setup coverage if enabled
  let coverageCtx: ResolvedCoverageContext | undefined;
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

    // Parse every file before any session runs, so `requires:` can be checked for the
    // whole run up front. Each entry is reported in its original position below.
    const planned: PlannedFile[] = [];
    for (const filePath of testFiles) {
      const content = await readFile(filePath, 'utf-8');
      try {
        const testFile = parseTestFile(content, filePath);
        const config = mergeConfig(globalConfig, testFile.config);
        planned.push({
          filePath,
          testFile,
          config,
          blocksToRun: selectBlocks(testFile.blocks, opts.filter),
        });
      } catch (error) {
        // A malformed file is a failure of that file, not a crash of the whole run.
        if (error instanceof TestParseError) {
          planned.push({ filePath, parseError: error });
          continue;
        }
        throw error;
      }
    }

    if (!checkRequires(planned, loadedGlobalConfig, opts.quiet)) {
      process.exitCode = 1;
      return;
    }

    for (const entry of planned) {
      if (shouldStop) {
        break;
      }

      if (entry.parseError) {
        logError(entry.parseError.message);
        parseErrors++;
        if (opts.failFast) {
          break;
        }
        continue;
      }

      const { filePath, testFile, config, blocksToRun } = entry;

      for (const warning of testFile.configWarnings ?? []) {
        const warningPath = warning.path ? `:${warning.path}` : '';
        logWarn(`${filePath}${warningPath}: ${warning.message}`);
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
