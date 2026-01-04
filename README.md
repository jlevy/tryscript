# tryscript

[![CI](https://github.com/jlevy/tryscript/actions/workflows/ci.yml/badge.svg)](https://github.com/jlevy/tryscript/actions/workflows/ci.yml)
[![Coverage](https://raw.githubusercontent.com/jlevy/tryscript/main/badges/packages/tryscript/coverage-total.svg)](https://raw.githubusercontent.com/jlevy/tryscript/main/badges/packages/tryscript/coverage-total.svg)
[![npm version](https://img.shields.io/npm/v/tryscript)](https://www.npmjs.com/package/tryscript)
[![X Follow](https://img.shields.io/twitter/follow/ojoshe)](https://x.com/ojoshe)

Golden testing for CLI applications - a TypeScript port of [trycmd](https://github.com/assert-rs/trycmd).

## What It Does

Write CLI tests as Markdown. tryscript runs commands, captures output, and compares against expected results. Tests become documentation; documentation becomes tests.

````markdown
# Test: Basic echo

```console
$ echo "hello world"
hello world
? 0
```

# Test: Grep with pattern matching

```console
$ ls -la | grep ".md"
[..]README.md
...
? 0
```
````

The `[..]` matches any text on that line. The `...` matches zero or more lines. These "elision patterns" let tests handle dynamic output gracefully.

## Quick Start

```bash
# Install
pnpm add -D tryscript

# Run tests
npx tryscript run tests/

# Update expected output when behavior changes
npx tryscript run --update tests/
```

## Features

- **Markdown format** - Tests are readable documentation
- **Elision patterns** - Handle variable output: `[..]`, `...`, `[CWD]`, `[ROOT]`, `[EXE]`
- **Custom patterns** - Define regex patterns for timestamps, versions, UUIDs
- **Update mode** - Regenerate expected output with `--update`
- **Sandbox mode** - Isolate tests in temp directories
- **Code coverage** - Track coverage from subprocess execution with `--coverage`

## Example Test File

````markdown
---
env:
  NO_COLOR: "1"
sandbox: true
---

# Test: CLI help

```console
$ my-cli --help
Usage: my-cli [options] <command>

Options:
  --version  Show version
  --help     Show this help
...
? 0
```

# Test: Version output

```console
$ my-cli --version
my-cli v[..]
? 0
```

# Test: Error handling

```console
$ my-cli unknown-command 2>&1
Error: unknown command 'unknown-command'
? 1
```
````

## CLI Reference

```bash
tryscript run [files...]  # Run golden tests
tryscript docs            # Show syntax quick reference
tryscript readme          # Show this documentation
tryscript --help          # Show all options
```

For complete syntax reference, run `tryscript docs` or see the [reference documentation](https://github.com/jlevy/tryscript/blob/main/docs/tryscript-reference.md).

### Common Options

| Option | Description |
| --- | --- |
| `--update` | Update test files with actual output |
| `--fail-fast` | Stop on first failure |
| `--filter <regex>` | Filter tests by name |
| `--verbose` | Show detailed output |
| `--coverage` | Collect code coverage (requires c8) |

## Development

```bash
# Clone and install
git clone https://github.com/jlevy/tryscript.git
cd tryscript
pnpm install

# Build and test
pnpm build
pnpm test
```

## License

MIT
