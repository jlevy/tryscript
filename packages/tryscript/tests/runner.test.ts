import { describe, it, expect, afterEach, vi } from 'vitest';
import treeKill from 'tree-kill';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { constants as osConstants, tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createExecutionContext,
  cleanupExecutionContext,
  exitCodeFor,
  runAfterHook,
  runBlock,
} from '../src/lib/runner.js';
import type { TestBlock } from '../src/lib/types.js';

// Use the tests directory as a real path for test file location
const TEST_DIR = resolve(fileURLToPath(import.meta.url), '..');
const TEST_FILE = resolve(TEST_DIR, 'fake.tryscript.md');

describe('exitCodeFor', () => {
  it('rejects an indeterminate process close instead of reporting success', () => {
    expect(() => exitCodeFor(null, null)).toThrow('without an exit code or signal');
  });
});

describe('createExecutionContext', () => {
  let ctx: Awaited<ReturnType<typeof createExecutionContext>> | null = null;

  afterEach(async () => {
    if (ctx) {
      await cleanupExecutionContext(ctx);
      ctx = null;
    }
  });

  it('creates a temp directory', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    expect(ctx.tempDir).toContain('tryscript-');
    expect(existsSync(ctx.tempDir)).toBe(true);
  });

  it('sets default timeout', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    expect(ctx.timeout).toBe(30_000);
  });

  it('respects custom timeout', async () => {
    ctx = await createExecutionContext({ timeout: 5000 }, TEST_FILE);
    expect(ctx.timeout).toBe(5000);
  });

  it('expands env vars in `env:` values, as it already does in `path:`', async () => {
    ctx = await createExecutionContext(
      { env: { TOOL: '$TRYSCRIPT_GIT_ROOT/target/debug/tool', PLAIN: 'literal' } },
      TEST_FILE,
    );
    // The two fields have to agree about what `$VAR` means. While they disagreed, a
    // test could name a directory by absolute path but never a file, so selecting an
    // exact binary meant an external wrapper setting the variable beforehand.
    expect(ctx.env.TOOL).toBe(`${ctx.env.TRYSCRIPT_GIT_ROOT}/target/debug/tool`);
    expect(ctx.env.TOOL).not.toContain('$TRYSCRIPT_GIT_ROOT');
    expect(ctx.env.PLAIN).toBe('literal');
  });

  it('exposes TRYSCRIPT_EXE so front matter can name a binary portably', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    expect(ctx.env.TRYSCRIPT_EXE).toBe(process.platform === 'win32' ? '.exe' : '');
  });

  it('names an exact binary from `env:` using both provided variables', async () => {
    ctx = await createExecutionContext(
      { env: { TOOL: '$TRYSCRIPT_GIT_ROOT/target/debug/tool$TRYSCRIPT_EXE' } },
      TEST_FILE,
    );
    const exe = process.platform === 'win32' ? '.exe' : '';
    expect(ctx.env.TOOL).toBe(`${ctx.env.TRYSCRIPT_GIT_ROOT}/target/debug/tool${exe}`);
  });

  it('keeps a literal `$` in an `env:` value when escaped', async () => {
    // Expanding `env:` makes every value a candidate for substitution, so an
    // unescaped `$ssw0rd` would expand away and silently truncate the value.
    ctx = await createExecutionContext({ env: { PASSWORD: 'p$$ssw0rd' } }, TEST_FILE);
    expect(ctx.env.PASSWORD).toBe('p$ssw0rd');
  });

  it('sets NO_COLOR by default', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    expect(ctx.env.NO_COLOR).toBe('1');
  });

  it('defaults cwd to test file directory', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    expect(ctx.cwd).toBe(TEST_DIR);
    expect(ctx.sandbox).toBe(false);
  });

  it('uses temp dir when sandbox is true', async () => {
    ctx = await createExecutionContext({ sandbox: true }, TEST_FILE);
    expect(ctx.cwd).toBe(ctx.tempDir);
    expect(ctx.sandbox).toBe(true);
  });

  it('copies directory to sandbox when sandbox is a path', async () => {
    // Create a test fixture directory
    const fixtureDir = resolve(TEST_DIR, 'sandbox-fixture');
    if (!existsSync(fixtureDir)) {
      mkdirSync(fixtureDir, { recursive: true });
      writeFileSync(resolve(fixtureDir, 'test.txt'), 'fixture content');
    }

    ctx = await createExecutionContext({ sandbox: './sandbox-fixture' }, TEST_FILE);
    expect(ctx.cwd).toBe(ctx.tempDir);
    expect(ctx.sandbox).toBe(true);
    // The fixture file should be copied to the sandbox
    expect(existsSync(resolve(ctx.tempDir, 'test.txt'))).toBe(true);
  });

  it('rejects a fixture destination outside the sandbox', async () => {
    await expect(
      createExecutionContext(
        {
          sandbox: true,
          fixtures: [{ source: 'sandbox-fixture/test.txt', dest: '../escaped.txt' }],
        },
        TEST_FILE,
      ),
    ).rejects.toThrow('Fixture destination must stay inside the sandbox: ../escaped.txt');
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a fixture destination through a sandbox symlink',
    async () => {
      const projectDir = mkdtempSync(join(tmpdir(), 'tryscript-fixture-boundary-'));
      const sandboxSource = join(projectDir, 'sandbox');
      const outsideDir = join(projectDir, 'outside');
      const testFile = join(projectDir, 'fixture.tryscript.md');
      mkdirSync(sandboxSource);
      mkdirSync(outsideDir);
      writeFileSync(join(projectDir, 'source.txt'), 'fixture');
      symlinkSync(outsideDir, join(sandboxSource, 'escape'));

      try {
        await expect(
          createExecutionContext(
            {
              sandbox: 'sandbox',
              fixtures: [{ source: 'source.txt', dest: 'escape/copied.txt' }],
            },
            testFile,
          ),
        ).rejects.toThrow('Fixture destination traverses a symbolic link: escape/copied.txt');
        expect(existsSync(join(outsideDir, 'copied.txt'))).toBe(false);
      } finally {
        rmSync(projectDir, { recursive: true, force: true });
      }
    },
  );

  it('resolves cwd relative to test file directory', async () => {
    ctx = await createExecutionContext({ cwd: './golden' }, TEST_FILE);
    expect(ctx.cwd).toBe(resolve(TEST_DIR, 'golden'));
    expect(ctx.sandbox).toBe(false);
  });

  it('preserves absolute PATH entries on the host platform', async () => {
    const absoluteToolsPath = resolve(TEST_DIR, 'absolute-tools');

    ctx = await createExecutionContext({ path: [absoluteToolsPath] }, TEST_FILE);

    expect(ctx.env.PATH?.split(delimiter)[0]).toBe(absoluteToolsPath);
  });

  it('removes its temp directory when fixture setup fails', async () => {
    const isolatedTempRoot = mkdtempSync(join(tmpdir(), 'tryscript-runner-test-'));
    const originalTempDir = process.env.TMPDIR;
    process.env.TMPDIR = isolatedTempRoot;

    try {
      await expect(
        createExecutionContext(
          { sandbox: true, fixtures: ['fixture-that-does-not-exist'] },
          TEST_FILE,
        ),
      ).rejects.toThrow();
      expect(readdirSync(isolatedTempRoot)).toEqual([]);
    } finally {
      if (originalTempDir === undefined) {
        delete process.env.TMPDIR;
      } else {
        process.env.TMPDIR = originalTempDir;
      }
      rmSync(isolatedTempRoot, { recursive: true, force: true });
    }
  });
});

