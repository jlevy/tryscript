---
sandbox: true
after: echo "cleanup completed"
---

# After Hook Test

This file tests the `after` hook functionality.

# Test: Command runs normally

```console
$ echo "test command"
test command
? 0
```

# Test: After hook runs after all tests

The after hook defined in frontmatter will run after this test.

```console
$ echo "second test"
second test
? 0
```
