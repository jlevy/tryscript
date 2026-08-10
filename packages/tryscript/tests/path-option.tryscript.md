---
sandbox: true
path:
  - cli-fixtures/bin
env:
  NO_COLOR: "1"
---

# Test: Binary from custom path

Binaries in path directories are available by name when the `path` option is set.

```console
$ hello-world
Hello from custom bin!
? 0
```

# Test: Multiple binaries from path

```console
$ version-check
test-cli v1.0.0
? 0
```

# Test: Path works with other commands

Commands not in the custom path still work (from system PATH).

```console
$ echo "system command works"
system command works
? 0
```
