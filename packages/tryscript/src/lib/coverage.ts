/**
 * Coverage collection for CLI subprocess testing.
 *
 * Uses c8 and NODE_V8_COVERAGE to collect coverage from spawned processes.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { CoverageContext, CoverageConfig } from './types.js';
import { resolveCoverageConfig } from './config.js';
import {
  readLcovFile,
  mergeLcov,
  writeLcovFile,
  lcovToJsonSummary,
  writeJsonSummary,
} from './lcov.js';

/**
 * Find the c8 executable path.
 * Checks local node_modules/.bin first, then falls back to npx.
 */
function findC8Path(): string {
  // Check common locations for local c8
  const localPaths = [
    resolve(process.cwd(), 'node_modules', '.bin', 'c8'),
    resolve(process.cwd(), '..', '..', 'node_modules', '.bin', 'c8'), // monorepo root
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return localPath;
    }
  }

  // Fall back to npx which will find c8 in node_modules
  return 'npx c8';
}

/**
 * Check if c8 is available in the current environment.
 */
export async function isC8Available(): Promise<boolean> {
  const c8Path = findC8Path();

  return new Promise((resolve) => {
    // Use npx to run c8 if we fell back to npx
    const isNpx = c8Path === 'npx c8';
    const command = isNpx ? 'npx' : c8Path;
    const args = isNpx ? ['c8', '--version'] : ['--version'];

    const proc = spawn(command, args, {
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
  const c8Path = findC8Path();

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

  // Handle 'npx c8' vs direct c8 path
  // Use shell: false to prevent glob expansion of patterns like dist/**
  const isNpx = c8Path === 'npx c8';
  const command = isNpx ? 'npx' : c8Path;
  const args = isNpx ? ['c8', ...reportArgs] : reportArgs;

  await new Promise<void>((resolvePromise, reject) => {
    const proc = spawn(command, args, {
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
      reject(new Error(`Failed to run c8 report: ${err.message}`));
    });
  });
}

/**
 * Clean up coverage context by removing the temporary directory.
 */
export async function cleanupCoverageContext(ctx: CoverageContext): Promise<void> {
  try {
    await access(ctx.tempDir);
    await rm(ctx.tempDir, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist, nothing to clean up
  }
}

/**
 * Merge external LCOV file with generated coverage.
 * Reads the generated lcov.info, merges with external LCOV, and writes back.
 * Also generates coverage-summary.json for badge generation.
 *
 * @returns Object with merged coverage percentages, or null if merge failed
 */
export function mergeExternalCoverage(
  reportsDir: string,
  externalLcovPath: string,
): { lines: number; functions: number } | null {
  const generatedLcovPath = join(reportsDir, 'lcov.info');

  if (!existsSync(externalLcovPath)) {
    console.error(`External LCOV file not found: ${externalLcovPath}`);
    return null;
  }

  if (!existsSync(generatedLcovPath)) {
    console.error(`Generated LCOV file not found: ${generatedLcovPath}`);
    console.error('Make sure "lcov" is included in reporters');
    return null;
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
