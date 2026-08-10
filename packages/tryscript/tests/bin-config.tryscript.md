---
env:
  MYECHO: /bin/echo
  NO_COLOR: "1"
---

# Tests for CLI binary configuration via env

These tests verify that environment variables can be used to configure CLI binaries.

# Test: env variable for binary path

```console
$ $MYECHO "hello from env"
hello from env
? 0
```

# Test: env variable with multiple arguments

```console
$ $MYECHO "hello" "world"
hello world
? 0
```

# Test: Regular commands still work

```console
$ echo "regular echo works too"
regular echo works too
? 0
```
