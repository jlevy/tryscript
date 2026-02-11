# tryscript

[![CI](https://github.com/jlevy/tryscript/actions/workflows/ci.yml/badge.svg)](https://github.com/jlevy/tryscript/actions/runs/21926473938)
[![Coverage](https://raw.githubusercontent.com/jlevy/tryscript/main/badges/packages/tryscript/coverage-total.svg)](https://github.com/jlevy/tryscript/actions/runs/21926473938)
[![npm version](https://img.shields.io/npm/v/tryscript)](https://www.npmjs.com/package/tryscript)
[![X Follow](https://img.shields.io/twitter/follow/ojoshe)](https://x.com/ojoshe)

**Powerful, agent-friendly testing of CLI applications via golden tests**

> [!NOTE]
> 100% of the code and specs in this repository were written by Claude Code.
> The design and management and prompting was by me ([jlevy](https://github.com/jlevy)) supported by  the workflows, agent rules,
> and other research docs in [tbd](https://github.com/jlevy/tbd).
> 
> I find the code quality higher than most agent-written code I've
> seen because of the spec-driven process.
> You can review the architecture doc and all of the specs all of the specs in [docs/project](docs/project).
> The general research, guideline, and rules docs I use are in [docs/general](docs/general).

## Why?

Write CLI tests as Markdown. tryscript runs commands, captures output, and compares against expected results:

- Tests are clear and maintainable for agents and humans: tests become documentation; documentation becomes tests
- Inner state and working can be exposed for greater test coverage at no extra cost
- Things are quick to implement or test using arbitrary shell commands

This began as a TypeScript port of [trycmd](https://github.com/assert-rs/trycmd) but I (well, Claude and friends)
have since enhanced it to be more agent-friendly and self-documenting as a CLI.

For a bit more philosophy on why golden tests are so useful, you (or your friendly agent)
should read [tbd](https://github.com/jlevy/tbd)’s guidelines doc:

```bash
npx --yes get-tbd@latest guidelines golden-testing-guidelines
```

## What It Does

An example test:

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

# Test: Check output file contents

```console
$ my-cli process data.json > output.txt && grep "success" output.txt
[..]success[..]
? 0
```
````

The `[..]` matches any text on that line. The `...` matches zero or more lines. These "elision patterns" let tests handle dynamic output gracefully. Any shell command works - pipes, redirects, environment variables, etc.

## Quick Start

```bash
# Install
pnpm add -D tryscript

# For coverage support (optional)
pnpm add -D c8

# For accurate line counts when merging with vitest (optional)
pnpm add -D c8 monocart-coverage-reports

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
- **Code coverage** - Track coverage from subprocess execution with `--coverage` (experimental; use `--coverage-monocart` for best accuracy)

## CLI Reference

```bash
tryscript run [files...]          # Run golden tests
tryscript coverage <commands...>  # Run commands with merged coverage
tryscript docs                    # Show syntax quick reference
tryscript readme                  # Show this documentation
tryscript --help                  # Show all options
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
| `--coverage-monocart` | Use monocart for accurate line counts (requires monocart-coverage-reports) |
| `--coverage-exclude-node-modules` | Exclude node_modules from coverage (default: true) |
| `--coverage-exclude <pattern>` | Exclude patterns from coverage |

> **Note**: Coverage features are experimental. See the [reference documentation](packages/tryscript/docs/tryscript-reference.md#code-coverage) for details on merged coverage, monocart integration, and sourcemap requirements.

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
