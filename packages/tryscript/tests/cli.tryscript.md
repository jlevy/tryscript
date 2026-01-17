---
sandbox: true
env:
  NO_COLOR: "1"
fixtures:
  - cli-fixtures/pass.md
  - cli-fixtures/fail.md
  - cli-fixtures/verbose.md
  - cli-fixtures/quiet.md
  - cli-fixtures/filter.md
  - cli-fixtures/failfast.md
  - cli-fixtures/exitcode.md
  - cli-fixtures/env.md
  - cli-fixtures/patterns.md
  - cli-fixtures/multi1.md
  - cli-fixtures/multi2.md
  - cli-fixtures/counts.md
  - cli-fixtures/coverage-pass.tryscript.md
  - cli-fixtures/update-test.md
  - cli-fixtures/mock-c8.sh
---

# Master CLI Test Suite

Comprehensive tests for all tryscript CLI features.

## Help and Version

# Test: --help shows usage information

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs --help
Usage: tryscript [options] [command]

Golden testing for CLI applications

Options:
  --version                         Show version number
  -h, --help                        display help for command

Commands:
  run [options] [files...]          Run golden tests
  coverage [options] <commands...>  Run commands with merged V8 coverage
  readme [options]                  Display README documentation
  docs [options]                    Display concise syntax reference
? 0
```

# Test: run --help shows run options

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --help
Usage: tryscript run [options] [files...]

Run golden tests

Arguments:
  files                               Test files to run (default:
                                      **/*.tryscript.md)

Options:
  --update                            Update golden files with actual output
  --diff                              Show diff on failure (default: true)
  --no-diff                           Hide diff on failure
  --fail-fast                         Stop on first failure
  --filter <pattern>                  Filter tests by name pattern
  --verbose                           Show detailed output including passing
                                      test output
  --quiet                             Suppress non-essential output (only show
                                      failures)
  --coverage                          Enable code coverage collection (requires
                                      c8)
  --coverage-dir <dir>                Coverage output directory (default:
                                      coverage-tryscript)
  --coverage-reporter <reporter...>   Coverage reporters (default: text, html).
                                      Can be specified multiple times.
  --coverage-exclude <pattern...>     Patterns to exclude from coverage (c8
                                      --exclude). Can be specified multiple
                                      times.
  --coverage-exclude-node-modules     Exclude node_modules from coverage (c8
                                      --exclude-node-modules, default: true)
  --no-coverage-exclude-node-modules  Include node_modules in coverage (c8
                                      --no-exclude-node-modules)
  --coverage-exclude-after-remap      Apply exclude logic after sourcemap
                                      remapping (c8 --exclude-after-remap)
  --coverage-skip-full                Hide files with 100% coverage (c8
                                      --skip-full)
  --coverage-allow-external           Allow files from outside cwd (c8
                                      --allowExternal)
  --coverage-monocart                 Use monocart for accurate line counts,
                                      better for merging with vitest (c8
                                      --experimental-monocart)
  --merge-lcov <path>                 Merge coverage from an existing LCOV file
                                      (e.g., from vitest --coverage)
  -h, --help                          display help for command

Global Options:
  --version                           Show version number
? 0
```

# Test: --version shows version number

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs --version
[..]
? 0
```

## Subcommands

# Test: readme command displays README

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs readme --raw | head -20
# tryscript

...
Golden testing for CLI applications - a TypeScript port of [trycmd](https://github.com/assert-rs/trycmd).
...
? 0
```

# Test: docs command displays reference

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs docs --raw | head -5
# tryscript Reference

Complete reference for writing tryscript golden tests. This document covers all syntax,
configuration, and patterns needed to write accurate CLI tests on the first try.

