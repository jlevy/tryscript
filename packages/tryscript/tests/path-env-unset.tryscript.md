---
sandbox: true
path:
  - $TRYSCRIPT_TEST_UNSET_TOOL_DIR
  - ${TRYSCRIPT_TEST_UNSET_TOOL_DIR}
---

# Test: path drops entries that expand to empty

A `path:` entry naming an unset variable contributes nothing. Before v0.3.0 it resolved
to the test file's directory, so a command lookup could find a stray executable among the
test's own files instead of reporting that the command was not found.

```console
$ echo "$PATH" | tr ':' '\n' | grep -cx "$TRYSCRIPT_TEST_DIR"
0
? 1
```

```console
$ case ":$PATH:" in *::*) echo "empty element" ;; *) echo "no empty element" ;; esac
no empty element
? 0
```
