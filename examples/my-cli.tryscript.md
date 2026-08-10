---
env:
  NO_COLOR: "1"
sandbox: true
fixtures:
  - my-cli.sh
---
# Test: CLI help

```console
$ bash my-cli.sh --help
Usage: my-cli [options] <command>

Options:
  --version  Show version
  --help     Show this help
? 0
```

# Test: Version output

```console
$ bash my-cli.sh --version
my-cli v[..]
? 0
```

# Test: Error handling

```console
$ bash my-cli.sh unknown-command 2>&1
Error: unknown command 'unknown-command'
? 1
```

# Test: Check output file contents

```console
$ bash my-cli.sh process data.json > output.txt && grep "success" output.txt
[..]success[..]
? 0
```

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