? 0
```

# Test: docs command with --color formats markdown

The NO_COLOR env must be unset for colors to work. Output contains ANSI escape sequences.

```console
$ NO_COLOR= node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs docs --color 2>&1 | head -1 | cat -v
^[[1m^[[36m# tryscript Reference^[[39m^[[22m
? 0
```

# Test: readme command with --color formats markdown

```console
$ NO_COLOR= node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs readme --color 2>&1 | head -1 | cat -v
^[[1m^[[36m# tryscript^[[39m^[[22m
? 0
```

## Running Tests

# Test: Run passing test and show summary

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run pass.md
PASS [..]pass.md
  ✓ Pass

1 passed [..]
? 0
```

# Test: Run failing test shows failure

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run fail.md --no-diff 2>&1; echo "exit: $?"
FAIL [..]fail.md
  ✗ Fail
...
exit: 1
? 0
```

## CLI Options

# Test: --verbose shows detailed output

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run verbose.md --verbose
PASS [..]verbose.md
  ✓ Verbose
...
1 passed [..]
? 0
```

# Test: --quiet suppresses output on success

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run quiet.md --quiet
1 passed [..]
? 0
```

# Test: --filter runs only matching tests

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run filter.md --filter Alpha
PASS [..]filter.md
  ✓ Alpha

1 passed [..]
? 0
```

# Test: --fail-fast stops on first failure

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run failfast.md --fail-fast --no-diff 2>&1; echo "exit: $?"
FAIL [..]failfast.md
  ✗ First Fail
...
exit: 1
? 0
```

## Error Handling

# Test: No test files found exits with code 1

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run /nonexistent/*.tryscript.md 2>&1; echo "exit: $?"
No test files found
exit: 1
? 0
```

# Test: Exit code mismatch is detected

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run exitcode.md --no-diff 2>&1; echo "exit: $?"
FAIL [..]exitcode.md
  ✗ Exit Code
...
exit: 1
? 0
```

## Frontmatter Configuration

# Test: Custom environment variables work

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run env.md
PASS [..]env.md
  ✓ Env

1 passed [..]
? 0
```

# Test: Custom patterns work

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run patterns.md
PASS [..]patterns.md
  ✓ Patterns

1 passed [..]
? 0
```

## Multiple Files

# Test: Run multiple test files

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run multi1.md multi2.md
PASS [..]multi1.md
  ✓ One

PASS [..]multi2.md
  ✓ Two

2 passed [..]
? 0
```

## Summary Statistics

# Test: Summary shows correct counts

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run counts.md
PASS [..]counts.md
  ✓ A
  ✓ B
  ✓ C

3 passed [..]
? 0
```

## Coverage

# Test: --coverage flag is accepted and generates report

The coverage report may fail in sandbox due to npx/c8 isolation, but this tests
that the --coverage flag works and triggers the coverage code path. The error
message tests the logError function which uses colors.error.

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --coverage --coverage-reporter text coverage-pass.tryscript.md 2>&1
PASS [..]coverage-pass.tryscript.md
  ✓ Coverage Pass

1 passed [..]

Generating coverage report...
...
Failed to generate coverage report: c8 report exited with code 1
? 0
```

## Coverage Command

# Test: coverage --help shows coverage options

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage --help
Usage: tryscript coverage [options] <commands...>

Run commands with merged V8 coverage

Arguments:
  commands                   Commands to run (each will inherit coverage
                             environment)

Options:
  --reports-dir <dir>        Coverage output directory (default: coverage)
  --reporters <reporters>    Comma-separated coverage reporters (default:
                             text,json,json-summary,lcov,html)
  --include <patterns>       Comma-separated patterns to include in coverage
  --exclude <patterns>       Comma-separated patterns to exclude from coverage
  --exclude-node-modules     Exclude node_modules from coverage (default: true)
                             (default: true)
  --no-exclude-node-modules  Include node_modules in coverage
  --exclude-after-remap      Apply exclude logic after sourcemap remapping
  --skip-full                Hide files with 100% coverage
  --allow-external           Allow files from outside cwd
  --monocart                 Use monocart for accurate line counts (recommended
                             for merging)
  --src <dir>                Source directory for sourcemap remapping (default:
                             src)
  --verbose                  Show coverage summary after each command for
                             debugging
  --merge-lcov <path>        Merge coverage from an existing LCOV file (e.g.,
                             from vitest --coverage)
  -h, --help                 display help for command

Global Options:
  --version                  Show version number
? 0
```

## Update Mode

# Test: --update updates test file with actual output

This test verifies the --update flag modifies files. We use a fixture that
has wrong expected output and verify it gets updated. We grep to check the
file was updated correctly (avoids backtick issues in expected output).

```console
$ cp update-test.md update-test-copy.md; node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --update update-test-copy.md 2>&1; grep "old output" update-test-copy.md; rm update-test-copy.md
...
  ↻ Updated: Update test
...
old output
? 0
```

## CLI Error Handling

# Test: Invalid argument shows error message

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs invalid-arg 2>&1; echo "exit: $?"
error: too many arguments. Expected 0 arguments but got 1.
(use --help for usage)
exit: 1
? 0
```

# Test: coverage command requires arguments

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage 2>&1; echo "exit: $?"
error: missing required argument 'commands'
(use --help for usage)
exit: 1
? 0
```

## Coverage Command with Mock c8

These tests use a mock c8 script to verify the coverage command logic.

# Test: coverage command runs commands and generates report

```console
$ TRYSCRIPT_C8_COMMAND="$PWD/mock-c8.sh" node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage "echo hello" 2>&1
Collecting V8 coverage to /tmp/tryscript-coverage-[..]

=== Running command 1/1: echo hello ===
hello

V8 coverage: 0 files (0 new), 0.0 KB total
No new coverage files from this command. This may indicate the command doesn't write to NODE_V8_COVERAGE.

=== Generating coverage report ===
mock-c8 called with: report --temp-directory /tmp/tryscript-coverage-[..] --reports-dir coverage --src src --all --include dist/** --exclude-node-modules --reporter text --reporter json --reporter json-summary --reporter lcov --reporter html

Coverage report written to coverage/
? 0
```

# Test: coverage command with --monocart flag

```console
$ TRYSCRIPT_C8_COMMAND="$PWD/mock-c8.sh" node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage --monocart "echo test" 2>&1
...
mock-c8 called with: report --temp-directory [..] --reports-dir coverage --src src --all --include dist/** --exclude-node-modules --experimental-monocart --reporter text --reporter json --reporter json-summary --reporter lcov --reporter html
...
? 0
```

# Test: coverage command with custom reporters

```console
$ TRYSCRIPT_C8_COMMAND="$PWD/mock-c8.sh" node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage --reporters text,html "echo test" 2>&1
...
mock-c8 called with: report --temp-directory [..] --reports-dir coverage --src src --all --include dist/** --exclude-node-modules --reporter text --reporter html
...
? 0
```

# Test: coverage command with multiple commands

```console
$ TRYSCRIPT_C8_COMMAND="$PWD/mock-c8.sh" node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage "echo first" "echo second" 2>&1
...
=== Running command 1/2: echo first ===
first
...
=== Running command 2/2: echo second ===
second
...
mock-c8 called with: report [..]
...
? 0
```

# Test: coverage command with custom reports-dir

```console
$ TRYSCRIPT_C8_COMMAND="$PWD/mock-c8.sh" node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage --reports-dir my-coverage "echo test" 2>&1
...
mock-c8 called with: report --temp-directory [..] --reports-dir my-coverage --src src --all --include dist/** --exclude-node-modules --reporter text --reporter json --reporter json-summary --reporter lcov --reporter html
...
Coverage report written to my-coverage/
? 0
```

# Test: coverage command with --no-exclude-node-modules

```console
$ TRYSCRIPT_C8_COMMAND="$PWD/mock-c8.sh" node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage --no-exclude-node-modules "echo test" 2>&1
...
mock-c8 called with: report --temp-directory [..] --reports-dir coverage --src src --all --include dist/** --no-exclude-node-modules --reporter text --reporter json --reporter json-summary --reporter lcov --reporter html
...
? 0
```

# Test: coverage command exits with failure when command fails

```console
$ TRYSCRIPT_C8_COMMAND="$PWD/mock-c8.sh" node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage "exit 1" 2>&1; echo "exit: $?"
...
Command exited with code 1: exit 1
...
exit: 1
? 0
```
