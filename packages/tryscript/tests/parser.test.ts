import { describe, it, expect } from 'vitest';
import { parseTestFile } from '../src/lib/parser.js';

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
});
