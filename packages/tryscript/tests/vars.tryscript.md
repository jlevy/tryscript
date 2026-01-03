---
cwd: temp
vars:
  FILE: testfile.txt
  MSG: hello
---

# Variable Expansion Tests

Tests for $VAR expansion in commands.

## Built-in $TEMP variable creates file in temp dir

```console
$ touch $TEMP/marker && ls $TEMP/marker
[CWD]/marker
```

## Built-in $ROOT variable shows test dir

```console
$ basename $ROOT
tests
```

## Built-in $CWD variable matches temp dir

The CWD should equal TEMP when cwd: temp is set.

```console
$ test "$CWD" = "$TEMP" && echo "match"
match
```

## User-defined variable in filename

```console
$ touch $FILE && ls $FILE
testfile.txt
```

## User-defined variable in echo

```console
$ echo $MSG
hello
```

## Variable in complex command

```console
$ echo "file is $FILE" | cat
file is testfile.txt
```

## Unknown variables pass through to shell

```console
$ UNKNOWN_VAR=test && echo $UNKNOWN_VAR
test
```
