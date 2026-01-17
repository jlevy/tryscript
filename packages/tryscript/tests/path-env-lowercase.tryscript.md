---
sandbox: true
path:
  - $HOME/../tmp
  - ${TRYSCRIPT_PROJECT_ROOT}/packages/tryscript/dist
---

# Test: Lowercase env var expansion in path

Environment variables in `path:` support standard shell syntax including lowercase variables.

```console
$ echo $PATH | grep -q "packages/tryscript/dist" && echo "expanded"
expanded
? 0
```

# Test: Braced variable syntax

The `${VAR}` syntax is also supported for variable expansion.

```console
$ echo "testing braced syntax"
testing braced syntax
? 0
```
