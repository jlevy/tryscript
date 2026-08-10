/**
 * Coverage command - runs multiple commands with merged V8 coverage.
 *
 * This command provides a simple way to collect coverage from multiple sources
 * (e.g., unit tests + CLI tests) and generate a merged coverage report.
 *
 * Example usage:
 *   tryscript coverage "vitest run" "tryscript run 'tests/*.tryscript.md'"
 *   tryscript coverage --monocart --reporters text,html "vitest run" "node dist/bin.mjs run 'tests/*.tryscript.md'"
 */

import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logError, logWarn, colors } from '../lib/shared.js';
import { resolveC8Command, mergeExternalCoverage } from '../../lib/coverage.js';
import type { CoverageConfig } from '../../lib/types.js';

type CoverageOptions = CoverageConfig & {
  verbose?: boolean;
};

const BYTES_PER_KIBIBYTE = 1024;

type CoverageCommandOptions = Omit<CoverageOptions, 'reporters' | 'include' | 'exclude'> & {
  reporters?: string | string[];
  include?: string | string[];
  exclude?: string | string[];
};

function parseCommaSeparated(values: string | string[] | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined;
  }
  const parsed = (typeof values === 'string' ? values.split(',') : values)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return parsed;
}

/**
 * Register the coverage command.
 */
export function registerCoverageCommand(program: Command): void {
  program
    .command('coverage')
    .description('Collect merged V8 coverage from one or more commands')
    .argument('<commands...>', 'Quoted shell commands to run with NODE_V8_COVERAGE')
    .option('--reports-dir <dir>', 'Coverage output directory (default: coverage)')
    .option(
      '--reporters <reporters>',
      'Comma-separated reporters (default: text,json,json-summary,lcov,html)',
    )
    .option('--include <patterns>', 'Comma-separated glob patterns to include')
    .option('--exclude <patterns>', 'Comma-separated glob patterns to exclude')
    .option('--exclude-node-modules', 'Exclude node_modules from coverage', true)
    .option('--no-exclude-node-modules', 'Include node_modules in coverage')
    .option('--exclude-after-remap', 'Apply exclude logic after sourcemap remapping')
    .option('--skip-full', 'Hide files with 100% coverage')
    .option('--allow-external', 'Include files outside the working directory')
    .option('--monocart', 'Use monocart AST-aware line counts when merging reports')
    .option('--src <dir>', 'Source directory for sourcemap remapping (default: src)')
    .option('--verbose', 'Show coverage summary after each command for debugging')
    .option('--merge-lcov <path>', 'Merge an existing LCOV file into the generated report')
    .action(coverageCommand);
}

/**
 * Run a command with inherited coverage environment.
 */
async function runCommand(
  command: string,
  env: Record<string, string>,
): Promise<{ success: boolean; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, [], {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      shell: true,
    });

    proc.on('close', (code) => {
      resolve({ success: code === 0, code: code ?? 1 });
    });

    proc.on('error', (err) => {
      logError(`Failed to run command: ${err.message}`);
      resolve({ success: false, code: 1 });
    });
  });
}

/**
 * Get coverage file statistics from temp directory.
 */
async function getCoverageStats(
  tempDir: string,
): Promise<{ fileCount: number; totalBytes: number }> {
  const files = await readdir(tempDir);
  const coverageFiles = files.filter(
    (file) => file.startsWith('coverage-') && file.endsWith('.json'),
  );
  let totalBytes = 0;

  for (const file of coverageFiles) {
    const fileStat = await stat(join(tempDir, file));
    totalBytes += fileStat.size;
  }

  return { fileCount: coverageFiles.length, totalBytes };
}

/**
 * Generate a text-only coverage report for debugging (doesn't write files).
 */
async function generateTextReport(
  tempDir: string,
  options: CoverageOptions,
  label: string,
): Promise<void> {
  const c8 = resolveC8Command();
  if (!c8) {
    throw new Error('Coverage requires the optional c8 package. Install it with: pnpm add -D c8');
  }

  const include = options.include ?? ['dist/**'];
  const exclude = options.exclude ?? [];

  // Create a temporary reports dir that we'll discard
  const tempReportsDir = await mkdtemp(join(tmpdir(), 'tryscript-coverage-report-'));

  const reportArgs = [
    'report',
    '--temp-directory',
    tempDir,
    '--reports-dir',
    tempReportsDir,
    '--src',
    options.src ?? 'src',
    '--all',
    ...include.flatMap((pattern) => ['--include', pattern]),
    ...exclude.flatMap((pattern) => ['--exclude', pattern]),
    ...(options.excludeNodeModules !== false
      ? ['--exclude-node-modules']
      : ['--no-exclude-node-modules']),
    ...(options.excludeAfterRemap ? ['--exclude-after-remap'] : []),
    ...(options.monocart ? ['--experimental-monocart'] : []),
    '--reporter',
    'text',
  ];

  console.error(colors.info(`\n--- Coverage after: ${label} ---`));

  try {
    await new Promise<void>((resolvePromise, reject) => {
      const proc = spawn(c8.command, [...c8.argsPrefix, ...reportArgs], {
        stdio: 'inherit',
        shell: false,
      });
      proc.on('close', (code) => {
        if (code === 0) {
          resolvePromise();
          return;
        }
        reject(new Error(`c8 text report exited with code ${String(code)}`));
      });
      proc.on('error', (error) => {
        reject(new Error(`Failed to run c8 text report: ${error.message}`, { cause: error }));
      });
    });
  } finally {
    await rm(tempReportsDir, { recursive: true, force: true });
  }
}

/**
 * Generate c8 coverage report.
 */
