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
  --version                 Show version number
  -h, --help                display help for command

Commands:
  run [options] [files...]  Run golden tests
  readme [options]          Display README documentation
  docs [options]            Display concise syntax reference
? 0
```

# Test: run --help shows run options

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --help
Usage: tryscript run [options] [files...]

Run golden tests

Arguments:
  files                              Test files to run (default:
                                     **/*.tryscript.md)

Options:
  --update                           Update golden files with actual output
  --diff                             Show diff on failure (default: true)
  --no-diff                          Hide diff on failure
  --fail-fast                        Stop on first failure
  --filter <pattern>                 Filter tests by name pattern
  --verbose                          Show detailed output including passing test
                                     output
  --quiet                            Suppress non-essential output (only show
                                     failures)
  --coverage                         Enable code coverage collection (requires
                                     c8)
  --coverage-dir <dir>               Coverage output directory (default:
                                     coverage-tryscript)
  --coverage-reporter <reporter...>  Coverage reporters (default: text, html).
                                     Can be specified multiple times.
  -h, --help                         display help for command

Global Options:
  --version                          Show version number
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
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs readme --raw | head -5
# tryscript

Golden testing for CLI applications - a TypeScript port of [trycmd](https://github.com/assert-rs/trycmd).

## What It Does
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
