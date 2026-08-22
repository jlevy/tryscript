import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm, cp, lstat } from 'node:fs/promises';
import { constants as osConstants, tmpdir } from 'node:os';
import { join, dirname, resolve, basename, delimiter, isAbsolute, relative, sep } from 'node:path';
import treeKill from 'tree-kill';
import type { TestBlock, TestBlockResult } from './types.js';
import type { Fixture } from './types.js';
import type { TryscriptConfig } from './config.js';
import { findPackageJson, findGitRoot } from './package-bin.js';
import { createEnvExpander } from './env-vars.js';

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT = 30_000;
/** Sentinel used when a command could not produce an exit status. */
const EXECUTION_ERROR_EXIT_CODE = -1;

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
  /** Failure from the first before-hook attempt; prevents later blocks from running */
  beforeError?: Error;
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

/** Resolve a fixture destination without allowing writes outside the sandbox. */
function resolveFixtureDestination(sandboxDir: string, destination: string): string {
  const resolvedDestination = resolve(sandboxDir, destination);
  const relativeDestination = relative(sandboxDir, resolvedDestination);
  const escapesSandbox =
    relativeDestination === '..' ||
    relativeDestination.startsWith(`..${sep}`) ||
    isAbsolute(relativeDestination);

  if (escapesSandbox) {
    throw new Error(`Fixture destination must stay inside the sandbox: ${destination}`);
  }

  return resolvedDestination;
}

/** Reject destination paths that escape through a symlink already in the sandbox. */
async function assertFixtureDestinationHasNoSymlinks(
  sandboxDir: string,
  resolvedDestination: string,
): Promise<void> {
  const relativeDestination = relative(sandboxDir, resolvedDestination);
  let currentPath = sandboxDir;

  for (const component of relativeDestination.split(sep).filter(Boolean)) {
    currentPath = join(currentPath, component);
    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error(`Fixture destination traverses a symbolic link: ${relativeDestination}`);
      }
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }
  }
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
    const dst = resolveFixtureDestination(sandboxDir, destName);
    await assertFixtureDestinationHasNoSymlinks(sandboxDir, dst);
    await cp(src, dst, { recursive: true });
  }
}

/**
 * Create an execution context for a test file.
 * @param config - Test configuration
 * @param testFilePath - Path to the test file
 * @param coverageEnv - Optional coverage environment variables (e.g., NODE_V8_COVERAGE)
 */
