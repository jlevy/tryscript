---
bin: /bin/echo
binName: myecho
env:
  NO_COLOR: "1"
---

# Tests for bin and binName configuration

These tests verify that `bin` and `binName` work correctly.

# Test: binName resolves to bin path

```console
$ myecho "hello from binName"
hello from binName
? 0
```

# Test: binName with multiple arguments

```console
$ myecho "hello" "world"
hello world
? 0
```

# Test: Regular commands still work

```console
$ echo "regular echo works too"
regular echo works too
? 0
```
