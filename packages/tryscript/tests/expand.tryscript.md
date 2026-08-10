---
sandbox: true
fixtures:
  - source: cli-fixtures/expand-fixture.tryscript.md
    dest: target.tryscript.md
env:
  NO_COLOR: "1"
---

# Test: Warning shown for unknown wildcards

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run target.tryscript.md 2>&1
PASS [..]target.tryscript.md
  ✓ Simple echo with unknown wildcard
  ✓ Multi-line with unknown wildcard
  ✓ Stderr with unknown wildcard

Warning: 3 unknown wildcards found (??? or [??]). Run with --expand, then review the replacement before committing.
3 passed [..]
? 0
```

# Test: Expand unknown wildcards in a test file

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --expand target.tryscript.md 2>&1
PASS [..]target.tryscript.md
  ✓ Simple echo with unknown wildcard
  ✓ Multi-line with unknown wildcard
  ✓ Stderr with unknown wildcard

  ↻ Expanded 3 wildcards: [..]
Warning: 3 unknown wildcards found (??? or [??]). Run with --expand, then review the replacement before committing.
3 passed [..]
? 0
```

# Test: No warning after expansion (file is clean)

Re-running on the expanded file proves expansion was correct: tests pass with
literal values and no unknown wildcard warning appears.

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run target.tryscript.md 2>&1
PASS [..]target.tryscript.md
  ✓ Simple echo with unknown wildcard
  ✓ Multi-line with unknown wildcard
  ✓ Stderr with unknown wildcard

3 passed [..]
? 0
```
