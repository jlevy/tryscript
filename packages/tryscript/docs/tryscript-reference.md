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
env:
  MY_VAR: "value"
  NO_COLOR: "1"
timeout: 5000
sandbox: true
patterns:
  VERSION: "\\d+\\.\\d+\\.\\d+"
---
```

### Config Options

| Option     | Type            | Description                                |
| ---------- | --------------- | ------------------------------------------ |
| `cwd`      | string          | Working directory (default: test file dir) |
| `sandbox`  | boolean\|string | Run in isolated temp directory             |
| `env`      | object          | Environment variables                      |
| `timeout`  | number          | Command timeout in milliseconds            |
| `patterns` | object          | Custom regex patterns for `[NAME]`         |
| `fixtures` | array           | Files to copy to sandbox (requires sandbox)|
| `before`   | string          | Shell command to run before first test     |
| `after`    | string          | Shell command to run after all tests       |

## Sandbox Mode

Run tests in an isolated temporary directory:

```yaml
# Empty sandbox
sandbox: true
```

```yaml
# Copy fixtures to sandbox
sandbox: ./test-fixtures
```

When sandbox is enabled:
- Commands run in a fresh temp directory
- `[CWD]` matches the sandbox directory
- Files created by tests don't pollute the source directory
- Fixtures are copied to the sandbox before tests run

## Environment Variables

Use `env` to pass variables to commands (shell handles `$VAR` expansion):

```yaml
env:
  MY_CLI: ./dist/cli.mjs
  DEBUG: "true"
```

```console
$ $MY_CLI --version
1.0.0
```

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
  env: { NO_COLOR: '1' },
  timeout: 30000,
  patterns: {
    VERSION: '\\d+\\.\\d+\\.\\d+',
  },
});
```
