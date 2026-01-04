# tryscript Reference

Complete reference for writing tryscript golden tests. This document covers all syntax,
configuration, and patterns needed to write accurate CLI tests on the first try.

## Overview

Tryscript is a markdown-based CLI golden testing format. Test files are markdown documents
with embedded console code blocks specifying commands and expected output.

**Design Philosophy:**
- **Shell delegation**: Commands run in a real shell with full shell features
- **Markdown-first**: Test files are valid markdown, readable as documentation
- **Output matching**: Patterns like `[..]` match variable output; they're not for commands

## Quick Start Example

````markdown
---
sandbox: true
env:
  NO_COLOR: "1"
---

# Test: Basic echo

```console
$ echo "hello world"
hello world
? 0
```

# Test: Command with variable output

```console
$ date +%Y
[..]
? 0
```
````

## Test File Structure

```
┌──────────────────────────────────────┐
│ ---                                  │  YAML Frontmatter (optional)
│ env:                                 │  - Configuration
│   MY_VAR: value                      │  - Environment variables
│ sandbox: true                        │  - Patterns
│ ---                                  │
├──────────────────────────────────────┤
│ # Test: Description                  │  Test heading (# or ##)
│                                      │
│ ```console                           │  Test block
│ $ command --flag                     │  - Command starts with $
│ expected output                      │  - Expected stdout follows
│ ? 0                                  │  - Exit code (optional, default 0)
│ ```                                  │
└──────────────────────────────────────┘
```

## Command Block Syntax

```
$ command [arguments...]     # Command to execute (required)
> continuation line          # Multi-line command continuation
expected output              # Expected stdout (line by line)
! stderr line                # Expected stderr (when separating streams)
? exit_code                  # Expected exit code (default: 0)
```

### Examples

**Simple command:**
```console
$ echo "hello"
hello
? 0
```

**Non-zero exit code:**
```console
$ exit 42
? 42
```

**Multi-line command:**
```console
$ ls -la | \
> grep ".md" | \
> wc -l
5
```

**Stderr handling:**
```console
$ cat nonexistent 2>&1
cat: nonexistent: No such file or directory
? 1
```

**Separate stderr assertion:**
```console
$ ./script.sh
stdout line
! stderr line
? 0
```

## Elision Patterns

Patterns in expected output match variable content:

| Pattern | Matches | Example |
|---------|---------|---------|
| `[..]` | Any text on a single line | `Built in [..]ms` |
| `...` | Zero or more complete lines | `...\nDone` |
| `[CWD]` | Current working directory | `[CWD]/output.txt` |
| `[ROOT]` | Test file directory | `[ROOT]/fixtures/` |
| `[EXE]` | `.exe` on Windows, empty otherwise | `my-cli[EXE]` |
| `[PATTERN]` | Custom pattern from config | User-defined regex |

### Pattern Examples

**Single-line wildcard:**
```console
$ date
[..]
? 0
```

**Multi-line wildcard:**
```console
$ ls -la
total [..]
...
-rw-r--r-- 1 user user [..] README.md
```

**Custom pattern:**
```yaml
patterns:
  VERSION: '\d+\.\d+\.\d+'
```
```console
$ my-cli --version
my-cli version [VERSION]
```

## Configuration (Frontmatter)

All options are optional. Place at the top of the file:

```yaml
---
cwd: ./subdir              # Working directory (relative to test file)
sandbox: true              # Run in isolated temp directory
env:                       # Environment variables
  NO_COLOR: "1"
  MY_VAR: value
timeout: 5000              # Command timeout in milliseconds
patterns:                  # Custom elision patterns
  UUID: '[0-9a-f]{8}-...'
fixtures:                  # Files to copy to sandbox
  - data/input.txt
before: npm run build      # Run before first test
after: rm -rf ./cache      # Run after all tests
---
```

### Config Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | path | `"."` | Working directory (relative to test file) |
| `sandbox` | `boolean \| path` | `false` | Run in isolated temp directory |
| `env` | `object` | `{}` | Environment variables passed to shell |
| `timeout` | `number` | `30000` | Command timeout in milliseconds |
| `patterns` | `object` | `{}` | Custom regex patterns for `[NAME]` |
| `fixtures` | `array` | `[]` | Files to copy to sandbox |
| `before` | `string` | - | Shell command before first test |
| `after` | `string` | - | Shell command after all tests |

## Sandbox Mode

Sandbox provides test isolation by running commands in a temporary directory:

| Configuration | Behavior |
|--------------|----------|
| `sandbox: false` (default) | Commands run in `cwd` (test file dir) |
| `sandbox: true` | Creates empty temp dir, commands run there |
| `sandbox: ./fixtures` | Copies `./fixtures/` to temp dir, runs there |

**When sandbox is enabled:**
- Fresh temp directory created for each test file
- Fixtures are copied before tests run
- `[CWD]` matches the sandbox directory
- Files created by tests don't pollute source

### Sandbox with Fixtures

```yaml
---
sandbox: true
fixtures:
  - data/input.txt                 # Copies to sandbox/input.txt
  - source: config/settings.json   # Copies to sandbox/custom.json
    dest: custom.json
---
```

## Environment Variables

Use `env` to set variables. The **shell** handles `$VAR` expansion:

```yaml
env:
  CLI: ./dist/cli.mjs
  DEBUG: "true"
```

```console
$ $CLI --version
1.0.0
```

**Important:** Variables are for the shell, not for output matching.

## Test Annotations

Control test execution with HTML comments:

```markdown
## This test is skipped <!-- skip -->

## Only run this test <!-- only -->
```

| Annotation | Effect |
|------------|--------|
| `<!-- skip -->` | Test is skipped, marked as passed |
| `<!-- only -->` | Only tests with this annotation run |

