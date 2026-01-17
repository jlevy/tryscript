---
sandbox: true
env:
  NO_COLOR: "1"
---

# Test: TRYSCRIPT_PACKAGE_BIN points to node_modules/.bin

The TRYSCRIPT_PACKAGE_BIN environment variable points to the node_modules/.bin
directory relative to the nearest package.json.

```console
$ echo $TRYSCRIPT_PACKAGE_BIN | grep -q "node_modules/.bin" && echo "found"
found
? 0
```

# Test: TRYSCRIPT_PACKAGE_BIN is an absolute path

```console
$ test "$TRYSCRIPT_PACKAGE_BIN" = "$(realpath "$TRYSCRIPT_PACKAGE_BIN")" && echo "absolute"
absolute
? 0
```
