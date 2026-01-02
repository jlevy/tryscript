---
env:
  NO_COLOR: "1"
---

# Master CLI Test Suite

Comprehensive tests for all tryscript CLI features.

## Help and Version

# Test: --help shows usage information

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs --help
Usage: tryscript [options] [command] [files...]

Golden testing for CLI applications

Arguments:
  files               Test files to run (default: **/*.tryscript.md)

Options:
  --version           Show version number
  --update            Update golden files with actual output
  --diff              Show diff on failure (default: true)
  --no-diff           Hide diff on failure
  --fail-fast         Stop on first failure
  --filter <pattern>  Filter tests by name pattern
  --verbose           Show detailed output including passing test output
  --quiet             Suppress non-essential output (only show failures)
  -h, --help          display help for command

Commands:
  readme [options]    Display README documentation
  docs [options]      Display concise syntax reference
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

## Requirements
? 0
```

# Test: docs command displays reference

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs docs --raw | head -5
# tryscript Quick Reference

Concise syntax reference for writing tryscript test files.

## Test File Format
? 0
```

## Running Tests

# Test: Run passing test and show summary

```console
$ node -e "require('fs').writeFileSync('/tmp/pass-cli.tryscript.md', '# Test: Pass\n\n\`\`\`console\n\$ echo ok\nok\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/pass-cli.tryscript.md
PASS [..]pass-cli.tryscript.md
  ✓ Pass

1 passed [..]
? 0
```

# Test: Run failing test shows failure

```console
$ node -e "require('fs').writeFileSync('/tmp/fail-cli.tryscript.md', '# Test: Fail\n\n\`\`\`console\n\$ echo actual\nexpected\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/fail-cli.tryscript.md --no-diff 2>&1; echo "exit: $?"
FAIL [..]fail-cli.tryscript.md
  ✗ Fail
...
exit: 1
? 0
```

## CLI Options

# Test: --verbose shows detailed output

```console
$ node -e "require('fs').writeFileSync('/tmp/verbose.tryscript.md', '# Test: Verbose\n\n\`\`\`console\n\$ echo hello\nhello\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/verbose.tryscript.md --verbose
PASS [..]verbose.tryscript.md
  ✓ Verbose
...
1 passed [..]
? 0
```

# Test: --quiet suppresses output on success

```console
$ node -e "require('fs').writeFileSync('/tmp/quiet.tryscript.md', '# Test: Quiet\n\n\`\`\`console\n\$ echo hi\nhi\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/quiet.tryscript.md --quiet
1 passed [..]
? 0
```

# Test: --filter runs only matching tests

```console
$ node -e "require('fs').writeFileSync('/tmp/filter.tryscript.md', '# Test: Alpha\n\n\`\`\`console\n\$ echo a\na\n? 0\n\`\`\`\n\n# Test: Beta\n\n\`\`\`console\n\$ echo b\nb\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/filter.tryscript.md --filter Alpha
PASS [..]filter.tryscript.md
  ✓ Alpha

1 passed [..]
? 0
```

# Test: --fail-fast stops on first failure

```console
$ node -e "require('fs').writeFileSync('/tmp/failfast.tryscript.md', '# Test: First Fail\n\n\`\`\`console\n\$ echo wrong\nright\n? 0\n\`\`\`\n\n# Test: Second\n\n\`\`\`console\n\$ echo two\ntwo\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/failfast.tryscript.md --fail-fast --no-diff 2>&1; echo "exit: $?"
FAIL [..]failfast.tryscript.md
  ✗ First Fail
...
exit: 1
? 0
```

## Error Handling

# Test: No test files found exits with code 1

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /nonexistent/*.tryscript.md 2>&1; echo "exit: $?"
No test files found
exit: 1
? 0
```

# Test: Exit code mismatch is detected

```console
$ node -e "require('fs').writeFileSync('/tmp/exitcode.tryscript.md', '# Test: Exit Code\n\n\`\`\`console\n\$ exit 1\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/exitcode.tryscript.md --no-diff 2>&1; echo "exit: $?"
FAIL [..]exitcode.tryscript.md
  ✗ Exit Code
...
exit: 1
? 0
```

## Frontmatter Configuration

# Test: Custom environment variables work

```console
$ node -e "require('fs').writeFileSync('/tmp/env.tryscript.md', '---\nenv:\n  MY_VAR: hello\n---\n\n# Test: Env\n\n\`\`\`console\n\$ echo \$MY_VAR\nhello\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/env.tryscript.md
PASS [..]env.tryscript.md
  ✓ Env

1 passed [..]
? 0
```

# Test: Custom patterns work

```console
$ node -e "require('fs').writeFileSync('/tmp/patterns.tryscript.md', '---\npatterns:\n  NUM: \"[0-9]+\"\n---\n\n# Test: Patterns\n\n\`\`\`console\n\$ echo 12345\n[NUM]\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/patterns.tryscript.md
PASS [..]patterns.tryscript.md
  ✓ Patterns

1 passed [..]
? 0
```

## Multiple Files

# Test: Run multiple test files

```console
$ node -e "require('fs').writeFileSync('/tmp/multi1.tryscript.md', '# Test: One\n\n\`\`\`console\n\$ echo 1\n1\n? 0\n\`\`\`\n')" && node -e "require('fs').writeFileSync('/tmp/multi2.tryscript.md', '# Test: Two\n\n\`\`\`console\n\$ echo 2\n2\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/multi1.tryscript.md /tmp/multi2.tryscript.md
PASS /tmp/multi1.tryscript.md
  ✓ One

PASS /tmp/multi2.tryscript.md
  ✓ Two

2 passed [..]
? 0
```

## Summary Statistics

# Test: Summary shows correct counts

```console
$ node -e "require('fs').writeFileSync('/tmp/counts.tryscript.md', '# Test: A\n\n\`\`\`console\n\$ echo a\na\n? 0\n\`\`\`\n\n# Test: B\n\n\`\`\`console\n\$ echo b\nb\n? 0\n\`\`\`\n\n# Test: C\n\n\`\`\`console\n\$ echo c\nc\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs /tmp/counts.tryscript.md
PASS [..]counts.tryscript.md
  ✓ A
  ✓ B
  ✓ C

3 passed [..]
? 0
```
