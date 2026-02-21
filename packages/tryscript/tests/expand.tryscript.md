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

2 unknown wildcard(s) found (??? or [??]). These are temporary and should be expanded. Use --expand to fill them in.
2 passed [..]
? 0
```

# Test: Expand unknown wildcards in a test file

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --expand target.tryscript.md 2>&1
PASS [..]target.tryscript.md
  ✓ Simple echo with unknown wildcard
  ✓ Multi-line with unknown wildcard

  ↻ Expanded 2 wildcard(s): [..]
2 unknown wildcard(s) found (??? or [??]). These are temporary and should be expanded. Use --expand to fill them in.
2 passed [..]
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

2 passed [..]
? 0
```
