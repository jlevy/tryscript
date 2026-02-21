import { describe, it, expect } from 'vitest';
import { buildCaptureLogDoc, captureLogSortMapEntries } from '../src/lib/capture-log.js';
import { stringifyYaml } from '../src/lib/yaml-utils.js';
import type { TestFileResult, TestBlockResult, TestBlock, TestFile } from '../src/lib/types.js';

function makeBlock(overrides: Partial<TestBlock> = {}): TestBlock {
  return {
    command: 'echo hello',
    expectedOutput: 'hello\n',
    expectedExitCode: 0,
    lineNumber: 1,
    rawContent: '```console\n$ echo hello\nhello\n? 0\n```',
    name: 'test block',
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

function makeFileResult(blocks: TestBlock[], results: TestBlockResult[]): TestFileResult {
  const file: TestFile = {
    path: '/test/example.tryscript.md',
    blocks,
    rawContent: 'raw',
    config: {},
  };
  return {
    file,
    results,
    passed: results.every((r) => r.passed),
    duration: results.reduce((sum, r) => sum + r.duration, 0),
  };
}

describe('buildCaptureLogDoc', () => {
  it('builds a capture log document with correct structure', () => {
    const block = makeBlock({ expectedOutput: 'Result: [??]\n' });
    const result = makeResult(block, { actualOutput: 'Result: 42\n' });
    const fr = makeFileResult([block], [result]);

    const context = { root: '/test', cwd: '/test' };
    const doc = buildCaptureLogDoc([fr], () => context);

    expect(doc.generated).toBeDefined();
    expect(doc.files).toHaveLength(1);

    const logFile = doc.files[0]!;
    expect(logFile.blocks).toHaveLength(1);

    const logBlock = logFile.blocks[0]!;
    expect(logBlock.name).toBe('test block');
    expect(logBlock.command).toBe('echo hello');
    expect(logBlock.captures).toHaveLength(1);
    expect(logBlock.captures[0]).toMatchObject({
      category: 'unknown',
      matched: '42',
    });
    expect(logBlock.passed).toBe(true);
  });

  it('returns empty captures when output does not match', () => {
    const block = makeBlock({ expectedOutput: 'goodbye\n' });
    const result = makeResult(block, { actualOutput: 'hello\n', passed: false });
    const fr = makeFileResult([block], [result]);

    const doc = buildCaptureLogDoc([fr], () => ({ root: '/t', cwd: '/t' }));
    expect(doc.files[0]!.blocks[0]!.captures).toEqual([]);
  });
});

describe('capture log YAML key ordering', () => {
  it('produces YAML with keys in logical order', () => {
    const block = makeBlock({
      expectedOutput: 'Result: [??]\n',
      name: 'My test',
    });
    const result = makeResult(block, { actualOutput: 'Result: 42\n' });
    const fr = makeFileResult([block], [result]);

    const doc = buildCaptureLogDoc([fr], () => ({ root: '/test', cwd: '/test' }));
    const yaml = stringifyYaml(doc, { sortMapEntries: captureLogSortMapEntries });

    const lines = yaml.split('\n');
    const generatedIdx = lines.findIndex((l) => l.startsWith('generated:'));
    const filesIdx = lines.findIndex((l) => l.startsWith('files:'));
    expect(generatedIdx).toBeLessThan(filesIdx);

    const nameIdx = lines.findIndex((l) => l.trimStart().startsWith('name:'));
    const commandIdx = lines.findIndex((l) => l.trimStart().startsWith('command:'));
    const expectedOutputIdx = lines.findIndex((l) => l.trimStart().startsWith('expected_output:'));
    const actualOutputIdx = lines.findIndex((l) => l.trimStart().startsWith('actual_output:'));
    const capturesIdx = lines.findIndex((l) => l.trimStart().startsWith('captures:'));
    const passedIdx = lines.findIndex((l) => l.trimStart().startsWith('passed:'));

    expect(nameIdx).toBeLessThan(commandIdx);
    expect(commandIdx).toBeLessThan(expectedOutputIdx);
    expect(expectedOutputIdx).toBeLessThan(actualOutputIdx);
    expect(actualOutputIdx).toBeLessThan(capturesIdx);
    expect(capturesIdx).toBeLessThan(passedIdx);
  });

  it('orders capture fields correctly', () => {
    const block = makeBlock({
      expectedOutput: 'Result: [??]\n',
    });
    const result = makeResult(block, { actualOutput: 'Result: 42\n' });
    const fr = makeFileResult([block], [result]);

    const doc = buildCaptureLogDoc([fr], () => ({ root: '/test', cwd: '/test' }));
    const yaml = stringifyYaml(doc, { sortMapEntries: captureLogSortMapEntries });

    const lines = yaml.split('\n');
    const categoryIdx = lines.findIndex((l) => l.trimStart().startsWith('category:'));
    const matchedIdx = lines.findIndex((l) => l.trimStart().startsWith('matched:'));

    expect(categoryIdx).toBeLessThan(matchedIdx);
  });
});
