---
env:
  NO_COLOR: "1"
---

# Test: Multi-line command with continuation

The `> ` prefix continues a command on the next line.

```console
$ echo "This is a" && \
> echo "multi-line command"
This is a
multi-line command
? 0
```

# Test: Commands share temp directory

Files created in one block persist for subsequent blocks.

```console
$ echo "test content" > myfile.txt && echo "File created"
File created
? 0
```

```console
$ ls myfile.txt
myfile.txt
? 0
```

```console
$ rm myfile.txt && echo "Cleaned up"
Cleaned up
? 0
```

# Test: Unicode output

```console
$ node -e "console.log('Hello 世界 🌍')"
Hello 世界 🌍
? 0
```

# Test: Stderr is captured

```console
$ node -e "console.error('error message'); console.log('stdout message')"
error message
stdout message
? 0
```

# Test: Working directory is temp

```console
$ node -e "console.log(process.cwd().includes('tryscript-') ? 'In temp' : 'Not in temp')"
In temp
? 0
```

# Test: Empty output matches

```console
$ true
? 0
```

# Test: False command

```console
$ false
? 1
```

# Test: Complex shell pipeline

```console
$ printf "c\na\nb\n" | sort
a
b
c
? 0
```

# Test: Environment isolation

Tests should not leak environment.

```console
$ node -e "console.log('FORCE_COLOR=' + process.env.FORCE_COLOR)"
FORCE_COLOR=0
? 0
```
