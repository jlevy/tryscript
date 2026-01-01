# Plan Spec: tryscript — CLI Golden Testing Tool

## Purpose

Design and implementation plan for `tryscript`, a TypeScript port of Rust’s `trycmd` for
golden testing CLI applications.

This is a combined plan and implementation spec, covering Stages 1-4:

- **Stage 1: Planning** — Goals, scope, test format specification

- **Stage 2: Architecture** — Package structure, dependencies, design decisions

- **Stage 3: Implementation** — Phased TDD development from repo setup through polish

- **Stage 4: Validation** — Acceptance criteria and dogfooding

## Background

Golden testing captures CLI output and compares it against known-good “golden” files.
This approach is powerful for CLI tools but lacks good cross-platform, language-agnostic
tooling outside the Rust ecosystem.

**Why tryscript?** The Rust ecosystem has excellent golden testing via
[trycmd](https://docs.rs/trycmd/latest/trycmd/) (part of the
[assert-rs/snapbox](https://github.com/assert-rs/snapbox) project).
However, trycmd is tightly coupled to Cargo and Rust binaries.
tryscript brings the same format and patterns to the TypeScript/Node.js ecosystem,
enabling golden testing for any CLI regardless of implementation language.

**Related Documentation**:

- [CLI Golden Testing
  Research](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-cli-golden-testing.md)
  — Full research on approaches, existing tools, and detailed design sketches

- [Golden Testing Guidelines](https://github.com/jlevy/speculate/blob/main/docs/general/agent-guidelines/golden-testing-guidelines.md)
  — General golden/session testing principles

- [Modern TypeScript CLI
  Patterns](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-modern-typescript-cli-patterns.md)
  — CLI architecture patterns for the implementation

- [Modern TypeScript Monorepo
  Patterns](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-modern-typescript-monorepo-patterns.md)
  — pnpm workspace setup, tsdown build, Changesets, CI/CD

**Reference Implementations**:

- [trycmd](https://github.com/assert-rs/snapbox/tree/main/crates/trycmd) — The Rust
  reference implementation.
  tryscript aims for format compatibility with trycmd’s `.trycmd`/`.md` format.

- [markform](https://github.com/jlevy/markform) — Modern TypeScript CLI following all
  patterns above. Use as a reference for project structure, build configuration, CI/CD
  setup, and CLI organization.

## Summary of Task

Build a minimal, self-contained CLI tool that:

1. Parses markdown test files (`.tryscript.md`) with console blocks

2. Executes commands and captures stdout/stderr

3. Compares output against expected patterns with elision support

4. Provides `--update` mode to regenerate golden files

5. Bootstraps itself (tryscript tests tryscript)

## Backward Compatibility

Not applicable — new standalone tool.

* * *

## Stage 1: Planning

### Goals

1. **Language-agnostic**: Test any CLI binary, not just Node/TypeScript (Unlike trycmd
   which is tightly integrated with Cargo)

2. **trycmd-compatible format**: Same markdown syntax and elision patterns.
   See [trycmd docs](https://docs.rs/trycmd/latest/trycmd/#trycmd) for the reference
   format.

3. **Minimal dependencies**: Node.js only, no Docker

4. **Self-bootstrapping**: Use tryscript to test tryscript from Phase 2 onward

5. **Modern TypeScript practices**: Follow monorepo patterns for build, lint, CI/CD

### Scope

**In scope**:

- Markdown test file format with console blocks

- Command execution with stdout/stderr capture

- Elision patterns: `[..]`, `...`, `[EXE]`, `[ROOT]`, `[CWD]`, custom `[NAME]`

- Exit code verification (`? 0`, `? 1`, etc.)

- `--update` mode for golden file regeneration

- YAML frontmatter for per-test config

- Basic CLI with colored output and diff display

- pnpm monorepo structure (single package initially)

- CI/CD with GitHub Actions

**Out of scope for v1** (trycmd features deferred):

- `.in/` and `.out/` directory verification — trycmd’s
  [file system assertions](https://docs.rs/trycmd/latest/trycmd/#in)

- Parallel test execution — trycmd uses rayon for concurrent test runs

- Watch mode

- TOML format — trycmd’s
  [alternative structured format](https://docs.rs/trycmd/latest/trycmd/#toml) with
  separate `.stdout`/`.stderr` files

- Named exit codes — trycmd supports `? success`, `? failed`, `? interrupted`, `?
  skipped`

- Interactive command testing (spawn with waitForText)

- Binary file comparison — trycmd’s `binary = true` mode

- npm publishing (stretch goal)

### Test Format Specification

> **trycmd compatibility**: The test format mirrors
> [trycmd’s `.trycmd`/`.md` format](https://docs.rs/trycmd/latest/trycmd/#trycmd).
> Key syntax elements (`$ `, `> `, `? <code>`) are identical.
> See [Appendix: trycmd Compatibility](#appendix-trycmd-compatibility) for full
> comparison.

See [research doc: Test File
Format](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-cli-golden-testing.md#test-file-format-tryscriptmd)
for full specification.

Summary:

````markdown
---
bin: ./my-cli
env:
  NO_COLOR: "1"
---

# Test: Feature Name

```console
$ my-cli --help
Usage: my-cli [OPTIONS]
...

? 0
```
````

**Parsing rules** (matching
[trycmd syntax](https://docs.rs/trycmd/latest/trycmd/#trycmd)):

- Lines starting with `$ ` are commands; the `$` and leading space are stripped

- Lines starting with `> ` are command continuations, appended with a space

- The `? <code>` exit directive may appear anywhere after command output; default is `?
  0` if absent. **Note**: trycmd also supports `? success`, `? failed`, `? interrupted`,
  `? skipped` — tryscript v1 only supports numeric codes.

- The `$` prompt and `>` continuation markers are not part of expected output

- Comments with `#` inside console blocks are treated as literal output (not stripped)

- Trailing blank lines in expected output are ignored by default (configurable)

- **Command splitting**: trycmd uses [shlex](https://crates.io/crates/shlex) for command
  parsing. tryscript uses `shell: true` with Node.js spawn, achieving similar
  shell-native parsing.

**Environment from frontmatter**: Merged shallowly with `process.env`. Frontmatter `env`
values take precedence.

### Elision Patterns

> **trycmd reference**:
> [Eliding Content](https://docs.rs/trycmd/latest/trycmd/#stdout-and-stderr) — These
> patterns match trycmd’s elision syntax exactly.

| Pattern | Matches | trycmd Regex | Example |
| --- | --- | --- | --- |
| `[..]` | Any characters on line | `[^\n]*?` | `Done in [..]ms` |
| `...` | Zero or more lines | `\n(([^\n]*\n)*)?` | See full output below `...` |
| `[EXE]` | `.exe` on Windows, empty otherwise | `.exe` or `` | `my-cli[EXE]` |
| `[ROOT]` | Test root directory path | Literal substitution | `[ROOT]/output.txt` |
| `[CWD]` | Current working directory | Literal substitution | `[CWD]/file.txt` |
| `[NAME]` | Custom pattern from config | Via `TestCases::insert_var` | `Created: [TIMESTAMP]` |

* * *

## Stage 2: Architecture

> **Implementation patterns**: Follow [Modern TypeScript CLI
> Patterns](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-modern-typescript-cli-patterns.md)
> for CLI structure, output handling, and error reporting.
> 
> **Build and project setup**: Follow [Modern TypeScript Monorepo
> Patterns](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-modern-typescript-monorepo-patterns.md)
> for pnpm workspaces, tsdown, Changesets, and CI/CD.
> 
> **Reference repo**: Use [markform](https://github.com/jlevy/markform) as a reference
> for project structure and configuration.

### Package Structure

```
tryscript/
├── .changeset/
│   └── config.json
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── packages/
│   └── tryscript/
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsdown.config.ts
│       ├── src/
│       │   ├── index.ts           # Public API exports + VERSION
│       │   ├── bin.ts             # CLI entry point (shebang)
│       │   ├── cli/
│       │   │   ├── cli.ts         # Commander setup
│       │   │   └── commands/
│       │   │       └── run.ts     # Main run command handler
│       │   └── lib/
│       │       ├── types.ts       # Type definitions
│       │       ├── config.ts      # Config loading
│       │       ├── parser.ts      # Markdown + frontmatter parser
│       │       ├── runner.ts      # Command execution, temp dirs
│       │       ├── matcher.ts     # Pattern matching with elisions
│       │       ├── normalizer.ts  # Output normalization
│       │       ├── reporter.ts    # Colored output, diffs
│       │       └── updater.ts     # Golden file updates
│       └── tests/
│           └── *.tryscript.md     # Self-tests (bootstrap)
├── .gitignore
├── .npmrc
├── .prettierrc
├── eslint.config.js
├── lefthook.yml
├── package.json                   # Root workspace package
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

### Dependencies

**Runtime** (packages/tryscript):

- `commander` — CLI framework

- `yaml` — YAML frontmatter parsing

- `picocolors` — Terminal colors

- `diff` — Diff generation for failures

- `fast-glob` — Gitignore-aware file discovery for `**/*.tryscript.md`

- `strip-ansi` — Remove ANSI escape codes during output normalization

- `tree-kill` — Cross-platform process tree termination for timeout handling

- `atomically` — Atomic file writes (for update mode)

**Dev** (root workspace):

- `typescript` — Type checking

- `tsdown` — Build ESM/CJS with declarations

- `@types/node` — Node.js types

- `vitest` — Unit tests (Phase 1 only, before bootstrap)

- `publint` — Package validation

- `prettier` — Code formatting

- `eslint` + `typescript-eslint` — Linting

- `eslint-config-prettier` — Disable conflicting ESLint rules

- `lefthook` — Git hooks

- `@changesets/cli` — Version management

**Package versions** (recommended minimums):

```json
{
  "dependencies": {
    "atomically": "^2.0.0",
    "commander": "^14.0.0",
    "diff": "^8.0.0",
    "fast-glob": "^3.3.0",
    "picocolors": "^1.1.0",
    "strip-ansi": "^7.1.0",
    "tree-kill": "^1.2.0",
    "yaml": "^2.6.0",
    "zod": "^4.0.0"
  }
}
```

### CLI Design

Per
[TypeScript CLI Patterns](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-modern-typescript-cli-patterns.md):

**CLI entry point** (`src/bin.ts`):

```typescript
#!/usr/bin/env node
import { run } from './cli/cli.js';

run(process.argv);
```

**CLI setup** (`src/cli/cli.ts`):

```typescript
import { Command } from 'commander';
import pc from 'picocolors';
import { VERSION } from '../index.js';
import { runCommand } from './commands/run.js';

export function run(argv: string[]): void {
  const program = new Command()
    .name('tryscript')
    .version(VERSION, '--version', 'Show version number')
    .description('Golden testing for CLI applications')
    .showHelpAfterError('(use --help for usage)')
    .argument('[files...]', 'Test files to run (default: **/*.tryscript.md)')
    .option('--update', 'Update golden files with actual output')
    .option('--diff', 'Show diff on failure (default: true)')
    .option('--no-diff', 'Hide diff on failure')
    .option('--fail-fast', 'Stop on first failure')
    .option('--filter <pattern>', 'Filter tests by name pattern')
    .option('--verbose', 'Show detailed output including passing test output')
    .option('--quiet', 'Suppress non-essential output (only show failures)')
    .action(runCommand);

  program.parseAsync(argv).catch((err) => {
    console.error(pc.red(`Error: ${err.message}`));
    process.exit(2);
  });
}
```

**Run command handler** (`src/cli/commands/run.ts`):

```typescript
import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import pc from 'picocolors';
import { loadConfig, mergeConfig } from '../../lib/config.js';
import { parseTestFile } from '../../lib/parser.js';
import { runBlock, createExecutionContext, cleanupExecutionContext } from '../../lib/runner.js';
import { matchOutput } from '../../lib/matcher.js';
import { createDiff, reportFile, reportSummary } from '../../lib/reporter.js';
import { updateTestFile } from '../../lib/updater.js';
import type { TestBlockResult, TestFileResult, TestRunSummary } from '../../lib/types.js';

interface RunOptions {
  update?: boolean;
  diff?: boolean;
  failFast?: boolean;
  filter?: string;
  verbose?: boolean;
  quiet?: boolean;
}

export async function runCommand(
  files: string[],
  options: RunOptions,
): Promise<void> {
  const startTime = Date.now();

  // Default options
  const opts = {
    diff: options.diff !== false,
    verbose: options.verbose ?? false,
    quiet: options.quiet ?? false,
    update: options.update ?? false,
    failFast: options.failFast ?? false,
    filter: options.filter,
  };

  // Find test files (fast-glob respects .gitignore by default)
  const patterns = files.length > 0 ? files : ['**/*.tryscript.md'];
  const testFiles = await fg(patterns, {
    ignore: ['**/node_modules/**', '**/dist/**'],
    absolute: true,
    dot: false,
  });

  if (testFiles.length === 0) {
    console.error(pc.yellow('No test files found'));
    process.exit(1);
  }

  // Load global config
  const globalConfig = await loadConfig(process.cwd());

  // Run tests
  const fileResults: TestFileResult[] = [];
  let shouldStop = false;

  for (const filePath of testFiles) {
    if (shouldStop) break;

    const content = await readFile(filePath, 'utf-8');
    const testFile = parseTestFile(content, filePath);
    const config = mergeConfig(globalConfig, testFile.config);

    // Filter blocks by name if specified
    let blocksToRun = testFile.blocks;
    if (opts.filter) {
      const filterPattern = new RegExp(opts.filter, 'i');
      blocksToRun = blocksToRun.filter((b) =>
        b.name ? filterPattern.test(b.name) : true
      );
    }

    if (blocksToRun.length === 0) {
      continue;
    }

    const ctx = await createExecutionContext(config, filePath);
    const results: TestBlockResult[] = [];

    try {
      for (const block of blocksToRun) {
        const result = await runBlock(block, ctx);

        // Check if output matches expected
        const matches = matchOutput(
          result.actualOutput,
          block.expectedOutput,
          { root: ctx.tempDir, cwd: ctx.tempDir },
          config.patterns ?? {},
        );

        const exitCodeMatches = result.actualExitCode === block.expectedExitCode;
        result.passed = matches && exitCodeMatches && !result.error;

        if (!result.passed && opts.diff) {
          result.diff = createDiff(
            block.expectedOutput,
            result.actualOutput,
            `${filePath}:${block.lineNumber}`,
          );
        }

        results.push(result);

        if (!result.passed && opts.failFast) {
          shouldStop = true;
          break;
        }
      }
    } finally {
      await cleanupExecutionContext(ctx);
    }

    const fileResult: TestFileResult = {
      file: testFile,
      results,
      passed: results.every((r) => r.passed),
      duration: results.reduce((sum, r) => sum + r.duration, 0),
    };

    fileResults.push(fileResult);
    reportFile(fileResult, opts);

    // Update mode
    if (opts.update && !fileResult.passed) {
      const { updated, changes } = await updateTestFile(testFile, results);
      if (updated) {
        console.error(pc.yellow(`  ↻ Updated: ${changes.join(', ')}`));
      }
    }
  }

  // Summary
  const summary: TestRunSummary = {
    files: fileResults,
    totalPassed: fileResults.reduce((sum, f) => sum + f.results.filter((r) => r.passed).length, 0),
    totalFailed: fileResults.reduce((sum, f) => sum + f.results.filter((r) => !r.passed).length, 0),
    totalBlocks: fileResults.reduce((sum, f) => sum + f.results.length, 0),
    duration: Date.now() - startTime,
  };

  reportSummary(summary, opts);

  // Exit code
  process.exit(summary.totalFailed > 0 ? 1 : 0);
}
```

**Output handling** (stdout/stderr separation):

- Test results summary → stdout (pipeable)

- Progress/status messages → stderr (visible when piped)

- Errors → stderr with clear formatting

**No single-letter aliases**: Use full option names (`--update` not `-u`) to avoid
conflicts as the CLI grows.

### Key Design Decisions

> **trycmd alignment**: These decisions mirror trycmd’s behavior unless noted.
> See [trycmd source](https://github.com/assert-rs/snapbox/tree/main/crates/trycmd/src)
> for reference implementation.

1. **Merged stdout/stderr in captured output**: Combine streams for deterministic
   ordering. **trycmd correspondence**: trycmd merges streams for `.trycmd`/`.md` files
   but keeps them separate for `.toml` format with `.stdout`/`.stderr` sidecar files.
   tryscript only supports merged output (simpler for v1).

2. **Temp directory per test file**: Each test file gets a fresh temp directory.
   All commands in that file run in the same temp dir, allowing multi-step workflows
   (create file in one block, verify in next).
   The temp dir is cleaned up after the file completes.
   **trycmd correspondence**: Identical behavior.

3. **Pattern-to-regex conversion**: Expected output with elision patterns is converted
   to a regex. Special characters are escaped, then placeholders like `[..]` are
   converted to regex patterns.
   Matching is done on normalized output.
   **trycmd correspondence**: Same approach; patterns defined in
   [snapbox/src/data](https://github.com/assert-rs/snapbox/tree/main/crates/snapbox/src/data).

4. **In-place updates**: `--update` rewrites the original `.tryscript.md` file.
   The updater preserves markdown structure and attempts to keep elision patterns where
   they still apply. **trycmd discrepancy**: trycmd uses `TRYCMD=overwrite` env var;
   tryscript uses `--update` flag for better discoverability.

5. **Fail on first mismatch per block**: When a block fails, show detailed diff and
   continue to the next block (unless `--fail-fast`). This allows seeing all failures in
   a single run. **trycmd correspondence**: Similar behavior.

6. **Exit codes**:

   - `0` = all tests pass

   - `1` = one or more test failures

   - `2` = configuration or runtime error (can’t run tests)

7. **Binary discovery**: The `bin` config option specifies an explicit path to the
   binary. **trycmd discrepancy**: trycmd uses `bin.name` to look up binaries from
   `Cargo.toml` via the `cargo_bin!` macro.
   tryscript uses explicit paths since it’s language-agnostic and can’t assume Cargo
   integration.

8. **Config format**: TypeScript config file (`tryscript.config.ts`) with `defineConfig`
   helper. **trycmd discrepancy**: trycmd uses TOML and Cargo.toml integration.
   TypeScript config allows type-safe `RegExp` objects for custom patterns: `patterns: {
   TIMESTAMP: /\d{4}-\d{2}-\d{2}/ }`

### Important Implementation Notes

**Output normalization** (applied before matching, matching
[snapbox normalization](https://docs.rs/snapbox/latest/snapbox/)):

- Convert `\r\n` and `\r` to `\n`

- Trim trailing whitespace from each line

- Ensure single trailing newline

- On Windows: normalize backslash paths to forward slashes

**Command execution**:

- Commands run via shell (`spawn` with `shell: true`)

- Working directory is the test file’s temp directory

- Environment includes `NO_COLOR=1` by default (can be overridden in config)

- Timeout is enforced per-command (default: 30 seconds)

**Binary resolution**:

- The `bin` config option is resolved relative to the test file’s directory

- If no `bin` is specified, commands run directly in shell

- For testing the CLI itself: use relative path like `bin: ../dist/bin.js`

**Multi-block workflows**:

- All blocks in a file share the same temp directory

- This enables workflows like:

  - Block 1: `my-cli init`

  - Block 2: `ls` (verify files were created)

  - Block 3: `my-cli build`

**Pattern matching order**:

1. Custom patterns from config are applied first (before regex escaping)

2. Built-in patterns (`[..]`, `...`, `[EXE]`) are applied after escaping

3. Path placeholders (`[ROOT]`, `[CWD]`) are replaced with actual paths

* * *

## Stage 3: Implementation Phases

> **TDD approach**: Each phase follows Red → Green → Refactor.
> Write tests first, then implement.
> From Phase 2 onward, use tryscript to test tryscript.
> 
> **Reference**: See [markform](https://github.com/jlevy/markform) for examples of each
> configuration file.

### Phase 0: Repository Setup

**Goal**: Scaffold a modern TypeScript monorepo following all patterns.

**Files to create**:

- [ ] `pnpm-workspace.yaml` — Workspace configuration

- [ ] `package.json` (root) — Workspace scripts, devDependencies

- [ ] `.npmrc` — pnpm configuration

- [ ] `tsconfig.base.json` — Shared TypeScript config

- [ ] `eslint.config.js` — Type-aware ESLint flat config

- [ ] `.prettierrc` + `.prettierignore` — Formatting config

- [ ] `lefthook.yml` — Pre-commit/pre-push hooks

- [ ] `.changeset/config.json` — Changesets configuration

- [ ] `.github/workflows/ci.yml` — CI workflow

- [ ] `.github/workflows/release.yml` — Release workflow (optional, for npm)

- [ ] `.gitignore` — Standard ignores

- [ ] `packages/tryscript/package.json` — Package manifest

- [ ] `packages/tryscript/tsconfig.json` — Package TypeScript config

- [ ] `packages/tryscript/tsdown.config.ts` — Build configuration

**Root `package.json` scripts** (per monorepo patterns):

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "format": "prettier --write --log-level warn .",
    "format:check": "prettier --check --log-level warn .",
    "lint": "eslint . --fix && pnpm typecheck && eslint . --max-warnings 0",
    "lint:check": "pnpm typecheck && eslint . --max-warnings 0",
    "prepare": "lefthook install",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "pnpm build && pnpm -r publint && changeset publish"
  }
}
```

**Package `tsdown.config.ts`** (per monorepo patterns):

```typescript
import { execSync } from 'node:child_process';
import { defineConfig } from 'tsdown';
import pkg from './package.json' with { type: 'json' };

/**
 * Get version string with git info for dev builds.
 * Format: X.Y.Z-dev.N.hash (or just X.Y.Z for tagged releases)
 */
function getGitVersion(): string {
  try {
    const git = (args: string) =>
      execSync(`git ${args}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

    const tag = git('describe --tags --abbrev=0');
    const tagVersion = tag.replace(/^v/, '');
    const [major, minor, patch] = tagVersion.split('.').map(Number);
    const commitsSinceTag = parseInt(git(`rev-list ${tag}..HEAD --count`), 10);
    const hash = git('rev-parse --short=7 HEAD');

    let dirty = false;
    try {
      git('diff --quiet');
      git('diff --cached --quiet');
    } catch {
      dirty = true;
    }

    if (commitsSinceTag === 0 && !dirty) {
      return tagVersion;
    }

    const bumpedPatch = (patch ?? 0) + 1;
    const suffix = dirty ? `${hash}-dirty` : hash;
    return `${major}.${minor}.${bumpedPatch}-dev.${commitsSinceTag}.${suffix}`;
  } catch {
    return pkg.version;
  }
}

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['esm', 'cjs'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  dts: true,
  clean: true,
  define: {
    __VERSION__: JSON.stringify(getGitVersion()),
  },
  banner: ({ fileName }) =>
    fileName.startsWith('bin.') ? '#!/usr/bin/env node\n' : '',
});
```

**Package `src/index.ts`** (public API exports):

```typescript
// Public API exports

// Version constant (injected at build time)
declare const __VERSION__: string;
export const VERSION: string =
  typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'development';

// Config helper
export { defineConfig } from './lib/config.js';
export type { TryscriptConfig } from './lib/config.js';

// Types
export type {
  TestConfig,
  TestBlock,
  TestFile,
  TestBlockResult,
  TestFileResult,
  TestRunSummary,
} from './lib/types.js';

// Core functions (for programmatic use)
export { parseTestFile } from './lib/parser.js';
export { runBlock, createExecutionContext, cleanupExecutionContext } from './lib/runner.js';
export { matchOutput, normalizeOutput } from './lib/matcher.js';
```

**Acceptance**:

- [ ] `pnpm install` succeeds

- [ ] `pnpm build` produces dist/ with ESM, CJS, and .d.ts

- [ ] `pnpm lint` and `pnpm format:check` pass

- [ ] `pnpm typecheck` passes

- [ ] Git hooks configured and working

- [ ] CI workflow runs on push

* * *

### Phase 1: Core Parser and Types

**Goal**: Parse `.tryscript.md` files into structured test cases.

**Files to create/modify**:

- [ ] `src/lib/types.ts` — TestFile, TestBlock, Config interfaces

- [ ] `src/lib/parser.ts` — Parse markdown, extract console blocks, parse frontmatter

- [ ] `src/index.ts` — Export public API + VERSION constant

- [ ] `tests/parser.test.ts` — Unit tests (using vitest, temporary)

**Type definitions**:

```typescript
// types.ts
import { z } from 'zod';

export const TestConfigSchema = z.object({
  bin: z.string().optional().describe('Path to the binary to test'),
  env: z.record(z.string()).optional().describe('Environment variables'),
  timeout: z.number().optional().describe('Timeout per command in ms'),
  patterns: z.record(z.union([z.string(), z.instanceof(RegExp)])).optional().describe('Custom elision patterns'),
  tests: z.array(z.string()).optional().describe('Test file glob patterns'),
});

/**
 * Configuration for a test file or global config.
 */
export type TestConfig = z.infer<typeof TestConfigSchema>;

/**
 * A single command block within a test file.
 */
export interface TestBlock {
  /** Optional test name from preceding markdown heading */
  name?: string;
  /** The command to execute (may span multiple lines with > continuation) */
  command: string;
  /** Expected output (may include elision patterns) */
  expectedOutput: string;
  /** Expected exit code (default: 0) */
  expectedExitCode: number;
  /** Line number where this block starts (1-indexed, for error reporting) */
  lineNumber: number;
  /** Raw content of the block for update mode */
  rawContent: string;
}

/**
 * A parsed test file with all its blocks.
 */
export interface TestFile {
  /** Absolute path to the test file */
  path: string;
  /** Merged configuration (global + frontmatter) */
  config: TestConfig;
  /** Parsed test blocks in order */
  blocks: TestBlock[];
  /** Raw file content for update mode */
  rawContent: string;
}

/**
 * Result of running a single test block.
 */
export interface TestBlockResult {
  block: TestBlock;
  passed: boolean;
  actualOutput: string;
  actualExitCode: number;
  /** Diff if test failed (unified diff format) */
  diff?: string;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if execution failed */
  error?: string;
}

/**
 * Result of running all blocks in a test file.
 */
export interface TestFileResult {
  file: TestFile;
  results: TestBlockResult[];
  passed: boolean;
  /** Total duration in milliseconds */
  duration: number;
}

/**
 * Summary of running multiple test files.
 */
export interface TestRunSummary {
  files: TestFileResult[];
  totalPassed: number;
  totalFailed: number;
  totalBlocks: number;
  duration: number;
}
```

**Test cases to handle**:

```markdown
# Basic: single command
$ echo hello
hello

# Multi-line command
$ echo "line 1" && \
> echo "line 2"
line 1
line 2

# Exit code
$ false
? 1

# With frontmatter
---
bin: ./my-cli
---
```

**Parser implementation**:

```typescript
// parser.ts
import { parse as parseYaml } from 'yaml';
import type { TestConfig, TestBlock, TestFile } from './types.js';

/** Regex to match YAML frontmatter at the start of a file */
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** Regex to match fenced code blocks with console/bash info string */
const CODE_BLOCK_REGEX = /```(console|bash)\r?\n([\s\S]*?)```/g;

/** Regex to match markdown headings (for test names) */
const HEADING_REGEX = /^#+\s+(?:Test:\s*)?(.+)$/m;

/**
 * Parse a .tryscript.md file into structured test data.
 */
export function parseTestFile(content: string, filePath: string): TestFile {
  const rawContent = content;
  let config: TestConfig = {};
  let body = content;

  // Extract frontmatter if present
  const frontmatterMatch = content.match(FRONTMATTER_REGEX);
  if (frontmatterMatch) {
    const yamlContent = frontmatterMatch[1];
    config = parseYaml(yamlContent) as TestConfig;
    body = content.slice(frontmatterMatch[0].length);
  }

  // Parse all console blocks
  const blocks: TestBlock[] = [];
  let match: RegExpExecArray | null;

  while ((match = CODE_BLOCK_REGEX.exec(body)) !== null) {
    const blockContent = match[2];
    const blockStart = match.index;

    // Find the line number (1-indexed)
    const precedingContent = content.slice(0, content.indexOf(match[0]));
    const lineNumber = precedingContent.split('\n').length;

    // Look for a heading before this block (for test name)
    const contentBefore = body.slice(0, blockStart);
    const lastHeadingMatch = [...contentBefore.matchAll(new RegExp(HEADING_REGEX.source, 'gm'))].pop();
    const name = lastHeadingMatch?.[1]?.trim();

    // Parse the block content
    const parsed = parseBlockContent(blockContent);
    if (parsed) {
      blocks.push({
        name,
        command: parsed.command,
        expectedOutput: parsed.expectedOutput,
        expectedExitCode: parsed.expectedExitCode,
        lineNumber,
        rawContent: match[0],
      });
    }
  }

  return { path: filePath, config, blocks, rawContent };
}

/**
 * Parse the content of a single console block.
 */
function parseBlockContent(content: string): {
  command: string;
  expectedOutput: string;
  expectedExitCode: number;
} | null {
  const lines = content.split('\n');
  const commandLines: string[] = [];
  const outputLines: string[] = [];
  let expectedExitCode = 0;
  let inCommand = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('$ ')) {
      // Start of a command
      inCommand = true;
      commandLines.push(line.slice(2));
    } else if (line.startsWith('> ') && inCommand) {
      // Continuation of a multi-line command
      commandLines.push(line.slice(2));
    } else if (line.startsWith('? ')) {
      // Exit code specification
      inCommand = false;
      expectedExitCode = parseInt(line.slice(2).trim(), 10);
    } else if (inCommand && line.endsWith('\\')) {
      // Command continues on next line (shell continuation)
      // The line after $ already captured, this handles edge cases
    } else {
      // Output line
      inCommand = false;
      outputLines.push(line);
    }
  }

  if (commandLines.length === 0) {
    return null;
  }

  // Join command lines, handling shell continuations
  let command = '';
  for (let i = 0; i < commandLines.length; i++) {
    const line = commandLines[i];
    if (line.endsWith('\\')) {
      command += line.slice(0, -1) + ' ';
    } else {
      command += line;
      if (i < commandLines.length - 1) {
        command += ' ';
      }
    }
  }

  // Join output lines, preserving blank lines but trimming trailing empty lines
  let expectedOutput = outputLines.join('\n');
  expectedOutput = expectedOutput.replace(/\n+$/, '');
  if (expectedOutput) {
    expectedOutput += '\n';
  }

  return { command: command.trim(), expectedOutput, expectedExitCode };
}
```

**Acceptance**:

- [ ] Parser extracts commands, expected output, exit codes correctly

- [ ] Multi-line commands with `> ` continuation work

- [ ] Shell continuation with `\` at end of line works

- [ ] Frontmatter merged with defaults

- [ ] Line numbers tracked for error reporting

- [ ] Test names extracted from preceding headings

- [ ] Unit tests pass

* * *

### Phase 2: Runner and Basic Execution

**Goal**: Execute commands and capture output.
Create first self-tests.

**Files to create/modify**:

- [ ] `src/lib/runner.ts` — Spawn commands, capture stdout+stderr, handle timeouts

- [ ] `src/lib/normalizer.ts` — Basic normalization (line endings, trailing whitespace)

- [ ] `src/bin.ts` — CLI entry point

- [ ] `src/cli/cli.ts` — Commander setup with global options

- [ ] `src/cli/commands/run.ts` — Main run command handler

- [ ] `tests/basic.tryscript.md` — First self-test file

**CLI output routing** (per CLI patterns):

- Progress → stderr (so results can be piped)

- Final summary → stdout

- Errors → stderr with color

**Runner implementation**:

```typescript
// runner.ts
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import treeKill from 'tree-kill';
import type { TestConfig, TestBlock, TestBlockResult } from './types.js';

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT = 30_000;

/**
 * Execution context for a test file.
 * Created once per file, contains the temp directory.
 */
export interface ExecutionContext {
  /** Temporary directory for this test file */
  tempDir: string;
  /** Resolved binary path */
  binPath: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Timeout per command */
  timeout: number;
}

/**
 * Create an execution context for a test file.
 */
export async function createExecutionContext(
  config: TestConfig,
  testFilePath: string,
): Promise<ExecutionContext> {
  const tempDir = await mkdtemp(join(tmpdir(), 'tryscript-'));

  // Resolve binary path relative to test file directory
  let binPath = config.bin ?? '';
  if (binPath && !binPath.startsWith('/')) {
    binPath = join(testFilePath, '..', binPath);
  }

  return {
    tempDir,
    binPath,
    env: {
      ...process.env,
      ...config.env,
      // Disable colors by default for deterministic output
      NO_COLOR: config.env?.NO_COLOR ?? '1',
      FORCE_COLOR: '0',
    },
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
  };
}

/**
 * Clean up execution context (remove temp directory).
 */
export async function cleanupExecutionContext(ctx: ExecutionContext): Promise<void> {
  await rm(ctx.tempDir, { recursive: true, force: true });
}

/**
 * Run a single test block and return the result.
 */
export async function runBlock(
  block: TestBlock,
  ctx: ExecutionContext,
): Promise<TestBlockResult> {
  const startTime = Date.now();

  try {
    const { output, exitCode } = await executeCommand(
      block.command,
      ctx,
    );

    // output already contains merged stdout/stderr with correct interleaving
    const actualOutput = output;

    const duration = Date.now() - startTime;

    return {
      block,
      passed: true, // Matching handled separately
      actualOutput,
      actualExitCode: exitCode,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    return {
      block,
      passed: false,
      actualOutput: '',
      actualExitCode: -1,
      duration,
      error: message,
    };
  }
}

/**
 * Execute a command and capture output.
 */
async function executeCommand(
  command: string,
  ctx: ExecutionContext,
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, {
      shell: true,
      cwd: ctx.tempDir,
      env: ctx.env as NodeJS.ProcessEnv,
      // Pipe both to capture
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const chunks: Buffer[] = [];

    // Capture data as it comes in to preserve order
    proc.stdout.on('data', (data) => chunks.push(data));
    proc.stderr.on('data', (data) => chunks.push(data));

    const timeoutId = setTimeout(() => {
      if (proc.pid) {
        treeKill(proc.pid, 'SIGKILL');
      }
      reject(new Error(`Command timed out after ${ctx.timeout}ms`));
    }, ctx.timeout);

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const output = Buffer.concat(chunks).toString('utf-8');
      resolve({
        output,
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}
```

**First self-tests** (`tests/basic.tryscript.md`):

````markdown
# Test: Echo command

```console
$ echo "hello world"
hello world
? 0
```

# Test: Exit code

```console
$ sh -c "exit 42"
? 42
```
````

**Bootstrap milestone**: After this phase, run `pnpm tryscript tests/basic.tryscript.md`
to test with itself.

**Acceptance**:

- [ ] Commands execute in temp directory

- [ ] stdout/stderr merged in order

- [ ] Exit codes captured correctly

- [ ] Basic pass/fail output

- [ ] First self-test passes

* * *

### Phase 3: Pattern Matching with Elisions

**Goal**: Support `[..]`, `...`, and built-in patterns.

**Files to create/modify**:

- [ ] `src/lib/matcher.ts` — Convert expected patterns to regex, match actual output

- [ ] Update `runner.ts` to integrate matcher

- [ ] `tests/elisions.tryscript.md` — Elision pattern tests

**Pattern conversion logic**:

> **trycmd reference**: Pattern matching is implemented in
> [snapbox/src/data](https://github.com/assert-rs/snapbox/tree/main/crates/snapbox/src/data).
> The regex conversions below match trycmd’s documented behavior.

```typescript
// matcher.ts

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert expected output with elision patterns to a regex.
 *
 * Handles (matching trycmd):
 * - [..] — matches any characters on the same line (trycmd: [^\n]*?)
 * - ... — matches zero or more complete lines (trycmd: \n(([^\n]*\n)*)?)
 * - [EXE] — matches .exe on Windows, empty otherwise
 * - [ROOT] — replaced with test root directory (pre-processed)
 * - [CWD] — replaced with current working directory (pre-processed)
 * - Custom [NAME] patterns from config (trycmd: TestCases::insert_var)
 */
function patternToRegex(
  expected: string,
  customPatterns: Record<string, string | RegExp> = {},
): RegExp {
  // First, handle custom patterns BEFORE escaping (they may contain special chars)
  let processed = expected;
  for (const [name, pattern] of Object.entries(customPatterns)) {
    const placeholder = `[${name}]`;
    const patternStr = pattern instanceof RegExp ? pattern.source : pattern;
    // Replace placeholders with a unique marker that won't be escaped
    processed = processed.replaceAll(placeholder, `\x00CUSTOM:${name}:${patternStr}\x00`);
  }

  // Escape special regex characters
  let pattern = escapeRegex(processed);

  // Restore custom patterns (the markers were escaped, so unescape them)
  pattern = pattern.replace(/\\x00CUSTOM:([^:]+):([^\\]+)\\x00/g, '($2)');

  // [..] matches any characters on the line (non-greedy, stops at newline)
  // After escaping, [..] becomes \[\.\.\]
  pattern = pattern.replace(/\\\[\\\.\\\.\\\]/g, '[^\\n]*');

  // ... matches zero or more complete lines (including the newline after ...)
  // After escaping, ... becomes \.\.\.
  // Match: optional content before newline, then zero or more complete lines
  pattern = pattern.replace(/\\\.\\\.\\\.(\r?\\n)?/g, '(?:[^\\n]*\\n)*');

  // [EXE] platform-specific executable extension
  // After escaping, [EXE] becomes \[EXE\]
  const exe = process.platform === 'win32' ? '\\.exe' : '';
  pattern = pattern.replace(/\\\[EXE\\\]/g, exe);

  // Match the entire string (multiline mode for ^ and $ to match line boundaries)
  return new RegExp(`^${pattern}$`, 's');
}

/**
 * Pre-process expected output to replace path placeholders with actual paths.
 * This happens BEFORE pattern matching.
 */
function preprocessPaths(
  expected: string,
  context: { root: string; cwd: string },
): string {
  let result = expected;
  // Normalize paths for comparison (use forward slashes)
  const normalizedRoot = context.root.replace(/\\/g, '/');
  const normalizedCwd = context.cwd.replace(/\\/g, '/');
  result = result.replaceAll('[ROOT]', normalizedRoot);
  result = result.replaceAll('[CWD]', normalizedCwd);
  return result;
}

/**
 * Normalize actual output for comparison.
 * - Normalize line endings to \n
 * - Normalize paths (Windows backslashes to forward slashes)
 * - Trim trailing whitespace from lines
 * - Ensure single trailing newline
 */
function normalizeOutput(output: string): string {
  return output
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n+$/, '\n');
}

/**
 * Check if actual output matches expected pattern.
 */
function matchOutput(
  actual: string,
  expected: string,
  context: { root: string; cwd: string },
  customPatterns: Record<string, string | RegExp> = {},
): boolean {
  const normalizedActual = normalizeOutput(actual);
  const preprocessed = preprocessPaths(expected, context);
  const regex = patternToRegex(preprocessed, customPatterns);
  return regex.test(normalizedActual);
}
```

**Self-tests** (`tests/elisions.tryscript.md`):

````markdown
# Test: Wildcard on line

```console
$ node -e "console.log(Date.now())"
[..]
? 0
```

# Test: Multi-line wildcard

```console
$ ls -la
total [..]
...
? 0
```
````

**Acceptance**:

- [ ] `[..]` matches any characters on a line

- [ ] `...` matches zero or more complete lines

- [ ] `[EXE]` expands correctly per platform

- [ ] Clear error messages on mismatch with diff

- [ ] Elision self-tests pass

* * *

### Phase 4: Custom Patterns and Config

**Goal**: Support custom elision patterns and config files.

**Files to create/modify**:

- [ ] `src/lib/config.ts` — Load `tryscript.config.ts`, merge with defaults

- [ ] Update `matcher.ts` for custom patterns

- [ ] Update `matcher.ts` for `[ROOT]` and `[CWD]` patterns

- [ ] `tests/tryscript.config.ts` — Test config file

- [ ] `tests/config.tryscript.md` — Config tests

**Config format**:

```typescript
// tryscript.config.ts
import { defineConfig } from 'tryscript';

export default defineConfig({
  bin: './dist/cli.js',
  env: { NO_COLOR: '1' },
  patterns: {
    TIMESTAMP: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    DURATION: /\d+(\.\d+)?ms/,
  },
});
```

**Config loading implementation**:

```typescript
// config.ts
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface TryscriptConfig {
  bin?: string;
  env?: Record<string, string>;
  timeout?: number;
  patterns?: Record<string, RegExp | string>;
  tests?: string[];
}

const CONFIG_FILES = ['tryscript.config.ts', 'tryscript.config.js', 'tryscript.config.mjs'];

/**
 * Load config file using dynamic import.
 * Supports both TypeScript (via tsx/ts-node) and JavaScript configs.
 */
export async function loadConfig(baseDir: string): Promise<TryscriptConfig> {
  for (const filename of CONFIG_FILES) {
    const configPath = resolve(baseDir, filename);
    if (existsSync(configPath)) {
      const configUrl = pathToFileURL(configPath).href;
      const module = await import(configUrl);
      return module.default ?? module;
    }
  }
  return {};
}

/**
 * Merge config with frontmatter overrides.
 * Frontmatter takes precedence over config file.
 */
export function mergeConfig(
  base: TryscriptConfig,
  frontmatter: TryscriptConfig,
): TryscriptConfig {
  return {
    ...base,
    ...frontmatter,
    env: { ...base.env, ...frontmatter.env },
    patterns: { ...base.patterns, ...frontmatter.patterns },
  };
}

/**
 * Helper for typed config files.
 */
export function defineConfig(config: TryscriptConfig): TryscriptConfig {
  return config;
}
```

**Self-tests** (`tests/config.tryscript.md`):

````markdown
---
bin: ../dist/bin.js
patterns:
  TIMESTAMP: '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
---

# Test: Version command

```console
$ tryscript --version
tryscript [..]
? 0
```

# Test: Help output

```console
$ tryscript --help
Usage: tryscript [options] [files...]

Golden testing for CLI applications

Arguments:
  files                    Test files to run (default: **/*.tryscript.md)

Options:
...
? 0
```

# Test: Custom pattern

```console
$ node -e "console.log(new Date().toISOString())"
[TIMESTAMP][..]
? 0
```
````

**Comprehensive self-test example** (`tests/features.tryscript.md`):

````markdown
---
bin: ../dist/bin.js
env:
  NO_COLOR: "1"
---

# Test: Running a passing test

Create a simple passing test and verify it passes.

```console
$ cat > test.tryscript.md << 'EOF'
# Simple test
\`\`\`console
$ echo hello
hello
? 0
\`\`\`
EOF
$ tryscript test.tryscript.md
PASS test.tryscript.md
  ✓ Simple test

1 passed, 0 failed [..]
? 0
```

# Test: Running a failing test

Create a test with wrong expected output.

```console
$ cat > fail.tryscript.md << 'EOF'
# Will fail
\`\`\`console
$ echo hello
goodbye
? 0
\`\`\`
EOF
$ tryscript fail.tryscript.md --no-diff
FAIL fail.tryscript.md
  ✗ Will fail
...
0 passed, 1 failed [..]
? 1
```

# Test: Update mode

```console
$ tryscript fail.tryscript.md --update --no-diff
...
UPDATED fail.tryscript.md
...
? 0
```

After update, the test should pass:

```console
$ tryscript fail.tryscript.md
PASS fail.tryscript.md
...
? 0
```
````

**Acceptance**:

- [ ] Config file loaded and merged

- [ ] Custom patterns work in expected output

- [ ] `[ROOT]`/`[CWD]` replaced correctly

- [ ] Config self-tests pass

* * *

### Phase 5: Reporter and Diff Display

**Goal**: Polished output with colors and helpful diffs.

**Files to create/modify**:

- [ ] `src/lib/reporter.ts` — Colored pass/fail, file/block names, timing

- [ ] Update `run.ts` to use reporter

- [ ] `tests/reporter.tryscript.md` — Reporter output tests (test via snapshot)

**Output format**:

```
PASS tests/parser.tryscript.md
  ✓ Parse single command
  ✓ Parse multi-line command

FAIL tests/runner.tryscript.md
  ✗ Handle timeout
    Expected exit code 0, got 124

    - expected
    + actual

    @@ -1,2 +1,2 @@
    -Command completed
    +Command timed out

2 passed, 1 failed (1.23s)
```

**Reporter implementation**:

```typescript
// reporter.ts
import pc from 'picocolors';
import { createPatch } from 'diff';
import type { TestBlockResult, TestFileResult, TestRunSummary } from './types.js';

export interface ReporterOptions {
  diff: boolean;
  verbose: boolean;
  quiet: boolean;
}

/**
 * Create a unified diff between expected and actual output.
 */
export function createDiff(expected: string, actual: string, filename: string): string {
  const patch = createPatch(filename, expected, actual, 'expected', 'actual');
  // Remove the header lines (first 4 lines)
  const lines = patch.split('\n').slice(4);
  return lines
    .map((line) => {
      if (line.startsWith('+')) {
        return pc.green(line);
      }
      if (line.startsWith('-')) {
        return pc.red(line);
      }
      if (line.startsWith('@')) {
        return pc.cyan(line);
      }
      return line;
    })
    .join('\n');
}

/**
 * Format a duration in milliseconds for display.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Report results for a single file.
 */
export function reportFile(result: TestFileResult, options: ReporterOptions): void {
  const filename = result.file.path;
  const status = result.passed
    ? pc.green(pc.bold('PASS'))
    : pc.red(pc.bold('FAIL'));

  if (options.quiet && result.passed) {
    return;
  }

  // File header
  console.error(`${status} ${filename}`);

  // Individual block results
  for (const blockResult of result.results) {
    const name = blockResult.block.name ?? `Line ${blockResult.block.lineNumber}`;

    if (blockResult.passed) {
      if (!options.quiet) {
        console.error(`  ${pc.green('✓')} ${name}`);
      }
    } else {
      console.error(`  ${pc.red('✗')} ${name}`);

      // Show error details
      if (blockResult.error) {
        console.error(`    ${pc.red(blockResult.error)}`);
      } else {
        // Exit code mismatch
        if (blockResult.actualExitCode !== blockResult.block.expectedExitCode) {
          console.error(
            `    Expected exit code ${blockResult.block.expectedExitCode}, got ${blockResult.actualExitCode}`,
          );
        }

        // Output mismatch with diff
        if (options.diff && blockResult.diff) {
          console.error('');
          console.error(blockResult.diff);
        }
      }
    }
  }

  console.error('');
}

/**
 * Report final summary.
 */
export function reportSummary(summary: TestRunSummary, options: ReporterOptions): void {
  const parts: string[] = [];

  if (summary.totalPassed > 0) {
    parts.push(pc.green(`${summary.totalPassed} passed`));
  }
  if (summary.totalFailed > 0) {
    parts.push(pc.red(`${summary.totalFailed} failed`));
  }

  const duration = formatDuration(summary.duration);
  const line = `${parts.join(', ')} (${duration})`;

  // Summary goes to stdout (can be piped/parsed)
  console.log(line);
}
```

**Reporter features**:

- `--diff` flag for detailed diff output (default: true)

- `--verbose` for extra information (command output even on pass)

- `--quiet` for minimal output (only failures)

- Color detection (respect `NO_COLOR` via picocolors)

**Acceptance**:

- [ ] Clear visual distinction between pass/fail

- [ ] Diff shows exactly what mismatched with colors

- [ ] Summary enables quick CI scanning

- [ ] Respects `--verbose`, `--quiet`, `NO_COLOR`

- [ ] Progress to stderr, summary to stdout

* * *

### Phase 6: Update Mode and Polish

**Goal**: Complete the tool with golden update capability.

**Files to create/modify**:

- [ ] `src/lib/updater.ts` — Rewrite `.tryscript.md` with actual output

- [ ] Update `run.ts` for `--update`, `--filter`, `--fail-fast`

- [ ] Comprehensive self-test suite in `tests/`

- [ ] `README.md` with usage examples

- [ ] `packages/tryscript/README.md` — Package readme

**Update behavior**:

```
$ tryscript --update
UPDATED tests/output.tryscript.md
  ↻ Command output - updated expected output
```

**Preservation rules**:

- Keep `[..]`, `...`, and custom patterns intact where possible

- Only update the literal expected text

- Preserve markdown structure and comments

**Updater implementation**:

```typescript
// updater.ts
import { writeFile } from 'atomically';
import type { TestFile, TestBlockResult } from './types.js';

/**
 * Strategy for preserving elision patterns during update.
 *
 * When updating, we want to keep patterns like [..] and ... where they still
 * make sense. This is a heuristic approach:
 *
 * 1. If the pattern [..] appears in expected and actual has content in that position,
 *    keep [..] instead of replacing with actual content.
 *
 * 2. If ... appears at the end of expected and actual has more lines,
 *    keep ... to match any trailing content.
 *
 * For simplicity in v1, we take a conservative approach:
 * - If the test was passing, don't touch the expected output
 * - If the test was failing, replace expected with actual but preserve exit code line
 */

/**
 * Update a test file with actual output from test results.
 */
export async function updateTestFile(
  file: TestFile,
  results: TestBlockResult[],
): Promise<{ updated: boolean; changes: string[] }> {
  let content = file.rawContent;
  const changes: string[] = [];

  // Process blocks in reverse order to maintain correct offsets
  const blocksWithResults = file.blocks
    .map((block, i) => ({ block, result: results[i] }))
    .reverse();

  for (const { block, result } of blocksWithResults) {
    if (result.passed) {
      continue; // Don't touch passing tests
    }

    if (result.error) {
      // Execution error, can't update
      continue;
    }

    // Build the new block content
    const newBlockContent = buildUpdatedBlock(block, result);

    // Find and replace the block in the file
    const blockStart = content.indexOf(block.rawContent);
    if (blockStart !== -1) {
      content =
        content.slice(0, blockStart) +
        newBlockContent +
        content.slice(blockStart + block.rawContent.length);

      changes.push(block.name ?? `Line ${block.lineNumber}`);
    }
  }

  if (changes.length > 0) {
    await writeFile(file.path, content);
  }

  return { updated: changes.length > 0, changes };
}

/**
 * Build an updated console block with new expected output.
 */
function buildUpdatedBlock(block: TestBlock, result: TestBlockResult): string {
  // Reconstruct the command line(s)
  const commandLines = block.command.split('\n').map((line, i) => {
    return i === 0 ? `$ ${line}` : `> ${line}`;
  });

  // Build the block
  const lines: string[] = [
    '```console',
    ...commandLines,
    result.actualOutput.trimEnd(),
    `? ${result.actualExitCode}`,
    '```',
  ];

  return lines.join('\n');
}

/**
 * Attempt to preserve elision patterns in updated output.
 * This is a best-effort heuristic for common cases.
 */
export function preserveElisions(
  expected: string,
  actual: string,
): string {
  // Split into lines for comparison
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const result: string[] = [];

  let expectedIdx = 0;
  let actualIdx = 0;

  while (actualIdx < actualLines.length) {
    const actualLine = actualLines[actualIdx];

    if (expectedIdx < expectedLines.length) {
      const expectedLine = expectedLines[expectedIdx];

      // Check for ... pattern (matches remaining lines)
      if (expectedLine.trim() === '...') {
        // Keep the ... and skip to end
        result.push('...');
        break;
      }

      // Check for [..] pattern
      if (expectedLine.includes('[..]')) {
        // Try to preserve [..] if the line structure matches
        const pattern = expectedLine.replace(/\[\.\.]/g, '(.*)');
        const regex = new RegExp(`^${escapeForRegex(pattern)}$`);
        if (regex.test(actualLine)) {
          result.push(expectedLine);
          expectedIdx++;
          actualIdx++;
          continue;
        }
      }
    }

    // No pattern match, use actual line
    result.push(actualLine);
    actualIdx++;
    expectedIdx++;
  }

  return result.join('\n');
}

function escapeForRegex(str: string): string {
  return str
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\(\.\*\\\)/g, '(.*)');
}
```

**Final CLI options**:

```
Usage: tryscript [options] [files...]

Golden testing for CLI applications

Arguments:
  files                    Test files to run (default: **/*.tryscript.md)

Options:
  --version               Show version number
  --update                Update golden files with actual output
  --diff                  Show diff on failure
  --fail-fast             Stop on first failure
  --filter <pattern>      Filter tests by name
  --verbose               Show detailed output
  --quiet                 Suppress non-essential output
  --help                  Display help for command
```

**Acceptance**:

- [ ] `--update` correctly rewrites files

- [ ] Elision patterns preserved during update

- [ ] Full self-test suite passes

- [ ] README documents all features

- [ ] Package ready for use

* * *

## Stage 4: Validation

### Validation Checklist

- [ ] All phases complete with passing self-tests

- [ ] Can test a real external CLI (not just echo/ls)

- [ ] Works on macOS, Linux (Windows stretch goal)

- [ ] `--update` workflow is smooth

- [ ] Error messages are helpful

- [ ] README documents all features

- [ ] CI passes consistently

- [ ] `pnpm publint` passes

- [ ] Package exports work correctly (ESM and CJS)

### Dogfooding

Use tryscript to test:

1. **tryscript itself** (primary) — Full self-test suite

2. **Another CLI in the workspace** (if available)

3. **External CLI** — Test with a well-known CLI like `jq` or `curl`

### Edge Cases and Pitfalls

**Edge cases to test**:

1. **Empty output**: Command produces no output

2. **Binary in output**: Non-UTF8 characters in output (should fail gracefully)

3. **Very long output**: Large output files (>1MB)

4. **Interactive commands**: Commands that wait for input (should timeout)

5. **Signal handling**: Commands killed by signals (exit codes 128+N)

6. **Unicode output**: Non-ASCII characters in output

7. **Color codes**: ANSI escape sequences (should be disabled via `NO_COLOR`)

8. **Trailing whitespace**: Significant vs insignificant whitespace

9. **No newline at end**: Files without trailing newline

**Common pitfalls**:

1. **Shell differences**: Bash vs zsh vs sh behavior differs

   - Recommend `sh -c "command"` for portable tests

2. **Path separators**: Windows uses `\`, Unix uses `/`

   - Normalize all paths to `/` in output comparison

3. **Locale differences**: Date/time formats, number formats

   - Set `LC_ALL=C` in test environment

4. **Filesystem ordering**: `ls` output order varies

   - Use `ls | sort` for deterministic output

5. **Timing-dependent output**: “Done in 0.5s” varies

   - Use `[..]` for timing values

6. **Environment leakage**: Tests should not depend on user environment

   - Explicitly set required environment variables in config

### Future Work (Post-v1)

> **trycmd parity**: Most of these features exist in trycmd and could be ported.

- `.in/` and `.out/` directory verification — [trycmd file system
  assertions](https://docs.rs/trycmd/latest/trycmd/#in)

- Parallel test execution (run files concurrently) — trycmd uses rayon

- Named exit codes (`? success`, `? failed`) —
  [trycmd status values](https://docs.rs/trycmd/latest/trycmd/#trycmd)

- TOML format alternative —
  [trycmd .toml format](https://docs.rs/trycmd/latest/trycmd/#toml) with separate
  `.stdout`/`.stderr` files

- Watch mode (re-run on file changes)

- npm publishing with changesets

- Windows support improvements (path handling, shell behavior)

- Interactive command testing (spawn with `waitForText`)

- Test coverage reporting (which commands/blocks ran)

* * *

## References

### trycmd (Rust Reference Implementation)

tryscript is a TypeScript port of trycmd, aiming for format compatibility where
practical.

**Documentation**:

- [trycmd docs.rs](https://docs.rs/trycmd/latest/trycmd/) — Official API documentation

- [trycmd File Formats](https://docs.rs/trycmd/latest/trycmd/#file-formats) —
  `.trycmd`/`.md` and `.toml` format specifications

- [trycmd Eliding Content](https://docs.rs/trycmd/latest/trycmd/#stdout-and-stderr) —
  Elision pattern documentation

- [TestCases struct](https://docs.rs/trycmd/latest/trycmd/struct.TestCases.html) — Test
  harness API

**Source Code** (trycmd is now part of the snapbox monorepo):

- [snapbox monorepo](https://github.com/assert-rs/snapbox) — Parent repository

- [trycmd crate](https://github.com/assert-rs/snapbox/tree/main/crates/trycmd) — trycmd
  source

- [trycmd/src](https://github.com/assert-rs/snapbox/tree/main/crates/trycmd/src) —
  Implementation

- [snapbox crate](https://github.com/assert-rs/snapbox/tree/main/crates/snapbox) —
  Underlying snapshot testing library (handles elisions, normalization)

**Examples**:

- [demo_trycmd](https://github.com/assert-rs/snapbox/tree/main/examples/demo_trycmd) —
  Example project using trycmd

- [typos](https://github.com/crate-ci/typos) — Production project using trycmd

- [clap](https://github.com/clap-rs/clap) — CLI parser that uses trycmd for testing

### Related Documentation

- [markform](https://github.com/jlevy/markform) — Reference TypeScript CLI project

- [CLI Golden Testing
  Research](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-cli-golden-testing.md)

- [Modern TypeScript CLI
  Patterns](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-modern-typescript-cli-patterns.md)

- [Modern TypeScript Monorepo
  Patterns](https://github.com/jlevy/speculate/blob/main/docs/general/research/current/research-modern-typescript-monorepo-patterns.md)

* * *

## Appendix: trycmd Compatibility

This section documents how tryscript aligns with or diverges from trycmd.

### Correspondences (Matching trycmd)

| Feature | trycmd | tryscript | Notes |
| --- | --- | --- | --- |
| File extension | `.trycmd`, `.md` | `.tryscript.md` | Same markdown format |
| Command prefix | `$ ` | `$ ` | Identical |
| Continuation prefix | `> ` | `> ` | Identical |
| Exit code syntax | `? <code>` | `? <code>` | Identical |
| `[..]` pattern | `[^\n]*?` | `[^\n]*` | Same semantics |
| `...` pattern | `\n(([^\n]*\n)*)?` | `(?:[^\n]*\n)*` | Same semantics |
| `[EXE]` pattern | `.exe` on Windows | `.exe` on Windows | Identical |
| `[ROOT]` pattern | Test root dir | Test root dir | Identical |
| `[CWD]` pattern | Current working dir | Current working dir | Identical |
| Custom patterns | `TestCases::insert_var` | `patterns` config | Same concept |
| Merged stdout/stderr | Yes (in `.trycmd`) | Yes | Same approach |
| Temp dir per file | Yes | Yes | Identical |
| Shared temp across blocks | Yes | Yes | Identical |
| Output normalization | Line endings, trailing ws | Line endings, trailing ws | Same rules |
| Command parsing | shlex | shell: true | Similar result |

### Discrepancies (Intentional Differences)

| Feature | trycmd | tryscript | Rationale |
| --- | --- | --- | --- |
| Binary discovery | `bin.name` from Cargo.toml | Explicit `bin` path in config | Language-agnostic design |
| Config format | `.toml` + Cargo integration | `tryscript.config.ts` | TypeScript-native, type-safe RegExp |
| Update mode | `TRYCMD=overwrite` env var | `--update` CLI flag | More discoverable |
| Named exit codes | `? success`, `? failed`, `? skipped` | Numeric only (`? 0`, `? 1`) | Simpler for v1 |
| Separate stdout/stderr | `.stdout`/`.stderr` files with `.toml` | Merged only | Simpler for v1 |
| `.in/` directories | Auto-CWD from input dir | Not supported in v1 | Future work |
| `.out/` directories | File system verification | Not supported in v1 | Future work |
| TOML format | Full `.toml` test format | Not supported | Markdown-only for v1 |
| Parallel execution | Yes (via rayon) | Not in v1 | Future work |
| Binary file support | `binary = true` in TOML | Not supported | Text-only for v1 |
| Sandbox mode | `fs.sandbox = true` | Always sandboxed (temp dir) | Implicit |

### Future Alignment Opportunities

These trycmd features could be added in future versions:

1. **Named exit codes**: Add `? success` (alias for `? 0`) and `? failed` (non-zero)

2. **`.in/` and `.out/` directories**: File system verification

3. **Parallel execution**: Run test files concurrently

4. **TOML format**: Alternative structured format for complex tests
