import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateTestFile } from '../src/lib/updater.js';
import { parseTestFile } from '../src/lib/parser.js';
import type { TestBlock, TestBlockResult } from '../src/index.js';

function getBlock(blocks: TestBlock[], index: number): TestBlock {
  const block = blocks[index];
  if (!block) {
    throw new Error(`Block at index ${index} not found`);
  }
  return block;
}

describe('updateTestFile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'updater-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('updates a legacy TestBlock without source-offset metadata', async () => {
    const rawContent = '```console\n$ echo old\nold\n? 0\n```';
    const filePath = join(tempDir, 'legacy.tryscript.md');
    await writeFile(filePath, rawContent);
    const block: TestBlock = {
      command: 'echo old',
      expectedOutput: 'old\n',
      expectedExitCode: 0,
      lineNumber: 1,
      rawContent,
    };

    await updateTestFile({ path: filePath, config: {}, blocks: [block], rawContent }, [
      {
        block,
        passed: false,
        actualOutput: 'new\n',
        actualExitCode: 0,
        duration: 1,
      },
    ]);

    expect(await readFile(filePath, 'utf-8')).toBe('```console\n$ echo old\nnew\n? 0\n```');
  });

  it('rejects a legacy block that cannot be located in the file', async () => {
    const fileContent = '```console\n$ echo current\ncurrent\n? 0\n```';
    const rawContent = '```console\n$ echo stale\nstale\n? 0\n```';
    const filePath = join(tempDir, 'stale.tryscript.md');
    await writeFile(filePath, fileContent);
    const block: TestBlock = {
      command: 'echo stale',
      expectedOutput: 'stale\n',
      expectedExitCode: 0,
      lineNumber: 1,
      rawContent,
    };

    await expect(
      updateTestFile({ path: filePath, config: {}, blocks: [block], rawContent: fileContent }, [
        {
          block,
          passed: false,
          actualOutput: 'new\n',
          actualExitCode: 0,
          duration: 1,
        },
      ]),
    ).rejects.toThrow(/cannot locate.*block/i);
    expect(await readFile(filePath, 'utf-8')).toBe(fileContent);
  });

  it('rejects stale explicit source offsets without modifying the file', async () => {
    const fileContent = 'prefix\n```console\n$ echo current\ncurrent\n? 0\n```\nsuffix\n';
    const filePath = join(tempDir, 'stale-offsets.tryscript.md');
    await writeFile(filePath, fileContent);
    const testFile = parseTestFile(fileContent, filePath);
    const block = getBlock(testFile.blocks, 0);
    block.startOffset = (block.startOffset ?? 0) + 1;
    block.endOffset = (block.endOffset ?? 0) + 1;

    await expect(
      updateTestFile(testFile, [
        {
          block,
          passed: false,
          actualOutput: 'replacement\n',
          actualExitCode: 0,
          duration: 1,
        },
      ]),
    ).rejects.toThrow(/source offsets.*stale/i);
    expect(await readFile(filePath, 'utf-8')).toBe(fileContent);
  });

  it('rejects incomplete explicit source-offset metadata', async () => {
    const rawContent = '```console\n$ echo current\ncurrent\n? 0\n```';
    const filePath = join(tempDir, 'partial-offsets.tryscript.md');
    await writeFile(filePath, rawContent);
    const block: TestBlock = {
      command: 'echo current',
      expectedOutput: 'current\n',
      expectedExitCode: 0,
      lineNumber: 1,
      rawContent,
      startOffset: 0,
    };

    await expect(
      updateTestFile({ path: filePath, config: {}, blocks: [block], rawContent }, [
        {
          block,
          passed: false,
          actualOutput: 'replacement\n',
          actualExitCode: 0,
          duration: 1,
        },
      ]),
    ).rejects.toThrow(/source-offset metadata.*incomplete/i);
    expect(await readFile(filePath, 'utf-8')).toBe(rawContent);
  });

  it('does not modify passing tests', async () => {
    const content = `# Test

\`\`\`console
$ echo hello
hello
? 0
\`\`\`
`;
    const filePath = join(tempDir, 'test.tryscript.md');
    await writeFile(filePath, content);

    const testFile = parseTestFile(content, filePath);
    const results: TestBlockResult[] = [
      {
        block: getBlock(testFile.blocks, 0),
        passed: true,
        actualOutput: 'hello\n',
        actualExitCode: 0,
        duration: 10,
      },
    ];

    const { updated, changes } = await updateTestFile(testFile, results);
    expect(updated).toBe(false);
    expect(changes).toEqual([]);

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toBe(content);
  });

  it('updates failing test with actual output', async () => {
    const content = `# Test

\`\`\`console
$ echo hello
wrong output
? 0
\`\`\`
`;
    const filePath = join(tempDir, 'test.tryscript.md');
    await writeFile(filePath, content);

    const testFile = parseTestFile(content, filePath);
    const results: TestBlockResult[] = [
      {
        block: getBlock(testFile.blocks, 0),
        passed: false,
        actualOutput: 'hello\n',
        actualExitCode: 0,
        duration: 10,
      },
    ];

    const { updated, changes } = await updateTestFile(testFile, results);
    expect(updated).toBe(true);
    expect(changes).toEqual(['Test']);

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toContain('hello');
    expect(newContent).not.toContain('wrong output');
  });

  it('preserves CRLF throughout a rewritten block', async () => {
    const content = [
      '# Test',
      '',
      '```console',
      '$ echo hello',
      'wrong output',
      '? 0',
      '```',
      '',
    ].join('\r\n');
    const filePath = join(tempDir, 'crlf.tryscript.md');
    await writeFile(filePath, content);
    const testFile = parseTestFile(content, filePath);
    const block = getBlock(testFile.blocks, 0);

    await updateTestFile(testFile, [
      {
        block,
        passed: false,
        actualOutput: 'first\r\nsecond\r\n',
        actualExitCode: 0,
        duration: 10,
      },
    ]);

    expect(await readFile(filePath, 'utf-8')).toBe(
      ['# Test', '', '```console', '$ echo hello', 'first', 'second', '? 0', '```', ''].join(
        '\r\n',
      ),
    );
  });

  it('updates exit code when different', async () => {
    const content = `# Exit Test

\`\`\`console
$ false
? 0
\`\`\`
`;
    const filePath = join(tempDir, 'test.tryscript.md');
    await writeFile(filePath, content);

    const testFile = parseTestFile(content, filePath);
    const results: TestBlockResult[] = [
      {
        block: getBlock(testFile.blocks, 0),
        passed: false,
        actualOutput: '',
        actualExitCode: 1,
        duration: 10,
      },
    ];

    const { updated, changes } = await updateTestFile(testFile, results);
    expect(updated).toBe(true);
    expect(changes).toEqual(['Exit Test']);

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toContain('? 1');
    expect(newContent).not.toContain('? 0');
  });

  it('does not update on execution error', async () => {
    const content = `# Test

\`\`\`console
$ echo hello
hello
? 0
\`\`\`
`;
    const filePath = join(tempDir, 'test.tryscript.md');
    await writeFile(filePath, content);

    const testFile = parseTestFile(content, filePath);
    const results: TestBlockResult[] = [
      {
        block: getBlock(testFile.blocks, 0),
        passed: false,
        actualOutput: '',
        actualExitCode: -1,
        duration: 10,
        error: 'Command timed out',
      },
    ];

    const { updated, changes } = await updateTestFile(testFile, results);
    expect(updated).toBe(false);
    expect(changes).toEqual([]);

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toBe(content);
  });

  it('updates multiple failing blocks', async () => {
    const content = `# Test 1

\`\`\`console
$ echo one
wrong1
? 0
\`\`\`

# Test 2

\`\`\`console
$ echo two
wrong2
? 0
\`\`\`
`;
    const filePath = join(tempDir, 'test.tryscript.md');
    await writeFile(filePath, content);

    const testFile = parseTestFile(content, filePath);
    const results: TestBlockResult[] = [
      {
        block: getBlock(testFile.blocks, 0),
        passed: false,
        actualOutput: 'one\n',
        actualExitCode: 0,
        duration: 10,
      },
      {
        block: getBlock(testFile.blocks, 1),
        passed: false,
        actualOutput: 'two\n',
        actualExitCode: 0,
        duration: 10,
      },
    ];

    const { updated, changes } = await updateTestFile(testFile, results);
    expect(updated).toBe(true);
    // Document order. Rewrites are spliced by source offset in descending order, so
    // the reported list is no longer coupled to the order edits are applied in.
    expect(changes).toEqual(['Test 1', 'Test 2']);

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toContain('one');
    expect(newContent).toContain('two');
    expect(newContent).not.toContain('wrong1');
    expect(newContent).not.toContain('wrong2');
  });

  it('aligns results by block identity when only a subset ran', async () => {
    const content = `# Test 1

\`\`\`console
$ echo first
wrong1
? 0
\`\`\`

# Test 2

\`\`\`console
$ echo second
wrong2
? 0
\`\`\`
`;
    const filePath = join(tempDir, 'test.tryscript.md');
    await writeFile(filePath, content);

    const testFile = parseTestFile(content, filePath);

    // Simulate --filter: only the second block ran and failed
    const secondBlock = getBlock(testFile.blocks, 1);
    const results: TestBlockResult[] = [
      {
        block: secondBlock,
        passed: false,
        actualOutput: 'two\n',
        actualExitCode: 0,
        duration: 10,
      },
    ];

    const { updated, changes } = await updateTestFile(testFile, results);
    expect(updated).toBe(true);
    expect(changes).toEqual(['Test 2']);

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toContain('wrong1');
    expect(newContent).toContain('two');
    expect(newContent).not.toContain('wrong2');
  });

  it('preserves extended fence length when updating', async () => {
    const content = `# Test

\`\`\`\`console
$ echo hello
wrong
? 0
\`\`\`\`
`;
    const filePath = join(tempDir, 'test.tryscript.md');
    await writeFile(filePath, content);

    const testFile = parseTestFile(content, filePath);
    const results: TestBlockResult[] = [
      {
        block: getBlock(testFile.blocks, 0),
        passed: false,
        actualOutput: 'hello\n',
        actualExitCode: 0,
        duration: 10,
      },
    ];

    const { updated } = await updateTestFile(testFile, results);
    expect(updated).toBe(true);

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toContain('````console');
    expect(newContent).toContain('hello');
    expect(newContent).not.toContain('wrong');
  });

  it('preserves frontmatter', async () => {
    const content = `---
env:
  FOO: bar
---

# Test

\`\`\`console
$ echo hello
wrong
? 0
\`\`\`
`;
    const filePath = join(tempDir, 'test.tryscript.md');
    await writeFile(filePath, content);

    const testFile = parseTestFile(content, filePath);
    const results: TestBlockResult[] = [
      {
        block: getBlock(testFile.blocks, 0),
        passed: false,
        actualOutput: 'hello\n',
        actualExitCode: 0,
        duration: 10,
      },
    ];

    const { updated } = await updateTestFile(testFile, results);
    expect(updated).toBe(true);

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toContain('---');
    expect(newContent).toContain('FOO: bar');
    expect(newContent).toContain('hello');
  });
});