async function generateReport(tempDir: string, options: CoverageOptions): Promise<void> {
  const c8 = resolveC8Command();
  if (!c8) {
    throw new Error('Coverage requires the optional c8 package. Install it with: pnpm add -D c8');
  }

  const reporters = options.reporters ?? ['text', 'json', 'json-summary', 'lcov', 'html'];
  const include = options.include ?? ['dist/**'];
  const exclude = options.exclude ?? [];

  const reportArgs = [
    'report',
    '--temp-directory',
    tempDir,
    '--reports-dir',
    options.reportsDir ?? 'coverage',
    '--src',
    options.src ?? 'src',
    '--all',
    ...include.flatMap((pattern) => ['--include', pattern]),
    ...exclude.flatMap((pattern) => ['--exclude', pattern]),
    ...(options.excludeNodeModules !== false
      ? ['--exclude-node-modules']
      : ['--no-exclude-node-modules']),
    ...(options.excludeAfterRemap ? ['--exclude-after-remap'] : []),
    ...(options.skipFull ? ['--skip-full'] : []),
    ...(options.allowExternal ? ['--allowExternal'] : []),
    ...(options.monocart ? ['--experimental-monocart'] : []),
    ...reporters.flatMap((reporter) => ['--reporter', reporter]),
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(c8.command, [...c8.argsPrefix, ...reportArgs], {
      stdio: 'inherit',
      shell: false,
    });

    proc.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal === null
            ? `c8 report exited with code ${String(code)}`
            : `c8 report terminated by ${signal}`,
        ),
      );
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to generate coverage report: ${err.message}`, { cause: err }));
    });
  });
}

async function coverageCommand(commands: string[], options: CoverageCommandOptions): Promise<void> {
  // Validate we have commands to run
  if (commands.length === 0) {
    logError('No commands specified. Usage: tryscript coverage "cmd1" "cmd2"');
    process.exit(1);
  }

  // Check for c8
  const c8 = resolveC8Command();
  if (!c8) {
    logError('Coverage requires the optional c8 package. Install it with: pnpm add -D c8');
    process.exit(1);
  }

  // Parse comma-separated options early so we can use them for intermediate reports
  const { reporters, include, exclude, ...otherOptions } = options;
  let parsedReporters = parseCommaSeparated(reporters);
  if (
    otherOptions.mergeLcov !== undefined &&
    parsedReporters !== undefined &&
    !parsedReporters.includes('lcov')
  ) {
    parsedReporters = [...parsedReporters, 'lcov'];
  }
  const parsedOptions: CoverageOptions = {
    ...otherOptions,
    ...(parsedReporters === undefined ? {} : { reporters: parsedReporters }),
    ...(include === undefined ? {} : { include: parseCommaSeparated(include) ?? [] }),
    ...(exclude === undefined ? {} : { exclude: parseCommaSeparated(exclude) ?? [] }),
  };

  // Create temp directory for V8 coverage data
  const coverageTemp = await mkdtemp(join(tmpdir(), 'tryscript-coverage-'));
  const coverageEnv = { NODE_V8_COVERAGE: coverageTemp };

  console.error(colors.info(`Collecting V8 coverage to ${coverageTemp}`));

  let hasFailures = false;
  let previousFileCount = 0;

  try {
    // Run each command with shared coverage environment
    for (const [index, command] of commands.entries()) {
      console.error(
        colors.info(`\n=== Running command ${index + 1}/${commands.length}: ${command} ===`),
      );

      const result = await runCommand(command, coverageEnv);
      if (!result.success) {
        logWarn(`Command exited with code ${result.code}: ${command}`);
        hasFailures = true;
      }

      // Show coverage stats after each command
      const stats = await getCoverageStats(coverageTemp);
      const newFiles = stats.fileCount - previousFileCount;
      const bytesKiB = (stats.totalBytes / BYTES_PER_KIBIBYTE).toFixed(1);

      console.error(
        colors.info(
          `\nV8 coverage: ${stats.fileCount} files (${newFiles} new), ${bytesKiB} KiB total`,
        ),
      );

      if (newFiles === 0) {
        logWarn(
          `No new coverage files from this command. ` +
            `This may indicate the command doesn't write to NODE_V8_COVERAGE.`,
        );
      }

      // Show intermediate coverage report if verbose
      if (parsedOptions.verbose && stats.fileCount > 0) {
        await generateTextReport(coverageTemp, parsedOptions, command);
      }

      previousFileCount = stats.fileCount;
    }

    // Generate merged coverage report
    console.error(colors.info('\n=== Generating coverage report ==='));

    try {
      await generateReport(coverageTemp, parsedOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logError(`Failed to generate coverage report: ${message}`);
      process.exitCode = 1;
      return;
    }

    const reportsDir = parsedOptions.reportsDir ?? 'coverage';

    // If --merge-lcov is specified, merge with external LCOV and rewrite outputs
    if (parsedOptions.mergeLcov) {
      const externalLcovPath = parsedOptions.mergeLcov;

      console.error(colors.info(`\nMerging with external coverage: ${externalLcovPath}`));
      let merged: { lines: number; functions: number };
      try {
        merged = mergeExternalCoverage(reportsDir, externalLcovPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError(`Failed to merge external coverage: ${message}`);
        process.exitCode = 1;
        return;
      }

      console.error(
        colors.success(`\nMerged coverage: ${merged.lines}% lines, ${merged.functions}% functions`),
      );
    }

    console.error(colors.success(`\nCoverage report written to ${reportsDir}/`));
  } finally {
    // Cleanup temp directory
    await rm(coverageTemp, { recursive: true, force: true });
  }

  // Exit with failure if any command failed
  if (hasFailures) {
    process.exitCode = 1;
  }
}
