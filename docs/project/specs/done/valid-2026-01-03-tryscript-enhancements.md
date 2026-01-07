# Feature Validation: Tryscript Enhancements

## Purpose

This validation spec covers post-testing validation for the tryscript enhancements
including bug fixes (bin config, cwd default) and new features (vars, fixtures, hooks,
skip/only, stderr).

**Feature Plan:** [plan-2026-01-03-tryscript-enhancements.md](plan-2026-01-03-tryscript-enhancements.md)

## Stage 4: Validation Stage

## Automated Validation (Testing Performed)

### Unit Testing

All 50 unit tests pass (`npm test`):

- **matcher.test.ts** (18 tests): Output matching with elision patterns
- **parser.test.ts** (5 tests): Markdown parsing, frontmatter extraction
- **runner.test.ts** (16 tests): Command execution, context creation, cwd/binName
- **updater.test.ts** (6 tests): Golden file updating
- **cli.integration.test.ts** (5 tests): CLI commands, help, version

### Integration and End-to-End Testing

All 75 golden tests pass (`npm run test:golden`):

**Phase 1 Features:**
- `bin-config.tryscript.md` - binName resolves to bin path
- `cwd-temp.tryscript.md` - Working directory set to temp when configured
- `features.tryscript.md` - Default cwd is test file directory

**Phase 2 Features:**
- `vars.tryscript.md` - Variable expansion with $TEMP, $ROOT, $CWD, user vars
- `fixtures.tryscript.md` - File copying to temp directory before tests
- `hooks.tryscript.md` - before/after hook execution

**Phase 3 Features:**
- `skip-only.tryscript.md` - Skip/only annotations in headings
- `stderr.tryscript.md` - Separate stdout/stderr with `!` prefix

**Existing Tests (Regression):**
- `basic.tryscript.md` - Core functionality unchanged
- `cli.tryscript.md` - CLI behavior unchanged
- `config.tryscript.md` - Config patterns unchanged
- `elisions.tryscript.md` - Elision patterns unchanged
- `meta.tryscript.md` - Meta-testing unchanged

### Manual Testing Needed

#### 1. Phase 1: Core Options

**1.1 binName aliasing:**
```yaml
---
bin: ./dist/bin.mjs
binName: mycli
---
```
- [ ] Create a test file with above config
- [ ] Verify `$ mycli --help` resolves to `./dist/bin.mjs --help`
- [ ] Verify error messages reference correct binary path

**1.2 cwd default behavior:**
- [ ] Create test file without `cwd:` config
- [ ] Verify commands run in test file's directory (not temp)
- [ ] Verify relative paths work naturally: `$ ls tests/` works

**1.3 cwd: temp isolation:**
```yaml
---
cwd: temp
---
```
- [ ] Verify commands run in temp directory
- [ ] Verify files created don't pollute test directory

#### 2. Phase 2: Variables and Fixtures

**2.1 vars expansion:**
```yaml
---
vars:
  INPUT: examples/test.md
  NAME: myproject
---
```
- [ ] Verify `$ cat $INPUT` expands correctly
- [ ] Verify `$TEMP`, `$ROOT`, `$CWD` built-ins work
- [ ] Verify unknown `$UNKNOWN` passes through to shell

**2.2 fixtures:**
```yaml
---
fixtures:
  - source-file.txt
  - source: data/config.json
    dest: config.json
---
```
- [ ] Verify simple fixture is copied to temp with same name
- [ ] Verify fixture with dest is copied with new name
- [ ] Verify fixtures available before first test runs

**2.3 hooks:**
```yaml
---
before: npm run setup
after: rm -rf $TEMP/cache
---
```
- [ ] Verify before hook runs once before first test
- [ ] Verify after hook runs after all tests complete
- [ ] Verify hook failure stops test execution

#### 3. Phase 3: Filtering and Stderr

**3.1 skip annotation:**
```markdown
## This test is skipped <!-- skip -->
```
- [ ] Verify test with `<!-- skip -->` is not executed
- [ ] Verify skipped test shows as passed in output
- [ ] Verify skip can be inline or on separate line

**3.2 only annotation:**
```markdown
## Focus on this test <!-- only -->
```
- [ ] Verify only tests with `<!-- only -->` run
- [ ] Verify multiple `<!-- only -->` tests all run
- [ ] Verify tests without `<!-- only -->` are skipped

**3.3 stderr assertions:**
```console
$ command-with-errors
stdout line
! stderr line
? 1
```
- [ ] Verify `!` prefix matches stderr only
- [ ] Verify stdout lines (no prefix) match stdout only
- [ ] Verify mixed stdout/stderr works correctly

## Open Questions

None - all features have automated test coverage and clear behavior specifications.
