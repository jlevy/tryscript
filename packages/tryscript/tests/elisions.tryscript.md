---
bin: ../dist/bin.js
env:
  NO_COLOR: "1"
---

# Test: Wildcard on line [..]

The `[..]` pattern matches any characters on the same line.

```console
$ node -e "console.log('Current time: ' + Date.now())"
Current time: [..]
? 0
```

# Test: Multi-line wildcard ...

The `...` pattern matches zero or more complete lines.

```console
$ node -e "console.log('line 1'); console.log('line 2'); console.log('line 3')"
line 1
...
? 0
```

# Test: [..] with prefix and suffix

```console
$ node -e "console.log('Version: 1.2.3-dev.5.abc123')"
Version: [..]
? 0
```

# Test: ... at beginning

```console
$ node -e "console.log('header'); console.log('content'); console.log('footer')"
...
footer
? 0
```

# Test: Combined [..] and ...

```console
$ node -e "console.log('Started at: ' + new Date().toISOString()); console.log('Processing...'); console.log('Done in 123ms')"
Started at: [..]
...
Done in [..]
? 0
```

# Test: Empty output with exit code

```console
$ node -e "process.exit(0)"
? 0
```

# Test: Non-zero exit code

```console
$ node -e "process.exit(42)"
? 42
```
