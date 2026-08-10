# Development Guide

Use these workflows to build, test, and release tryscript from a clean checkout.
The [documentation map](docs-overview.md) links the product reference, architecture, and
historical records.

## Prerequisites

- **Node.js 20.19 or newer:** Node.js 24 is the recommended development runtime.
  The published CLI retains its Node.js 20 contract, and package smoke tests run on
  20.0.0. See the [Node.js releases](https://nodejs.org/en/about/previous-releases) page
  for the support schedule.

- **pnpm 10.34.5:** The root `packageManager` field pins the repository version.
  Enable Corepack before installing dependencies.

- **uv 0.11.28 or newer:** Repository scripts use `uvx` to run the exact reviewed
  `flowmark-rs==0.3.2` Markdown formatter.
  CI pins uv 0.11.28. See the
  [uv installation guide](https://docs.astral.sh/uv/getting-started/installation/).

- **GitHub CLI:** Required for pull-request and release operations.
  See [GitHub CLI setup](general/agent-setup/github-cli-setup.md).

### Node.js Setup

This project requires Node.js 20.19 or newer for development.
Node.js 24 matches the release workflow.

**Option 1: Direct installation**

Download Node.js 24 from [nodejs.org](https://nodejs.org/).

**Option 2: Using a version manager**

```bash
# Using nvm
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
node --version   # Should show v20.19.x or higher (v24 recommended)
pnpm --version   # Should show 10.x.x
uv --version     # Should show 0.11.28 or higher
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
      docs/              # Generated package documentation (ignored)
  docs/                  # Project documentation
  .changeset/            # Version management
  .github/workflows/     # CI/CD
```

## Common Commands

Run from repository root:

```bash
# Install dependencies
pnpm install

# Install the repository's pinned Git hooks (install scripts are disabled)
pnpm exec lefthook install

# Build all packages
pnpm build

# Type checking (no emit)
pnpm typecheck

# Run tests
pnpm test

# Lint
pnpm lint

# Format code, data files, and maintained Markdown
pnpm format

# Verify Flowmark formatting without changing Markdown
pnpm format:docs:check

# Validate package exports
pnpm publint

# Check maintained Markdown structure and local links
pnpm docs:check
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

1. Create a feature branch from `main`.

2. Make the change and add focused regression coverage.

3. Run the full validation gate with `pnpm verify`.

4. Review the diff, commit, and push.

### Pre-commit Checklist

Before committing, ensure:

```bash
pnpm format:check  # Prettier and Flowmark formatting correct
pnpm lint:check    # No lint errors or source changes
pnpm typecheck     # No type errors
pnpm build         # Build succeeds
pnpm publint       # Package exports valid
pnpm test          # Tests pass
pnpm docs:check    # Maintained docs and local links are valid
```

Or run the full verification gate:

```bash
pnpm verify        # Format check, lint, types, build, package smoke, tests, audit
```

### Releases

User-visible changes need a Changeset, either in their pull request or during release
preparation.
See the [publishing runbook](publishing.md) for versioning, tagging, trusted
publishing, and release verification.

## CLI Usage

Run the CLI from the repository root:

```bash
# Run TypeScript source directly through tsx; no build is required.
pnpm tryscript --help
pnpm tryscript run tests/basic.tryscript.md
pnpm tryscript run 'tests/**/*.tryscript.md' --verbose

# Exercise built output after pnpm build.
node packages/tryscript/dist/bin.mjs --help
```

**Why two approaches?**

- `pnpm tryscript`: Runs source through `tsx`. Use it while changing the CLI. Its
  `readme` and `docs` commands read the tracked workspace documents, so they work before
  the first build.

- `node packages/tryscript/dist/bin.mjs`: Runs the built ESM executable.
  The package smoke test separately verifies the packed ESM, CommonJS, and CLI entry
  points.

### CLI Commands

| Command | Description |
| --- | --- |
| (none) | Print help |
| `run [files...]` | Run Markdown golden tests |
| `coverage <commands...>` | Collect merged V8 coverage from one or more commands |
| `readme` | Print the README |
| `docs` | Print the syntax reference |

### CLI Options (for `run` command)

| Option | Description |
| --- | --- |
| `--update` | Replace expected output with actual output |
| `--expand` | Replace unknown wildcards (`???` and `[??]`) with actual output |
| `--expand-generic` | Replace unknown and generic wildcards |
| `--expand-all` | Replace all wildcards, including named patterns |
| `--capture-log <path>` | Write wildcard captures to a YAML file |
| `--diff` | Show diff on failure (default: true) |
| `--no-diff` | Hide diff on failure |
| `--fail-fast` | Stop on first failure |
| `--filter <pattern>` | Run named tests matching a regular expression |
| `--verbose` | Include captured output for passing tests |
| `--quiet` | Show only failures and the final summary |
| `--coverage` | Collect V8 coverage with an installed `c8` package |
| `--coverage-*` | Coverage options (see [Coverage CLI Options](#coverage-cli-options)) |

## Testing

### Quick Reference

```bash
# Fast local gate; formatting may update files.
pnpm precommit

# Full release-quality gate
pnpm verify

# Individual checks
pnpm build           # Build all packages
pnpm lint:check       # ESLint and TypeScript, without source changes
pnpm typecheck       # TypeScript type checking
pnpm test            # All tests
pnpm test:golden     # Golden self-tests only
pnpm publint         # Validate exports, the npm artifact, and v0.1.7 compatibility
```

### Test Categories

**Unit and integration tests:** `packages/tryscript/tests/*.test.ts`

```bash
pnpm test
```

**Golden tests:** `packages/tryscript/tests/*.tryscript.md`

```bash
pnpm test:golden
```

The golden suite runs the built tryscript CLI against its own `.tryscript.md` files.

**Published-package and compatibility tests:**

```bash
pnpm --filter tryscript test:package
pnpm --filter tryscript test:compat
```

The package test uses `npm pack`, verifies the MIT license, compiles representative
v0.1.7 consumers against both declaration formats, and exercises every JavaScript and
CLI entry point. The compatibility test replays the pinned v0.1.7 golden corpus and
rejects differences outside the reviewed tryscript CLI-text allowlist.
Both require a built package; the replay also requires full Git history containing its
pinned baseline commit.

### Coverage

Tryscript merges LCOV data from unit tests and golden tests:

```bash
pnpm test:coverage          # Run both and merge results
```

This runs two steps:

1. `test:coverage:vitest` runs Vitest coverage and writes `coverage/lcov.info`.
2. `test:coverage:tryscript` runs golden tests with `c8` and `NODE_V8_COVERAGE`, then
   merges Vitest’s LCOV file through `--merge-lcov`.

**Why LCOV merging?**

- Vitest controls the V8 profiler through `node:inspector`.
- Tryscript sets `NODE_V8_COVERAGE` for spawned processes.
- `--merge-lcov` combines the two result sets without assuming they share a collector.

The merged coverage is written to `coverage-tryscript/lcov.info` and
`coverage-tryscript/coverage-summary.json`.

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

For the investigation behind this design, see
[TypeScript coverage research](general/research/current/research-code-coverage-typescript.md).

### Watch Mode

```bash
# Run tests in watch mode during development
pnpm --filter tryscript test:watch
```

### CI Consistency

The CI workflow (`.github/workflows/ci.yml`) pins uv and Flowmark, then runs these gates
in order:

1. `pnpm install --frozen-lockfile`

2. `pnpm audit --audit-level=moderate`

3. `pnpm ci:quality` (Prettier, Flowmark, maintained docs, types, and lint)

4. `pnpm build` and `pnpm publint`

5. `pnpm --filter tryscript test:coverage`

6. The npm-compatible package and pinned v0.1.7 replay tests under the declared minimum
   Node.js 20.0.0 runtime.

Run `pnpm verify` for the local release-quality gate.
Coverage and the explicit Node.js 20.0.0 compatibility run remain CI checks.
Pull-request test execution has read-only repository access.
After a successful test job, coverage data moves through an artifact to a comment-only
job with pull-request write access.
A separate main-only job receives repository write access to refresh coverage badges.

## Writing Test Files

Test files use the `.tryscript.md` extension and contain Markdown with console code
blocks:

````markdown
---
path:
  - .
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

**Named patterns:** Typed dynamic values.

| Pattern | Matches | Example |
| --- | --- | --- |
| `[CWD]` | Current working directory | `[CWD]/file.txt` |
| `[ROOT]` | Test root directory path | `[ROOT]/output.txt` |
| `[EXE]` | `.exe` on Windows, empty else | `my-cli[EXE]` |
| `[PATTERN]` | Custom regex from config | User-defined |

**Unknown wildcards:** Temporary placeholders to replace with `--expand`.

| Pattern | Matches | Example |
| --- | --- | --- |
| `[??]` | Any characters on line | `Result: [??]` |
| `???` | Zero or more lines | `???\nDone` |

**Generic wildcards:** Intentional omissions of variable output.

| Pattern | Matches | Example |
| --- | --- | --- |
| `[..]` | Any characters on line | `Done in [..]ms` |
| `...` | Zero or more lines | `...\nDone` |

## Git Hooks

Lefthook manages the repository’s local checks:

- **Pre-commit:** Format staged files, lint them, and type-check the workspace.

- **Pre-push:** Run formatting and lint checks, build and validate the package, run the
  tests, and audit dependencies.

Install the pinned hook configuration after each fresh clone:

```bash
pnpm exec lefthook install
```

## Issue Tracking

This project uses **tbd beads** for issue tracking.
Agents operate tbd on the user’s behalf; beads preserve findings, dependencies, and
session state in Git.

```bash
# Inspect ready work.
tbd ready

# Create and claim work.
tbd create "Description" --type task --priority 2
tbd update <id> --status in_progress

# Complete and synchronize tracked work.
tbd close <id> --reason "Implemented and verified"
tbd sync
```

<!-- This document follows common-doc-guidelines.md.
See github.com/jlevy/practical-prose and review guidelines before editing.
-->
