# tryscript

[![Follow @ojoshe on X](https://img.shields.io/badge/follow_%40ojoshe-black?logo=x&logoColor=white)](https://x.com/ojoshe)
[![CI](https://github.com/jlevy/tryscript/actions/workflows/ci.yml/badge.svg)](https://github.com/jlevy/tryscript/actions/runs/31350507302)
[![Coverage](https://raw.githubusercontent.com/jlevy/tryscript/main/badges/packages/tryscript/coverage-total.svg)](https://github.com/jlevy/tryscript/actions/runs/31350507302)
[![npm version](https://img.shields.io/npm/v/tryscript)](https://www.npmjs.com/package/tryscript)

**Golden tests for CLI applications, written in Markdown.**

Tryscript runs shell commands embedded in Markdown, captures their output, and compares
it with readable expected results.
The test files double as executable documentation for humans and coding agents.

## Quick Start

```bash
pnpm add -D tryscript
pnpm exec tryscript run 'tests/**/*.tryscript.md'
```

When an intentional behavior change makes a golden result stale, review the new behavior
and update the file:

```bash
pnpm exec tryscript run --update 'tests/**/*.tryscript.md'
```

## Test File Example

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

The `[..]` pattern matches any text on one line.
The `...` pattern matches zero or more lines.
Commands run in a real shell, so pipes, redirects, environment variables, and other
shell features work directly.

## Why tryscript

- **Readable tests:** Commands and expected results stay together in valid Markdown.
- **Process-level coverage:** Tests exercise the installed CLI and its shell behavior,
  not only internal functions.
- **Controlled variation:** Named and generic patterns keep dynamic output readable
  without discarding the stable parts of a result.
- **Reviewable updates:** `--update` and `--expand` rewrite only the relevant expected
  output after the author reviews the executed command.

Tryscript began as a TypeScript port of [trycmd](https://github.com/assert-rs/trycmd),
with additional workflows for agent-authored tests and executable documentation.
For more background on golden tests, see tbd’s pinned guidance:

```bash
npx --yes get-tbd@0.4.1 guidelines golden-testing-guidelines
```

## Wildcard Categories

Use the most specific pattern that fits the output:

1. **Named patterns** (`[HASH]`, `[VERSION]`, `[CWD]`): typed dynamic values with a
   specific meaning.
2. **Unknown wildcards** (`[??]`, `???`): temporary placeholders to replace with
   `--expand` before finalizing a test.
3. **Generic wildcards** (`[..]`, `...`): intentional omissions for output whose exact
   value is irrelevant or unpredictable.

## CLI Reference

| Command | Purpose |
| --- | --- |
| `tryscript run [files...]` | Run Markdown golden tests |
| `tryscript coverage <commands...>` | Run commands with merged V8 coverage |
| `tryscript docs` | Print the syntax reference |
| `tryscript readme` | Print this README |
| `tryscript --help` | Print all commands and global options |

Common `run` options:

| Option | Purpose |
| --- | --- |
| `--update` | Replace expected output with actual output |
| `--expand` | Replace unknown wildcards (`???` and `[??]`) with actual output |
| `--expand-generic` | Replace unknown and generic wildcards |
| `--expand-all` | Replace all wildcards, including named patterns |
| `--capture-log <path>` | Write wildcard captures to a YAML file |
| `--fail-fast` | Stop after the first failure |
| `--filter <pattern>` | Run named tests matching a regular expression |
| `--verbose` | Include captured output for passing tests |
| `--coverage` | Collect V8 coverage with an installed `c8` package |

Coverage support is experimental.
Install its optional dependencies before using it:

```bash
pnpm add -D c8

# Add monocart when merging tryscript and Vitest coverage.
pnpm add -D monocart-coverage-reports
```

## Documentation

- [Syntax and configuration reference](https://github.com/jlevy/tryscript/blob/main/docs/tryscript-reference.md)
- [Language architecture](https://github.com/jlevy/tryscript/blob/main/docs/project/architecture/current/arch-tryscript-language.md)
- [Development guide](https://github.com/jlevy/tryscript/blob/main/docs/development.md)
- [Documentation map](https://github.com/jlevy/tryscript/blob/main/docs/docs-overview.md)

## Project Notes

Claude Code produced the implementation and specifications under Joshua Levy’s design,
prompting, and review, using [tbd](https://github.com/jlevy/tbd) workflows.
The [project documentation](https://github.com/jlevy/tryscript/tree/main/docs/project)
records the architecture and implementation decisions; the
[general documentation](https://github.com/jlevy/tryscript/tree/main/docs/general)
contains the shared Speculate-era research and guidance used during development.

## Development

```bash
git clone https://github.com/jlevy/tryscript.git
cd tryscript
pnpm install
pnpm exec lefthook install
pnpm verify
```

See the
[development guide](https://github.com/jlevy/tryscript/blob/main/docs/development.md)
for toolchain requirements, individual checks, and release links.

## License

MIT

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
