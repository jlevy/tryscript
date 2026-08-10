# Test: Echo command

```console
$ echo "hello world"
hello world
? 0
```

# Test: Exit code

```console
$ sh -c "exit 42"
? 42
```

# Test: Multi-line output

```console
$ echo "line 1" && echo "line 2"
line 1
line 2
? 0
```
