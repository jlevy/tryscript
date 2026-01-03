import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import treeKill from 'tree-kill';
import type { TestBlock, TestBlockResult } from './types.js';
import type { TryscriptConfig, Fixture } from './config.js';

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
  /** Working directory for command execution */
  cwd: string;
  /** Whether running in sandbox mode */
  sandbox: boolean;
  /** Environment variables */
  env: Record<string, string>;
  /** Timeout per command */
  timeout: number;
  /** Before hook script */
  before?: string;
  /** After hook script */
  after?: string;
  /** Whether before hook has been run */
  beforeRan?: boolean;
}

/**
 * Normalize fixture config to Fixture object.
 */
function normalizeFixture(fixture: string | Fixture): Fixture {
  if (typeof fixture === 'string') {
    return { source: fixture };
  }
  return fixture;
}

/**
 * Setup fixtures by copying files to sandbox directory.
 */
async function setupFixtures(
  fixtures: (string | Fixture)[] | undefined,
  testDir: string,
  sandboxDir: string,
): Promise<void> {
  if (!fixtures || fixtures.length === 0) {
    return;
  }

  for (const f of fixtures) {
    const fixture = normalizeFixture(f);
    const src = resolve(testDir, fixture.source);
    const destName = fixture.dest ?? basename(fixture.source);
    const dst = resolve(sandboxDir, destName);
    await cp(src, dst, { recursive: true });
  }
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

  // Determine working directory based on sandbox config
  let cwd: string;
  let sandbox = false;

  if (config.sandbox === true) {
    // Empty sandbox: run in temp directory
    cwd = tempDir;
    sandbox = true;
  } else if (typeof config.sandbox === 'string') {
    // Copy directory to sandbox: copy source to temp, run in temp
    const srcPath = resolve(testDir, config.sandbox);
    await cp(srcPath, tempDir, { recursive: true });
    cwd = tempDir;
    sandbox = true;
  } else if (config.cwd) {
    // Run in specified directory (relative to test file)
    cwd = resolve(testDir, config.cwd);
  } else {
    // Default: run in test file directory
    cwd = testDir;
  }

  // Copy additional fixtures to sandbox (only if sandbox enabled)
  if (sandbox && config.fixtures) {
    await setupFixtures(config.fixtures, testDir, tempDir);
  }

  const ctx: ExecutionContext = {
    tempDir,
    testDir,
    cwd,
    sandbox,
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
    before: config.before,
    after: config.after,
  };

  return ctx;
}

/**
 * Clean up execution context (remove temp directory).
 */
export async function cleanupExecutionContext(ctx: ExecutionContext): Promise<void> {
  await rm(ctx.tempDir, { recursive: true, force: true });
}

/**
 * Run the before hook if it hasn't run yet.
 */
export async function runBeforeHook(ctx: ExecutionContext): Promise<void> {
  if (ctx.before && !ctx.beforeRan) {
    ctx.beforeRan = true;
    await executeCommand(ctx.before, ctx);
  }
}

/**
 * Run the after hook.
 */
export async function runAfterHook(ctx: ExecutionContext): Promise<void> {
  if (ctx.after) {
    await executeCommand(ctx.after, ctx);
  }
}

/**
 * Run a single test block and return the result.
 */
export async function runBlock(block: TestBlock, ctx: ExecutionContext): Promise<TestBlockResult> {
  const startTime = Date.now();

  // Handle skip annotation
  if (block.skip) {
    return {
      block,
      passed: true,
      actualOutput: '',
      actualExitCode: 0,
      duration: 0,
      skipped: true,
    };
  }

  try {
    // Run before hook if this is the first test
    await runBeforeHook(ctx);

    // Execute command directly (shell handles $VAR expansion)
    const { output, stdout, stderr, exitCode } = await executeCommand(block.command, ctx);

    const duration = Date.now() - startTime;

    return {
      block,
      passed: true, // Matching handled separately
      actualOutput: output,
      actualStdout: stdout,
      actualStderr: stderr,
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

/** Command execution result with separate stdout/stderr */
interface CommandResult {
  output: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a command and capture output.
 */
async function executeCommand(command: string, ctx: ExecutionContext): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, {
      shell: true,
      cwd: ctx.cwd,
      env: ctx.env as NodeJS.ProcessEnv,
      // Pipe both to capture
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const combinedChunks: { data: Buffer; type: 'stdout' | 'stderr' }[] = [];
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    // Capture data as it comes in to preserve order
    proc.stdout.on('data', (data: Buffer) => {
      combinedChunks.push({ data, type: 'stdout' });
      stdoutChunks.push(data);
    });
    proc.stderr.on('data', (data: Buffer) => {
      combinedChunks.push({ data, type: 'stderr' });
      stderrChunks.push(data);
    });

    const timeoutId = setTimeout(() => {
      if (proc.pid) {
        treeKill(proc.pid, 'SIGKILL');
      }
      reject(new Error(`Command timed out after ${ctx.timeout}ms`));
    }, ctx.timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const output = Buffer.concat(combinedChunks.map((c) => c.data)).toString('utf-8');
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      resolve({
        output,
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}
