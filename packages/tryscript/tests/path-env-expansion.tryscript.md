---
sandbox: true
path:
  - $TRYSCRIPT_PACKAGE_BIN
env:
  NO_COLOR: "1"
---

# Test: path expands TRYSCRIPT_PACKAGE_BIN

The `path:` setting should expand `$TRYSCRIPT_PACKAGE_BIN` to the node_modules/.bin
directory, making installed binaries available.

```console
$ echo $PATH | grep -q "node_modules/.bin" && echo "expanded"
expanded
? 0
```
