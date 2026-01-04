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
- **Code coverage** - Built-in subprocess coverage collection with `--coverage`
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

## Code Coverage

tryscript can collect code coverage from subprocess execution. This enables coverage tracking for CLI code that runs as child processes.

```bash
# Install c8 (required for coverage)
pnpm add -D c8

# Run tests with coverage
npx tryscript run --coverage tests/

# Custom output directory
npx tryscript run --coverage --coverage-dir my-coverage tests/

# Custom reporters
npx tryscript run --coverage --coverage-reporter text --coverage-reporter lcov tests/
```

Coverage is collected using [c8](https://github.com/bcoe/c8) which leverages Node.js's built-in V8 coverage. By default, coverage reports are written to `coverage-tryscript/` with `text` and `html` reporters.

You can also configure coverage in `tryscript.config.ts`:

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  coverage: {
    reportsDir: 'coverage-tryscript',
    reporters: ['text', 'html'],
    include: ['dist/**'],
    src: 'src',
  },
});
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
