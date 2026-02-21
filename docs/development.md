# Development Guide

> This document covers essential developer workflows for this project.
> **Update this document** as new patterns and workflows are established during
> implementation.

## Prerequisites

- **Node.js 20+** — We recommend v24 (current) or v22 LTS. Minimum supported is v20.
  [nodejs.org](https://nodejs.org/)

- **pnpm 10.x** — Install via `corepack enable` or `npm install -g pnpm`

- **GitHub CLI** (for releases) — See [GitHub CLI Setup](general/agent-setup/github-cli-setup.md)

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
[Publishing](publishing.md) for the release workflow. The release process requires the
GitHub CLI (`gh`) — see [GitHub CLI Setup](general/agent-setup/github-cli-setup.md).

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
| (none) | Display help (same as --help) |
| `run [files...]` | Run golden tests |
| `readme` | Display README documentation |
| `docs` | Display concise syntax reference |

### CLI Options (for `run` command)

| Option | Description |
| --- | --- |
| `--update` | Update golden files with actual output |
| `--expand` | Expand unknown wildcards (`???`/`[??]`) with actual output |
| `--expand-generic` | Expand unknown + generic wildcards |
| `--expand-all` | Expand all wildcards (including named patterns) |
| `--capture-log <path>` | Write wildcard capture log to YAML file |
| `--diff` | Show diff on failure (default: true) |
| `--no-diff` | Hide diff on failure |
| `--fail-fast` | Stop on first failure |
| `--filter <regex>` | Filter tests by name pattern |
| `--verbose` | Show detailed output |
| `--quiet` | Suppress non-essential output |
| `--coverage` | Enable code coverage collection (requires c8) |
| `--coverage-*` | Coverage options (see [Coverage CLI Options](#coverage-cli-options)) |

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

tryscript uses **LCOV merging** to combine coverage from unit tests and golden tests:

```bash
pnpm test:coverage          # Run both and merge results
```

This runs two steps:

1. `test:coverage:vitest` - Unit tests with vitest coverage (produces `coverage/lcov.info`)
2. `test:coverage:tryscript` - Golden tests with c8/NODE_V8_COVERAGE, then merges with vitest's LCOV via built-in `--merge-lcov`

**Why LCOV merging?**

- Vitest uses `node:inspector` for coverage (captures imports)
- Tryscript uses `NODE_V8_COVERAGE` (captures subprocess spawns)
- These are different mechanisms that must be merged via LCOV files
- The built-in `--merge-lcov` flag handles this automatically

The merged coverage is written to `coverage-tryscript/lcov.info` and `coverage-tryscript/coverage-summary.json`.

#### Individual Coverage Scripts

```bash
pnpm test:coverage:vitest     # Unit tests only
pnpm test:coverage:tryscript  # Golden tests + merge with vitest coverage
```

#### For Users Testing Their Own CLIs

Use the same LCOV merging approach for any CLI project:

```json
{
  "scripts": {
    "test:coverage:vitest": "vitest run --coverage",
    "test:coverage:tryscript": "tryscript run 'tests/**/*.tryscript.md' --coverage --merge-lcov coverage/lcov.info",
    "test:coverage": "pnpm test:coverage:vitest && pnpm test:coverage:tryscript"
  }
}
```

#### Deep Dive: Coverage Architecture

For comprehensive documentation on coverage strategies, see
[Research: Code Coverage Best Practices](general/research/current/research-code-coverage-typescript.md).

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

There are three categories of wildcards (in order of preference):

**Named patterns** -- typed dynamic values:

| Pattern | Matches | Example |
| --- | --- | --- |
| `[CWD]` | Current working directory | `[CWD]/file.txt` |
| `[ROOT]` | Test root directory path | `[ROOT]/output.txt` |
| `[EXE]` | `.exe` on Windows, empty else | `my-cli[EXE]` |
| `[PATTERN]` | Custom regex from config | User-defined |

**Unknown wildcards** -- temporary placeholders (expand with `--expand`):

| Pattern | Matches | Example |
| --- | --- | --- |
| `[??]` | Any characters on line | `Result: [??]` |
| `???` | Zero or more lines | `???\nDone` |

**Generic wildcards** -- intentional omission of variable output:

| Pattern | Matches | Example |
| --- | --- | --- |
| `[..]` | Any characters on line | `Done in [..]ms` |
| `...` | Zero or more lines | `...\nDone` |

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
