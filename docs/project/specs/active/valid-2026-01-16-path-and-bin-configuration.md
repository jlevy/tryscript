# Feature Validation: PATH and Binary Configuration

## Purpose

This validation spec documents the testing performed for the PATH and binary configuration
features including path option, environment variables, and env var expansion.

**Feature Plan:** [plan-2026-01-16-path-and-bin-configuration.md](plan-2026-01-16-path-and-bin-configuration.md)

**Related Issue:** [#32 - Feature: PATH configuration with environment variable expansion](https://github.com/jlevy/tryscript/issues/32)

## Automated Validation (Testing Performed)

### Golden Tests (End-to-End)

All features are validated through golden tests that test actual command execution:

**Phase I - `path` option:**
- `tests/path-option.tryscript.md` - Tests:
  - Binary from custom path directory (`hello-world` command)
  - Multiple binaries from path (`version-check` command)
  - Path works alongside system PATH commands

**Phase II - `TRYSCRIPT_PACKAGE_ROOT`:**
- `tests/package-root-var.tryscript.md` - Tests:
  - Variable contains "tryscript" (points to package root)
  - Variable is an absolute path

**Phase III-IV - `TRYSCRIPT_GIT_ROOT` and `TRYSCRIPT_PROJECT_ROOT`:**
- `tests/project-root-vars.tryscript.md` - Tests:
  - `TRYSCRIPT_GIT_ROOT` points to directory with `.git`
  - `TRYSCRIPT_GIT_ROOT` is absolute path
  - `TRYSCRIPT_PROJECT_ROOT` is set (most specific of package/git root)
  - `TRYSCRIPT_PROJECT_ROOT` is absolute path

**Phase V - `TRYSCRIPT_PACKAGE_BIN`:**
- `tests/package-bin-env.tryscript.md` - Tests:
  - `TRYSCRIPT_PACKAGE_BIN` points to `node_modules/.bin`
  - Variable is an absolute path

**Phase VI - Environment variable expansion in `path:`:**
- `tests/path-env-expansion.tryscript.md` - Tests `$TRYSCRIPT_PACKAGE_BIN` in path
- `tests/path-env-project-root.tryscript.md` - Tests `$TRYSCRIPT_PROJECT_ROOT` in path
- `tests/path-env-git-root.tryscript.md` - Tests `$TRYSCRIPT_GIT_ROOT` in path

### Test Fixtures

Test fixtures created to support golden tests:
- `tests/cli-fixtures/bin/hello-world` - Shell script outputting "Hello from custom bin!"
- `tests/cli-fixtures/bin/version-check` - Shell script outputting "test-cli v1.0.0"

### Unit Tests

Existing unit tests in `tests/runner.test.ts` continue to pass, validating core runner functionality.

### Test Results

All 111 golden tests pass:
```
111 passed
```

All 74 unit tests pass:
```
Test Files  7 passed (7)
Tests       74 passed (74)
```

## Manual Testing Needed

### 1. Review New Configuration Options

The recommended approach for npm packages:

```yaml
---
sandbox: true
path:
  - $TRYSCRIPT_PACKAGE_BIN   # Access node_modules/.bin via env var
---
```

### 2. Test with Your Own Package

Verify `$TRYSCRIPT_PACKAGE_BIN` works in path:

```yaml
---
sandbox: true
path:
  - $TRYSCRIPT_PACKAGE_BIN
---

# Your CLI should work by name
```console
$ your-cli --version
[expected version output]
? 0
```
```

### 3. Verify Environment Variables

In any test file, verify environment variables are set:

```console
$ echo $TRYSCRIPT_PACKAGE_ROOT
[absolute path to package root]
? 0

$ echo $TRYSCRIPT_GIT_ROOT
[absolute path to git root]
? 0

$ echo $TRYSCRIPT_PROJECT_ROOT
[most specific of package/git root]
? 0

$ echo $TRYSCRIPT_PACKAGE_BIN
[absolute path to node_modules/.bin]
? 0
```

### 4. Documentation Review

Documentation has been updated in `docs/tryscript-reference.md`:
- Added `TRYSCRIPT_PACKAGE_BIN` to environment variables table
- Documented env var expansion in `path:` settings
- Added "Using node_modules/.bin" section with recommended approach

## Open Questions

None at this time. All implementation questions from the plan spec have been addressed.

## Remaining Work

- [x] Implement `TRYSCRIPT_GIT_ROOT` env var
- [x] Implement `TRYSCRIPT_PROJECT_ROOT` env var
- [x] Implement `TRYSCRIPT_PACKAGE_BIN` env var
- [x] Implement env var expansion in `path:` settings
- [x] Update documentation
- [x] Update specs
