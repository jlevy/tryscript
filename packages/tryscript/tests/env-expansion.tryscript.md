---
sandbox: true
env:
  NO_COLOR: "1"
  TOOL: $TRYSCRIPT_GIT_ROOT/packages/tryscript/tests/cli-fixtures/bin/hello-world
  LITERAL: costs $$5 for $$USD
---

# Test: env values expand TRYSCRIPT_* variables

`env:` values expand the same variables as `path:` entries, so front matter can name one
exact executable instead of relying on a `PATH` lookup that could resolve elsewhere.

```console
$ "$TOOL"
Hello from custom bin!
? 0
```

`$$` escapes to a literal `$`, so a value that has to keep one is not substituted away.

```console
$ echo "$LITERAL"
costs $5 for $USD
? 0
```
