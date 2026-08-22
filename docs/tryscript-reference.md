# tryscript Reference

A `.tryscript.md` file combines Markdown prose with console blocks that execute shell
commands and assert their output.
This keeps the command, result, and explanation in one reviewable file.

Three design choices shape the format:

- **Shell execution:** Commands run in a real shell, including pipes, redirects, and
  environment-variable expansion.
- **Markdown source:** Test files remain readable documentation outside the runner.
- **Output-only patterns:** Tokens such as `[..]` match variable output; they never
  interpolate commands.

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
$ command [arguments...]     # Command to execute (required, exactly one per block)
> continuation line          # Multi-line command continuation
expected output              # Expected stdout (line by line)
! stderr line                # Expected stderr (when separating streams)
!                            # A bare `!` is an empty expected stderr line
? exit_code                  # Expected exit code (default: 0)
```

Each block contains one `$ ` command.
Use `> ` lines to continue that command, or put a second command in its own block.
A bare `!` represents an empty stderr line, which preserves blank lines without relying
on trailing whitespace.

LF and CRLF test files have the same command and output semantics.
In particular, carriage returns from CRLF line endings are not passed into continued
shell commands.

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

**Combined stderr:**

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

When the shell terminates a command with a signal, tryscript reports the shell-style
exit status `128 + signal number`. Signal numbers come from the current platform, so
portable tests should prefer named behavior over hard-coded values for uncommon signals.

## Elision Patterns

Patterns in expected output match variable content.
There are three categories of wildcards, listed in order of preference:

### Named Patterns

Named patterns match typed dynamic values with specific meaning:

| Pattern | Matches | Example |
| --- | --- | --- |
| `[CWD]` | Current working directory | `[CWD]/output.txt` |
| `[ROOT]` | Test file directory | `[ROOT]/fixtures/` |
| `[EXE]` | `.exe` on Windows, empty otherwise | `my-cli[EXE]` |
| `[PATTERN]` | Custom pattern from config | User-defined regex |

`[ROOT]` and `[CWD]` protect the resolved directory as literal text, even when a real
path component looks like `[..]` or `[??]`. On a line containing either token, `/` and
`\` are interchangeable path separators so the same golden works with Windows and POSIX
path output.

### Unknown Wildcards

Unknown wildcards are temporary placeholders for output you haven’t filled in yet.
They are intended to be expanded with `--expand` before finalizing tests.
A warning is always shown when unknown wildcards are present in expected stdout or
stderr.

| Pattern | Matches | Example |
| --- | --- | --- |
| `[??]` | Any text on a single line | `Result: [??]` |
| `???` | Zero or more complete lines | `???\nDone` |

### Generic Wildcards

Generic wildcards intentionally omit unpredictable or irrelevant output.
Use these when the exact value doesn’t matter for the test.

| Pattern | Matches | Example |
| --- | --- | --- |
| `[..]` | Any text on a single line | `Built in [..]ms` |
| `...` | Zero or more complete lines | `...\nDone` |

### Pattern Examples

**Single-line wildcard:**
```console
$ date
[..]
? 0
```

**Unknown wildcard (to be expanded later):**
```console
$ my-cli process data.json
[??]
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

Custom names cannot replace the built-ins `ROOT`, `CWD`, `EXE`, `..`, or `??`; project
config emits a warning and ignores that custom entry.
Capturing groups are allowed.
Numeric and named backreferences can refer to groups defined inside the same custom
pattern.
Tryscript preserves those references when it combines patterns and when the same
named-group pattern appears more than once.
A decimal escape that is not a local backreference keeps its standalone JavaScript regex
meaning.

A JavaScript `RegExp` value contributes its source text only.
Flags are ignored for v0.1 compatibility and produce a project-config warning; use a
string with explicit character classes when flag behavior matters.

### Wildcard Best Practices

1. **Prefer named patterns** when the output has a known structure (e.g., `[VERSION]`,
   `[HASH]`). This makes tests self-documenting.

2. **Use unknown wildcards** (`[??]`/`???`) as temporary scaffolding when writing new
   tests. Run with `--expand` to fill them in with actual output.

