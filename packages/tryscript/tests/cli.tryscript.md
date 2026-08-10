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

Markdown golden tests for CLI applications

Options:
  --version                         Print the version
  -h, --help                        display help for command

Commands:
  run [options] [files...]          Run Markdown golden tests
  coverage [options] <commands...>  Collect merged V8 coverage from one or more
                                    commands
  readme [options]                  Print the README
  docs [options]                    Print the syntax reference
? 0
```

# Test: run --help shows run options

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --help
Usage: tryscript run [options] [files...]

Run Markdown golden tests

Arguments:
  files                               Files or glob patterns (default:
                                      **/*.tryscript.md)

Options:
  --update                            Replace expected output with actual output
  --diff                              Show diff on failure (default: true)
  --no-diff                           Hide diff on failure
  --fail-fast                         Stop on first failure
  --filter <pattern>                  Run named tests matching a regular
                                      expression
  --verbose                           Include captured output for passing tests
  --quiet                             Show only failures and the final summary
  --expand                            Replace unknown wildcards (??? and [??])
                                      with actual output
  --expand-generic                    Replace unknown and generic wildcards with
                                      actual output
  --expand-all                        Replace all wildcards, including named
                                      patterns
  --capture-log <path>                Write wildcard captures to a YAML file
  --coverage                          Collect V8 coverage with an installed c8
                                      package
  --coverage-dir <dir>                Coverage output directory (default:
                                      coverage-tryscript)
  --coverage-reporter <reporter>      Coverage reporter; repeat for multiple
                                      values (default: text, html)
  --coverage-exclude <pattern>        Exclude pattern; repeat for multiple
                                      values (c8 --exclude)
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
  --coverage-monocart                 Use monocart AST-aware line counts when
                                      merging with Vitest
  --merge-lcov <path>                 Merge an existing LCOV file into the
                                      generated report
  -h, --help                          display help for command

Global Options:
  --version                           Print the version
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

...
? 0
```

# Test: docs command displays reference

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs docs --raw | head -5
# tryscript Reference

A `.tryscript.md` file combines Markdown prose with console blocks that execute shell
commands and assert their output.
This keeps the command, result, and explanation in one reviewable file.

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
    hello

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
Error: No test files matched: /nonexistent/*.tryscript.md (working directory: [CWD])
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

# Test: --coverage flag is accepted and generates report <!-- skip -->

This test is skipped because it depends on c8 availability and can time out
in sandboxed environments. The coverage command functionality is tested below
using the mock c8 script.

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --coverage --coverage-reporter text coverage-pass.tryscript.md 2>&1
PASS [..]coverage-pass.tryscript.md
  ✓ Coverage Pass

1 passed [..]

Generating coverage report...
...
Error: Failed to generate coverage report: c8 report exited with code 1
? 1
```

## Coverage Command

# Test: coverage --help shows coverage options

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage --help
Usage: tryscript coverage [options] <commands...>

Collect merged V8 coverage from one or more commands

Arguments:
  commands                   Quoted shell commands to run with NODE_V8_COVERAGE

Options:
  --reports-dir <dir>        Coverage output directory (default: coverage)
  --reporters <reporters>    Comma-separated reporters (default:
                             text,json,json-summary,lcov,html)
  --include <patterns>       Comma-separated glob patterns to include
  --exclude <patterns>       Comma-separated glob patterns to exclude
  --exclude-node-modules     Exclude node_modules from coverage (default: true)
  --no-exclude-node-modules  Include node_modules in coverage
  --exclude-after-remap      Apply exclude logic after sourcemap remapping
  --skip-full                Hide files with 100% coverage
  --allow-external           Include files outside the working directory
  --monocart                 Use monocart AST-aware line counts when merging
                             reports
  --src <dir>                Source directory for sourcemap remapping (default:
                             src)
  --verbose                  Show coverage summary after each command for
                             debugging
  --merge-lcov <path>        Merge an existing LCOV file into the generated
                             report
  -h, --help                 display help for command

Global Options:
  --version                  Print the version
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
Error: too many arguments. Expected 0 arguments but got 1.
Run tryscript --help for usage.
exit: 1
? 0
```

# Test: coverage command requires arguments

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage 2>&1; echo "exit: $?"
Error: missing required argument 'commands'
Run tryscript --help for usage.
exit: 1
? 0
```

## Coverage Command with Mock c8

These tests use a mock c8 script to verify the coverage command logic.

# Test: coverage command runs commands and generates report

```console
$ TRYSCRIPT_C8_COMMAND="$PWD/mock-c8.sh" node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs coverage "echo hello" 2>&1
Collecting V8 coverage to [..]

=== Running command 1/1: echo hello ===
hello

V8 coverage: 0 files (0 new), 0.0 KiB total
Warning: No new coverage files from this command. This may indicate the command doesn't write to NODE_V8_COVERAGE.

=== Generating coverage report ===
mock-c8 called with: report --temp-directory [..] --reports-dir coverage --src src --all --include dist/** --exclude-node-modules --reporter text --reporter json --reporter json-summary --reporter lcov --reporter html

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
Warning: Command exited with code 1: exit 1
...
exit: 1
? 0
```
