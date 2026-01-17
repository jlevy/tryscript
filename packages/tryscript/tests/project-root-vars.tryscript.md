---
sandbox: true
env:
  NO_COLOR: "1"
---

# Test: TRYSCRIPT_GIT_ROOT points to git repository root

The TRYSCRIPT_GIT_ROOT environment variable points to the directory containing
the nearest `.git` directory.

```console
$ test -d "$TRYSCRIPT_GIT_ROOT/.git" && echo "has .git"
has .git
? 0
```

# Test: TRYSCRIPT_GIT_ROOT is an absolute path

```console
$ test "$TRYSCRIPT_GIT_ROOT" = "$(realpath "$TRYSCRIPT_GIT_ROOT")" && echo "absolute"
absolute
? 0
```

# Test: TRYSCRIPT_PROJECT_ROOT is the most specific root

TRYSCRIPT_PROJECT_ROOT should be the deepest of TRYSCRIPT_PACKAGE_ROOT or
TRYSCRIPT_GIT_ROOT (i.e., the most specific project boundary).

```console
$ test -n "$TRYSCRIPT_PROJECT_ROOT" && echo "set"
set
? 0
```

# Test: TRYSCRIPT_PROJECT_ROOT is an absolute path

```console
$ test "$TRYSCRIPT_PROJECT_ROOT" = "$(realpath "$TRYSCRIPT_PROJECT_ROOT")" && echo "absolute"
absolute
? 0
```
