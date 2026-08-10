---
sandbox: true
path:
  - $TRYSCRIPT_GIT_ROOT/packages/tryscript/tests/cli-fixtures/bin
env:
  NO_COLOR: "1"
---

# Test: path expands TRYSCRIPT_GIT_ROOT

Any TRYSCRIPT_* env var can be used in path entries.

```console
$ hello-world
Hello from custom bin!
? 0
```
