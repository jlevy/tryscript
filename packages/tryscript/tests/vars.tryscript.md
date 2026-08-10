---
sandbox: true
env:
  FILE: testfile.txt
  MSG: hello
---

# Environment Variable Tests

Tests for shell $VAR expansion via env config.

## Environment variable in filename

```console
$ touch $FILE && ls $FILE
testfile.txt
```

## Environment variable in echo

```console
$ echo $MSG
hello
```

## Variable in complex command

```console
$ echo "file is $FILE" | cat
file is testfile.txt
```

## Shell-defined variables work

```console
$ MY_VAR=test && echo $MY_VAR
test
```

## Variables defined in command persist

```console
$ export PERSIST=value && echo $PERSIST
value
```
