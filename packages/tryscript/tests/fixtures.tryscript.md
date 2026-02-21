---
sandbox: true
fixtures:
  - basic.tryscript.md
  - source: config.tryscript.md
    dest: renamed.md
---

# Fixtures Tests

Tests for fixtures: copying files to sandbox directory before tests.

## Simple fixture copied to sandbox

```console
$ head -1 basic.tryscript.md
# Test: Echo command
```

## Fixture with renamed destination

```console
$ head -1 renamed.md
---
```

## Multiple fixtures available

```console
$ ls *.md
basic.tryscript.md
renamed.md
```
