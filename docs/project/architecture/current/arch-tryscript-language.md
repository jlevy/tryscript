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
| `cwd` | `"."` \| `"temp"` \| path | `"."` | Working directory for commands |
| `env` | `Record<string, string>` | `{}` | Environment variables passed to shell |
| `timeout` | `number` | `30000` | Command timeout in milliseconds |
| `fixtures` | `string[]` \| `Fixture[]` | `[]` | Files to copy to temp dir before tests |
| `before` | `string` | - | Shell command to run before first test |
| `after` | `string` | - | Shell command to run after all tests |
| `patterns` | `Record<string, string>` | `{}` | Custom elision patterns |

### Removed Options (Simplified Design)

| Option | Reason for Removal | Alternative |
|--------|-------------------|-------------|
| `bin` | Redundant with `cwd: .` | Use relative paths directly |
| `binName` | Redundant with `env` | Use `env: { CLI: ./path }` then `$CLI` |
| `vars` | Conflicts with shell variables | Use `env` (shell handles `$VAR`) |

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
│  • tempDir: /tmp/tryscript-xxx/                             │
│  • testDir: directory containing test file                  │
│  • cwd: testDir (default) or tempDir (if cwd: temp)         │
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
| `[CWD]` | Current working directory | `[CWD]/output.txt` |
| `[ROOT]` | Test file directory | `[ROOT]/fixtures/` |
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

Copy files to temp directory before tests run:

```yaml
fixtures:
  - data/input.txt                    # Copies to $TEMP/input.txt
  - source: config/settings.json      # Copies to $TEMP/custom.json
    dest: custom.json
```

### Hooks

Run shell commands before/after test execution:

```yaml
before: npm run build
after: rm -rf $TEMP/cache
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

### DON'T: Expect tryscript variable expansion

```yaml
# ❌ WRONG: vars is removed
vars:
  FILE: test.txt
```

### DON'T: Use patterns in commands

```console
# ❌ WRONG: [CWD] is for output matching only
$ cat [CWD]/file.txt
```

## References

- [trycmd](https://docs.rs/trycmd) - Rust CLI testing tool (inspiration)
- [cram](https://bitheap.org/cram/) - Python CLI testing tool
- Plan spec: `docs/project/specs/active/plan-2026-01-03-tryscript-enhancements.md`
