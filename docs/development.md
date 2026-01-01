## Developer Workflows

### Initial Setup

Install dependencies:

```bash
# Install all dependencies (pnpm workspaces installs for both root and packages/)
pnpm install     # Installs dependencies + git hooks via prepare script
```

### Development Environment

For local development, tryscript uses pnpm workspaces with a modern TypeScript monorepo
structure.

### Building

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter tryscript build

# Watch mode for development
pnpm --filter tryscript dev
```

### Running Tests

```bash
# View all test-related scripts
pnpm run help | grep test

# Formatting and linting
pnpm format           # Format all files
pnpm lint             # Lint all files with auto-fix

# Check-only (for CI)
pnpm format:check     # Check formatting
pnpm lint:check       # Lint without auto-fix

# Common test commands
pnpm test             # Run all tests
pnpm test:golden      # Run golden tests with tryscript
pnpm test:coverage    # Run with coverage report
pnpm precommit        # Full precommit check (format, lint, typecheck, test)
```

### Running tryscript CLI

```bash
# Run during development (using tsx)
pnpm tryscript tests/basic.tryscript.md

# Run with built version
pnpm build && node packages/tryscript/dist/bin.js tests/

# Run specific test file
pnpm tryscript packages/tryscript/tests/basic.tryscript.md
```

### CLI Options

```
tryscript [options] [files...]

Options:
  --version          Show version number
  --update           Update golden files with actual output
  --diff             Show diff on failure (default: true)
  --no-diff          Hide diff on failure
  --fail-fast        Stop on first failure
  --filter <pattern> Filter tests by name pattern
  --verbose          Show detailed output
  --quiet            Suppress non-essential output (only show failures)
  --help             Display help
```

### Writing Test Files

Test files use the `.tryscript.md` extension and contain markdown with console code blocks:

````markdown
---
bin: ./my-cli
env:
  NO_COLOR: "1"
---

# Test: Help command

```console
$ my-cli --help
Usage: my-cli [options]
...
? 0
```
````

### Elision Patterns

| Pattern | Matches                       | Example              |
| ------- | ----------------------------- | -------------------- |
| `[..]`  | Any characters on line        | `Done in [..]ms`     |
| `...`   | Zero or more lines            | See output below ... |
| `[EXE]` | `.exe` on Windows, empty else | `my-cli[EXE]`        |
| `[ROOT]`| Test root directory path      | `[ROOT]/output.txt`  |
| `[CWD]` | Current working directory     | `[CWD]/file.txt`     |

### Creating a Release

This project uses Changesets for version management:

```bash
# Add a changeset for your changes
pnpm changeset

# Version packages (updates package.json and changelog)
pnpm version-packages

# Publish to npm
pnpm release
```

### Git Hooks

Pre-commit and pre-push hooks are managed by Lefthook:

- **Pre-commit**: Format, lint, and typecheck
- **Pre-push**: Run tests

To skip hooks temporarily:

```bash
git commit --no-verify
git push --no-verify
```

### Issue Tracking

This project uses **bd (beads)** for issue tracking. See
`docs/general/agent-setup/beads-setup.md` for setup instructions.

```bash
# Check what's ready to work on
bd ready

# Create a new issue
bd create "Description" -p 2 -t feature

# Update issue status
bd update <id> --status in_progress

# Close an issue
bd close <id>
```
