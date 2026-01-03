---
sandbox: true
env:
  NO_COLOR: "1"
---

# Tests for sandbox: true option

These tests run in an isolated temp directory (sandbox mode).

# Test: Working directory is sandbox

```console
$ node -e "console.log(process.cwd().includes('tryscript-') ? 'In sandbox' : 'Not in sandbox')"
In sandbox
? 0
```

# Test: Files persist across blocks in sandbox

```console
$ echo "test content" > myfile.txt && echo "File created"
File created
? 0
```

```console
$ cat myfile.txt
test content
? 0
```

```console
$ rm myfile.txt && echo "Cleaned up"
Cleaned up
? 0
```
