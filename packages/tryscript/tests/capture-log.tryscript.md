---
sandbox: true
fixtures:
  - source: cli-fixtures/capture-log-fixture.tryscript.md
    dest: target.tryscript.md
env:
  NO_COLOR: "1"
---

# Test: Capture log is written alongside test run

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --capture-log captures.yaml target.tryscript.md 2>&1
PASS [..]target.tryscript.md
  ✓ Simple echo

Warning: 1 unknown wildcard found (??? or [??]). Run with --expand, then review the replacement before committing.
1 passed [..]
Capture log written to captures.yaml
? 0
```

# Test: Capture log YAML structure and field ordering

Verifies: header comment, generated before files, block fields in spec order
(name > command > expected_exit_code > actual_exit_code > expected_output >
actual_output > captures > passed), and capture fields in order
(category > multiline > matched).

```console
$ cat captures.yaml
# tryscript capture log
generated: [..]
files:
  - path: [..]target.tryscript.md
    blocks:
      - name: Simple echo
        command: echo "hello world"
        expected_exit_code: 0
        actual_exit_code: 0
        expected_output: |
          [??]
        actual_output: |
          hello world
        captures:
          - category: unknown
            multiline: false
            matched: hello world
        passed: true
? 0
```
