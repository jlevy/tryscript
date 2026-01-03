---
cwd: temp
---

# Skip and Only Annotation Tests

Tests for <!-- skip --> and <!-- only --> annotations.

## This test runs normally

```console
$ echo "normal test"
normal test
```

## This test is skipped <!-- skip -->

```console
$ echo "this would fail if not skipped"
this output doesn't match but test is skipped
```

## Another normal test

```console
$ echo "another normal"
another normal
```
