import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

  it('resolves cwd relative to test file directory', async () => {
    ctx = await createExecutionContext({ cwd: './golden' }, TEST_FILE);
    expect(ctx.cwd).toBe(resolve(TEST_DIR, 'golden'));
    expect(ctx.sandbox).toBe(false);
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
