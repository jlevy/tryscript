# Development Guide

> This document covers essential developer workflows for this project.
> **Update this document** as new patterns and workflows are established during
> implementation.

## Prerequisites

- **Node.js 20+** — We recommend v24 (current) or v22 LTS. Minimum supported is v20.
  [nodejs.org](https://nodejs.org/)

- **pnpm 10.x** — Install via `corepack enable` or `npm install -g pnpm`

### Node.js Setup

This project requires Node.js 20 or higher.
We recommend Node 24 (current) for best performance.

**Option 1: Direct installation**

Download from [nodejs.org](https://nodejs.org/) and install Node.js 24 (current) or
Node.js 22 LTS.

**Option 2: Using a version manager**

```bash
# Using nvm (recommended: install latest)
nvm install 24
nvm use 24

# Using fnm
fnm install 24
fnm use 24

# Using mise
mise use node@24
```

**Verify Installation**

```bash
node --version   # Should show v20.x.x or higher (v24 recommended)
pnpm --version   # Should show 10.x.x
```

## Project Structure

This is a pnpm monorepo with packages in `packages/`:

```
tryscript/
  packages/
    tryscript/           # Main package (CLI, parser, runner)
      src/
        cli/             # CLI commands
        lib/             # Core: parsing, matching, running
      tests/             # Self-tests (.tryscript.md) and unit tests
      docs/              # Package documentation
  docs/                  # Project documentation
  .changeset/            # Version management
  .github/workflows/     # CI/CD
```

## Common Commands

Run from repository root:

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type checking (no emit)
pnpm typecheck

# Run tests
pnpm test

# Lint
pnpm lint

# Validate package exports
pnpm publint
```

Run commands for a specific package:

```bash
# Build only tryscript package
pnpm --filter tryscript build

# Watch mode during development
pnpm --filter tryscript dev

# Run tests for tryscript
pnpm --filter tryscript test
```

## Development Workflow

### Making Changes

1. Create a feature branch from `main`

2. Make changes and ensure tests pass

3. Run full validation: `pnpm lint && pnpm typecheck && pnpm build && pnpm test`

4. Commit and push

### Pre-commit Checklist

Before committing, ensure:

```bash
pnpm format:check  # Formatting correct
pnpm lint          # No lint errors
pnpm typecheck     # No type errors
pnpm build         # Build succeeds
pnpm publint       # Package exports valid
pnpm test          # Tests pass
```

Or run the full check:

```bash
pnpm precommit     # Runs format, lint, typecheck, test
```

### Releases

Changesets are created at release time, not per-PR. Just merge your work to `main`. See
[Publishing](publishing.md) for the release workflow.

## CLI Usage

Run the CLI from the repository root:

```bash
# Development: runs TypeScript source directly via tsx (always current, no build needed)
pnpm tryscript --help
pnpm tryscript run tests/basic.tryscript.md
pnpm tryscript run tests/ --verbose

# Testing built output (requires pnpm build first)
node packages/tryscript/dist/bin.mjs --help
```

**Why two approaches?**

- `pnpm tryscript` — Runs source via `tsx`. Use this during development—always current,
  no build step needed.

- `node dist/bin.mjs` — Runs the built binary from `dist/`. Use this to verify the
  published output works correctly before release.

### CLI Commands

| Command | Description |
| --- | --- |
| (none) | Display README documentation |
| `run [files...]` | Run golden tests |
| `readme` | Display README documentation |
| `docs` | Display concise syntax reference |

### CLI Options (for `run` command)

| Option | Description |
| --- | --- |
| `--update` | Update golden files with actual output |
| `--diff` | Show diff on failure (default: true) |
| `--no-diff` | Hide diff on failure |
| `--fail-fast` | Stop on first failure |
| `--filter <regex>` | Filter tests by name pattern |
| `--verbose` | Show detailed output |
| `--quiet` | Suppress non-essential output |

## Testing

### Quick Reference

```bash
# Full precommit check (format, lint, typecheck, test)
pnpm precommit

# Individual commands
pnpm build           # Build all packages
pnpm lint            # ESLint
pnpm typecheck       # TypeScript type checking
pnpm test            # All tests
pnpm test:golden     # Golden self-tests only
pnpm publint         # Validate package exports
```

### Test Categories

**Unit Tests** (`tests/*.test.ts`): Test individual modules

```bash
pnpm test
```

**Golden Tests** (`tests/*.tryscript.md`): Self-tests using tryscript on itself

```bash
pnpm test:golden
```

Golden tests run tryscript against .tryscript.md files to validate the golden testing
works correctly.

### Coverage

tryscript supports two types of coverage measurement:

**Unit Test Coverage** (vitest):

```bash
pnpm test:coverage          # Unit tests with coverage
```

**Golden Test Coverage** (c8):

```bash
pnpm test:golden:coverage   # Golden tests with subprocess coverage
```

**Combined Coverage**:

```bash
pnpm test:all:coverage      # Both coverage types
```

#### Why c8 for Golden Tests?

Standard coverage tools like `vitest --coverage` only track code executed in the main
process. When tryscript runs CLI commands as subprocesses, that execution isn’t tracked.

[c8](https://github.com/bcoe/c8) solves this by leveraging Node’s built-in V8 coverage
collection via the `NODE_V8_COVERAGE` environment variable.
When c8 wraps a command:

1. c8 sets `NODE_V8_COVERAGE` to a temp directory

2. Node.js writes coverage data when each process exits

3. c8 collects coverage from all subprocesses

4. Coverage is mapped back to source files via sourcemaps

#### c8 Configuration

The golden test coverage script uses these flags:

```bash
c8 --src src --all --include 'dist/**' --reporter text --reporter html \
   --reports-dir coverage-golden node dist/bin.mjs 'tests/**/*.tryscript.md'
```

| Flag | Purpose |
| --- | --- |
| `--src src` | Map coverage back to source directory |
| `--all` | Include files with 0% coverage in report |
| `--include 'dist/**'` | Only track your built CLI (not node_modules) |
| `--reporter text` | Terminal output |
| `--reporter html` | HTML report for detailed analysis |
| `--reports-dir coverage-golden` | Separate from vitest coverage |

#### For Users Testing Their Own CLIs

The same technique works for any CLI tested with tryscript.
Add to your `package.json`:

```json
{
  "scripts": {
    "test:golden": "tryscript 'tests/**/*.tryscript.md'",
    "test:golden:coverage": "c8 --src src --all --include 'dist/**' tryscript 'tests/**/*.tryscript.md'"
  }
}
```

This provides realistic coverage metrics from actual CLI usage rather than just unit
tests.

### Watch Mode

```bash
# Run tests in watch mode during development
pnpm --filter tryscript test:watch
```

### CI Consistency

The CI workflow (`.github/workflows/ci.yml`) runs these commands in order:

1. `pnpm install`

2. `pnpm format:check`

3. `pnpm lint:check`

4. `pnpm build`

5. `pnpm publint`

6. `pnpm test:coverage`

To match CI behavior locally, run `pnpm precommit` which executes the same checks.

## Writing Test Files

Test files use the `.tryscript.md` extension and contain markdown with console code
blocks:

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

| Pattern | Matches | Example |
| --- | --- | --- |
| `[..]` | Any characters on line | `Done in [..]ms` |
| `...` | Zero or more lines | `...\nDone` |
| `[EXE]` | `.exe` on Windows, empty else | `my-cli[EXE]` |
| `[ROOT]` | Test root directory path | `[ROOT]/output.txt` |
| `[CWD]` | Current working directory | `[CWD]/file.txt` |

## Git Hooks

Pre-commit and pre-push hooks are managed by Lefthook:

- **Pre-commit**: Format, lint, and typecheck

- **Pre-push**: Run tests

To skip hooks temporarily:

```bash
git commit --no-verify
git push --no-verify
```

## Issue Tracking

This project uses **bd (beads)** for issue tracking.
See `docs/general/agent-setup/beads-setup.md` for setup instructions.

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

* * *

> **Note:** This is an initial version created during Phase 0 scaffolding.
> Update as implementation progresses and new patterns emerge.
