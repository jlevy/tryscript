# Tryscript Language Architecture

Last updated: 2026-01-03

Maintenance: When revising this doc you must follow instructions in
@shortcut:revise-architecture-doc.md.

## Overview

Tryscript is a markdown-based CLI golden testing language. Test files are markdown
documents with embedded console code blocks that specify commands and expected output.

**Scope**: This document defines the tryscript language syntax, execution model, and
configuration options. It does NOT cover the CLI interface or reporter formatting.

**Design Philosophy**:
- **Shell delegation**: Commands run in a real shell. All shell features (pipes, redirects,
  variables) work naturally.
- **Markdown-first**: Test files are valid markdown, readable as documentation.
- **Minimal configuration**: Sensible defaults, explicit overrides only when needed.
- **Output matching, not scripting**: Variables/patterns are for matching output, not for
  command templating.

## Terminology

| Term | Definition |
|------|------------|
| **Test file** | A `.tryscript.md` markdown file containing test blocks |
| **Test block** | A fenced code block with `console` or `bash` info string |
| **Frontmatter** | YAML configuration at the start of a test file |
| **Elision pattern** | Placeholder in expected output that matches variable content |

## Language Syntax

### Test File Structure

```markdown
---
# Optional YAML frontmatter
env:
  MY_VAR: value
---

# Test Group Name

Description text (ignored by runner).

## Test Name

\`\`\`console
$ command --flag argument
expected output line 1
expected output line 2
\`\`\`
```

### Command Block Syntax

**File**: `packages/tryscript/src/lib/parser.ts`

```
$ command [arguments...]     # Command to execute
> continuation line          # Multi-line command (joined with space)
expected output              # Expected stdout/stderr (combined)
! stderr line                # Expected stderr only (when separating streams)
? exit_code                  # Expected exit code (default: 0)
```

**Examples**:

```console
$ echo "hello world"
hello world
```

```console
$ cat nonexistent 2>&1
cat: nonexistent: No such file or directory
? 1
```

```console
$ ls -la | \
> grep ".md" | \
> wc -l
5
```

## Configuration (Frontmatter)

**File**: `packages/tryscript/src/lib/config.ts`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | path | `"."` | Working directory for commands (relative to test file) |
| `sandbox` | `boolean` \| path | `false` | Run in isolated temp directory |
| `env` | `Record<string, string>` | `{}` | Environment variables passed to shell |
| `timeout` | `number` | `30000` | Command timeout in milliseconds |
| `fixtures` | `string[]` \| `Fixture[]` | `[]` | Files to copy to sandbox before tests |
| `before` | `string` | - | Shell command to run before first test |
| `after` | `string` | - | Shell command to run after all tests |
| `patterns` | `Record<string, string>` | `{}` | Custom elision patterns |

### Sandbox Mode

The `sandbox` option provides test isolation by running commands in a temporary directory:

| Configuration | Behavior |
|--------------|----------|
| `sandbox: false` (default) | Commands run directly in `cwd` (test file directory) |
| `sandbox: true` | Creates empty temp dir, commands run there |
| `sandbox: ./fixtures` | Copies `./fixtures/` to temp dir, commands run there |

**When sandbox is enabled:**
- A fresh temp directory is created for each test file
- Fixtures are copied to the sandbox before tests run
- Files created by tests don't pollute the source directory
- `[CWD]` pattern matches the sandbox directory

**Examples:**

```yaml
# Run directly in test file directory (no isolation)
cwd: .
```

```yaml
# Run in isolated temp directory (empty)
sandbox: true
```

```yaml
# Copy fixtures to temp and run there
sandbox: ./test-fixtures
fixtures:
  - extra-file.txt  # Also copied to sandbox
```

```yaml
# Run in subdirectory, isolated
cwd: ./fixtures
sandbox: true
```

## Execution Model

