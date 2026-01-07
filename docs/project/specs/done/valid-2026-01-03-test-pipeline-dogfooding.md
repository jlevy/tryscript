# Feature Validation: Test Pipeline Dogfooding

## Purpose

This validation spec documents the fixes for failing tests and the enhancement to ensure
tryscript dogfoods itself in the test pipeline.

**Related:** [valid-2026-01-03-sandbox-architecture.md](valid-2026-01-03-sandbox-architecture.md)
(this PR completes the migration started in that spec)

## Summary of Changes

### Bug Fixes

1. **Migrated 3 missed test files** - Three test files were missed during the sandbox
   architecture migration and still used deprecated `cwd: temp` syntax, causing
   "spawn /bin/sh ENOENT" errors:
   - `tests/meta.tryscript.md`
   - `tests/skip-only.tryscript.md`
   - `tests/stderr.tryscript.md`

2. **Fixed test artifact pollution** - `elisions.tryscript.md` was creating `testfile.txt`
   in the tests directory. Added `sandbox: true` to isolate test artifacts.

3. **Fixed `[ROOT]` test** - The test incorrectly assumed `[ROOT]` equals `[CWD]`. Updated
   to correctly test that `[ROOT]` matches the test file directory (via `TRYSCRIPT_TEST_DIR`).

### Test Pipeline Enhancement

**`pnpm test` now runs both vitest AND tryscript self-tests (dogfooding):**

| Command | What it runs | Test count |
|---------|--------------|------------|
| `pnpm test` | vitest + self-tests | 124 total |
| `pnpm test:unit` | vitest only | 51 tests |
| `pnpm test:self` | tryscript self-tests only | 73 tests |

This ensures regressions like the migration issues cannot slip through.

## Automated Validation

### All Tests Pass

```bash
pnpm test
# Output: 51 vitest tests pass, 73 tryscript self-tests pass
```

### No Test Artifacts

```bash
git status  # After running tests
# Output: nothing to commit, working tree clean
```

### Pre-push Hook Runs Full Suite

The lefthook pre-push hook now runs `pnpm test` which includes both vitest and self-tests.

## Manual Validation

### 1. Verify Test Pipeline

```bash
# Run full test suite
pnpm test

# Verify both test types run
# Should see: "51 passed" from vitest AND "73 passed" from tryscript
```

**Verify:**
- [ ] Vitest runs first (51 tests)
- [ ] Tryscript self-tests run second (73 tests)
- [ ] All 124 tests pass

### 2. Verify No Artifacts

```bash
# Run tests
pnpm test

# Check for artifacts
git status
```

**Verify:**
- [ ] No untracked files like `testfile.txt`
- [ ] Working tree is clean

### 3. Verify Previously Failing Tests

```bash
pnpm test:self -- tests/meta.tryscript.md tests/skip-only.tryscript.md tests/stderr.tryscript.md
```

**Verify:**
- [ ] All 9 tests pass (was 9 failures before fix)
- [ ] No "spawn /bin/sh ENOENT" errors

### 4. Verify Pre-push Hook

```bash
git push --dry-run
# Observe that pre-push hook runs pnpm test (full suite)
```

**Verify:**
- [ ] Hook runs `pnpm test` (not just `pnpm -r test`)
- [ ] Both vitest and self-tests execute

## Files Changed

| File | Change |
|------|--------|
| `package.json` | `test` script now includes self-tests |
| `packages/tryscript/package.json` | Added `test:self` script |
| `lefthook.yml` | pre-push runs `pnpm test` |
| `tests/meta.tryscript.md` | `cwd: temp` → `sandbox: true` |
| `tests/skip-only.tryscript.md` | `cwd: temp` → `sandbox: true` |
| `tests/stderr.tryscript.md` | `cwd: temp` → `sandbox: true` |
| `tests/elisions.tryscript.md` | Added `sandbox: true`, fixed `[ROOT]` test |
