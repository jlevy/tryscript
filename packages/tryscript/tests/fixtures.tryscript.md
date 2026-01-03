---
cwd: temp
fixtures:
  - basic.tryscript.md
  - source: config.tryscript.md
    dest: renamed.md
---

# Fixtures Tests

Tests for fixtures: copying files to temp directory before tests.

## Simple fixture copied to temp

```console
$ head -1 basic.tryscript.md
# Test: Echo command
```

## Fixture with renamed destination

```console
$ grep "^#" renamed.md | head -1
# Test: Custom TIMESTAMP pattern
```

## Multiple fixtures available

```console
$ ls *.md | wc -l | tr -d ' '
2
```
