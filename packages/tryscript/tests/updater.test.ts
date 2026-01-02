import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateTestFile } from '../src/lib/updater.js';
import { parseTestFile } from '../src/lib/parser.js';
import type { TestBlock, TestBlockResult } from '../src/lib/types.js';

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
    expect(changes).toEqual(['Test 2', 'Test 1']); // Reverse order

    const newContent = await readFile(filePath, 'utf-8');
    expect(newContent).toContain('one');
    expect(newContent).toContain('two');
    expect(newContent).not.toContain('wrong1');
    expect(newContent).not.toContain('wrong2');
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