3. **Use generic wildcards** (`[..]`/`...`) for output that is intentionally variable
   (timestamps, durations, dynamic content) and should remain elided.

## Configuration (Frontmatter)

All options are optional.
Place file-specific settings at the top of the file.
Project test discovery and coverage settings belong in the project config because they
are initialized before per-file frontmatter is read.

The opening and closing `---` delimiters are required as a pair.
Invalid or unclosed YAML is a parse failure reported with the test path and source line;
it is not treated as ordinary Markdown.

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
before: pnpm build         # Run before the first test
after: ./scripts/cleanup-test.sh # Run after all tests
path:                      # Directories to prepend to PATH
  - ../dist
  - $TRYSCRIPT_PACKAGE_BIN # Access node_modules/.bin via env var
---
```

### Config Options Reference

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `cwd` | path | `"."` | Working directory (relative to test file) |
| `sandbox` | `boolean \| path` | `false` | Run in isolated temp directory |
| `env` | `object` | `{}` | Environment variables passed to shell |
| `timeout` | `number` | `30000` | Command timeout in milliseconds |
| `patterns` | `object` | `{}` | Custom regex patterns for `[NAME]` |
| `fixtures` | `array` | `[]` | Files to copy to sandbox |
| `before` | `string` | - | Shell command before the first test |
| `after` | `string` | - | Shell command after all tests |
| `path` | `string[]` | `[]` | Directories to prepend to PATH (supports `$VAR` expansion) |

## Sandbox Mode

Sandbox provides test isolation by running commands in a temporary directory:

| Configuration | Behavior |
| --- | --- |
| `sandbox: false` (default) | Commands run in `cwd` (test file dir) |
| `sandbox: true` | Creates empty temp dir, commands run there |
| `sandbox: ./fixtures` | Copies `./fixtures/` to temp dir, runs there |

When sandbox mode is enabled:

- Each test file receives a fresh temporary directory.
- Fixtures are copied before its tests run.
- A fixture `dest` is relative to the sandbox and cannot escape it with an absolute
  path, `..` segment, or symbolic-link traversal.
- `[CWD]` matches the temporary directory.
- Files created by commands do not modify the source tree.

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

## Setup and Cleanup Hooks

`before` runs once before the first non-skipped command in a file.
`after` runs once after the selected commands, including when a test fails.
A hook timeout or non-zero exit fails the run; later test commands do not run after a
failed `before` hook.
A timed-out command is not reported complete until its process tree has received the
termination signal.

Output from a successful hook is discarded; output from a failed hook is included in the
error. Put behavior that needs a golden assertion in its own `console` block.

## Environment Variables

Use `env` to set variables:

```yaml
env:
  CLI: ./dist/cli.mjs
  DEBUG: "true"
```

```console
$ $CLI --version
1.0.0
```

Environment variables are shell inputs, not output-matching patterns.

### Variable Expansion in `env` and `path`

Tryscript expands `$VAR` and `${VAR}` in `env` values and `path` entries before the
command runs, using the same rules for both:

- Names resolve against the built-in variables below first, then the process
  environment.
- An undefined name expands to the empty string.
- `$$` produces a literal `$`. Use it whenever a value must keep a `$`, such as a
  password or a `sed` expression, since an unescaped `$name` would otherwise be
  substituted away.
- Values are substituted once and never rescanned, so a variable whose value itself
  contains `$VAR` keeps that text.
- Expansion resolves against the built-in variables and the process environment only,
  not against sibling `env` entries: given `PREFIX: /opt/tool`, a sibling
  `BIN: $PREFIX/bin/tool` expands to `/bin/tool`, not `/opt/tool/bin/tool`.

Expanding `env` is what lets front matter name an exact executable, which `path` alone
cannot do because `path` only prepends to the inherited `PATH`:

```yaml
env:
  TOOL: $TRYSCRIPT_GIT_ROOT/target/debug/tool$TRYSCRIPT_EXE
