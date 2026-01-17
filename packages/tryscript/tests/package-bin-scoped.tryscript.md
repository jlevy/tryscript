---
cwd: cli-fixtures/pkg-scoped
packageBin: true
env:
  NO_COLOR: "1"
---

# Test: packageBin with scoped package

For scoped packages (`@scope/name`), the scope is stripped to get the command name.

```console
$ scoped-cli
scoped-cli from @scope
? 0
```
