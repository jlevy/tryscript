---
sandbox: true
path:
  - $TRYSCRIPT_PROJECT_ROOT/packages/tryscript/dist
env:
  NO_COLOR: "1"
---

# Test: path expands TRYSCRIPT_PROJECT_ROOT

Environment variables like `$TRYSCRIPT_PROJECT_ROOT` can be used in path entries
to reference project directories.

```console
$ echo $PATH | grep -q "packages/tryscript/dist" && echo "expanded"
expanded
? 0
```
