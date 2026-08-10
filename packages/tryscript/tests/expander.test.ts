import { describe, it, expect, vi } from 'vitest';
import { expandExpectedOutput, expandTestFile, shouldExpandCategory } from '../src/lib/expander.js';
import type { TestBlock, TestBlockResult, TestFile } from '../src/lib/types.js';

vi.mock('atomically', () => ({ writeFile: vi.fn() }));

const context = { root: '/test/root', cwd: '/test/cwd' };

describe('shouldExpandCategory', () => {
  it('unknown level only targets unknown', () => {
    expect(shouldExpandCategory('unknown', 'unknown')).toBe(true);
    expect(shouldExpandCategory('generic', 'unknown')).toBe(false);
    expect(shouldExpandCategory('named', 'unknown')).toBe(false);
  });

  it('generic level targets unknown and generic', () => {
    expect(shouldExpandCategory('unknown', 'generic')).toBe(true);
    expect(shouldExpandCategory('generic', 'generic')).toBe(true);
    expect(shouldExpandCategory('named', 'generic')).toBe(false);
  });

  it('all level targets everything', () => {
    expect(shouldExpandCategory('unknown', 'all')).toBe(true);
    expect(shouldExpandCategory('generic', 'all')).toBe(true);
    expect(shouldExpandCategory('named', 'all')).toBe(true);
  });
});

