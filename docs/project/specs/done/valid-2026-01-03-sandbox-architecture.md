# Feature Validation: Sandbox Architecture Implementation

## Purpose

This validation spec documents the testing performed for the sandbox architecture
implementation and lists manual validation steps for user review.

**Feature Plan:** [plan-2026-01-03-sandbox-architecture.md](plan-2026-01-03-sandbox-architecture.md)

**Architecture Doc:** [arch-tryscript-language.md](../../architecture/current/arch-tryscript-language.md)

## Summary of Changes

### Breaking Changes (new library, no backward compatibility)
- Removed `bin`, `binName`, `vars` config options
- Removed `cwd: "temp"` magic keyword
- Removed `expandVars()` and `resolveCommand()` functions

### New Features
- Added `sandbox: boolean | string` option for explicit test isolation
- `sandbox: true` creates empty temp directory
- `sandbox: ./path` copies directory to temp and runs there
- Fixtures now require sandbox mode to be enabled

## Automated Validation (Testing Performed)

### Unit Testing

All 51 unit tests pass:

| Test File | Tests | Description |
|-----------|-------|-------------|
| `matcher.test.ts` | 18 | Elision pattern matching |
| `parser.test.ts` | 5 | Test file parsing, frontmatter |
| `runner.test.ts` | 17 | Command execution, sandbox mode |
| `updater.test.ts` | 6 | Golden file updates |
| `cli.integration.test.ts` | 5 | CLI interface |

**New/Updated Tests:**
- `uses temp dir when sandbox is true` - Verifies `sandbox: true` creates temp dir
- `copies directory to sandbox when sandbox is a path` - Verifies `sandbox: ./path` copies
- `resolves cwd relative to test file directory` - Verifies `cwd: ./path` works
- `uses env variables from config` - Verifies shell `$VAR` expansion
- `runs in sandbox directory when sandbox is true` - Verifies pwd is temp dir

### Integration and End-to-End Testing

**Tryscript Test Files Updated:**

| Test File | Changes |
|-----------|---------|
| `cwd-temp.tryscript.md` | Changed `cwd: temp` → `sandbox: true` |
| `bin-config.tryscript.md` | Changed `bin/binName` → `env` with `$MYECHO` |
| `vars.tryscript.md` | Changed `vars` → `env`, removed `$TEMP`/`$ROOT`/`$CWD` |
| `fixtures.tryscript.md` | Changed `cwd: temp` → `sandbox: true` |
| `hooks.tryscript.md` | Changed `cwd: temp` → `sandbox: true` |

All test files pass when run with `npx tryscript`.

## Manual Testing Needed

### 1. Verify Documentation

```bash
npx tryscript docs
```

**Verify:**
- [ ] Config options table shows `cwd`, `sandbox`, `env`, `timeout`, `patterns`, `fixtures`, `before`, `after`
- [ ] No mention of deprecated `bin`, `binName`, `vars` options
- [ ] Sandbox Mode section explains `sandbox: true` and `sandbox: ./path`
- [ ] Environment Variables section shows using `env` with `$VAR` syntax

### 2. Test Sandbox Mode: Empty Sandbox

Create a test file with `sandbox: true`:

```markdown
---
sandbox: true
---

# Test: Files created in sandbox

\`\`\`console
$ echo "test" > myfile.txt && cat myfile.txt
test
\`\`\`
```

**Verify:**
- [ ] Test passes
- [ ] No `myfile.txt` is created in the source directory (files stay in temp)

### 3. Test Sandbox Mode: Copy Directory

Create a fixture directory `test-fixtures/` with a file `data.txt` containing "hello".

Create a test file with `sandbox: ./test-fixtures`:

```markdown
---
sandbox: ./test-fixtures
---

# Test: Fixtures copied to sandbox

\`\`\`console
$ cat data.txt
hello
\`\`\`
```

**Verify:**
- [ ] Test passes
- [ ] `data.txt` content is read from sandbox copy

### 4. Test Environment Variables

Create a test file using `env`:

```markdown
---
env:
  MY_CLI: /bin/echo
---

# Test: Env variable for CLI

\`\`\`console
$ $MY_CLI "hello from env"
hello from env
\`\`\`
```

**Verify:**
- [ ] Test passes
- [ ] Shell correctly expands `$MY_CLI`

### 5. Run Full Test Suite

```bash
pnpm test
```

**Verify:**
- [ ] All 51 tests pass
- [ ] No TypeScript errors
- [ ] No ESLint errors

## Open Questions

None - implementation is complete and all automated tests pass.
