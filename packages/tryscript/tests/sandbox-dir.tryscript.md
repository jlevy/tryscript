---
sandbox: cli-fixtures/sandbox-src
---

# Sandbox Directory Test

This file tests copying a source directory to the sandbox.

# Test: Source directory contents are available

```console
$ cat test.txt
test content
? 0
```

# Test: Can create files in sandbox without affecting source

```console
$ echo "new file" > new.txt && cat new.txt
new file
? 0
```