```

### Built-in Environment Variables

Tryscript sets these environment variables for test commands:

| Variable | Description |
| --- | --- |
| `NO_COLOR` | Set to `"1"` by default (disables colors) |
| `FORCE_COLOR` | Set to `"0"` (disables forced colors) |
| `TRYSCRIPT_TEST_DIR` | Absolute path to directory containing the test file |
| `TRYSCRIPT_PACKAGE_ROOT` | Absolute path to directory containing nearest `package.json` (if found) |
| `TRYSCRIPT_GIT_ROOT` | Absolute path to directory containing nearest `.git` (if found) |
| `TRYSCRIPT_PROJECT_ROOT` | Most specific of `PACKAGE_ROOT` or `GIT_ROOT` (deepest path) |
| `TRYSCRIPT_PACKAGE_BIN` | Absolute path to `node_modules/.bin` directory (if exists) |
| `TRYSCRIPT_EXE` | Executable suffix: `.exe` on Windows, empty elsewhere |

Project-root variables keep tests portable across project types:

- **`TRYSCRIPT_PACKAGE_ROOT`:** The nearest ancestor containing `package.json`.
- **`TRYSCRIPT_GIT_ROOT`:** The nearest Git worktree root.
- **`TRYSCRIPT_PROJECT_ROOT`:** The deeper of the package and Git roots.
- **`TRYSCRIPT_PACKAGE_BIN`:** The package root’s `node_modules/.bin` directory, when
  present.

`TRYSCRIPT_EXE` keeps a binary path portable: it is `.exe` on Windows and empty
elsewhere, so `$TRYSCRIPT_GIT_ROOT/target/debug/tool$TRYSCRIPT_EXE` names the same build
on every platform.

Example using `TRYSCRIPT_PROJECT_ROOT`:

```console
$ test -n "$TRYSCRIPT_PROJECT_ROOT" && echo "in a project"
in a project
? 0
```

## Testing CLI Applications

Tryscript provides several ways to make CLI binaries available in tests.

### `path`: Custom Binary Directories

Use `path` to prepend directories to PATH, making executables available by name:

```yaml
---
sandbox: true
path:
  - ../dist                  # Relative to test file directory
  - $TRYSCRIPT_PACKAGE_BIN   # Use node_modules/.bin via env var
---
```

```console
$ my-cli --version
1.0.0
? 0
```

Key behavior:

- Relative paths resolve from the test file’s directory, not the sandbox working
  directory.
- Absolute paths use the host platform’s rules and remain unchanged.
- Earlier entries have higher priority.
- Frontmatter entries precede entries from `tryscript.config.ts`.
- `$VAR` and `${VAR}` expand first from tryscript’s built-in variables, then from the
  process environment.
  An undefined variable expands to an empty string.

### Using `node_modules/.bin`

For Node.js projects using npm, pnpm, or bun, use `$TRYSCRIPT_PACKAGE_BIN` to access
installed CLI tools:

````yaml
---
sandbox: true
path:
  - $TRYSCRIPT_PACKAGE_BIN   # Expands to node_modules/.bin
---

# Test: Run your CLI by name
```console
$ my-cli --version
1.0.0
? 0
````

# Test: Use any installed dev dependency

```console
$ prettier --check src/
[..]
? 0
```
```

This works for executables installed by npm, pnpm, or Bun. The variable is non-empty only
when `node_modules/.bin` exists.

Typical project layout:
```
my-project/ ├── package.json # TRYSCRIPT_PACKAGE_ROOT points here ├── node_modules/ │
└── .bin/ # TRYSCRIPT_PACKAGE_BIN points here │ ├── prettier │ ├── eslint │ └── my-cli #
Your package’s bin entry └── tests/ └── cli.tryscript.md # Your test file
````

### Language-Specific Examples

**Rust CLIs:**
```yaml
---
path:
  - ../target/release
---
````

**Python with venv:**
```yaml
---
path:
  - ../.venv/bin
---
```

**Go CLIs:**
```yaml
---
path:
  - ../bin
---
```

## Test Annotations

Control test execution with HTML comments:

```markdown
## This test is skipped <!-- skip -->

## Only run this test <!-- only -->
```

| Annotation | Effect |
| --- | --- |
| `<!-- skip -->` | Test is skipped, marked as passed |
| `<!-- only -->` | Only tests with this annotation run |

Annotations and headings are read only from top-level Markdown.
Text inside executable or documentation fences is output or example content and cannot
rename, skip, or focus a later test.

## Complete Test File

This example combines isolation, patterns, fixtures, hooks, and annotations:

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
tryscript run [files...]               # Run Markdown golden tests
tryscript coverage <commands...>       # Collect merged V8 coverage
tryscript docs                         # Print this reference
tryscript readme                       # Print the README
```

