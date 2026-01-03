import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutionContext, cleanupExecutionContext, runBlock } from '../src/lib/runner.js';
import type { TestBlock } from '../src/lib/types.js';

// Use the tests directory as a real path for test file location
const TEST_DIR = resolve(fileURLToPath(import.meta.url), '..');
const TEST_FILE = resolve(TEST_DIR, 'fake.tryscript.md');

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

  it('sets NO_COLOR by default', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    expect(ctx.env.NO_COLOR).toBe('1');
  });

  it('defaults cwd to test file directory', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    expect(ctx.cwd).toBe(TEST_DIR);
  });

  it('uses temp dir when cwd is "temp"', async () => {
    ctx = await createExecutionContext({ cwd: 'temp' }, TEST_FILE);
    expect(ctx.cwd).toBe(ctx.tempDir);
  });

  it('resolves binPath relative to test file directory', async () => {
    ctx = await createExecutionContext({ bin: './dist/bin.mjs' }, TEST_FILE);
    expect(ctx.binPath).toBe(resolve(TEST_DIR, './dist/bin.mjs'));
  });

  it('stores binName from config', async () => {
    ctx = await createExecutionContext({ bin: './dist/bin.mjs', binName: 'mycli' }, TEST_FILE);
    expect(ctx.binName).toBe('mycli');
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

  it('tracks duration', async () => {
    ctx = await createExecutionContext({}, TEST_FILE);
    const result = await runBlock(makeBlock('echo test'), ctx);

    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeLessThan(5000);
  });

  it('resolves binName alias in command', async () => {
    // Create a context with bin and binName
    ctx = await createExecutionContext({ bin: '/bin/echo', binName: 'myecho' }, TEST_FILE);
    const result = await runBlock(makeBlock('myecho "hello from alias"'), ctx);

    expect(result.actualOutput.trim()).toBe('hello from alias');
    expect(result.actualExitCode).toBe(0);
  });
});
