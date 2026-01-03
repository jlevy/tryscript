---
cwd: temp
env:
  NO_COLOR: "1"
---

# Tests for cwd: temp option

These tests run in the temp directory (opt-in isolation).

# Test: Working directory is temp

```console
$ node -e "console.log(process.cwd().includes('tryscript-') ? 'In temp' : 'Not in temp')"
In temp
? 0
```

# Test: Files persist across blocks in temp

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
