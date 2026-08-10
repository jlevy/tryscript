import { describe, it, expect } from 'vitest';
import { parseTestFile, TestParseError } from '../src/lib/parser.js';

describe('parseTestFile', () => {
  it('should parse a simple test file', () => {
    const content = `# Test: Echo command

\`\`\`console
$ echo "hello"
hello
? 0
\`\`\`
`;

    const result = parseTestFile(content, '/test/file.tryscript.md');

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.command).toBe('echo "hello"');
    expect(result.blocks[0]?.expectedOutput).toBe('hello\n');
    expect(result.blocks[0]?.expectedExitCode).toBe(0);
    expect(result.blocks[0]?.name).toBe('Echo command');
  });

  it('should parse frontmatter', () => {
    const content = `---
sandbox: true
env:
  NO_COLOR: "1"
---

# Test: Help

\`\`\`console
$ echo --help
Usage: echo
? 0
\`\`\`
`;

    const result = parseTestFile(content, '/test/file.tryscript.md');

    expect(result.config.sandbox).toBe(true);
    expect(result.config.env).toEqual({ NO_COLOR: '1' });
    expect(result.blocks).toHaveLength(1);
  });

  it('reports malformed YAML frontmatter with file and line context', () => {
    const content = `---
sandbox: [
---
`;

    let thrown: unknown;
    try {
      parseTestFile(content, '/test/malformed.tryscript.md');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TestParseError);
    if (!(thrown instanceof TestParseError)) {
      throw new Error('Expected malformed frontmatter to throw TestParseError');
    }
    expect(thrown.filePath).toBe('/test/malformed.tryscript.md');
    expect(thrown.lineNumber).toBe(3);
    expect(thrown.cause).toBeInstanceOf(Error);
    expect(thrown.message).toContain('/test/malformed.tryscript.md:3: invalid YAML frontmatter:');
  });

  it('rejects unclosed YAML frontmatter at the opening delimiter', () => {
    const content = `---
sandbox: true

# Test: This body must not be silently ignored
`;

    expect(() => parseTestFile(content, '/test/unclosed-frontmatter.tryscript.md')).toThrow(
      new TestParseError('unclosed YAML frontmatter', '/test/unclosed-frontmatter.tryscript.md', 1),
    );
  });

  it('should parse exit codes', () => {
    const content = `# Test: Exit code

\`\`\`console
$ exit 42
? 42
\`\`\`
`;

    const result = parseTestFile(content, '/test/file.tryscript.md');

    expect(result.blocks[0]?.expectedExitCode).toBe(42);
  });

  it('should parse multi-line commands with continuation', () => {
    const content = `# Test: Multi-line

\`\`\`console
$ echo "line 1" && \\
> echo "line 2"
line 1
line 2
? 0
\`\`\`
`;

    const result = parseTestFile(content, '/test/file.tryscript.md');

    expect(result.blocks[0]?.command).toBe('echo "line 1" &&  echo "line 2"');
  });

  it('removes CRLF carriage returns from continued commands and expected output', () => {
    const content = [
      '# Test: CRLF continuation',
      '',
      '```console',
      '$ echo "line 1" && \\',
      '> echo "line 2"',
      'line 1',
      'line 2',
      '? 0',
      '```',
      '',
    ].join('\r\n');

    const result = parseTestFile(content, '/test/crlf.tryscript.md');

    expect(result.blocks[0]?.command).toBe('echo "line 1" &&  echo "line 2"');
    expect(result.blocks[0]?.expectedOutput).toBe('line 1\nline 2\n');
  });

  it('should parse extended fences (4+ backticks)', () => {
    const content = `# Test: Extended fences

\`\`\`\`console
$ echo hello
hello
? 0
\`\`\`\`
`;

    const result = parseTestFile(content, '/test/file.tryscript.md');

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.command).toBe('echo hello');
    expect(result.blocks[0]?.expectedOutput).toBe('hello\n');
    expect(result.blocks[0]?.expectedExitCode).toBe(0);
  });

  it('should handle nested triple backticks inside extended fences', () => {
    const content = `# Test: Nested backticks

\`\`\`\`console
$ echo "\`\`\`"
\`\`\`
? 0
\`\`\`\`
`;

    const result = parseTestFile(content, '/test/file.tryscript.md');

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.expectedOutput).toBe('```\n');
  });

  it('ignores executable-looking examples inside an opaque Markdown fence', () => {
    const content = `# Documentation example

\`\`\`\`markdown
\`\`\`console
$ echo must-not-run
must-not-run
\`\`\`
\`\`\`\`

# Test: Real block

\`\`\`console
$ echo real
real
\`\`\`
`;

    const result = parseTestFile(content, '/test/opaque-fence.tryscript.md');

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.command).toBe('echo real');
  });

  it('ignores headings and annotations inside opaque fences', () => {
    const content = `# Test: Real test

\`\`\`\`markdown
# Test: Documentation example <!-- only -->

<!-- skip -->
\`\`\`console
$ echo documentation
documentation
\`\`\`
\`\`\`\`

\`\`\`console
$ echo real
real
\`\`\`
`;

    const result = parseTestFile(content, '/test/opaque-metadata.tryscript.md');

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      name: 'Real test',
      command: 'echo real',
      skip: false,
      only: false,
    });
  });

  it('ignores headings and annotations in prior expected output', () => {
    const content = `# Test: Shared heading

\`\`\`console
$ printf output
# Test: Printed heading <!-- only -->
<!-- skip -->
\`\`\`

\`\`\`console
$ echo second
second
\`\`\`
`;

    const result = parseTestFile(content, '/test/output-metadata.tryscript.md');

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[1]).toMatchObject({
      name: 'Shared heading',
      command: 'echo second',
      skip: false,
      only: false,
    });
  });

  it('should not close extended fence with fewer backticks', () => {
    const content = `# Test: Extended fence not closed early

\`\`\`\`\`console
$ echo test
\`\`\`
\`\`\`\`
still output
? 0
\`\`\`\`\`
`;

    const result = parseTestFile(content, '/test/file.tryscript.md');

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.expectedOutput).toBe('```\n````\nstill output\n');
  });

  it('should handle empty expected output', () => {
    const content = `# Test: No output

\`\`\`console
$ true
? 0
\`\`\`
`;

    const result = parseTestFile(content, '/test/file.tryscript.md');

    expect(result.blocks[0]?.expectedOutput).toBe('');
    expect(result.blocks[0]?.expectedExitCode).toBe(0);
  });

  it('rejects an unclosed executable fence at its source line', () => {
    const content = `# Test: Unclosed

\`\`\`console
$ echo never-runs
`;

    expect(() => parseTestFile(content, '/test/unclosed.tryscript.md')).toThrow(
      new TestParseError('unclosed console code block', '/test/unclosed.tryscript.md', 3),
    );
  });

  it('rejects an executable fence without a command prompt', () => {
    const content = `# Test: Missing command

\`\`\`console
output without a command
\`\`\`
`;

    expect(() => parseTestFile(content, '/test/commandless.tryscript.md')).toThrow(
      new TestParseError(
        'console code block must contain a `$ ` command prompt',
        '/test/commandless.tryscript.md',
        3,
      ),
    );
  });
});