### Run Options

| Option | Description |
| --- | --- |
| `--update` | Replace expected output with actual output |
| `--expand` | Replace unknown wildcards (`???` and `[??]`) with actual output |
| `--expand-generic` | Replace unknown and generic wildcards |
| `--expand-all` | Replace all wildcards, including named patterns |
| `--capture-log <path>` | Write wildcard captures to a YAML file |
| `--diff` / `--no-diff` | Show or hide the failure diff |
| `--fail-fast` | Stop on first failure |
| `--filter <pattern>` | Run named tests whose names match a regular expression; unnamed blocks are excluded |
| `--verbose` | Include captured output for passing tests |
| `--quiet` | Show only failures and the final summary |
| `--coverage` | Collect V8 coverage with an installed `c8` package |

#### Coverage Options

These options map to [c8](https://github.com/bcoe/c8) where the table names the
corresponding behavior:

| Option | Description | Default |
| --- | --- | --- |
| `--coverage-dir <dir>` | Output directory for reports | `coverage-tryscript` |
| `--coverage-reporter <reporter>` | Coverage reporter; repeat the option for more | `text`, `html` |
| `--coverage-exclude <pattern>` | Exclude pattern; repeat the option for more | none |
| `--coverage-exclude-node-modules` | Exclude node_modules | `true` |
| `--no-coverage-exclude-node-modules` | Include `node_modules` | - |
| `--coverage-exclude-after-remap` | Exclude after sourcemap remap | `false` |
| `--coverage-skip-full` | Hide 100% covered files | `false` |
| `--coverage-allow-external` | Allow files outside cwd | `false` |
| `--coverage-monocart` | Use monocart AST-aware line counts | `false` |
| `--merge-lcov <path>` | Merge an existing LCOV file | - |

### Documentation Output

`tryscript docs` and `tryscript readme` write the tracked or packaged Markdown source
exactly, without adding a final newline or terminal styling.
This stable output is suitable for people, agents, and pipelines.

The legacy `--raw` and `--color` options remain accepted as no-ops for compatibility.
They are no longer listed in command help and may be removed in a later breaking
release.

## Code Coverage

> [!WARNING]
> Coverage support is experimental.
> Different collectors can count generated and source-mapped lines differently.
> Use one configuration when comparing results over time.

Collect code coverage from subprocess execution using the `--coverage` flag:

```bash
# Basic coverage (node_modules excluded by default)
tryscript run --coverage 'tests/**/*.tryscript.md'

# Custom output directory
tryscript run --coverage --coverage-dir my-coverage 'tests/**/*.tryscript.md'

# Custom reporters
tryscript run --coverage --coverage-reporter text --coverage-reporter lcov 'tests/**/*.tryscript.md'

# Exclude additional patterns
tryscript run --coverage --coverage-exclude '**/vendor/**' 'tests/**/*.tryscript.md'

# Include node_modules in coverage
tryscript run --coverage --no-coverage-exclude-node-modules 'tests/**/*.tryscript.md'
```

Coverage uses [c8](https://github.com/bcoe/c8) and `NODE_V8_COVERAGE` to track code
executed by spawned CLI processes.

Install `c8` before collecting coverage.
Add monocart only when its AST-aware source-map handling is needed:

```bash
pnpm add -D c8

pnpm add -D monocart-coverage-reports
```

### Default Behavior

By default, tryscript coverage:

- Excludes `node_modules`.
- Includes files with 0% coverage and shows fully covered files.
- Includes the `dist/**` pattern so spawned built output is measured.

### Merging Coverage from Multiple Sources

The `coverage` command merges V8 coverage from multiple CLI commands into a single
report:

```bash
# Merge coverage from multiple CLI test commands
tryscript coverage "tryscript run 'tests/cli/**/*.tryscript.md'" "node dist/bin.mjs --help"

# Use monocart's AST-aware source-map handling.
tryscript coverage --monocart "tryscript run 'tests/**/*.tryscript.md'"
```

### Vitest Coverage

`tryscript coverage` collects subprocess data through `NODE_V8_COVERAGE`. Vitest instead
controls the V8 profiler through `node:inspector`, as documented in
[Vitest PR #2786](https://github.com/vitest-dev/vitest/pull/2786). Running `vitest` as a
child of `tryscript coverage` therefore does not collect Vitest’s test coverage.
The command warns when a child produces no new V8 coverage files.

#### Merging Vitest and tryscript Coverage

Use the built-in `--merge-lcov` flag to combine vitest and tryscript coverage in one
step:

```bash
# Step 1: Run vitest with its own coverage (generates coverage/lcov.info)
vitest run --coverage

# Step 2: Run tryscript with coverage, merging vitest's LCOV file
tryscript run --coverage --merge-lcov coverage/lcov.info 'tests/**/*.tryscript.md'
```

The `--merge-lcov` flag:

- Adds the `lcov` reporter when needed.
- Merges the external file with tryscript’s generated coverage.
- Writes the combined `lcov.info` and `coverage-summary.json` files.

Tryscript rejects malformed numeric LCOV records with the input path and line number.
Merging does not modify either source report in memory.
Serialized LCOV is ordered by source path and by complete function, branch, and line
keys, so equivalent reports produce byte-identical output regardless of input order.

**Alternative: Manual LCOV Merging**

If you need more control, you can merge LCOV files manually:

```bash
# Step 1: Run vitest with its own coverage
vitest run --coverage

# Step 2: Run tryscript with coverage
tryscript run --coverage --coverage-reporter lcov 'tests/**/*.tryscript.md'

# Step 3: Merge the LCOV files using lcov or a merge tool
lcov -a coverage/lcov.info -a coverage-tryscript/lcov.info -o coverage-merged/lcov.info
```

#### Coverage Command Options

| Option | Description | Default |
| --- | --- | --- |
| `--reports-dir <dir>` | Output directory | `coverage` |
| `--reporters <list>` | Comma-separated reporters | `text,json,json-summary,lcov,html` |
| `--include <patterns>` | Patterns to include | `dist/**` |
| `--exclude <patterns>` | Patterns to exclude | none |
| `--exclude-node-modules` | Exclude node_modules | `true` |
| `--no-exclude-node-modules` | Include node_modules | - |
| `--exclude-after-remap` | Post-sourcemap exclude | `false` |
| `--skip-full` | Hide 100% files | `false` |
| `--allow-external` | Include files outside the working directory | `false` |
| `--monocart` | AST-aware line counts | `false` |
| `--src <dir>` | Source directory for mapping | `src` |
| `--verbose` | Show coverage after each command | `false` |

#### How It Works

The `coverage` command:

1. Creates a shared temporary directory for V8 coverage data.
2. Sets `NODE_V8_COVERAGE` for each child command.
3. Runs the commands in sequence.
4. Reports file statistics and warns when a command contributes no data.
5. Generates one report through `c8`.

#### Debugging Coverage Issues

Use `--verbose` to see intermediate coverage tables after each command:

```bash
tryscript coverage --verbose "cmd1" "cmd2"
```

This identifies which commands contribute coverage.

#### Why Monocart?

The `--monocart` flag uses
[monocart-coverage-reports](https://github.com/cenfun/monocart-coverage-reports) for
AST-aware source-map processing.
This can make line accounting more comparable with Vitest, but the tools still use
different collectors.
Compare percentages only when the collector and configuration are held constant.

### Source Map Requirements

Coverage maps back to source files only when the build generates source maps.
Without them, reports show bundled filenames instead of source paths:

| Build Configuration | Coverage Report Shows |
| --- | --- |
| Sourcemaps disabled | Generated bundle paths such as `dist/cli-BXvEEW6O.mjs` |
| Sourcemaps enabled | Source paths such as `src/cli/commands/run.ts` |

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
    excludeNodeModules: true,     // Exclude node_modules by default
    excludeAfterRemap: false,     // Apply exclude after sourcemap remap
    skipFull: false,              // Hide 100% covered files
    allowExternal: false,         // Allow files outside cwd
    src: 'src',
    monocart: false,              // Use monocart's AST-aware line counts
  },
});
```

| Config Option | CLI Flag | Description |
| --- | --- | --- |
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
| `mergeLcov` | `--merge-lcov` | Merge with external LCOV file |

A `mergeLcov` value from project config has the same behavior as the CLI flag.
Both coverage commands add the LCOV reporter when necessary, including when the caller
explicitly selected other reporters.
They perform the merge and make a missing or malformed input a command failure.

## Wildcard Expansion

The `--expand` flags replace wildcard placeholders in your test files with actual output
from a test run.
Only the selected wildcard categories are replaced; surrounding Markdown
and untargeted patterns remain intact.

### Expansion Workflow

1. Write a test with unknown wildcards as temporary placeholders:

```console
$ my-cli status
[??]
? 0
```

2. Run with `--expand` to fill in actual output:

```bash
tryscript run --expand tests/my-test.tryscript.md
```

3. Review the expanded output and commit.

### Expansion Flags

The three flags form a hierarchy (each includes the previous):

| Flag | Expands |
| --- | --- |
| `--expand` | Unknown wildcards only (`???`, `[??]`) |
| `--expand-generic` | Unknown and generic (`...`, `[..]`) |
| `--expand-all` | All wildcards including named patterns |

These flags are mutually exclusive with each other and with `--update`.

### Capture Log

Use `--capture-log <path>` to write a YAML sidecar file recording what each wildcard
matched during a test run.
Use it to inspect pattern boundaries and review captured values.
The run exits non-zero if the requested log cannot be written.

```bash
tryscript run --capture-log captures.yaml 'tests/**/*.tryscript.md'
```

For a combined-output block, each capture records its category, optional custom-pattern
name, multiline status, and matched text.
When a block contains separate `!` stderr assertions, the log also records
`expected_stderr` and `actual_stderr`, and every capture identifies its `stdout` or
`stderr` stream.

## Best Practices

### Use Shell Features Directly

```console
$ echo "hello" | tr 'a-z' 'A-Z'
HELLO
```

```console
$ cat file.txt 2>/dev/null || echo "not found"
not found
```

### Use Environment Variables for CLI Paths

```yaml
env:
  BIN: ./dist/cli.mjs
```
```console
$ $BIN --version
1.0.0
```

### Use Sandbox Mode for File Operations

```yaml
sandbox: true
```
```console
$ echo "test" > output.txt
```

```console
$ cat output.txt
test
```

### Keep Patterns Out of Commands

`[CWD]` is an output token, so this command passes a literal bracketed string to `cat`:

```console
$ cat [CWD]/file.txt
```

### Elide Unstable Timestamps and Paths

An exact timestamp assertion becomes stale:

```console
$ date
Mon Jan 3 12:34:56 UTC 2026
```

Match the stable line shape instead:

```console
$ date
[..]
```

## Project Config

For project-wide settings, create `tryscript.config.ts`, `tryscript.config.js`, or
`tryscript.config.mjs` in the directory where you run tryscript.
When more than one exists, tryscript uses that extension order.
TypeScript configs work on every supported Node.js version because `tsx` ships with
tryscript. Project config and frontmatter mistakes produce dotted-path warnings without
silently rewriting supplied mapping values.
A null, primitive, or array project config produces a warning and continues as an empty
mapping.

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  tests: ['tests/**/*.tryscript.md'],
  env: { NO_COLOR: '1' },
  timeout: 30000,
  patterns: {
    VERSION: '\\d+\\.\\d+\\.\\d+',
    UUID: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  },
  path: ['./dist'],
});
```

Explicit CLI file arguments override `tests`; otherwise `tests` overrides the default
`**/*.tryscript.md` pattern.
Frontmatter values override the project config for a test file.
Fixture lists are appended, while frontmatter `path` entries are prepended so they have
higher command-resolution priority.
Coverage CLI flags override project coverage settings.

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

Key points:

1. Commands run in a real shell through `shell: true`.
2. The shell expands command variables such as `$VAR`.
3. Tryscript patterns such as `[..]` and `[CWD]` apply only to expected output.
4. Sandbox mode creates one isolated temporary directory per test file.

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