```
┌─────────────────────────────────────────────────────────────┐
│                      Test File                              │
│  ┌──────────────┐                                           │
│  │  Frontmatter │ → Parse YAML → Config                     │
│  └──────────────┘                                           │
│  ┌──────────────┐                                           │
│  │  Test Block  │ → Parse command + expected output         │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Execution Context                         │
│  • testDir: directory containing test file                  │
│  • sandbox: false → cwd = testDir/config.cwd                │
│             true  → cwd = /tmp/tryscript-xxx/               │
│             path  → copy path to temp, cwd = temp           │
│  • env: process.env + config.env                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Shell Execution                          │
│  spawn(command, { shell: true, cwd, env })                  │
│  • Full shell features: pipes, redirects, variables         │
│  • Captures stdout + stderr (combined or separate)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Output Matching                           │
│  • Literal text matching                                    │
│  • Elision patterns: [..], [...], [CWD], [ROOT], [PATTERN]  │
│  • Exit code comparison                                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Shell does the work**: Commands are passed to shell verbatim. No preprocessing,
   no variable substitution by tryscript.

2. **Environment for variables**: Use `env:` to set variables. Shell expands `$VAR`.
   ```yaml
   env:
     CLI: ./dist/bin.mjs
     INPUT: examples/test.md
   ```
   ```console
   $ $CLI validate $INPUT
   ```

3. **Patterns for matching**: `[..]`, `[CWD]` etc. are for OUTPUT matching only,
   not for command substitution.

## Elision Patterns

**File**: `packages/tryscript/src/lib/matcher.ts`

Patterns in expected output that match variable content:

| Pattern | Matches | Example |
|---------|---------|---------|
| `[..]` | Any text on single line | `file: [..]` |
| `...` | Any lines (multiline wildcard) | See below |
| `[CWD]` | Current working directory (sandbox when enabled) | `[CWD]/output.txt` |
| `[ROOT]` | Test file directory | `[ROOT]/fixtures/` |
| `[EXE]` | `.exe` on Windows, empty on Unix | `my-cli[EXE]` |
| `[PATTERN]` | Custom pattern from config | User-defined |

**Multiline example**:
```console
$ ls -la
total [..]
...
-rw-r--r-- 1 user user [..] README.md
```

## Test Annotations

**File**: `packages/tryscript/src/lib/parser.ts`

Annotations in markdown headings control test execution:

```markdown
## This test is skipped <!-- skip -->

## Only run this test <!-- only -->
```

| Annotation | Effect |
|------------|--------|
| `<!-- skip -->` | Test is not executed, marked as passed |
| `<!-- only -->` | Only tests with this annotation run |

## Fixtures and Hooks

### Fixtures

Copy files to sandbox directory before tests run (requires `sandbox: true` or `sandbox: path`):

```yaml
sandbox: true
fixtures:
  - data/input.txt                    # Copies to sandbox/input.txt
  - source: config/settings.json      # Copies to sandbox/custom.json
    dest: custom.json
```

### Hooks

Run shell commands before/after test execution:

```yaml
before: npm run build
after: rm -rf ./cache
```

- `before`: Runs once before first test block
- `after`: Runs once after all test blocks complete

## Stderr Handling

By default, stdout and stderr are captured together (interleaved).

For separate assertions, use `!` prefix:

```console
$ ./script.sh
stdout line
! stderr line
? 0
```

When `!` lines are present:
- Lines without prefix match stdout only
- Lines with `!` prefix match stderr only

## Usage Guidelines

### DO: Use shell features directly

```console
$ echo "hello" | tr 'a-z' 'A-Z'
HELLO

$ cat file.txt 2>/dev/null || echo "not found"
not found
```

### DO: Use env for variables

```yaml
env:
  BIN: ./dist/cli.mjs
```
```console
$ $BIN --version
1.0.0
```

### DO: Use sandbox for isolation

```yaml
sandbox: ./test-fixtures
```
```console
$ ls
file1.txt
file2.txt
$ echo "new" > created.txt
$ ls
created.txt
file1.txt
file2.txt
```

### DON'T: Use patterns in commands

```console
# ❌ WRONG: [CWD] is for output matching only
$ cat [CWD]/file.txt
```

## References

- **Reference doc**: `docs/tryscript-reference.md` - Complete syntax reference for developers
- [trycmd](https://docs.rs/trycmd) - Rust CLI testing tool (inspiration)
- [cram](https://bitheap.org/cram/) - Python CLI testing tool
- Plan spec: `docs/project/specs/active/plan-2026-01-03-tryscript-enhancements.md`
