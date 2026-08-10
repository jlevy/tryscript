import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  chmodSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function writeMockC8(path: string): void {
  writeFileSync(
    path,
    `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.exit(0);
}

const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const reportsDir = valueAfter('--reports-dir');
const reporters = args.flatMap((arg, index) => arg === '--reporter' ? [args[index + 1]] : []);
if (reportsDir !== undefined && reporters.includes('lcov')) {
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, 'lcov.info'), 'SF:target.js\\nDA:1,1\\nend_of_record\\n');
}
`,
  );
  chmodSync(path, 0o755);
}

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

  const runCli = (
    args: string,
    cwd = pkgDir,
    env: Record<string, string> = {},
  ): { output: string; stdout: string; stderr: string; exitCode: number } => {
    const result = spawnSync('node', [binPath, ...args.split(' ').filter(Boolean)], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', ...env },
    });

    // Combine stdout and stderr since Commander may write to either
    const output = result.stdout + result.stderr;
    return {
      output,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
    };
  };

  it('shows help with --help', () => {
    const result = runCli('--help');
    expect(result.output).toContain('Markdown golden tests for CLI applications');
    expect(result.output).toContain('run [options] [files...]');
    expect(result.exitCode).toBe(0);
  });

  it('shows run help with run --help', () => {
    const result = runCli('run --help');
    expect(result.output).toContain('Run Markdown golden tests');
    expect(result.output).toContain('--update');
    expect(result.exitCode).toBe(0);
  });

  it('shows version with --version', () => {
    const result = runCli('--version');
    // Version output should match semver pattern or "development"
    expect(result.output.trim()).toMatch(/^(\d+\.\d+\.\d+.*|development)/);
    expect(result.exitCode).toBe(0);
  });

  it('prints source Markdown exactly and accepts legacy formatting options', () => {
    const documents = [
      { command: 'readme', path: join(pkgDir, 'README.md') },
      { command: 'docs', path: join(pkgDir, '..', '..', 'docs', 'tryscript-reference.md') },
    ];

    for (const { command, path } of documents) {
      const source = readFileSync(path, 'utf8');
      for (const options of ['', ' --raw', ' --color', ' --raw --color']) {
        const result = runCli(`${command}${options}`);
        expect(result.stdout).toBe(source);
        expect(result.stderr).toBe('');
        expect(result.exitCode).toBe(0);
      }
    }
  });

  it('does not advertise legacy documentation formatting options', () => {
    for (const command of ['readme', 'docs']) {
      const result = runCli(`${command} --help`);
      expect(result.output).not.toContain('--raw');
      expect(result.output).not.toContain('--color');
      expect(result.exitCode).toBe(0);
    }
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

    const result = runCli(`run ${testFile}`);
    expect(result.output).toContain('1 passed');
    expect(result.exitCode).toBe(0);
  });

  it('fails when a requested capture log cannot be written', () => {
    const testFile = join(tempDir, 'capture-log-source.tryscript.md');
    writeFileSync(
      testFile,
      `\`\`\`console
$ echo hello
hello
\`\`\`
`,
    );
    const logPath = join(tempDir, 'capture-target-directory');
    mkdirSync(logPath);

    const result = runCli(`run --capture-log ${logPath} ${testFile}`);
    expect(result.output).toContain('Error: Failed to write capture log:');
    expect(result.exitCode).toBe(1);
  });

  it('fails when a requested coverage report cannot be written', () => {
    const testFile = join(tempDir, 'coverage-source.tryscript.md');
    const reportsPath = join(tempDir, 'not-a-directory');
    writeFileSync(
      testFile,
      `\`\`\`console
$ node -e "console.log('covered')"
covered
\`\`\`
`,
    );
    writeFileSync(reportsPath, 'file blocks directory creation');

    const result = runCli(`run --coverage --coverage-dir ${reportsPath} ${testFile}`);
    expect(result.output).toContain('Error: Failed to generate coverage report:');
    expect(result.exitCode).toBe(1);
  });

  it('does not consume a test file after repeatable coverage options', () => {
    const testFile = join(tempDir, 'coverage-option-parsing.tryscript.md');
    writeFileSync(
      testFile,
      `\`\`\`console
$ echo selected-file
selected-file
\`\`\`
`,
    );

    const result = runCli(
      `run --coverage-reporter text --coverage-exclude ignored-pattern ${testFile}`,
    );

    expect(result.output).toContain('1 passed');
    expect(result.output).toContain(testFile);
    expect(result.exitCode).toBe(0);
  });

  it('adds the LCOV reporter when mergeLcov comes from project config', () => {
    const projectDir = join(tempDir, 'configured-lcov-project');
    const mockC8 = join(projectDir, 'mock-c8.mjs');
    const reportsDir = join(projectDir, 'coverage-output');
    const externalLcov = join(projectDir, 'external.info');
    mkdirSync(projectDir);
    writeMockC8(mockC8);
    writeFileSync(externalLcov, 'SF:target.js\nDA:1,2\nend_of_record\n');
    writeFileSync(
      join(projectDir, 'tryscript.config.mjs'),
      `export default {
  coverage: {
    reportsDir: ${JSON.stringify(reportsDir)},
    reporters: ['text'],
    mergeLcov: ${JSON.stringify(externalLcov)},
  },
};
`,
    );
    writeFileSync(join(projectDir, 'configured-merge.tryscript.md'), '```console\n$ true\n```\n');

    const result = runCli('run --coverage configured-merge.tryscript.md', projectDir, {
      TRYSCRIPT_C8_COMMAND: mockC8,
    });

    expect(result.output).toContain('Merged coverage:');
    expect(readFileSync(join(reportsDir, 'lcov.info'), 'utf8')).toContain('DA:1,2');
    expect(result.exitCode).toBe(0);
  });

  it('reports coverage-command LCOV merge failures as artifact failures', () => {
    const projectDir = join(tempDir, 'coverage-command-merge-project');
    const mockC8 = join(projectDir, 'mock-c8.mjs');
    const reportsDir = join(projectDir, 'coverage-output');
    const missingLcov = join(projectDir, 'missing.info');
    mkdirSync(projectDir);
    writeMockC8(mockC8);

    const result = runCli(
      `coverage --reports-dir ${reportsDir} --merge-lcov ${missingLcov} true`,
      projectDir,
      { TRYSCRIPT_C8_COMMAND: mockC8 },
    );

    expect(result.output).toContain('Error: Failed to merge external coverage:');
    expect(result.output).toContain(`External LCOV file not found: ${missingLcov}`);
    expect(result.exitCode).toBe(1);
  });

  it('adds the LCOV reporter for coverage-command merges with explicit reporters', () => {
    const projectDir = join(tempDir, 'coverage-command-explicit-reporters');
    const mockC8 = join(projectDir, 'mock-c8.mjs');
    const reportsDir = join(projectDir, 'coverage-output');
    const externalLcov = join(projectDir, 'external.info');
    mkdirSync(projectDir);
    writeMockC8(mockC8);
    writeFileSync(externalLcov, 'SF:target.js\nDA:1,2\nend_of_record\n');

    const result = runCli(
      `coverage --reports-dir ${reportsDir} --reporters text --merge-lcov ${externalLcov} true`,
      projectDir,
      { TRYSCRIPT_C8_COMMAND: mockC8 },
    );

    expect(result.output).toContain('Merged coverage:');
    expect(readFileSync(join(reportsDir, 'lcov.info'), 'utf8')).toContain('DA:1,2');
    expect(result.exitCode).toBe(0);
  });

  it('warns and continues when project config is not a mapping', () => {
    const projectDir = join(tempDir, 'invalid-project-config');
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, 'tryscript.config.mjs'), 'export default null;\n');
    writeFileSync(join(projectDir, 'test.tryscript.md'), '```console\n$ echo safe\nsafe\n```\n');

    const result = runCli('run test.tryscript.md', projectDir);

    expect(result.output).toContain('Warning: project config: config must be a mapping');
    expect(result.output).toContain('1 passed');
    expect(result.exitCode).toBe(0);
  });

  it('fails and cleans up when a requested external LCOV file is missing', () => {
    const isolatedTempRoot = join(tempDir, 'merge-lcov-temporary-data');
    const reportsPath = join(tempDir, 'merge-lcov-report');
    const missingLcov = join(tempDir, 'missing-external-lcov.info');
    const testFile = join(tempDir, 'merge-lcov-source.tryscript.md');
    mkdirSync(isolatedTempRoot);
    writeFileSync(
      testFile,
      `\`\`\`console
$ node -e "console.log('covered')"
covered
\`\`\`
`,
    );

    const result = runCli(
      `run --coverage --coverage-dir ${reportsPath} --merge-lcov ${missingLcov} ${testFile}`,
      pkgDir,
      { TMPDIR: isolatedTempRoot },
    );

    expect(result.output).toContain('Error: Failed to generate coverage report:');
    expect(result.output).toContain(`External LCOV file not found: ${missingLcov}`);
    expect(result.exitCode).toBe(1);
    expect(readdirSync(isolatedTempRoot)).toEqual([]);
  });

  it('removes temporary coverage data before a report failure exit', () => {
    const failingC8 = join(tempDir, 'failing-c8.sh');
    writeFileSync(failingC8, '#!/bin/sh\nexit 1\n');
    chmodSync(failingC8, 0o755);

    const result = runCli('coverage true', pkgDir, { TRYSCRIPT_C8_COMMAND: failingC8 });
    const tempPath = /Collecting V8 coverage to (.+)\n/u.exec(result.output)?.[1]?.trim();

    expect(result.output).toContain(
      'Error: Failed to generate coverage report: c8 report exited with code 1',
    );
    expect(result.exitCode).toBe(1);
    expect(tempPath).toBeDefined();
    if (tempPath === undefined) {
      throw new Error('Coverage command did not report its temporary directory');
    }
    expect(existsSync(tempPath)).toBe(false);
  });

  it('surfaces verbose coverage reporter failures and cleans temporary data', () => {
    const isolatedTempRoot = join(tempDir, 'verbose-coverage-temporary-data');
    const failingC8 = join(tempDir, 'failing-verbose-c8.sh');
    const coverageProducer = join(tempDir, 'coverage-producer.sh');
    mkdirSync(isolatedTempRoot);
    writeFileSync(failingC8, '#!/bin/sh\nexit 9\n');
    writeFileSync(coverageProducer, '#!/bin/sh\nnode -e "console.log(\'covered\')"\n');
    chmodSync(failingC8, 0o755);
    chmodSync(coverageProducer, 0o755);

    const result = runCli(`coverage --verbose ${coverageProducer}`, pkgDir, {
      TRYSCRIPT_C8_COMMAND: failingC8,
      TMPDIR: isolatedTempRoot,
    });

    expect(result.output).toContain('Error: c8 text report exited with code 9');
    expect(result.exitCode).toBe(2);
    expect(readdirSync(isolatedTempRoot)).toEqual([]);
  });

  it('removes coverage data when an after hook fails', () => {
    const isolatedTempRoot = join(tempDir, 'after-hook-temporary-data');
    const testFile = join(tempDir, 'failing-after-hook.tryscript.md');
    mkdirSync(isolatedTempRoot);
    writeFileSync(
      testFile,
      `---
after: exit 9
---

\`\`\`console
$ true
\`\`\`
`,
    );

    const result = runCli(`run --coverage ${testFile}`, pkgDir, {
      TMPDIR: isolatedTempRoot,
    });

    expect(result.output).toContain('After hook exited with code 9');
    expect(result.exitCode).toBe(2);
    expect(readdirSync(isolatedTempRoot)).toEqual([]);
  });

  it('uses global config test patterns when no files are specified', () => {
    const projectDir = join(tempDir, 'configured-discovery');
    const selectedDir = join(projectDir, 'selected');
    mkdirSync(selectedDir, { recursive: true });
    writeFileSync(
      join(projectDir, 'tryscript.config.mjs'),
      "export default { tests: ['selected/*.tryscript.md'], timout: 5 };\n",
    );
    writeFileSync(
      join(selectedDir, 'passing.tryscript.md'),
      `\`\`\`console
$ echo selected
selected
\`\`\`
`,
    );
    writeFileSync(
      join(projectDir, 'ignored.tryscript.md'),
      `\`\`\`console
$ echo actual
expected
\`\`\`
`,
    );

    const result = runCli('run', projectDir);
    expect(result.output).toContain("Warning: project config:timout: unknown config key 'timout'");
    expect(result.output).toContain('1 passed');
    expect(result.output).not.toContain('ignored.tryscript.md');
    expect(result.exitCode).toBe(0);
  });

  it('rejects cyclic default exports in project config modules', () => {
    const projectDir = join(tempDir, 'cyclic-config');
    mkdirSync(projectDir);
    writeFileSync(
      join(projectDir, 'tryscript.config.mjs'),
      `const first = {};
const second = {};
first.default = second;
second.default = first;
export default first;
`,
    );

    const result = runCli('run', projectDir);

    expect(result.output).toContain('contains cyclic default exports');
    expect(result.output).toContain(join(projectDir, 'tryscript.config.mjs'));
    expect(result.exitCode).toBe(2);
  });

  it('reports discovered test files in deterministic path order', () => {
    const projectDir = join(tempDir, 'ordered-discovery');
    mkdirSync(projectDir);
    for (const name of ['zeta', 'alpha']) {
      writeFileSync(
        join(projectDir, `${name}.tryscript.md`),
        `\`\`\`console
$ echo ${name}
${name}
\`\`\`
`,
      );
    }

    const result = runCli('run', projectDir);
    const alphaPosition = result.output.indexOf('alpha.tryscript.md');
    const zetaPosition = result.output.indexOf('zeta.tryscript.md');

    expect(alphaPosition).toBeGreaterThanOrEqual(0);
    expect(zetaPosition).toBeGreaterThan(alphaPosition);
    expect(result.exitCode).toBe(0);
  });

  it('prints the full config path in frontmatter warnings', () => {
    const testFile = join(tempDir, 'warning.tryscript.md');
    writeFileSync(
      testFile,
      `---
coverage:
  reportsDir: 42
---

\`\`\`console
$ true
? 0
\`\`\`
`,
    );

    const result = runCli(`run ${testFile}`);
    expect(result.output).toContain('Warning:');
    expect(result.output).toContain(`${testFile}:coverage.reportsDir:`);
    expect(result.exitCode).toBe(0);
  });

  it('enforces an explicit empty-stderr assertion', () => {
    const testFile = join(tempDir, 'empty-stderr.tryscript.md');
    writeFileSync(
      testFile,
      `\`\`\`console
$ printf 'same\\n' >&2
same
!
? 0
\`\`\`
`,
    );

    const result = runCli(`run ${testFile}`);
    expect(result.output).toContain('FAIL');
    expect(result.exitCode).toBe(1);
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

    const result = runCli(`run ${testFile}`);
    expect(result.output).toContain('1 failed');
    expect(result.exitCode).toBe(1);
  });

  it('excludes unnamed blocks when filtering by test name', () => {
    const testFile = join(tempDir, 'filtered.tryscript.md');
    writeFileSync(
      testFile,
      `\`\`\`console
$ echo unexpected
wrong
\`\`\`

# Test: Selected block

\`\`\`console
$ echo selected
selected
\`\`\`
`,
    );

    const result = runCli(`run --filter Selected ${testFile}`);

    expect(result.output).toContain('Selected block');
    expect(result.output).toContain('1 passed');
    expect(result.output).not.toContain('FAIL');
    expect(result.exitCode).toBe(0);
  });

  it('exits with code 1 when no test files found', () => {
    const pattern = join(tempDir, 'nonexistent/*.tryscript.md');
    const result = runCli(`run ${pattern}`);
    expect(result.output).toContain(`Error: No test files matched: ${pattern}`);
    expect(result.output).toContain(`working directory: ${pkgDir}`);
    expect(result.exitCode).toBe(1);
  });

  it('runs the README example from examples/', () => {
    const exampleFile = join(pkgDir, '..', '..', 'examples', 'my-cli.tryscript.md');
    const result = runCli(`run ${exampleFile}`);
    expect(result.output).toContain('4 passed');
    expect(result.output).toContain('CLI help');
    expect(result.output).toContain('Version output');
    expect(result.output).toContain('Error handling');
    expect(result.output).toContain('Check output file contents');
    expect(result.exitCode).toBe(0);
  });
});
