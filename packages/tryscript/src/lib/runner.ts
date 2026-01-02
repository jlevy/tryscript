import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import treeKill from 'tree-kill';
import type { TestBlock, TestBlockResult } from './types.js';
import type { TryscriptConfig } from './config.js';

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT = 30_000;

/**
 * Execution context for a test file.
 * Created once per file, contains the temp directory.
 */
export interface ExecutionContext {
  /** Temporary directory for this test file */
  tempDir: string;
  /** Resolved binary path */
  binPath: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Timeout per command */
  timeout: number;
}

/**
 * Create an execution context for a test file.
 */
export async function createExecutionContext(
  config: TryscriptConfig,
  testFilePath: string,
): Promise<ExecutionContext> {
  const tempDir = await mkdtemp(join(tmpdir(), 'tryscript-'));

  // Resolve binary path relative to test file directory
  let binPath = config.bin ?? '';
  if (binPath && !binPath.startsWith('/')) {
    binPath = join(dirname(testFilePath), binPath);
  }

  return {
    tempDir,
    binPath,
    env: {
      ...process.env,
      ...config.env,
      // Disable colors by default for deterministic output
      NO_COLOR: config.env?.NO_COLOR ?? '1',
      FORCE_COLOR: '0',
    } as Record<string, string>,
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
  };
}

/**
 * Clean up execution context (remove temp directory).
 */
export async function cleanupExecutionContext(ctx: ExecutionContext): Promise<void> {
  await rm(ctx.tempDir, { recursive: true, force: true });
}

/**
 * Run a single test block and return the result.
 */
export async function runBlock(block: TestBlock, ctx: ExecutionContext): Promise<TestBlockResult> {
  const startTime = Date.now();

  try {
    const { output, exitCode } = await executeCommand(block.command, ctx);

    const duration = Date.now() - startTime;

    return {
      block,
      passed: true, // Matching handled separately
      actualOutput: output,
      actualExitCode: exitCode,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    return {
      block,
      passed: false,
      actualOutput: '',
      actualExitCode: -1,
      duration,
      error: message,
    };
  }
}

/**
 * Execute a command and capture output.
 */
async function executeCommand(
  command: string,
  ctx: ExecutionContext,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, {
      shell: true,
      cwd: ctx.tempDir,
      env: ctx.env as NodeJS.ProcessEnv,
      // Pipe both to capture
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];

    // Capture data as it comes in to preserve order
    proc.stdout.on('data', (data: Buffer) => chunks.push(data));
    proc.stderr.on('data', (data: Buffer) => chunks.push(data));

    const timeoutId = setTimeout(() => {
      if (proc.pid) {
        treeKill(proc.pid, 'SIGKILL');
      }
      reject(new Error(`Command timed out after ${ctx.timeout}ms`));
    }, ctx.timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const output = Buffer.concat(chunks).toString('utf-8');
      resolve({
        output,
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}
