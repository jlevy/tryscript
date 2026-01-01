# tryscript

Golden testing for CLI applications - a TypeScript port of [trycmd](https://github.com/assert-rs/trycmd).

## Installation

```bash
npm install tryscript
# or
pnpm add tryscript
```

## Quick Start

Create a test file with the `.tryscript.md` extension:

```markdown
# Test: Help command

\`\`\`console
$ my-cli --help
Usage: my-cli [options]

Options:
  --version  Show version
  --help     Show help
? 0
\`\`\`
```

Run the tests:

```bash
npx tryscript tests/
```

## Test File Format

Test files are Markdown documents with console code blocks. Each code block represents a test case:

```markdown
\`\`\`console
$ <command>
<expected output>
? <exit code>
\`\`\`
```

### Example

```markdown
# Test: Echo command

\`\`\`console
$ echo "hello world"
hello world
? 0
\`\`\`

# Test: Exit with error

\`\`\`console
$ exit 1
? 1
\`\`\`
```

## Elision Patterns

Use elision patterns to match dynamic or platform-specific output:

| Pattern  | Description                              | Example                    |
| -------- | ---------------------------------------- | -------------------------- |
| `[..]`   | Match any characters on the current line | `Built in [..]ms`          |
| `...`    | Match zero or more complete lines        | `...\nDone`                |
| `[EXE]`  | Match `.exe` on Windows, empty otherwise | `my-cli[EXE] --help`       |
| `[ROOT]` | Match the test's root directory          | `[ROOT]/output.txt`        |
| `[CWD]`  | Match the current working directory      | `[CWD]/file.txt`           |

### Example with Elision

```markdown
\`\`\`console
$ time-command
Elapsed: [..]ms
? 0
\`\`\`
```

## Configuration

### YAML Frontmatter

Add configuration at the top of your test file:

```markdown
---
bin: ./my-cli
env:
  NO_COLOR: "1"
timeout: 5000
---

# Test: Custom binary

\`\`\`console
$ my-cli --version
1.0.0
? 0
\`\`\`
```

### Config File

Create `tryscript.config.ts` in your project root:

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  bin: './dist/cli.js',
  env: {
    NO_COLOR: '1',
  },
  timeout: 30000,
  patterns: {
    VERSION: '\\d+\\.\\d+\\.\\d+',
    UUID: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  },
});
```

## CLI Options

```
tryscript [options] [files...]

Arguments:
  files               Test files to run (default: **/*.tryscript.md)

Options:
  --version           Show version number
  --update            Update golden files with actual output
  --diff              Show diff on failure (default: true)
  --no-diff           Hide diff on failure
  --fail-fast         Stop on first failure
  --filter <pattern>  Filter tests by name pattern
  --verbose           Show detailed output
  --quiet             Suppress non-essential output
  --help              Show help
```

## Update Mode

When your CLI output changes, update all test files at once:

```bash
npx tryscript --update
```

This rewrites test files with the actual output from running the commands.

## Programmatic API

```typescript
import { parseTestFile, runBlock, createExecutionContext, matchOutput } from 'tryscript';

const content = await fs.readFile('test.tryscript.md', 'utf-8');
const testFile = parseTestFile(content, 'test.tryscript.md');

const ctx = await createExecutionContext({}, 'test.tryscript.md');
for (const block of testFile.blocks) {
  const result = await runBlock(block, ctx);
  const matches = matchOutput(
    result.actualOutput,
    block.expectedOutput,
    { root: ctx.tempDir, cwd: ctx.tempDir },
  );
  console.log(`${block.name}: ${matches ? 'PASS' : 'FAIL'}`);
}
```

## Comparison with trycmd

tryscript is a TypeScript port of the Rust [trycmd](https://github.com/assert-rs/trycmd) crate. Key differences:

- **Language**: TypeScript/Node.js instead of Rust
- **Format**: Uses console code blocks (trycmd uses `.toml` or `.trycmd` files)
- **Integration**: Works with Node.js test frameworks (Vitest, Jest)

## License

MIT
