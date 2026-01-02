# tryscript Quick Reference

Concise syntax reference for writing tryscript test files.

## Test File Format

Test files use `.tryscript.md` extension. Each file contains Markdown with console code blocks:

```markdown
# Test: Description

\`\`\`console
$ command
expected output
? exit_code
\`\`\`
```

## Basic Example

```markdown
# Test: Echo command

\`\`\`console
$ echo "hello world"
hello world
? 0
\`\`\`
```

## Exit Codes

Use `? N` to specify expected exit code:

```console
$ exit 42
? 42
```

## Elision Patterns

| Pattern  | Matches                          | Example               |
| -------- | -------------------------------- | --------------------- |
| `[..]`   | Any characters on current line   | `Built in [..]ms`     |
| `...`    | Zero or more complete lines      | `...\nDone`           |
| `[EXE]`  | `.exe` on Windows, empty on Unix | `my-cli[EXE]`         |
| `[ROOT]` | Test root directory              | `[ROOT]/output.txt`   |
| `[CWD]`  | Current working directory        | `[CWD]/file.txt`      |

## YAML Frontmatter

Configure test behavior at the top of the file:

```yaml
---
bin: ./my-cli
env:
  NO_COLOR: "1"
timeout: 5000
patterns:
  VERSION: "\\d+\\.\\d+\\.\\d+"
---
```

### Config Options

| Option     | Type     | Description                           |
| ---------- | -------- | ------------------------------------- |
| `bin`      | string   | Path to CLI binary                    |
| `env`      | object   | Environment variables                 |
| `timeout`  | number   | Command timeout in milliseconds       |
| `patterns` | object   | Custom regex patterns for `[NAME]`    |

## Custom Patterns

Define reusable patterns in frontmatter:

```yaml
patterns:
  VERSION: "\\d+\\.\\d+\\.\\d+"
  UUID: "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
```

Use in output:

```console
$ my-cli --version
my-cli version [VERSION]
? 0
```

## Multiple Commands

Multiple tests per file, each with its own heading:

```markdown
# Test: First test

\`\`\`console
$ echo one
one
? 0
\`\`\`

# Test: Second test

\`\`\`console
$ echo two
two
? 0
\`\`\`
```

## CLI Usage

```bash
# Run all tests
npx tryscript

# Run specific files
npx tryscript tests/foo.tryscript.md

# Update golden files
npx tryscript --update

# Filter tests by name
npx tryscript --filter "pattern"

# Fail fast on first error
npx tryscript --fail-fast

# Verbose output
npx tryscript --verbose
```

## Options

| Option             | Description                              |
| ------------------ | ---------------------------------------- |
| `--update`         | Update golden files with actual output   |
| `--diff`           | Show diff on failure (default: true)     |
| `--no-diff`        | Hide diff on failure                     |
| `--fail-fast`      | Stop on first failure                    |
| `--filter <regex>` | Filter tests by name pattern             |
| `--verbose`        | Show detailed output                     |
| `--quiet`          | Suppress non-essential output            |

## Config File

Create `tryscript.config.ts` in your project root:

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  bin: './dist/cli.js',
  env: { NO_COLOR: '1' },
  timeout: 30000,
  patterns: {
    VERSION: '\\d+\\.\\d+\\.\\d+',
  },
});
```
