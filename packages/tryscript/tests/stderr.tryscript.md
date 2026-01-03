---
sandbox: true
---

# Stderr Assertion Tests

Tests for separate stderr assertions with ! prefix.

## Stderr assertion with ! prefix

```console
$ echo "error message" >&2
? 0
! error message
```

## Stderr with stdout combined

```console
$ echo "stdout" && echo "stderr" >&2
stdout
! stderr
```

## Multiple stderr lines

```console
$ echo "line1" >&2 && echo "line2" >&2
? 0
! line1
! line2
```