describe('cleanupExecutionContext', () => {
  it('removes the temp directory', async () => {
    const ctx = await createExecutionContext({}, TEST_FILE);
    const tempDir = ctx.tempDir;
    expect(existsSync(tempDir)).toBe(true);

    await cleanupExecutionContext(ctx);
    expect(existsSync(tempDir)).toBe(false);
  });
});

describe('runBlock', () => {
  let ctx: Awaited<ReturnType<typeof createExecutionContext>> | null = null;

  afterEach(async () => {
    if (ctx) {
      await cleanupExecutionContext(ctx);
      ctx = null;
    }
  });

  const makeBlock = (command: string): TestBlock => ({
    command,
    expectedOutput: '',
    expectedExitCode: 0,
    lineNumber: 1,
    rawContent: '',
    startOffset: 0,
    endOffset: 0,
    infoString: 'console',
  });

  it('captures stdout', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    const result = await runBlock(makeBlock('echo "hello world"'), ctx);

    expect(result.actualOutput.trim()).toBe('hello world');
    expect(result.actualExitCode).toBe(0);
  });

  it('captures stderr', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    const result = await runBlock(makeBlock('echo "error" >&2'), ctx);

    expect(result.actualOutput.trim()).toBe('error');
  });

  it('captures exit code', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    const result = await runBlock(makeBlock('exit 42'), ctx);

    expect(result.actualExitCode).toBe(42);
  });

  it.skipIf(process.platform === 'win32')(
    'maps real signal termination using the platform signal table',
    async () => {
      ctx = await createExecutionContext({}, TEST_FILE);
      const result = await runBlock(makeBlock('kill -USR1 $$'), ctx);

      expect(result.actualExitCode).toBe(128 + osConstants.signals.SIGUSR1);
    },
  );

  it('handles command not found', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    const result = await runBlock(makeBlock('nonexistent_command_12345'), ctx);

    // Command not found typically returns 127 on Unix
    expect(result.actualExitCode).not.toBe(0);
  });

  it('times out long-running commands', async () => {
    ctx = await createExecutionContext({ timeout: 100 }, TEST_FILE);
    const result = await runBlock(makeBlock('sleep 10'), ctx);

    expect(result.passed).toBe(false);
    expect(result.error).toContain('timed out');
  }, 5000);

  it('does not settle a timeout before process-tree termination completes', async () => {
    const timeoutMs = 20;
    const killDelayMs = 75;
    const schedulerToleranceMs = 15;

    vi.resetModules();
    vi.doMock('tree-kill', () => ({
      default: (pid: number, signal: NodeJS.Signals, callback?: (error?: Error) => void): void => {
        setTimeout(() => {
          treeKill(pid, signal, callback);
        }, killDelayMs);
      },
    }));

    const isolatedRunner = await import('../src/lib/runner.js');
    const isolatedContext = await isolatedRunner.createExecutionContext(
      { timeout: timeoutMs },
      TEST_FILE,
    );
    try {
      const result = await isolatedRunner.runBlock(
        makeBlock('node -e "setInterval(() => {}, 1000)"'),
        isolatedContext,
      );

      expect(result.error).toContain('timed out');
      expect(result.duration).toBeGreaterThanOrEqual(
        timeoutMs + killDelayMs - schedulerToleranceMs,
      );
    } finally {
      await isolatedRunner.cleanupExecutionContext(isolatedContext);
      vi.doUnmock('tree-kill');
      vi.resetModules();
    }
  });

  it('tracks duration', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    const result = await runBlock(makeBlock('echo test'), ctx);

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeLessThan(5000);
  });

  it('does not execute blocks after a before hook exits non-zero', async () => {
    ctx = await createExecutionContext({ sandbox: true, before: 'exit 7' }, TEST_FILE);

    const first = await runBlock(makeBlock('touch command-ran'), ctx);
    const second = await runBlock(makeBlock('touch second-command-ran'), ctx);

    expect(first.error).toContain('Before hook exited with code 7');
    expect(second.error).toContain('Before hook exited with code 7');
    expect(existsSync(resolve(ctx.tempDir, 'command-ran'))).toBe(false);
    expect(existsSync(resolve(ctx.tempDir, 'second-command-ran'))).toBe(false);
  });

  it('rejects when an after hook exits non-zero', async () => {
    ctx = await createExecutionContext(
      { sandbox: true, after: 'printf cleanup >&2; exit 9' },
      TEST_FILE,
    );

    await expect(runAfterHook(ctx)).rejects.toThrow('After hook exited with code 9: cleanup');
  });

  it('uses env variables from config', async () => {
    ctx = await createExecutionContext({ env: { MY_VAR: 'test_value' } }, TEST_FILE);
    const result = await runBlock(makeBlock('echo $MY_VAR'), ctx);

    expect(result.actualOutput.trim()).toBe('test_value');
    expect(result.actualExitCode).toBe(0);
  });

  it('runs in sandbox directory when sandbox is true', async () => {
    ctx = await createExecutionContext({ sandbox: true }, TEST_FILE);
    const result = await runBlock(makeBlock('pwd'), ctx);

    expect(result.actualOutput.trim()).toBe(ctx.tempDir);
  });
});
