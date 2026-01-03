---
sandbox: true
env:
  NO_COLOR: "1"
fixtures:
  - cli-fixtures/meta-pass.md
  - cli-fixtures/meta-fail.md
  - cli-fixtures/meta-elision.md
  - cli-fixtures/meta-multi.md
---

# Meta-tests: tryscript testing itself

These tests verify that tryscript can correctly test CLI applications.
Uses fixtures to provide test files in the sandbox.

# Test: Create and run a passing test file

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run meta-pass.md
PASS [..]meta-pass.md
  ✓ Pass Test

1 passed [..]
? 0
```

# Test: Create and detect a failing test file

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run meta-fail.md --no-diff 2>&1; echo "exit: $?"
FAIL [..]
  ✗ Fail Test
...
exit: 1
? 0
```

# Test: Elision patterns work in meta-tests

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run meta-elision.md
PASS [..]meta-elision.md
  ✓ Elision Test

1 passed [..]
? 0
```

# Test: Multiple test blocks work

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run meta-multi.md
PASS [..]meta-multi.md
  ✓ Test One
  ✓ Test Two

2 passed [..]
? 0
```
