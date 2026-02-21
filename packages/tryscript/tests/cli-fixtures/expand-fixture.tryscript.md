---
sandbox: true
env:
  NO_COLOR: "1"
---

# Test: Simple echo with unknown wildcard

```console
$ echo "hello world"
[??]
? 0
```

# Test: Multi-line with unknown wildcard

```console
$ echo "line1"; echo "line2"; echo "line3"
???
? 0
```
