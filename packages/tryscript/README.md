# tryscript

Golden testing for CLI applications - a TypeScript port of [trycmd](https://github.com/assert-rs/trycmd).

## Overview

tryscript enables golden testing for any CLI application. Write test cases in Markdown with console code blocks, and tryscript runs the commands, compares output, and reports differences.

````markdown
# Test: Hello World

```console
$ echo "hello world"
hello world
? 0
```
````

## Features

- **Markdown test format** - Tests are readable documentation
- **Elision patterns** - Match dynamic output with `[..]`, `...`, `[EXE]`, `[ROOT]`, `[CWD]`
- **Custom patterns** - Define regex patterns for timestamps, versions, UUIDs
- **Update mode** - Regenerate golden files with `--update`
- **Self-bootstrapping** - tryscript tests itself

## Quick Start

```bash
# Install
pnpm add tryscript

# Run tests
npx tryscript tests/

# Update golden files
npx tryscript --update
```

## Documentation

See [packages/tryscript/README.md](packages/tryscript/README.md) for full documentation.

## Project Structure

```
tryscript/
├── packages/
│   └── tryscript/     # Main package
│       ├── src/       # TypeScript source
│       └── tests/     # Self-tests
└── docs/              # Documentation
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Run self-tests
pnpm -r tryscript tests/
```

## License

MIT
