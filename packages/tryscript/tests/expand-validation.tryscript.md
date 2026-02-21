---
sandbox: true
env:
  NO_COLOR: "1"
---

# Test: Expand flags are mutually exclusive

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --expand --expand-generic 2>&1; echo "exit: $?"
--expand, --expand-generic, and --expand-all are mutually exclusive
exit: 1
? 0
```

# Test: Expand and update are mutually exclusive

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --expand --update 2>&1; echo "exit: $?"
--expand* flags and --update are mutually exclusive
exit: 1
? 0
```
