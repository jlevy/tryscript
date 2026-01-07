#!/usr/bin/env tsx
// Combined coverage collection from unit tests and golden tests.
//
// This script merges coverage from two sources:
// - Unit tests: vitest runs directly with V8 coverage
// - Golden tests: tryscript spawns CLI subprocesses that write V8 coverage
//
// Both write to the same NODE_V8_COVERAGE directory, then c8 merges them.
//
// NOTE: For standalone tryscript coverage (no merging), use:
//   tryscript run --coverage 'tests/**/*.tryscript.md'
//
// Usage: pnpm tsx scripts/coverage.ts [--text-only]

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

const textOnly = process.argv.includes('--text-only');

// Run a command with inherited stdio and coverage environment.
async function run(command: string, args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      shell: false,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run ${command}: ${err.message}`));
    });
  });
}

// Find the c8 executable path.
function findC8Path(): string {
  const localPaths = [
    resolve(process.cwd(), 'node_modules', '.bin', 'c8'),
    resolve(process.cwd(), '..', '..', 'node_modules', '.bin', 'c8'),
  ];

  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return localPath;
    }
  }

  throw new Error('c8 not found. Install with: npm install -D c8');
}

async function main(): Promise<void> {
  // Create temp directory for V8 coverage data
  const coverageTemp = await mkdtemp(join(tmpdir(), 'tryscript-coverage-'));
  const coverageEnv = { NODE_V8_COVERAGE: coverageTemp };

  console.log(`Collecting V8 coverage to ${coverageTemp}`);

  try {
    // Run unit tests with vitest (no --coverage flag, raw V8 collection)
    console.log('\n=== Running unit tests ===');
    await run('pnpm', ['vitest', 'run'], coverageEnv);

    // Run golden tests (tryscript spawns CLI subprocesses that inherit NODE_V8_COVERAGE)
    console.log('\n=== Running golden tests ===');
    await run('node', ['dist/bin.mjs', 'run', 'tests/**/*.tryscript.md'], coverageEnv);

    // Build c8 report arguments
    const reporters = textOnly ? ['text'] : ['text', 'json', 'json-summary', 'lcov', 'html'];

    const c8Path = findC8Path();
    const reportArgs = [
      'report',
      '--temp-directory',
      coverageTemp,
      '--reports-dir',
      'coverage',
      '--src',
      'src',
      '--all',
      '--include',
      'dist/**',
      '--exclude-node-modules',
      '--experimental-monocart',
      ...reporters.flatMap((r) => ['--reporter', r]),
    ];

    // Generate combined coverage report
    console.log('\n=== Generating combined coverage report ===');
    await run(c8Path, reportArgs, {});

    console.log('\nCoverage report written to coverage/');
  } finally {
    // Cleanup temp directory
    await rm(coverageTemp, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
