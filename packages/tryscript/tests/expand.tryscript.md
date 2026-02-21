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
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run target.tryscript.md 2>&1 | grep "should be expanded"
2 unknown wildcard(s) found (??? or [??]). These are temporary and should be expanded. Use --expand to fill them in.
? 0
```

# Test: Expand unknown wildcards in a test file

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --expand target.tryscript.md 2>&1 | grep "Expanded"
[..]Expanded 2 wildcard(s): [..]
? 0
```

# Test: Verify expanded file contains actual output

```console
$ grep -x "hello world" target.tryscript.md
hello world
? 0
```

# Test: Verify expanded file has multi-line expansion

```console
$ grep -x "line1" target.tryscript.md
line1
? 0
```

# Test: No warning after expansion

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run target.tryscript.md 2>&1 | grep "should be expanded" || echo "clean"
clean
? 0
```
