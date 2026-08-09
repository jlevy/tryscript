/**
 * Regressions for the v0.1.8 stability review.
 *
 * Each test names the finding it locks down; see
 * docs/project/specs/active/spec-v0.1.8-stability-review.md.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTestFile, validateConfig, TestParseError } from '../src/lib/parser.js';
import { updateTestFile } from '../src/lib/updater.js';
import { expandTestFile } from '../src/lib/expander.js';
import { matchOutput, normalizeOutput } from '../src/lib/matcher.js';
import {
  cleanupExecutionContext,
  createExecutionContext,
  exitCodeFor,
  runBlock,
} from '../src/lib/runner.js';
import { asParsedBlock } from '../src/lib/block-writer.js';
import { constants as osConstants } from 'node:os';
import type { TestBlock, TestBlockResult } from '../src/lib/types.js';

const F = '```';

function getBlock(blocks: TestBlock[], index: number): TestBlock {
  const block = blocks[index];
  if (!block) {
    throw new Error(`Block at index ${index} not found`);
  }
  return block;
}

function makeResult(block: TestBlock, overrides: Partial<TestBlockResult> = {}): TestBlockResult {
  return {
    block,
    passed: false,
    actualOutput: '',
    actualExitCode: 0,
    duration: 1,
    ...overrides,
  };
}

describe('B1: rewrites target the right block when blocks are identical (#47)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'regression-b1-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('assigns each duplicate block its own captured output', async () => {
    const content = [
      '# First state',
      '',
      `${F}console`,
      '$ read-state',
      'WRONG',
      '? 0',
      F,
      '',
      '# Second state',
      '',
      `${F}console`,
      '$ read-state',
      'WRONG',
      '? 0',
      F,
      '',
    ].join('\n');

    const filePath = join(tempDir, 'dup.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);

    // The two blocks are byte-identical; only execution order distinguishes them.
    expect(getBlock(testFile.blocks, 0).rawContent).toBe(getBlock(testFile.blocks, 1).rawContent);

    const results = [
      makeResult(getBlock(testFile.blocks, 0), { actualOutput: 'first\n' }),
      makeResult(getBlock(testFile.blocks, 1), { actualOutput: 'second\n' }),
    ];

    await updateTestFile(testFile, results);
    const updated = await readFile(filePath, 'utf-8');

    // Not just "both values present" — each must land under its own heading.
    const firstSection = updated.slice(
      updated.indexOf('# First state'),
      updated.indexOf('# Second state'),
    );
    const secondSection = updated.slice(updated.indexOf('# Second state'));

    expect(firstSection).toContain('first');
    expect(firstSection).not.toContain('second');
    expect(secondSection).toContain('second');
    expect(secondSection).not.toContain('first');
  });

  it('re-parses the updated file to the captured values', async () => {
    const content = [
      `${F}console`,
      '$ read-state',
      'WRONG',
      '? 0',
      F,
      '',
      `${F}console`,
      '$ read-state',
      'WRONG',
      '? 0',
      F,
      '',
    ].join('\n');

    const filePath = join(tempDir, 'roundtrip.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);

    await updateTestFile(testFile, [
      makeResult(getBlock(testFile.blocks, 0), { actualOutput: 'alpha\n' }),
      makeResult(getBlock(testFile.blocks, 1), { actualOutput: 'beta\n' }),
    ]);

    const reparsed = parseTestFile(await readFile(filePath, 'utf-8'), filePath);
    expect(getBlock(reparsed.blocks, 0).expectedOutput).toBe('alpha\n');
    expect(getBlock(reparsed.blocks, 1).expectedOutput).toBe('beta\n');
  });

  it('expands identical blocks independently', async () => {
    const content = [
      `${F}console`,
      '$ read-state',
      '[??]',
      '? 0',
      F,
      '',
      `${F}console`,
      '$ read-state',
      '[??]',
      '? 0',
      F,
      '',
    ].join('\n');

    const filePath = join(tempDir, 'expand.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);

    await expandTestFile(
      testFile,
      [
        makeResult(getBlock(testFile.blocks, 0), { actualOutput: 'alpha\n' }),
        makeResult(getBlock(testFile.blocks, 1), { actualOutput: 'beta\n' }),
      ],
      'unknown',
      { root: tempDir, cwd: tempDir },
    );

    const reparsed = parseTestFile(await readFile(filePath, 'utf-8'), filePath);
    expect(getBlock(reparsed.blocks, 0).expectedOutput).toBe('alpha\n');
    expect(getBlock(reparsed.blocks, 1).expectedOutput).toBe('beta\n');
  });
});

describe('B2: signal termination is not a clean exit', () => {
  it('maps a signal to the shell 128 + signal convention', () => {
    expect(exitCodeFor(null, 'SIGKILL')).toBe(137);
    expect(exitCodeFor(null, 'SIGTERM')).toBe(143);
    expect(exitCodeFor(null, 'SIGSEGV')).toBe(139);
  });

  it('never reports 0 for a signalled process', () => {
    expect(exitCodeFor(null, 'SIGKILL')).not.toBe(0);
    // Unknown signal still reports failure rather than success.
    expect(exitCodeFor(null, 'SIGUSR2')).toBeGreaterThan(0);
  });

  it('passes a real exit code through unchanged', () => {
    expect(exitCodeFor(0, null)).toBe(0);
    expect(exitCodeFor(3, null)).toBe(3);
    // A process that exits normally while a signal is also reported keeps its code.
    expect(exitCodeFor(2, 'SIGPIPE')).toBe(2);
  });
});

describe('B3: output without a trailing newline', () => {
  it('matches an expectation that ends with a newline', () => {
    const ctx = { root: '/r', cwd: '/c' };
    expect(matchOutput('no-trailing-newline', 'no-trailing-newline\n', ctx)).toBe(true);
  });

  it('normalizes missing and repeated trailing newlines identically', () => {
    expect(normalizeOutput('x')).toBe('x\n');
    expect(normalizeOutput('x\n')).toBe('x\n');
    expect(normalizeOutput('x\n\n\n')).toBe('x\n');
  });

  it('still treats empty output as empty', () => {
    expect(normalizeOutput('')).toBe('');
    expect(normalizeOutput('\n')).toBe('');
  });

  it('does not make unequal output match', () => {
    const ctx = { root: '/r', cwd: '/c' };
    expect(matchOutput('actual', 'expected\n', ctx)).toBe(false);
  });

  it('matches a wildcard against output with no trailing newline', () => {
    const ctx = { root: '/r', cwd: '/c' };
    expect(matchOutput('beta', '[??]\n', ctx)).toBe(true);
  });
});

describe('B4: one command prompt per block (#46)', () => {
  it('rejects a second $ prompt instead of concatenating', () => {
    const content = [`${F}console`, '$ first-command', '$ second-command', '? 0', F, ''].join('\n');

    expect(() => parseTestFile(content, '/t/f.tryscript.md')).toThrow(TestParseError);
    expect(() => parseTestFile(content, '/t/f.tryscript.md')).toThrow(/only one .* command prompt/);
  });

  it('points at the offending line', () => {
    const content = [
      '# Heading',
      '',
      `${F}console`,
      '$ first-command',
      'output',
      '$ second-command',
      '? 0',
      F,
      '',
    ].join('\n');

    // The second prompt is on line 6 (1-indexed).
    expect(() => parseTestFile(content, '/t/f.tryscript.md')).toThrow(/f\.tryscript\.md:6:/);
  });

  it('still accepts > continuation lines', () => {
    const content = [`${F}console`, '$ echo one \\', '> two', '? 0', F, ''].join('\n');
    const parsed = parseTestFile(content, '/t/f.tryscript.md');
    // Unchanged from v0.1.7, double space included: the backslash is dropped and a
    // separator added, and the shell collapses the run of spaces anyway.
    expect(getBlock(parsed.blocks, 0).command).toBe('echo one  two');
  });

  it('rejects a repeated exit code line', () => {
    const content = [`${F}console`, '$ cmd', '? 0', '? 1', F, ''].join('\n');
    expect(() => parseTestFile(content, '/t/f.tryscript.md')).toThrow(/only once/);
  });
});

describe('B5: bare ! is an empty stderr line (#45)', () => {
  it('parses an internal blank stderr line', () => {
    const content = [`${F}console`, '$ cmd', '! first', '!', '! second', '? 0', F, ''].join('\n');

    const parsed = parseTestFile(content, '/t/f.tryscript.md');
    const block = getBlock(parsed.blocks, 0);
    expect(block.expectedStderr).toBe('first\n\nsecond\n');
    // The bare `!` must not leak into stdout.
    expect(block.expectedOutput).toBe('');
  });

  it('still accepts the trailing-space spelling', () => {
    const content = [`${F}console`, '$ cmd', '! first', '! ', '! second', '? 0', F, ''].join('\n');
    expect(getBlock(parseTestFile(content, '/t/f.tryscript.md').blocks, 0).expectedStderr).toBe(
      'first\n\nsecond\n',
    );
  });

  it('matches actual stderr containing a blank line', () => {
    const ctx = { root: '/r', cwd: '/c' };
    expect(matchOutput('first\n\nsecond\n', 'first\n\nsecond\n', ctx)).toBe(true);
  });
});

describe('B6/B7: rewrites preserve fence and stderr assertions', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'regression-b6-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('keeps a bash fence as bash', async () => {
    const content = [`${F}bash`, '$ cmd', 'OLD', '? 0', F, ''].join('\n');
    const filePath = join(tempDir, 't.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);

    await updateTestFile(testFile, [
      makeResult(getBlock(testFile.blocks, 0), { actualOutput: 'NEW\n' }),
    ]);

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain('```bash');
    expect(updated).not.toContain('```console');
  });

  it('keeps stdout and stderr separate after --update', async () => {
    const content = [`${F}console`, '$ cmd', 'OLD', '! OLDERR', '? 0', F, ''].join('\n');
    const filePath = join(tempDir, 't.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);

    await updateTestFile(testFile, [
      makeResult(getBlock(testFile.blocks, 0), {
        actualOutput: 'out\nerr\n',
        actualStdout: 'out\n',
        actualStderr: 'err\n',
      }),
    ]);

    const reparsed = parseTestFile(await readFile(filePath, 'utf-8'), filePath);
    const block = getBlock(reparsed.blocks, 0);
    // The block must still assert the two streams separately, not merge them.
    expect(block.expectedOutput).toBe('out\n');
    expect(block.expectedStderr).toBe('err\n');
  });

  it('writes a blank captured stderr line as a bare !', async () => {
    const content = [`${F}console`, '$ cmd', '! OLD', '? 0', F, ''].join('\n');
    const filePath = join(tempDir, 't.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);

    await updateTestFile(testFile, [
      makeResult(getBlock(testFile.blocks, 0), {
        actualOutput: 'a\n\nb\n',
        actualStdout: '',
        actualStderr: 'a\n\nb\n',
      }),
    ]);

    const updated = await readFile(filePath, 'utf-8');
    expect(updated).toContain('\n!\n');
    expect(updated).not.toContain('! \n');
    expect(getBlock(parseTestFile(updated, filePath).blocks, 0).expectedStderr).toBe('a\n\nb\n');
  });

  it('leaves a combined-output block combined', async () => {
    const content = [`${F}console`, '$ cmd', 'OLD', '? 0', F, ''].join('\n');
    const filePath = join(tempDir, 't.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);

    await updateTestFile(testFile, [
      makeResult(getBlock(testFile.blocks, 0), {
        actualOutput: 'out\nerr\n',
        actualStdout: 'out\n',
        actualStderr: 'err\n',
      }),
    ]);

    const block = getBlock(parseTestFile(await readFile(filePath, 'utf-8'), filePath).blocks, 0);
    expect(block.expectedOutput).toBe('out\nerr\n');
    expect(block.expectedStderr).toBeUndefined();
  });
});

describe('B8: line numbers for identical blocks', () => {
  it('reports each block at its own line', () => {
    const content = [
      `${F}console`, // line 1
      '$ echo same',
      'NOPE',
      '? 0',
      F,
      '',
      'some text',
      '',
      `${F}console`, // line 9
      '$ echo same',
      'NOPE',
      '? 0',
      F,
      '',
    ].join('\n');

    const parsed = parseTestFile(content, '/t/f.tryscript.md');
    expect(getBlock(parsed.blocks, 0).lineNumber).toBe(1);
    expect(getBlock(parsed.blocks, 1).lineNumber).toBe(9);
  });

  it('counts frontmatter lines toward block line numbers', () => {
    const content = [
      '---',
      'sandbox: true',
      '---',
      '',
      `${F}console`, // line 5
      '$ cmd',
      '? 0',
      F,
      '',
    ].join('\n');

    expect(getBlock(parseTestFile(content, '/t/f.tryscript.md').blocks, 0).lineNumber).toBe(5);
  });
});

describe('B9: exit code must be an integer', () => {
  it('rejects a non-numeric exit code', () => {
    const content = [`${F}console`, '$ cmd', '? three', F, ''].join('\n');
    expect(() => parseTestFile(content, '/t/f.tryscript.md')).toThrow(
      /must be a non-negative integer/,
    );
  });

  it('accepts a valid exit code', () => {
    const content = [`${F}console`, '$ cmd', '? 42', F, ''].join('\n');
    expect(getBlock(parseTestFile(content, '/t/f.tryscript.md').blocks, 0).expectedExitCode).toBe(
      42,
    );
  });

  it('leaves a bare ? as stdout', () => {
    // Unlike `!`, a bare `?` keeps its old meaning so files printing a literal `?` work.
    const content = [`${F}console`, '$ cmd', '?', F, ''].join('\n');
    expect(getBlock(parseTestFile(content, '/t/f.tryscript.md').blocks, 0).expectedOutput).toBe(
      '?\n',
    );
  });
});

describe('B11: custom patterns containing $ substitution sequences', () => {
  const ctx = { root: '/r', cwd: '/c' };

  it('inserts $& literally rather than expanding it', () => {
    expect(matchOutput('cost$&fee\n', 'cost[MONEY]fee\n', ctx, { MONEY: '\\$&' })).toBe(true);
  });

  it("inserts $' literally", () => {
    expect(matchOutput("a$'b\n", 'a[Q]b\n', ctx, { Q: "\\$'" })).toBe(true);
  });

  it('still handles ordinary patterns', () => {
    expect(matchOutput('total: 42\n', 'total: [NUM]\n', ctx, { NUM: '\\d+' })).toBe(true);
    expect(matchOutput('total: xx\n', 'total: [NUM]\n', ctx, { NUM: '\\d+' })).toBe(false);
  });
});

describe('B12: frontmatter validation', () => {
  it('warns about an unknown key', () => {
    const warnings = validateConfig({ sandbox: true, timout: 5000 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('timout');
  });

  it('warns about a mistyped known key', () => {
    const warnings = validateConfig({ timeout: 'soon' });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]?.path).toBe('timeout');
  });

  it('accepts a valid config without warnings', () => {
    expect(
      validateConfig({
        sandbox: true,
        env: { NO_COLOR: '1' },
        timeout: 5000,
        fixtures: ['a.txt', { source: 'b.txt', dest: 'c.txt' }],
        coverage: { reportsDir: 'cov' },
      }),
    ).toEqual([]);
  });

  it('treats an empty or absent frontmatter as valid', () => {
    expect(validateConfig(null)).toEqual([]);
    expect(validateConfig(undefined)).toEqual([]);
    expect(validateConfig({})).toEqual([]);
  });

  it('surfaces warnings on the parsed file but still parses it', () => {
    const content = ['---', 'sandbx: true', '---', '', `${F}console`, '$ cmd', '? 0', F, ''].join(
      '\n',
    );
    const parsed = parseTestFile(content, '/t/f.tryscript.md');
    expect(parsed.configWarnings?.[0]?.message).toContain('sandbx');
    // Warning, never fatal: the block still parses and would still run.
    expect(parsed.blocks).toHaveLength(1);
  });
});

// --- Review round 2 (jlevy senior review on PR #48) -------------------------

describe('R1: signal exit codes are platform-correct', () => {
  it('derives the number from the runtime, not a hard-coded table', () => {
    // Asserting against os.constants makes this meaningful on every platform:
    // SIGUSR1 is 10 on Linux and 30 on macOS, SIGBUS is 7 and 10 respectively.
    for (const name of ['SIGKILL', 'SIGTERM', 'SIGSEGV', 'SIGUSR1', 'SIGBUS'] as const) {
      const number = osConstants.signals[name];
      expect(exitCodeFor(null, name)).toBe(128 + number);
    }
  });

  it('matches what a shell reports for a signal-killed command', async () => {
    // End-to-end, so the helper cannot drift from real child-process behavior.
    const ctx = await createExecutionContext({}, join(tmpdir(), 'sig.tryscript.md'));
    try {
      const block: TestBlock = {
        command: 'kill -KILL $$',
        expectedOutput: '',
        expectedExitCode: 0,
        lineNumber: 1,
        rawContent: '',
      };
      const result = await runBlock(block, ctx);
      expect(result.actualExitCode).toBe(128 + osConstants.signals.SIGKILL);
      expect(result.actualExitCode).not.toBe(0);
    } finally {
      await cleanupExecutionContext(ctx);
    }
  });

  it('never reports a bare 128 for a signal it cannot resolve', () => {
    // 128 would be a real `128 + 0` value, so it could satisfy an expectation of
    // 128 and read as a genuine result. A signal Node does not know must still
    // report failure, just not that particular number.
    const unresolvable = 'SIGNOTAREALSIGNAL' as NodeJS.Signals;
    expect(osConstants.signals[unresolvable]).toBeUndefined();
    expect(exitCodeFor(null, unresolvable)).not.toBe(0);
    expect(exitCodeFor(null, unresolvable)).not.toBe(128);
  });
});

describe('R3: validation covers coverage and nested objects', () => {
  it('validates the coverage key instead of blindly allowlisting it', () => {
    const warnings = validateConfig({ coverage: 'wrong' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('coverage');
  });

  it('reports an unknown key nested inside coverage', () => {
    const warnings = validateConfig({ coverage: { reportsDirr: 'x' } });
    expect(warnings[0]?.message).toContain('reportsDirr');
  });

  it('reports a misspelled nested fixture key instead of stripping it', () => {
    const warnings = validateConfig({ fixtures: [{ source: 'a.txt', dst: 'b.txt' }] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.path).toBe('fixtures.0.dst');
  });

  it('names the offending key in the message, not just the type error', () => {
    const warnings = validateConfig({ fixtures: { source: 'a' } });
    expect(warnings[0]?.message).toContain('fixtures');
  });

  it('still accepts a fully valid config', () => {
    expect(
      validateConfig({
        sandbox: true,
        fixtures: ['a.txt', { source: 'b.txt', dest: 'c.txt' }],
        coverage: { reportsDir: 'cov', reporters: ['text'] },
      }),
    ).toEqual([]);
  });
});

describe('R4: --expand handles wildcards in either stream', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'regression-r4-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function expandOne(content: string, result: Partial<TestBlockResult>) {
    const filePath = join(tempDir, 't.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);
    const outcome = await expandTestFile(
      testFile,
      [makeResult(getBlock(testFile.blocks, 0), result)],
      'unknown',
      { root: tempDir, cwd: tempDir },
    );
    return { outcome, reparsed: parseTestFile(await readFile(filePath, 'utf-8'), filePath) };
  }

  it('expands a wildcard that exists only in stderr', async () => {
    const { outcome, reparsed } = await expandOne(
      [`${F}console`, '$ cmd', '! [??]', '? 0', F, ''].join('\n'),
      { actualOutput: 'boom\n', actualStdout: '', actualStderr: 'boom\n' },
    );
    expect(outcome.expanded).toBe(true);
    expect(getBlock(reparsed.blocks, 0).expectedStderr).toBe('boom\n');
  });

  it('expands stderr when stdout is literal and already matches', async () => {
    const { outcome, reparsed } = await expandOne(
      [`${F}console`, '$ cmd', 'out', '! [??]', '? 0', F, ''].join('\n'),
      { actualOutput: 'out\nboom\n', actualStdout: 'out\n', actualStderr: 'boom\n' },
    );
    expect(outcome.expanded).toBe(true);
    const block = getBlock(reparsed.blocks, 0);
    expect(block.expectedOutput).toBe('out\n');
    expect(block.expectedStderr).toBe('boom\n');
  });

  it('expands stdout without discarding literal stderr assertions', async () => {
    const { reparsed } = await expandOne(
      [`${F}console`, '$ cmd', '[??]', '! err', '? 0', F, ''].join('\n'),
      { actualOutput: 'out\nerr\n', actualStdout: 'out\n', actualStderr: 'err\n' },
    );
    const block = getBlock(reparsed.blocks, 0);
    expect(block.expectedOutput).toBe('out\n');
    expect(block.expectedStderr).toBe('err\n');
  });

  it('still writes nothing when neither stream has a wildcard', async () => {
    const { outcome } = await expandOne(
      [`${F}console`, '$ cmd', 'out', '! err', '? 0', F, ''].join('\n'),
      { actualOutput: 'out\nerr\n', actualStdout: 'out\n', actualStderr: 'err\n' },
    );
    expect(outcome).toEqual({ expanded: false, expandedCount: 0, changes: [] });
  });
});

describe('R5: TestBlock stays constructible by external consumers', () => {
  it('accepts a block literal without parser bookkeeping fields', () => {
    // Compile-time guard: this is the shape a v0.1.7 consumer would have written.
    // If startOffset/endOffset/infoString ever become required again, this fails
    // to typecheck rather than silently breaking downstream builds.
    const block: TestBlock = {
      command: 'echo hi',
      expectedOutput: 'hi\n',
      expectedExitCode: 0,
      lineNumber: 1,
      rawContent: '```console\n$ echo hi\nhi\n? 0\n```',
    };
    expect(block.startOffset).toBeUndefined();
    expect(block.infoString).toBeUndefined();
  });

  it('refuses to rewrite a block that lacks source offsets', () => {
    // Loud failure beats falling back to locating the block by text, which is the
    // ambiguity that caused the duplicate-block bug in the first place.
    const block: TestBlock = {
      command: 'echo hi',
      expectedOutput: 'hi\n',
      expectedExitCode: 0,
      lineNumber: 4,
      rawContent: '',
    };
    expect(() => asParsedBlock(block)).toThrow(/missing source offsets/);
    expect(() => asParsedBlock(block)).toThrow(/line 4/);
  });

  it('narrows a parser-produced block without complaint', () => {
    const content = [`${F}console`, '$ echo hi', 'hi', '? 0', F, ''].join('\n');
    const parsed = parseTestFile(content, '/t/f.tryscript.md');
    expect(() => asParsedBlock(getBlock(parsed.blocks, 0))).not.toThrow();
  });
});

describe('R6: the project self-suite is clean under validation', () => {
  it('reports no warnings for the frontmatter the golden files use', () => {
    // Guards against a stale key returning to the project's own test files.
    expect(validateConfig({ sandbox: true, env: { NO_COLOR: '1' } })).toEqual([]);
  });

  it('flags the removed bin key so it cannot quietly come back', () => {
    const warnings = validateConfig({ sandbox: true, bin: '../dist/bin.mjs' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain('bin');
  });
});
