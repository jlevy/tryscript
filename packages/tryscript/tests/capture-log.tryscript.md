---
sandbox: true
fixtures:
  - source: cli-fixtures/capture-log-fixture.tryscript.md
    dest: target.tryscript.md
env:
  NO_COLOR: "1"
---

# Test: Capture log is written

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs run --capture-log captures.yaml target.tryscript.md 2>&1 | grep "Capture log"
Capture log written to captures.yaml
? 0
```

# Test: Capture log has header comment

```console
$ head -1 captures.yaml
# tryscript capture log
? 0
```

# Test: Capture log generated field comes before files

```console
$ head -3 captures.yaml | tail -2
generated: [..]
files:
? 0
```

# Test: Capture log block fields in correct order

Key ordering must be: name, command, expected_exit_code, actual_exit_code,
expected_output, actual_output, captures, passed.

```console
$ grep -E "^ +(-\s*)?(name|command|expected_exit_code|actual_exit_code|expected_output|actual_output|captures|passed):" captures.yaml
      - name: Simple echo
        command: echo "hello world"
        expected_exit_code: 0
        actual_exit_code: 0
        expected_output: |
        actual_output: |
        captures:
        passed: true
? 0
```

# Test: Capture log capture fields in correct order

```console
$ grep -E "^ +(-\s*)?(category|multiline|matched):" captures.yaml
          - category: unknown
            multiline: false
            matched: hello world
? 0
```

# Test: Capture log full YAML is valid and complete

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
