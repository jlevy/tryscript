import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('tryscript CLI', () => {
  let tempDir: string;
  const pkgDir = join(__dirname, '..');
  const binPath = join(pkgDir, 'dist/bin.mjs');

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tryscript-cli-test-'));

    // Skip tests if the CLI isn't built
    if (!existsSync(binPath)) {
      throw new Error(`CLI not built. Run 'pnpm build' first. Expected: ${binPath}`);
    }
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const runCli = (args: string): { output: string; exitCode: number } => {
    const result = spawnSync('node', [binPath, ...args.split(' ').filter(Boolean)], {
      cwd: pkgDir,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
    });

    // Combine stdout and stderr since Commander may write to either
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    return {
      output,
      exitCode: result.status ?? 1,
    };
  };

  it('shows help with --help', () => {
    const result = runCli('--help');
    expect(result.output).toContain('Golden testing for CLI applications');
    expect(result.output).toContain('--update');
    expect(result.exitCode).toBe(0);
  });

  it('shows version with --version', () => {
    const result = runCli('--version');
    // Version output should match semver pattern or "development"
    expect(result.output.trim()).toMatch(/^(\d+\.\d+\.\d+.*|development)/);
    expect(result.exitCode).toBe(0);
  });

  it('runs passing test file', () => {
    const testFile = join(tempDir, 'passing.tryscript.md');
    writeFileSync(
      testFile,
      `# Test: Echo

\`\`\`console
$ echo "hello"
hello
? 0
\`\`\`
`,
    );

    const result = runCli(testFile);
    expect(result.output).toContain('1 passed');
    expect(result.exitCode).toBe(0);
  });

  it('reports failing test', () => {
    const testFile = join(tempDir, 'failing.tryscript.md');
    writeFileSync(
      testFile,
      `# Test: Wrong output

\`\`\`console
$ echo "actual"
expected
? 0
\`\`\`
`,
    );

    const result = runCli(testFile);
    expect(result.output).toContain('1 failed');
    expect(result.exitCode).toBe(1);
  });

  it('exits with code 1 when no test files found', () => {
    const result = runCli(join(tempDir, 'nonexistent/*.tryscript.md'));
    expect(result.exitCode).toBe(1);
  });
});
