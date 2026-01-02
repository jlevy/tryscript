---
env:
  NO_COLOR: "1"
---

# Meta-tests: tryscript testing itself

These tests verify that tryscript can correctly test CLI applications.

# Test: Create and run a passing test file

```console
$ node -e "require('fs').writeFileSync('pass.tryscript.md', '# Pass Test\n\n\`\`\`console\n\$ echo hello\nhello\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs pass.tryscript.md
PASS [..]pass.tryscript.md
  ✓ Pass Test

1 passed [..]
? 0
```

# Test: Create and detect a failing test file

```console
$ node -e "require('fs').writeFileSync('fail.tryscript.md', '# Fail Test\n\n\`\`\`console\n\$ echo actual\nexpected\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs fail.tryscript.md --no-diff 2>&1; echo "exit: $?"
FAIL [..]
  ✗ Fail Test
...
exit: 1
? 0
```

# Test: Elision patterns work in meta-tests

```console
$ node -e "require('fs').writeFileSync('elision.tryscript.md', '# Elision Test\n\n\`\`\`console\n\$ date +%s\n[..]\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs elision.tryscript.md
PASS [..]elision.tryscript.md
  ✓ Elision Test

1 passed [..]
? 0
```

# Test: Multiple test blocks work

```console
$ node -e "require('fs').writeFileSync('multi.tryscript.md', '# Test One\n\n\`\`\`console\n\$ echo one\none\n? 0\n\`\`\`\n\n# Test Two\n\n\`\`\`console\n\$ echo two\ntwo\n? 0\n\`\`\`\n')" && node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs multi.tryscript.md
PASS [..]multi.tryscript.md
  ✓ Test One
  ✓ Test Two

2 passed [..]
? 0
```
