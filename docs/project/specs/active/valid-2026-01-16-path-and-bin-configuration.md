# Feature Validation: PATH and Binary Configuration

## Purpose

This validation spec documents the testing performed for the PATH and binary configuration
features (path option, packageBin option, and TRYSCRIPT_PACKAGE_ROOT environment variable).

**Feature Plan:** [plan-2026-01-16-path-and-bin-configuration.md](plan-2026-01-16-path-and-bin-configuration.md)

**Related Issue:** [#32 - Feature: Add packageBin option](https://github.com/jlevy/tryscript/issues/32)

## Automated Validation (Testing Performed)

### Golden Tests (End-to-End)

All features are validated through golden tests that test actual command execution:

**Phase I - `path` option:**
- `tests/path-option.tryscript.md` - Tests:
  - Binary from custom path directory (`hello-world` command)
  - Multiple binaries from path (`version-check` command)
  - Path works alongside system PATH commands

**Phase II - `packageBin` option:**
- `tests/package-bin.tryscript.md` - Tests object-form bin with explicit command names
- `tests/package-bin-string.tryscript.md` - Tests string-form bin (command name from package name)
- `tests/package-bin-scoped.tryscript.md` - Tests scoped packages (`@scope/name` → `name`)

**Phase III - `TRYSCRIPT_PACKAGE_ROOT`:**
- `tests/package-root-var.tryscript.md` - Tests:
  - Variable contains "tryscript" (points to package root)
  - Variable is an absolute path

### Test Fixtures

Test fixtures created to support golden tests:
- `tests/cli-fixtures/bin/hello-world` - Shell script outputting "Hello from custom bin!"
- `tests/cli-fixtures/bin/version-check` - Shell script outputting "test-cli v1.0.0"
- `tests/cli-fixtures/pkg-with-bin/` - Package with object-form bin
- `tests/cli-fixtures/pkg-string-bin/` - Package with string-form bin
- `tests/cli-fixtures/pkg-scoped/` - Package with scoped name

### Unit Tests

Existing unit tests in `tests/runner.test.ts` continue to pass, validating core runner functionality.

### Test Results

All 102 golden tests pass (100 existing + 5 new):
```
102 passed (27.05s)
```

All 74 unit tests pass:
```
Test Files  7 passed (7)
Tests       74 passed (74)
```

## Manual Testing Needed

### 1. Review New Configuration Options

The user should review the new configuration options work as documented:

```yaml
# In a test file frontmatter
---
sandbox: true
path:
  - ../dist           # Makes binaries in ../dist available by name
packageBin: true      # Auto-exposes package.json bin entries
---
```

### 2. Test packageBin with Your Own Package

Create a test file for your own CLI package and verify:

```yaml
---
sandbox: true
packageBin: true
---

# Your CLI should work by name
```console
$ your-cli --version
[expected version output]
? 0
```
```

### 3. Verify TRYSCRIPT_PACKAGE_ROOT

In any test file, verify the environment variable is set:

```console
$ echo $TRYSCRIPT_PACKAGE_ROOT
[should output absolute path to your package root]
? 0
```

### 4. Documentation Review

The following documentation updates are still pending (tryscript-336):
- Update `packages/tryscript/docs/tryscript-reference.md` with new config options
- Add "Testing CLIs" best practices section
- Update environment variables table

## Open Questions

None at this time. All implementation questions from the plan spec have been addressed.

## Remaining Work

- [x] Update documentation (tryscript-336)
- [x] Close epic bead (tryscript-327)
