# Feature Validation: CLI Subcommand Refactor

## Purpose

This validation spec covers the refactoring of the tryscript CLI to use a subcommand
structure similar to Markform. This change makes the CLI more intuitive by separating
test execution from documentation display.

**Feature Plan:** No dedicated plan spec - this is an ad-hoc usability improvement.

**Related Context:** Inspired by https://github.com/jlevy/markform CLI structure.

## Changes Summary

The CLI has been restructured from:
```
tryscript [options] [files...]  # Ran tests, awkwardly mixed with subcommands
```

To:
```
tryscript                    # Shows documentation (README)
tryscript run [files...]     # Runs golden tests
tryscript readme             # Shows README documentation
tryscript docs               # Shows concise syntax reference
```

## Automated Validation (Testing Performed)

### Unit Testing

All existing unit tests pass:
- `tests/matcher.test.ts` - 18 tests
- `tests/parser.test.ts` - 5 tests
- `tests/runner.test.ts` - 17 tests
- `tests/updater.test.ts` - 6 tests
- `tests/cli.integration.test.ts` - 6 tests (including new `run --help` test)

Total: 52 unit tests passing.

### Integration and End-to-End Testing

All golden tests pass (74 tests):
- `tests/cli.tryscript.md` - Updated with new CLI structure, tests both `--help` and
  `run --help` outputs
- `tests/meta.tryscript.md` - Updated to use `run` subcommand
- All other golden tests continue to pass

The following commands were validated:
- `pnpm tryscript --help` - Shows command overview
- `pnpm tryscript run --help` - Shows run options
- `pnpm tryscript` - Shows README documentation
- `pnpm tryscript run tests/basic.tryscript.md` - Runs tests

### Pre-commit Validation

Full precommit checks pass:
- `pnpm format` - Code formatted
- `pnpm typecheck` - No type errors
- `pnpm lint:check` - No lint errors
- `pnpm test` - All tests pass

## Manual Testing Needed

The user should validate the following:

### 1. CLI Help Output Review

Verify the help output is clear and intuitive:

```bash
pnpm tryscript --help
```

Expected: Shows commands `run`, `readme`, `docs` with descriptions.

```bash
pnpm tryscript run --help
```

Expected: Shows all run options (`--update`, `--diff`, `--filter`, etc.).

### 2. Default Behavior (No Arguments)

```bash
pnpm tryscript
```

Expected: Displays README documentation with syntax highlighting in terminal.

### 3. Running Tests with New Syntax

```bash
pnpm tryscript run tests/basic.tryscript.md
```

Expected: Runs the test file and shows pass/fail output.

```bash
pnpm tryscript run tests/ --verbose
```

Expected: Runs all tests in verbose mode.

### 4. Documentation Commands

```bash
pnpm tryscript readme
pnpm tryscript docs
```

Expected: Both display their respective documentation.

### 5. Package Scripts Work

The following package scripts use the new syntax:

```bash
pnpm test:golden      # Should run golden tests
pnpm test:self        # Should show README (new behavior)
```

## Files Changed

- `packages/tryscript/src/cli/cli.ts` - Main CLI restructure
- `packages/tryscript/src/cli/commands/run.ts` - Converted to registered subcommand
- `packages/tryscript/src/cli/commands/readme.ts` - Exported `showReadme` function
- `packages/tryscript/package.json` - Updated scripts to use `run` subcommand
- `packages/tryscript/README.md` - Updated CLI documentation
- `packages/tryscript/docs/tryscript-reference.md` - Updated CLI usage section
- `docs/development.md` - Updated CLI documentation
- `packages/tryscript/tests/cli.tryscript.md` - Updated golden tests
- `packages/tryscript/tests/meta.tryscript.md` - Updated to use `run` subcommand
- `packages/tryscript/tests/cli.integration.test.ts` - Updated integration tests
