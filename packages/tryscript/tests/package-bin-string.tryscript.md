---
cwd: cli-fixtures/pkg-string-bin
packageBin: true
env:
  NO_COLOR: "1"
---

# Test: packageBin with string form bin

When the `bin` field is a string, the command name is derived from the package name.

```console
$ simple-cli
simple-cli v2.0.0
? 0
```
