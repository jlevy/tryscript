import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import treeKill from 'tree-kill';
import type { TestBlock, TestBlockResult } from './types.js';
import type { TryscriptConfig } from './config.js';

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT = 30_000;

/**
 * Execution context for a test file.
 * Created once per file, contains directory paths and config.
 */
export interface ExecutionContext {
  /** Temporary directory for this test file (resolved, no symlinks) */
  tempDir: string;
  /** Directory containing the test file */
  testDir: string;
  /** Working directory for command execution (defaults to testDir) */
  cwd: string;
  /** Resolved binary path (if bin config is set) */
  binPath: string;
  /** Command name alias for binPath (if binName config is set) */
  binName?: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Timeout per command */
  timeout: number;
}

/**
 * Resolve working directory based on config.
 * Default is test file directory; 'temp' uses temp directory.
 */
function resolveCwd(cwdConfig: string | undefined, testDir: string, tempDir: string): string {
  if (cwdConfig === 'temp') {
    return tempDir;
  }
  if (!cwdConfig || cwdConfig === '.') {
    return testDir;
  }
  // Relative paths resolved from test file directory
  return resolve(testDir, cwdConfig);
}

/**
 * Create an execution context for a test file.
 */
export async function createExecutionContext(
  config: TryscriptConfig,
  testFilePath: string,
): Promise<ExecutionContext> {
  // Create temp directory and resolve symlinks (e.g., /var -> /private/var on macOS)
  // This ensures [CWD] and [ROOT] patterns match pwd output
  const rawTempDir = await mkdtemp(join(tmpdir(), 'tryscript-'));
  const tempDir = await realpath(rawTempDir);

  // Resolve test file directory for portable test commands
  const testDir = resolve(dirname(testFilePath));

  // Resolve working directory (defaults to test file directory)
  const cwd = resolveCwd(config.cwd, testDir, tempDir);

  // Resolve binary path relative to test file directory
  let binPath = config.bin ?? '';
  if (binPath && !binPath.startsWith('/')) {
    binPath = join(testDir, binPath);
  }

  return {
    tempDir,
    testDir,
    cwd,
    binPath,
    binName: config.binName,
    env: {
      ...process.env,
      ...config.env,
      // Disable colors by default for deterministic output
      NO_COLOR: config.env?.NO_COLOR ?? '1',
      FORCE_COLOR: '0',
      // Provide test directory for portable test commands
      TRYSCRIPT_TEST_DIR: testDir,
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
 * Resolve binName alias in command if configured.
 * If command starts with binName, replace it with the resolved binPath.
 */
function resolveCommand(command: string, ctx: ExecutionContext): string {
  if (!ctx.binName || !ctx.binPath) {
    return command;
  }

  // Check if command starts with binName (as a complete word)
  const binNamePattern = new RegExp(`^${ctx.binName}(?:\\s|$)`);
  if (binNamePattern.test(command)) {
    return command.replace(ctx.binName, ctx.binPath);
  }
  return command;
}

/**
 * Execute a command and capture output.
 */
async function executeCommand(
  command: string,
  ctx: ExecutionContext,
): Promise<{ output: string; exitCode: number }> {
  // Resolve binName alias to binPath
  const resolvedCommand = resolveCommand(command, ctx);

  return new Promise((resolve, reject) => {
    const proc = spawn(resolvedCommand, {
      shell: true,
      cwd: ctx.cwd,
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
