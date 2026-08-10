---
sandbox: true
env:
  NO_COLOR: "1"
---

# Test: Unknown single-line wildcard [??]

The `[??]` pattern matches any characters on the same line, like `[..]`.

```console
$ node -e "console.log('Result: ' + (40 + 2))"
Result: [??]
? 0
```

# Test: Unknown multi-line wildcard ???

The `???` pattern matches zero or more complete lines, like `...`.

```console
$ node -e "console.log('line 1'); console.log('line 2'); console.log('line 3')"
line 1
???
? 0
```

# Test: [??] with prefix and suffix

```console
$ node -e "console.log('Build ID: abc-' + Date.now() + '-xyz')"
Build ID: [??]
? 0
```

# Test: ??? at beginning

```console
$ node -e "console.log('setup'); console.log('init'); console.log('done')"
???
done
? 0
```

# Test: Combined [??] and ???

```console
$ node -e "console.log('ts: ' + Date.now()); console.log('mid1'); console.log('mid2'); console.log('end: ok')"
ts: [??]
???
end: ok
? 0
```

# Test: Combined generic and unknown wildcards

```console
$ node -e "console.log('a: ' + Date.now()); console.log('b'); console.log('c: ' + Date.now()); console.log('d')"
a: [..]
???
d
? 0
```