## Complete Example

Here's a complete test file demonstrating all features:

````markdown
---
sandbox: true
env:
  NO_COLOR: "1"
  CLI: ./dist/my-cli.mjs
timeout: 5000
patterns:
  VERSION: '\d+\.\d+\.\d+'
  TIMESTAMP: '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
fixtures:
  - test-data/config.json
before: echo "Setup complete"
---

# CLI Golden Tests

These tests validate the my-cli command-line tool.

## Basic Commands

# Test: Show version

```console
$ $CLI --version
my-cli version [VERSION]
? 0
```

# Test: Show help

```console
$ $CLI --help
Usage: my-cli [options] [command]

Options:
  --version  Show version
  --help     Show help
...
? 0
```

## Error Handling

# Test: Missing required argument

```console
$ $CLI process
Error: missing required argument 'file'
? 1
```

# Test: File not found

```console
$ $CLI process nonexistent.txt 2>&1
Error: file not found: nonexistent.txt
? 1
```

## Feature Tests

# Test: Process config file

```console
$ $CLI process config.json
Processing: config.json
Done at [TIMESTAMP][..]
? 0
```

# Test: Verbose output <!-- skip -->

```console
$ $CLI --verbose process config.json
[DEBUG] Loading config.json
...
Done
? 0
```
````

## CLI Usage

```bash
tryscript                    # Show help (same as --help)
tryscript run [files...]     # Run golden tests
tryscript docs               # Show this reference
tryscript readme             # Show README
```

### Run Options

| Option | Description |
|--------|-------------|
| `--update` | Update test files with actual output |
| `--diff` / `--no-diff` | Show/hide diff on failure |
| `--fail-fast` | Stop on first failure |
| `--filter <pattern>` | Filter tests by name |
| `--verbose` | Show detailed output |
| `--quiet` | Suppress non-essential output |
| `--coverage` | Enable code coverage collection (requires c8) |
| `--coverage-dir <dir>` | Coverage output directory (default: coverage-tryscript) |
| `--coverage-reporter <reporter...>` | Coverage reporters (default: text, html) |

## Code Coverage

Collect code coverage from subprocess execution using the `--coverage` flag:

```bash
# Basic coverage
tryscript run --coverage tests/

# Custom output directory
tryscript run --coverage --coverage-dir my-coverage tests/

# Custom reporters
tryscript run --coverage --coverage-reporter text --coverage-reporter lcov tests/
```

Coverage uses [c8](https://github.com/bcoe/c8) and `NODE_V8_COVERAGE` to track code executed
by spawned CLI processes. Install c8 as a dev dependency:

```bash
npm install -D c8
```

### Sourcemap Requirement

**Important**: Coverage reports map back to source files only if your build generates sourcemaps.
Without sourcemaps, reports show bundled filenames instead of source paths:

| Build Configuration | Coverage Report Shows |
|---------------------|----------------------|
| Sourcemaps disabled | `cli-BXvEEW6O.mjs` (34% coverage) |
| Sourcemaps enabled | `src/cli/commands/status.ts` (83% coverage) |

Enable sourcemaps in your build tool:

**tsdown / tsup:**
```typescript
// tsdown.config.ts or tsup.config.ts
export default defineConfig({
  sourcemap: true,
  // ... other options
});
```

**esbuild:**
```typescript
await esbuild.build({
  sourcemap: true,
  // ... other options
});
```

**rollup:**
```javascript
// rollup.config.js
export default {
  output: {
    sourcemap: true,
  },
};
```

**Vite:**
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    sourcemap: true,
  },
});
```

After enabling sourcemaps, rebuild your project before running coverage.

Configure coverage in `tryscript.config.ts`:

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  coverage: {
    reportsDir: 'coverage-tryscript',
    reporters: ['text', 'html'],
    include: ['dist/**'],
    src: 'src',
  },
});
```

## Best Practices

### DO: Use shell features directly

```console
$ echo "hello" | tr 'a-z' 'A-Z'
HELLO

$ cat file.txt 2>/dev/null || echo "not found"
not found
```

### DO: Use env for CLI paths

```yaml
env:
  BIN: ./dist/cli.mjs
```
```console
$ $BIN --version
1.0.0
```

### DO: Use sandbox for file operations

```yaml
sandbox: true
```
```console
$ echo "test" > output.txt
$ cat output.txt
test
```

### DON'T: Use patterns in commands

```console
# ❌ WRONG: Patterns are for output matching only
$ cat [CWD]/file.txt
```

### DON'T: Rely on exact timestamps or paths

```console
# ❌ WRONG: Exact match will fail
$ date
Mon Jan 3 12:34:56 UTC 2026

# ✓ RIGHT: Use elision
$ date
[..]
```

## Config File

For project-wide settings, create `tryscript.config.ts`:

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  env: { NO_COLOR: '1' },
  timeout: 30000,
  patterns: {
    VERSION: '\\d+\\.\\d+\\.\\d+',
    UUID: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  },
});
```

## Execution Model

```
Test File → Parse YAML + Blocks → Create Execution Context
                                         │
                    ┌────────────────────┴────────────────────┐
                    │                                         │
              sandbox: false                            sandbox: true
              cwd = testDir/config.cwd                  cwd = /tmp/tryscript-xxx/
                    │                                         │
                    └────────────────────┬────────────────────┘
                                         │
                    spawn(command, { shell: true, cwd, env })
                                         │
                    Capture stdout + stderr → Match against expected
```

**Key points:**
1. Commands run in a real shell (`shell: true`)
2. Shell handles all variable expansion (`$VAR`)
3. Patterns (`[..]`, `[CWD]`) only apply to output matching
4. Sandbox creates isolated temp directory per test file
