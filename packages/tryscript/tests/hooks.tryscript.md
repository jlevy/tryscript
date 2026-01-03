---
cwd: temp
before: touch $TEMP/before-ran.marker
---

# Hooks Tests

Tests for before: and after: hooks.

## Before hook runs before first test

```console
$ ls before-ran.marker
before-ran.marker
```

## Before hook only runs once

The marker file still exists from the before hook.

```console
$ test -f before-ran.marker && echo "exists"
exists
```
