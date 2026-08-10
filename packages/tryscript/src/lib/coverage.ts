/**
 * Coverage collection for CLI subprocess testing.
 *
 * Uses c8 and NODE_V8_COVERAGE to collect coverage from spawned processes.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { CoverageContext, CoverageConfig } from './types.js';
import { resolveCoverageConfig } from './config.js';
import {
  readLcovFile,
  mergeLcov,
  writeLcovFile,
  lcovToJsonSummary,
  writeJsonSummary,
} from './lcov.js';

export interface C8Command {
  command: string;
  argsPrefix: readonly string[];
}

const requireFromCoverage = createRequire(import.meta.url);

/** Resolve an installed c8 command without invoking a download-capable runner. */
export function resolveC8Command(): C8Command | null {
  const override = process.env.TRYSCRIPT_C8_COMMAND;
  if (override) {
    return { command: override, argsPrefix: [] };
  }

  const localPaths = [
    resolve(process.cwd(), 'node_modules', 'c8', 'bin', 'c8.js'),
    resolve(process.cwd(), '..', '..', 'node_modules', 'c8', 'bin', 'c8.js'),
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return { command: process.execPath, argsPrefix: [localPath] };
    }
  }

  try {
    const c8EntryPoint = requireFromCoverage.resolve('c8/bin/c8.js');
    return { command: process.execPath, argsPrefix: [c8EntryPoint] };
  } catch {
    return null;
  }
}

/**
 * Check if c8 is available in the current environment.
 */
export async function isC8Available(): Promise<boolean> {
  const c8 = resolveC8Command();
  if (!c8) {
    return false;
  }

  return new Promise((resolve) => {
    const proc = spawn(c8.command, [...c8.argsPrefix, '--version'], {
      shell: false,
      stdio: 'ignore',
    });
    proc.on('close', (code) => {
      resolve(code === 0);
    });
    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Create a coverage context for collecting V8 coverage data.
 */
export async function createCoverageContext(config?: CoverageConfig): Promise<CoverageContext> {
  const options = resolveCoverageConfig(config);
  const tempDir = await mkdtemp(join(tmpdir(), 'tryscript-coverage-'));

  return {
    tempDir,
    options,
  };
}

/**
 * Get environment variables for enabling V8 coverage in spawned processes.
 */
export function getCoverageEnv(ctx: CoverageContext): Record<string, string> {
  return {
    NODE_V8_COVERAGE: ctx.tempDir,
  };
}

/**
 * Generate coverage report from collected V8 coverage data using c8.
 * Throws an error if coverage report generation fails.
 */
export async function generateCoverageReport(ctx: CoverageContext): Promise<void> {
  const { options, tempDir } = ctx;
  const c8 = resolveC8Command();
  if (!c8) {
    throw new Error('Coverage requires the optional c8 package. Install it with: pnpm add -D c8');
  }

  // Base args for c8 report
  const reportArgs = [
    'report',
    '--temp-directory',
    tempDir,
    '--reports-dir',
    options.reportsDir,
    '--src',
    options.src,
    '--all',
    // Include patterns
    ...options.include.flatMap((pattern) => ['--include', pattern]),
    // Exclude patterns
    ...options.exclude.flatMap((pattern) => ['--exclude', pattern]),
    // Boolean flags (only add if explicitly set)
    ...(options.excludeNodeModules ? ['--exclude-node-modules'] : ['--no-exclude-node-modules']),
    ...(options.excludeAfterRemap ? ['--exclude-after-remap'] : []),
    ...(options.skipFull ? ['--skip-full'] : []),
    ...(options.allowExternal ? ['--allowExternal'] : []),
    ...(options.monocart ? ['--experimental-monocart'] : []),
    // Reporters
    ...options.reporters.flatMap((reporter) => ['--reporter', reporter]),
  ];

  // Use shell: false to prevent glob expansion of patterns like dist/**
  await new Promise<void>((resolvePromise, reject) => {
    const proc = spawn(c8.command, [...c8.argsPrefix, ...reportArgs], {
      shell: false,
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`c8 report exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run c8 report: ${err.message}`, { cause: err }));
    });
  });
}

/**
 * Clean up coverage context by removing the temporary directory.
 */
export async function cleanupCoverageContext(ctx: CoverageContext): Promise<void> {
  // `force` handles an already-absent path. Other filesystem failures must propagate;
  // reporting success while sensitive execution data remains would be misleading.
  await rm(ctx.tempDir, { recursive: true, force: true });
}

/**
 * Merge external LCOV file with generated coverage.
 * Reads the generated lcov.info, merges with external LCOV, and writes back.
 * Also generates coverage-summary.json for badge generation.
 *
 * @returns Merged line and function coverage percentages
 * @throws {Error} if either input is missing or the merge cannot be written
 */
export function mergeExternalCoverage(
  reportsDir: string,
  externalLcovPath: string,
): { lines: number; functions: number } {
  const generatedLcovPath = join(reportsDir, 'lcov.info');

  if (!existsSync(externalLcovPath)) {
    throw new Error(`External LCOV file not found: ${externalLcovPath}`);
  }

  if (!existsSync(generatedLcovPath)) {
    throw new Error(
      `Generated LCOV file not found: ${generatedLcovPath}. ` +
        'Make sure "lcov" is included in reporters.',
    );
  }

  // Read and merge LCOV files
  const externalLcov = readLcovFile(externalLcovPath);
  const generatedLcov = readLcovFile(generatedLcovPath);
  const mergedLcov = mergeLcov(externalLcov, generatedLcov);

  // Write merged LCOV
  writeLcovFile(generatedLcovPath, mergedLcov);

  // Write JSON summary from merged data
  const summary = lcovToJsonSummary(mergedLcov);
  writeJsonSummary(join(reportsDir, 'coverage-summary.json'), summary);

  return {
    lines: summary.total.lines.pct,
    functions: summary.total.functions.pct,
  };
}
