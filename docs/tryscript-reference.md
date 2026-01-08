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
tryscript                              # Show help (same as --help)
tryscript run [files...]               # Run golden tests
tryscript coverage <commands...>       # Run commands with merged coverage
tryscript docs                         # Show this reference
tryscript readme                       # Show README
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

#### Coverage Options

All coverage options mirror [c8](https://github.com/bcoe/c8) CLI flags for familiarity:

| Option | Description | Default |
|--------|-------------|---------|
| `--coverage-dir <dir>` | Output directory for reports | `coverage-tryscript` |
| `--coverage-reporter <r...>` | Coverage reporters | `text`, `html` |
| `--coverage-exclude <p...>` | Patterns to exclude | none |
| `--coverage-exclude-node-modules` | Exclude node_modules | `true` |
| `--no-coverage-exclude-node-modules` | Include node_modules | - |
| `--coverage-exclude-after-remap` | Exclude after sourcemap remap | `false` |
| `--coverage-skip-full` | Hide 100% covered files | `false` |
| `--coverage-allow-external` | Allow files outside cwd | `false` |
| `--coverage-monocart` | Use monocart for accurate line counts | `false` |
| `--merge-lcov <path>` | Merge with external LCOV file (e.g., vitest) | none |

## Code Coverage

> **Experimental**: Coverage features are experimental. Line counts may not perfectly match other tools
> like vitest, especially without the `--monocart` flag. Use `--monocart` for best accuracy when merging
> coverage reports from multiple sources.

Collect code coverage from subprocess execution using the `--coverage` flag:

```bash
# Basic coverage (node_modules excluded by default)
tryscript run --coverage tests/

# Custom output directory
tryscript run --coverage --coverage-dir my-coverage tests/

# Custom reporters
tryscript run --coverage --coverage-reporter text --coverage-reporter lcov tests/

# Exclude additional patterns
tryscript run --coverage --coverage-exclude '**/vendor/**' tests/

# Include node_modules in coverage (not recommended)
tryscript run --coverage --no-coverage-exclude-node-modules tests/
```

Coverage uses [c8](https://github.com/bcoe/c8) and `NODE_V8_COVERAGE` to track code executed
by spawned CLI processes.

**Required dependencies:**

```bash
# Basic coverage
npm install -D c8

# For --monocart flag (recommended for merging with vitest)
npm install -D c8 monocart-coverage-reports
```

### Default Behavior

By default, tryscript coverage:
- **Excludes node_modules** - Your reports show only your code, not dependencies
- **Includes all source files** - Files with 0% coverage are shown (use `--coverage-skip-full` to hide 100% covered files)
- **Uses dist/** include pattern - Tracks your built CLI output

### Merging Coverage from Multiple Sources

Most projects have both **unit tests** (testing code via imports) and **CLI tests** (testing via subprocess).
To get complete coverage, merge results from both sources using the `--merge-lcov` flag.

#### Recommended: Built-in LCOV Merging

```bash
# Step 1: Run vitest with coverage (produces coverage/lcov.info)
vitest run --coverage

# Step 2: Run tryscript with --merge-lcov to merge vitest's coverage
tryscript run 'tests/**/*.tryscript.md' --coverage --merge-lcov coverage/lcov.info
```

The `--merge-lcov` flag:
- Reads the external LCOV file (e.g., from vitest)
- Runs tryscript tests with coverage collection
- Merges both coverage sources (taking max hit count per line)
- Writes merged `lcov.info` and `coverage-summary.json`

**Output files** (in `coverage-tryscript/` by default):
- `lcov.info` - Merged LCOV file (for Codecov, SonarQube, etc.)
- `coverage-summary.json` - JSON summary (for badge generation)
- `index.html` - HTML coverage report

**In package.json:**
```json
{
  "scripts": {
    "test:coverage": "vitest run --coverage && tryscript run 'tests/**/*.tryscript.md' --coverage --merge-lcov coverage/lcov.info"
  }
}
```

**Example CI workflow** (GitHub Actions):
```yaml
- run: pnpm test:coverage

# Upload to Codecov
- uses: codecov/codecov-action@v4
  with:
    files: coverage-tryscript/lcov.info

# Generate badges (optional)
- uses: jpb06/coverage-badges-action@v1
  with:
    coverage-summary-path: coverage-tryscript/coverage-summary.json
```

**Why this approach?**

| Coverage Source | What It Captures |
|-----------------|------------------|
| `vitest run --coverage` | Code imported directly by unit tests |
| `tryscript run --coverage` | Code executed by CLI subprocess spawns |
| `--merge-lcov` | Combines both into single report |

> **Technical Note**: Vitest uses `node:inspector` for coverage, not `NODE_V8_COVERAGE`.
> This means vitest's coverage and tryscript's coverage use different collection mechanisms
> and must be merged via LCOV files rather than combined at the V8 level.

#### Alternative: tryscript coverage command

For projects that **only** test via CLI subprocesses (no unit tests with direct imports),
the `tryscript coverage` command provides a simpler workflow:

```bash
# Merge coverage from multiple CLI test commands
tryscript coverage "tryscript run tests/cli/" "node dist/bin.mjs --help"

# With monocart for accurate line counts
tryscript coverage --monocart "tryscript run tests/"
```

> **Note**: This approach does NOT capture vitest unit test coverage. Use LCOV merging
> if you have unit tests that import code directly.

#### Coverage Command Options

| Option | Description | Default |
|--------|-------------|---------|
| `--reports-dir <dir>` | Output directory | `coverage` |
| `--reporters <list>` | Comma-separated reporters | `text,json,json-summary,lcov,html` |
| `--include <patterns>` | Patterns to include | `dist/**` |
| `--exclude <patterns>` | Patterns to exclude | none |
| `--exclude-node-modules` | Exclude node_modules | `true` |
| `--no-exclude-node-modules` | Include node_modules | - |
| `--exclude-after-remap` | Post-sourcemap exclude | `false` |
| `--skip-full` | Hide 100% files | `false` |
| `--allow-external` | Allow external files | `false` |
| `--monocart` | AST-aware line counts | `false` |
| `--src <dir>` | Source dir for mapping | `src` |
| `--verbose` | Show coverage after each command | `false` |

#### How It Works

The `coverage` command:
1. Creates a shared temporary directory for V8 coverage data
2. Sets `NODE_V8_COVERAGE` environment variable
3. Runs each command in sequence (all inherit the coverage env)
4. Shows coverage file statistics after each command (warns if none produced)
5. Generates a merged coverage report using c8

#### Debugging Coverage Issues

Use `--verbose` to see intermediate coverage tables after each command:

```bash
tryscript coverage --verbose "cmd1" "cmd2"
```

This helps identify which commands are contributing coverage and which are not.

#### Why Monocart?

The `--monocart` flag uses [monocart-coverage-reports](https://github.com/cenfun/monocart-coverage-reports) for AST-aware
line counting, producing line counts ~90% aligned with vitest. Without this flag, standard c8 may inflate
line counts by 3-4x, making merged coverage percentages inaccurate.

| Metric | Standard c8 | With --monocart | Vitest |
|--------|-------------|-----------------|--------|
| Total lines | ~1700 (inflated) | ~460 | ~510 |
| Accuracy | ❌ | ✅ ~90% match | ✅ baseline |

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

### Configuration

Configure coverage in `tryscript.config.ts`:

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  coverage: {
    reportsDir: 'coverage-tryscript',
    reporters: ['text', 'html'],
    include: ['dist/**'],
    exclude: [],                  // Additional exclude patterns
    excludeNodeModules: true,     // Exclude node_modules (recommended)
    excludeAfterRemap: false,     // Apply exclude after sourcemap remap
    skipFull: false,              // Hide 100% covered files
    allowExternal: false,         // Allow files outside cwd
    src: 'src',
    monocart: false,              // Use monocart for vitest-compatible line counts
  },
});
```

| Config Option | CLI Flag | Description |
|---------------|----------|-------------|
| `reportsDir` | `--coverage-dir` | Output directory |
| `reporters` | `--coverage-reporter` | Reporter list |
| `include` | - | Include patterns (config only) |
| `exclude` | `--coverage-exclude` | Exclude patterns |
| `excludeNodeModules` | `--coverage-exclude-node-modules` | Exclude node_modules |
| `excludeAfterRemap` | `--coverage-exclude-after-remap` | Post-sourcemap exclude |
| `skipFull` | `--coverage-skip-full` | Hide 100% files |
| `allowExternal` | `--coverage-allow-external` | Allow external files |
| `src` | - | Source dir for mapping (config only) |
| `monocart` | `--coverage-monocart` | AST-aware line counts |
| `mergeLcov` | `--merge-lcov` | Path to external LCOV to merge |

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
