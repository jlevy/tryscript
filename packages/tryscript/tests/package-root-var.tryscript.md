---
sandbox: true
env:
  NO_COLOR: "1"
---

# Test: TRYSCRIPT_PACKAGE_ROOT points to package root

The TRYSCRIPT_PACKAGE_ROOT environment variable points to the directory containing
the nearest package.json file.

```console
$ echo $TRYSCRIPT_PACKAGE_ROOT | grep -q tryscript && echo "found"
found
? 0
```

# Test: TRYSCRIPT_PACKAGE_ROOT is an absolute path

```console
$ test "$TRYSCRIPT_PACKAGE_ROOT" = "$(realpath "$TRYSCRIPT_PACKAGE_ROOT")" && echo "absolute"
absolute
? 0
```
