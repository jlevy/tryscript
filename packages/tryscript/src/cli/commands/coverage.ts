/**
 * Coverage command - runs multiple commands with merged V8 coverage.
 *
 * This command provides a simple way to collect coverage from multiple sources
 * (e.g., unit tests + CLI tests) and generate a merged coverage report.
 *
 * Example usage:
 *   tryscript coverage "vitest run" "tryscript run tests/"
 *   tryscript coverage --monocart --reporters text,html "vitest run" "node dist/bin.mjs run tests/"
 */

import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { logError, logWarn, colors } from '../lib/shared.js';

interface CoverageOptions {
  reportsDir?: string;
  reporters?: string[];
  include?: string[];
  exclude?: string[];
  excludeNodeModules?: boolean;
  excludeAfterRemap?: boolean;
  skipFull?: boolean;
  allowExternal?: boolean;
  monocart?: boolean;
  src?: string;
  verbose?: boolean;
}

/**
 * Register the coverage command.
 */
export function registerCoverageCommand(program: Command): void {
  program
    .command('coverage')
    .description('Run commands with merged V8 coverage')
    .argument('<commands...>', 'Commands to run (each will inherit coverage environment)')
    .option('--reports-dir <dir>', 'Coverage output directory (default: coverage)')
    .option(
      '--reporters <reporters>',
      'Comma-separated coverage reporters (default: text,json,json-summary,lcov,html)',
    )
    .option('--include <patterns>', 'Comma-separated patterns to include in coverage')
    .option('--exclude <patterns>', 'Comma-separated patterns to exclude from coverage')
    .option('--exclude-node-modules', 'Exclude node_modules from coverage (default: true)', true)
    .option('--no-exclude-node-modules', 'Include node_modules in coverage')
    .option('--exclude-after-remap', 'Apply exclude logic after sourcemap remapping')
    .option('--skip-full', 'Hide files with 100% coverage')
    .option('--allow-external', 'Allow files from outside cwd')
    .option('--monocart', 'Use monocart for accurate line counts (recommended for merging)')
    .option('--src <dir>', 'Source directory for sourcemap remapping (default: src)')
    .option('--verbose', 'Show coverage summary after each command for debugging')
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
 * Find the c8 executable path.
 * Can be overridden via TRYSCRIPT_C8_COMMAND env var for testing.
 */
function findC8Path(): string | null {
  // Allow override for testing - when set, we trust it exists
  const override = process.env.TRYSCRIPT_C8_COMMAND;
  if (override) {
    return override;
  }

  const localPaths = [
    resolve(process.cwd(), 'node_modules', '.bin', 'c8'),
    resolve(process.cwd(), '..', '..', 'node_modules', '.bin', 'c8'),
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return localPath;
    }
  }

  return null;
}

/**
 * Get coverage file statistics from temp directory.
 */
async function getCoverageStats(
  tempDir: string,
): Promise<{ fileCount: number; totalBytes: number; files: string[] }> {
  try {
    const files = await readdir(tempDir);
    const coverageFiles = files.filter((f) => f.startsWith('coverage-') && f.endsWith('.json'));
    let totalBytes = 0;

    for (const file of coverageFiles) {
      const fileStat = await stat(join(tempDir, file));
      totalBytes += fileStat.size;
    }

    return { fileCount: coverageFiles.length, totalBytes, files: coverageFiles };
  } catch {
    return { fileCount: 0, totalBytes: 0, files: [] };
  }
}

/**
 * Generate a text-only coverage report for debugging (doesn't write files).
 */
async function generateTextReport(
  tempDir: string,
  options: CoverageOptions,
  label: string,
): Promise<void> {
  const c8Path = findC8Path();
  if (!c8Path) {
    return;
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

  await new Promise<void>((resolve) => {
    const proc = spawn(c8Path, reportArgs, {
      stdio: 'inherit',
      shell: false,
    });
    proc.on('close', () => {
      resolve();
    });
    proc.on('error', () => {
      resolve();
    });
  });

  // Cleanup temp reports dir
  await rm(tempReportsDir, { recursive: true, force: true });
}

/**
 * Generate c8 coverage report.
 */
async function generateReport(tempDir: string, options: CoverageOptions): Promise<boolean> {
  const c8Path = findC8Path();
  if (!c8Path) {
    logError('c8 not found. Install with: npm install -D c8');
    return false;
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

  return new Promise((resolve) => {
    const proc = spawn(c8Path, reportArgs, {
      stdio: 'inherit',
      shell: false,
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', (err) => {
      logError(`Failed to generate coverage report: ${err.message}`);
      resolve(false);
    });
  });
}

async function coverageCommand(commands: string[], options: CoverageOptions): Promise<void> {
  // Validate we have commands to run
  if (commands.length === 0) {
    logError('No commands specified. Usage: tryscript coverage "cmd1" "cmd2"');
    process.exit(1);
  }

  // Check for c8
  const c8Path = findC8Path();
  if (!c8Path) {
    logError('Coverage requires c8. Install with: npm install -D c8');
    process.exit(1);
  }

  // Parse comma-separated options early so we can use them for intermediate reports
  const parsedOptions: CoverageOptions = {
    ...options,
    reporters: options.reporters
      ? typeof options.reporters === 'string'
        ? (options.reporters as string).split(',')
        : options.reporters
      : undefined,
    include: options.include
      ? typeof options.include === 'string'
        ? (options.include as string).split(',')
        : options.include
      : undefined,
    exclude: options.exclude
      ? typeof options.exclude === 'string'
        ? (options.exclude as string).split(',')
        : options.exclude
      : undefined,
  };

  // Create temp directory for V8 coverage data
  const coverageTemp = await mkdtemp(join(tmpdir(), 'tryscript-coverage-'));
  const coverageEnv = { NODE_V8_COVERAGE: coverageTemp };

  console.error(colors.info(`Collecting V8 coverage to ${coverageTemp}`));

  let hasFailures = false;
  let previousFileCount = 0;

  try {
    // Run each command with shared coverage environment
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]!;
      console.error(
        colors.info(`\n=== Running command ${i + 1}/${commands.length}: ${command} ===`),
      );

      const result = await runCommand(command, coverageEnv);
      if (!result.success) {
        logWarn(`Command exited with code ${result.code}: ${command}`);
        hasFailures = true;
      }

      // Show coverage stats after each command
      const stats = await getCoverageStats(coverageTemp);
      const newFiles = stats.fileCount - previousFileCount;
      const bytesKB = (stats.totalBytes / 1024).toFixed(1);

      console.error(
        colors.info(
          `\nV8 coverage: ${stats.fileCount} files (${newFiles} new), ${bytesKB} KB total`,
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
    console.error(colors.info('\n=== Generating merged coverage report ==='));

    const reportSuccess = await generateReport(coverageTemp, parsedOptions);
    if (!reportSuccess) {
      logError('Failed to generate coverage report');
      process.exit(1);
    }

    console.error(
      colors.success(`\nCoverage report written to ${parsedOptions.reportsDir ?? 'coverage'}/`),
    );
  } finally {
    // Cleanup temp directory
    await rm(coverageTemp, { recursive: true, force: true });
  }

  // Exit with failure if any command failed
  if (hasFailures) {
    process.exit(1);
  }
}