export async function createExecutionContext(
  config: TryscriptConfig,
  testFilePath: string,
  coverageEnv?: Record<string, string>,
): Promise<ExecutionContext> {
  // Create temp directory and resolve symlinks (e.g., /var -> /private/var on macOS)
  // This ensures [CWD] and [ROOT] patterns match pwd output
  const rawTempDir = await mkdtemp(join(tmpdir(), 'tryscript-'));
  try {
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

    // Find package root for TRYSCRIPT_PACKAGE_ROOT (always available)
    const pkgPath = findPackageJson(testDir);
    const packageRoot = pkgPath ? dirname(pkgPath) : undefined;

    // Find git root for TRYSCRIPT_GIT_ROOT
    const gitRoot = findGitRoot(testDir) ?? undefined;

    // TRYSCRIPT_PROJECT_ROOT is the most specific (deepest) of package or git root
    // Deeper path = longer string = more specific project boundary
    const projectRoot =
      packageRoot && gitRoot
        ? packageRoot.length >= gitRoot.length
          ? packageRoot
          : gitRoot
        : (packageRoot ?? gitRoot);

    // TRYSCRIPT_PACKAGE_BIN points to node_modules/.bin if it exists
    const packageBinPath = packageRoot ? join(packageRoot, 'node_modules', '.bin') : undefined;
    const packageBin = packageBinPath && existsSync(packageBinPath) ? packageBinPath : undefined;

    // Build env vars map for path expansion (before building PATH)
    const tryscriptEnvVars: Record<string, string> = {
      ...(packageRoot && { TRYSCRIPT_PACKAGE_ROOT: packageRoot }),
      ...(gitRoot && { TRYSCRIPT_GIT_ROOT: gitRoot }),
      ...(projectRoot && { TRYSCRIPT_PROJECT_ROOT: projectRoot }),
      ...(packageBin && { TRYSCRIPT_PACKAGE_BIN: packageBin }),
      TRYSCRIPT_TEST_DIR: testDir,
      // `.exe` on Windows, empty elsewhere. Front matter that names a built binary by
      // path needs this to stay portable; without it the only portable way to reach an
      // executable is a bare name, which is a PATH lookup the test cannot control.
      TRYSCRIPT_EXE: process.platform === 'win32' ? '.exe' : '',
    };

    // Create expander with tryscript env vars taking precedence
    const expandEnvVars = createEnvExpander(tryscriptEnvVars);

    // Build PATH: config paths > system PATH
    const pathParts: string[] = [];
    if (config.path && config.path.length > 0) {
      // Expand env vars, preserve absolute entries, and resolve the rest from testDir.
      pathParts.push(
        ...config.path.map((p) => {
          const expanded = expandEnvVars(p);
          return isAbsolute(expanded) ? expanded : resolve(testDir, expanded);
        }),
      );
    }
    pathParts.push(process.env.PATH ?? '');

    // Expand env vars in `env:` values, exactly as `path:` entries are expanded above.
    // Without this the two fields disagree about what `$TRYSCRIPT_GIT_ROOT` means: one
    // resolves it, the other passes the literal through. A test could therefore name a
    // directory by absolute path but never a file, so selecting one exact binary meant
    // an external wrapper setting the variable before tryscript ran -- and a bare name
    // on PATH, which `path:` only prepends to, can silently resolve somewhere else.
    const expandedEnv = config.env
      ? Object.fromEntries(
          Object.entries(config.env).map(([key, value]) => [key, expandEnvVars(value)]),
        )
      : undefined;

    const ctx: ExecutionContext = {
      tempDir,
      testDir,
      cwd,
      sandbox,
      env: {
        ...process.env,
        ...expandedEnv,
        ...coverageEnv,
        // Disable colors by default for deterministic output
        NO_COLOR: expandedEnv?.NO_COLOR ?? '1',
        FORCE_COLOR: '0',
        // Provide test directory for portable test commands
        TRYSCRIPT_TEST_DIR: testDir,
        // Provide project roots for manual path construction
        ...tryscriptEnvVars,
        // Custom PATH with config paths
        PATH: pathParts.join(delimiter),
      },
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      ...(config.before === undefined ? {} : { before: config.before }),
      ...(config.after === undefined ? {} : { after: config.after }),
    };

    return ctx;
  } catch (error) {
    try {
      await rm(rawTempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Failed to initialize and clean up the execution context for ${testFilePath}`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
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
async function runBeforeHook(ctx: ExecutionContext): Promise<void> {
  if (ctx.beforeError) {
    throw ctx.beforeError;
  }
  if (ctx.before && !ctx.beforeRan) {
    ctx.beforeRan = true;
    try {
      await executeHook('Before', ctx.before, ctx);
    } catch (error) {
      const beforeError =
        error instanceof Error ? error : new Error('Before hook failed', { cause: error });
      ctx.beforeError = beforeError;
      throw beforeError;
    }
  }
}

/**
 * Run the after hook.
 */
export async function runAfterHook(ctx: ExecutionContext): Promise<void> {
  if (ctx.after) {
    await executeHook('After', ctx.after, ctx);
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
      actualExitCode: EXECUTION_ERROR_EXIT_CODE,
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

async function executeHook(
  name: 'Before' | 'After',
  command: string,
  ctx: ExecutionContext,
): Promise<void> {
  let result: CommandResult;
  try {
    result = await executeCommand(command, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name} hook failed: ${message}`, { cause: error });
  }

  if (result.exitCode !== 0) {
    const output = result.output.trim();
    const details = output ? `: ${output}` : '';
    throw new Error(`${name} hook exited with code ${result.exitCode}${details}`);
  }
}

/** Base used by shells when encoding signal termination as an exit status. */
const SHELL_SIGNAL_EXIT_OFFSET = 128;

/**
 * Resolve a process exit code, mapping signal termination to `128 + signal`.
 *
 * Node reports `code === null` when a process is terminated by a signal. Treating
 * that as 0 makes a killed command look like a clean success, so a crashing CLI can
 * pass its own golden test.
 *
 * Signal numbers are platform-specific -- `SIGUSR1` is 10 on Linux and 30 on macOS,
 * `SIGBUS` is 7 and 10 respectively -- so they are read from `node:os` at runtime
 * rather than from a hard-coded table, which would report the wrong shell-compatible
 * code everywhere except the platform it was written on.
 */
export function exitCodeFor(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) {
    return code;
  }
  if (signal) {
    // Node's type declares every signal on every platform, while the runtime table is
    // platform-dependent. Model that boundary as partial before indexing it.
    const platformSignals: Partial<Record<NodeJS.Signals, number>> = osConstants.signals;
    const signalNumber = platformSignals[signal];
    if (signalNumber === undefined) {
      throw new Error(`Cannot map unsupported process signal '${signal}' on ${process.platform}`);
    }
    return SHELL_SIGNAL_EXIT_OFFSET + signalNumber;
  }
  throw new Error('Process closed without an exit code or signal');
}

/**
 * Execute a command and capture output.
 */
async function executeCommand(command: string, ctx: ExecutionContext): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, {
      shell: true,
      cwd: ctx.cwd,
      env: ctx.env,
      // Pipe both to capture
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const combinedChunks: Buffer[] = [];
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timeoutStarted = false;

    // Capture data as it comes in to preserve order
    proc.stdout.on('data', (data: Buffer) => {
      combinedChunks.push(data);
      stdoutChunks.push(data);
    });
    proc.stderr.on('data', (data: Buffer) => {
      combinedChunks.push(data);
      stderrChunks.push(data);
    });

    const timeoutId = setTimeout(() => {
      timeoutStarted = true;
      const timeoutError = new Error(`Command timed out after ${ctx.timeout}ms`);
      if (proc.pid === undefined) {
        settled = true;
        reject(timeoutError);
        return;
      }

      treeKill(proc.pid, 'SIGKILL', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error) {
          reject(
            new Error(`Command timed out and its process tree could not be terminated`, {
              cause: error,
            }),
          );
          return;
        }
        reject(timeoutError);
      });
    }, ctx.timeout);

    proc.on('close', (code, signal) => {
      clearTimeout(timeoutId);
      if (settled || timeoutStarted) {
        return;
      }
      settled = true;
      const output = Buffer.concat(combinedChunks).toString('utf-8');
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');
      let exitCode: number;
      try {
        exitCode = exitCodeFor(code, signal);
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to map the process exit signal', { cause: error }),
        );
        return;
      }
      resolve({
        output,
        stdout,
        stderr,
        exitCode,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      if (settled || timeoutStarted) {
        return;
      }
      settled = true;
      reject(err);
    });
  });
}
