#!/usr/bin/env tsx
// Combined coverage collection from unit tests and golden tests.
//
// This script demonstrates using tryscript's `coverage` command to merge
// coverage from multiple sources (vitest unit tests + tryscript CLI tests).
//
// Usage: pnpm tsx scripts/coverage.ts [--text-only]

import { spawn } from 'node:child_process';

const textOnly = process.argv.includes('--text-only');

async function main(): Promise<void> {
  const reporters = textOnly ? 'text' : 'text,json,json-summary,lcov,html';

  // Use tryscript's coverage command to merge vitest + golden tests
  const args = [
    'dist/bin.mjs',
    'coverage',
    '--monocart',
    '--reporters',
    reporters,
    // Commands to run with merged coverage
    'pnpm vitest run',
    'node dist/bin.mjs run tests/**/*.tryscript.md',
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn('node', args, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Coverage failed with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run coverage: ${err.message}`));
    });
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