describe('expandExpectedOutput', () => {
  it('returns null on mismatch', () => {
    expect(expandExpectedOutput('goodbye\n', 'hello\n', context, 'unknown')).toBeNull();
  });

  it('expands [??] with unknown level', () => {
    const result = expandExpectedOutput('Result: [??]\n', 'Result: 42\n', context, 'unknown');
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('Result: 42\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('expands ??? with unknown level', () => {
    const result = expandExpectedOutput(
      'header\n???\nfooter\n',
      'header\nline1\nline2\nfooter\n',
      context,
      'unknown',
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('header\nline1\nline2\nfooter\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('does NOT expand [..] with unknown level', () => {
    const result = expandExpectedOutput('Value: [..]\n', 'Value: 123\n', context, 'unknown');
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('Value: [..]\n');
    expect(result!.expandedCount).toBe(0);
  });

  it('expands [..] with generic level', () => {
    const result = expandExpectedOutput('Value: [..]\n', 'Value: 123\n', context, 'generic');
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('Value: 123\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('expands ... with generic level', () => {
    const result = expandExpectedOutput(
      'header\n...\nfooter\n',
      'header\nline1\nline2\nfooter\n',
      context,
      'generic',
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('header\nline1\nline2\nfooter\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('does NOT expand named patterns with generic level', () => {
    const patterns = { VERSION: '\\d+\\.\\d+\\.\\d+' };
    const result = expandExpectedOutput(
      'v: [VERSION]\n',
      'v: 1.2.3\n',
      context,
      'generic',
      patterns,
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('v: [VERSION]\n');
    expect(result!.expandedCount).toBe(0);
  });

  it('expands named patterns with all level', () => {
    const patterns = { VERSION: '\\d+\\.\\d+\\.\\d+' };
    const result = expandExpectedOutput('v: [VERSION]\n', 'v: 1.2.3\n', context, 'all', patterns);
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('v: 1.2.3\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('ignores custom names reserved for built-in path tokens', () => {
    const result = expandExpectedOutput(
      'File: [ROOT]/output.txt\n',
      'File: /test/root/output.txt\n',
      context,
      'all',
      { ROOT: '.+' },
    );

    expect(result).toEqual({
      expandedOutput: 'File: [ROOT]/output.txt\n',
      captures: [],
      expandedCount: 0,
    });
  });

  it('handles mixed wildcards, only expanding targeted ones', () => {
    const result = expandExpectedOutput(
      'a: [..]\n???\nd\n',
      'a: 100\nb\nc: 200\nd\n',
      context,
      'unknown',
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('a: [..]\nb\nc: 200\nd\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('handles interleaved types where unknown precedes generic', () => {
    const result = expandExpectedOutput(
      '???\nvalue: [..]\nfooter\n',
      'line1\nline2\nvalue: 42\nfooter\n',
      context,
      'unknown',
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('line1\nline2\nvalue: [..]\nfooter\n');
    expect(result!.expandedCount).toBe(1);
  });

  it('handles interleaved types at all level with correct values', () => {
    const result = expandExpectedOutput(
      '???\nvalue: [..]\nfooter\n',
      'line1\nline2\nvalue: 42\nfooter\n',
      context,
      'all',
    );
    expect(result).not.toBeNull();
    expect(result!.expandedOutput).toBe('line1\nline2\nvalue: 42\nfooter\n');
    expect(result!.expandedCount).toBe(2);
  });

  it('returns zero expandedCount when nothing to expand', () => {
    const result = expandExpectedOutput('exact\n', 'exact\n', context, 'unknown');
    expect(result).not.toBeNull();
    expect(result!.expandedCount).toBe(0);
  });
});

describe('expandTestFile', () => {
  function makeBlock(overrides: Partial<TestBlock> = {}): TestBlock {
    return {
      command: 'echo hello',
      expectedOutput: '[??]\n',
      expectedExitCode: 0,
      lineNumber: 5,
      rawContent: '```console\n$ echo hello\n[??]\n? 0\n```',
      infoString: 'console',
      ...overrides,
    };
  }

  function makeResult(block: TestBlock, overrides: Partial<TestBlockResult> = {}): TestBlockResult {
    return {
      block,
      passed: true,
      actualOutput: 'hello\n',
      actualExitCode: 0,
      duration: 10,
      ...overrides,
    };
  }

  it('expands unknown wildcards and reports changes', async () => {
    const block = makeBlock();
    const rawContent = '# Test\n\n```console\n$ echo hello\n[??]\n? 0\n```\n';
    const file: TestFile = {
      path: '/tmp/test-expand.tryscript.md',
      blocks: [block],
      rawContent,
      config: {},
    };
    const result = makeResult(block);

    const { expanded, expandedCount, changes } = await expandTestFile(
      file,
      [result],
      'unknown',
      context,
    );

    expect(expanded).toBe(true);
    expect(expandedCount).toBe(1);
    expect(changes).toHaveLength(1);
  });

  it('aligns results by block identity when only a subset of blocks ran', async () => {
    const firstBlock = makeBlock({
      name: 'first block',
      lineNumber: 5,
      command: 'echo first',
      expectedOutput: 'value: [??]\n',
      rawContent: '```console\n$ echo first\nvalue: [??]\n? 0\n```',
    });
    const secondBlock = makeBlock({
      name: 'second block',
      lineNumber: 11,
      command: 'echo second',
      expectedOutput: 'value: [??]\n',
      rawContent: '```console\n$ echo second\nvalue: [??]\n? 0\n```',
    });

    const rawContent =
      '# Test\n\n```console\n$ echo first\nvalue: [??]\n? 0\n```\n\n' +
      '```console\n$ echo second\nvalue: [??]\n? 0\n```\n';

    const file: TestFile = {
      path: '/tmp/test-subset.tryscript.md',
      blocks: [firstBlock, secondBlock],
      rawContent,
      config: {},
    };

    // Simulate --filter/<!-- only -->: only the second block produced a result.
    const secondResult = makeResult(secondBlock, { actualOutput: 'value: second\n' });
    const { expanded, expandedCount, changes } = await expandTestFile(
      file,
      [secondResult],
      'unknown',
      context,
    );

    expect(expanded).toBe(true);
    expect(expandedCount).toBe(1);
    expect(changes).toEqual(['second block']);
  });

  it('does not write file when nothing to expand', async () => {
    const block = makeBlock({
      expectedOutput: 'hello\n',
      rawContent: '```console\n$ echo hello\nhello\n? 0\n```',
    });
    const file: TestFile = {
      path: '/tmp/test-noexpand.tryscript.md',
      blocks: [block],
      rawContent: '```console\n$ echo hello\nhello\n? 0\n```\n',
      config: {},
    };
    const result = makeResult(block);

    const { expanded, expandedCount } = await expandTestFile(file, [result], 'unknown', context);

    expect(expanded).toBe(false);
    expect(expandedCount).toBe(0);
  });

  it('expands a wildcard when the block only asserts stderr', async () => {
    const block = makeBlock({
      expectedOutput: '',
      expectedStderr: '[??]\n',
      rawContent: '```console\n$ echo error\n! [??]\n? 0\n```',
    });
    const file: TestFile = {
      path: '/tmp/test-expand-stderr.tryscript.md',
      blocks: [block],
      rawContent: block.rawContent,
      config: {},
    };
    const result = makeResult(block, {
      actualOutput: 'error\n',
      actualStdout: '',
      actualStderr: 'error\n',
    });

    const expanded = await expandTestFile(file, [result], 'unknown', context);

    expect(expanded.expanded).toBe(true);
    expect(expanded.expandedCount).toBe(1);
  });

  it('expands stderr when stdout matches without a wildcard', async () => {
    const block = makeBlock({
      expectedOutput: 'ok\n',
      expectedStderr: 'error: [??]\n',
      rawContent: '```console\n$ command\nok\n! error: [??]\n? 0\n```',
    });
    const file: TestFile = {
      path: '/tmp/test-expand-mixed.tryscript.md',
      blocks: [block],
      rawContent: block.rawContent,
      config: {},
    };
    const result = makeResult(block, {
      actualOutput: 'ok\nerror: details\n',
      actualStdout: 'ok\n',
      actualStderr: 'error: details\n',
    });

    const expanded = await expandTestFile(file, [result], 'unknown', context);

    expect(expanded.expanded).toBe(true);
    expect(expanded.expandedCount).toBe(1);
  });
});
