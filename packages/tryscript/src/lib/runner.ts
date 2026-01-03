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
  /** Working directory for command execution (defaults to testDir) */
  cwd: string;
  /** Resolved binary path (if bin config is set) */
  binPath: string;
  /** Command name alias for binPath (if binName config is set) */
  binName?: string;
  /** User-defined variables plus built-ins ($TEMP, $ROOT, $CWD) */
  vars: Record<string, string>;
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
 * Expand $VAR references in text using provided variables.
 * Built-in variables: $TEMP, $ROOT, $CWD
 * Unknown variables are left unexpanded.
 */
export function expandVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\$(\w+)/g, (match, name: string) => {
    return vars[name] ?? match;
  });
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
 * Setup fixtures by copying files to temp directory.
 */
async function setupFixtures(
  fixtures: (string | Fixture)[] | undefined,
  ctx: ExecutionContext,
): Promise<void> {
  if (!fixtures || fixtures.length === 0) {
    return;
  }

  for (const f of fixtures) {
    const fixture = normalizeFixture(f);
    const expandedSource = expandVars(fixture.source, ctx.vars);
    const src = resolve(ctx.testDir, expandedSource);
    const destName = fixture.dest ? expandVars(fixture.dest, ctx.vars) : basename(expandedSource);
    const dst = resolve(ctx.tempDir, destName);
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

  // Resolve working directory (defaults to test file directory)
  const cwd = resolveCwd(config.cwd, testDir, tempDir);

  // Resolve binary path relative to test file directory
  let binPath = config.bin ?? '';
  if (binPath && !binPath.startsWith('/')) {
    binPath = join(testDir, binPath);
  }

  // Build variables with built-ins and user-defined
  const vars: Record<string, string> = {
    TEMP: tempDir,
    ROOT: testDir,
    CWD: cwd,
    ...config.vars,
  };

  const ctx: ExecutionContext = {
    tempDir,
    testDir,
    cwd,
    binPath,
    binName: config.binName,
    vars,
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

  // Setup fixtures
  await setupFixtures(config.fixtures, ctx);

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
    const expandedHook = expandVars(ctx.before, ctx.vars);
    await executeCommand(expandedHook, ctx);
  }
}

/**
 * Run the after hook.
 */
export async function runAfterHook(ctx: ExecutionContext): Promise<void> {
  if (ctx.after) {
    const expandedHook = expandVars(ctx.after, ctx.vars);
    await executeCommand(expandedHook, ctx);
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

    // Expand variables in command
    const expandedCommand = expandVars(block.command, ctx.vars);
    const { output, stdout, stderr, exitCode } = await executeCommand(expandedCommand, ctx);

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
