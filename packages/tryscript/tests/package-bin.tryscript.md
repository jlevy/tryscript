---
cwd: cli-fixtures/pkg-with-bin
packageBin: true
env:
  NO_COLOR: "1"
---

# Test: packageBin exposes package.json bins (object form)

When `packageBin: true`, binaries defined in the nearest package.json's `bin` field
are automatically available as commands.

```console
$ test-cli
test-cli v1.0.0
? 0
```
