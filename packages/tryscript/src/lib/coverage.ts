/**
 * Coverage collection for CLI subprocess testing.
 *
 * Uses c8 and NODE_V8_COVERAGE to collect coverage from spawned processes.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CoverageContext, CoverageConfig } from './types.js';
import { resolveCoverageConfig } from './config.js';

/**
 * Check if c8 is available in the current environment.
 */
export async function isC8Available(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('c8', ['--version'], {
      shell: true,
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
 */
export async function generateCoverageReport(ctx: CoverageContext): Promise<void> {
  const { options, tempDir } = ctx;

  const args = [
    'report',
    '--temp-directory',
    tempDir,
    '--reports-dir',
    options.reportsDir,
    '--src',
    options.src,
    '--all',
    ...options.include.flatMap((pattern) => ['--include', pattern]),
    ...options.reporters.flatMap((reporter) => ['--reporter', reporter]),
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('c8', args, {
      shell: true,
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
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
