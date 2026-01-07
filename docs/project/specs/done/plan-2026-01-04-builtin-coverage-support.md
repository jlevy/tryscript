# Plan Spec: Built-in Code Coverage Support for CLI Testing

## Purpose

This is a technical design doc for implementing built-in code coverage support in
tryscript. The feature will streamline the collection of code coverage from CLI subprocess
execution, which is currently a significant pain point requiring manual c8 setup.

**Related:** [GitHub Issue #10](https://github.com/jlevy/tryscript/issues/10)

## Background

Tryscript is a golden testing framework for CLI applications. When users run their CLI
tools through tryscript tests, the commands execute as subprocesses. Standard coverage
tools like vitest's `--coverage` only track code executed in the main process, so CLI
code exercised via tryscript tests shows 0% coverage.

### The Problem

Currently, users must manually:
1. Install c8 as a dev dependency
2. Craft complex c8 commands with proper flags
3. Understand `NODE_V8_COVERAGE` internals
4. Add coverage directories to `.gitignore`
5. Write custom `package.json` scripts

Example of the current manual approach:
```json
{
  "scripts": {
    "test:tryscript:coverage": "c8 --src src --all --include 'dist/**' --reporter text --reporter html --reports-dir coverage-tryscript tryscript run 'tests/cli/**/*.tryscript.md'"
  }
}
```

### Real-World Impact

In the markform project, 18 tryscript tests exercise CLI commands. Without subprocess
coverage, CLI code (src/cli) shows 0-10% coverage. After adding manual c8 wrapper:
- CLI coverage becomes visible: 38.81% of dist files
- bin.mjs: 78.78% covered

This confirms tests ARE exercising the CLI, but coverage wasn't being tracked.

### How c8 Works

c8 leverages Node.js's built-in V8 coverage collection:
1. c8 sets `NODE_V8_COVERAGE` environment variable to a temp directory
2. Node.js writes coverage data (`.json` files) when each process exits
3. c8 collects coverage from all subprocesses
4. Coverage is mapped back to source files via sourcemaps

## Summary of Task

Implement a built-in `--coverage` flag for tryscript that:
1. Automatically configures subprocess coverage collection
2. Generates coverage reports after tests complete
3. Provides sensible defaults while allowing customization
4. Makes coverage discoverable via `--help` and docs

### Proposed CLI Interface

```bash
# Basic usage - enable coverage with defaults
tryscript run --coverage 'tests/**/*.tryscript.md'

# Custom output directory
tryscript run --coverage --coverage-dir my-coverage tests/*.tryscript.md

# Custom reporters
tryscript run --coverage --coverage-reporter text tests/*.tryscript.md
```

### Proposed Config Interface

```javascript
import { defineConfig } from 'tryscript';

export default defineConfig({
  coverage: {
    enabled: false,         // Enable via --coverage flag
    reportsDir: 'coverage-tryscript',
    include: ['dist/**'],
    src: 'src',
    reporters: ['text', 'html']
  }
});
```

## Backward Compatibility

| Area | Impact | Notes |
|------|--------|-------|
| CLI Interface | Additive | New `--coverage*` flags, no breaking changes |
| Config Schema | Additive | New `coverage` section, existing configs unaffected |
| Default Behavior | None | Coverage disabled by default |
| Dependencies | Soft | c8 as optional peer dependency with helpful error message |

## Stage 1: Planning Stage

### Feature Requirements

**Must Have:**
1. `--coverage` CLI flag to enable coverage collection
2. Automatic `NODE_V8_COVERAGE` configuration for spawned processes
3. Coverage report generation using c8 after tests complete
4. Sensible defaults: `text` + `html` reporters, `coverage-tryscript` output dir
5. Clear error message if c8 is not installed
6. Documentation in help output and user docs

**Should Have:**
7. `--coverage-dir <dir>` option for custom output directory
8. `--coverage-reporter <reporter>` option (repeatable) for custom reporters
9. Config file support for coverage settings
10. Coverage summary displayed after test summary

**Could Have (Future):**
11. `--coverage-include <glob>` option for custom file inclusion
12. `--coverage-threshold` for enforcement
13. Automatic coverage merging with vitest coverage

### Out of Scope

- Writing our own coverage engine (use c8)
- Bundling c8 (keep as peer dependency)
- Coverage for non-Node.js CLIs
- Browser coverage

### Acceptance Criteria

1. **Basic coverage works:**
   ```bash
   tryscript run --coverage tests/
   # Outputs coverage summary after test summary
   # Creates coverage-tryscript/ directory with reports
   ```

2. **Clear error without c8:**
   ```bash
   # If c8 not installed:
   Error: Coverage requires c8. Install with: npm install -D c8
   ```

3. **Custom options work:**
   ```bash
   tryscript run --coverage --coverage-dir my-cov --coverage-reporter text tests/
   # Creates my-cov/ directory with text reporter only
   ```

4. **Help shows coverage options:**
   ```bash
   tryscript run --help
   # Shows --coverage, --coverage-dir, --coverage-reporter
   ```

5. **Subprocess coverage captured:**
   - CLI code in `dist/` shows actual coverage %
   - All spawned commands contribute to coverage data

## Stage 2: Architecture Stage

### Current Architecture

The relevant parts of tryscript's architecture:

```
src/
  cli/
    cli.ts           - Main CLI setup (Commander.js)
    commands/
      run.ts         - Run command implementation
    lib/
      shared.ts      - CLI utilities (logging, colors)
  lib/
    runner.ts        - Command execution (spawn, env, temp dirs)
    config.ts        - Config loading and merging
    types.ts         - TypeScript types and Zod schemas
```

### Key Integration Points

1. **runner.ts:220-228** - `executeCommand()` spawns subprocesses:
   ```typescript
   const proc = spawn(command, {
     shell: true,
     cwd: ctx.cwd,
     env: ctx.env as NodeJS.ProcessEnv,
     stdio: ['ignore', 'pipe', 'pipe'],
   });
   ```
   The `env` here is where `NODE_V8_COVERAGE` needs to be set.

2. **runner.ts:71-130** - `createExecutionContext()` sets up environment:
   ```typescript
   env: {
     ...process.env,
     ...config.env,
     NO_COLOR: config.env?.NO_COLOR ?? '1',
     FORCE_COLOR: '0',
     TRYSCRIPT_TEST_DIR: testDir,
   }
   ```

3. **commands/run.ts:52-205** - `runCommand()` orchestrates tests:
   - Creates execution contexts
   - Runs test blocks
   - Cleans up and reports summary
   - This is where coverage report generation should happen

### Technical Design

#### Option A: Set NODE_V8_COVERAGE in Environment (Recommended)

**Approach:**
1. When `--coverage` is enabled, create a temp directory for coverage data
2. Set `NODE_V8_COVERAGE` in the environment passed to all subprocesses
3. After all tests complete, run `c8 report` to process the coverage files

**Advantages:**
- Clean integration with existing runner code
- No re-execution of tryscript needed
- Full control over coverage directory lifecycle
- Can integrate coverage summary with test summary

**Implementation:**

```typescript
// New file: src/lib/coverage.ts

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CoverageOptions {
  enabled: boolean;
  reportsDir: string;
  reporters: string[];
  include?: string[];
  src?: string;
}

export interface CoverageContext {
  tempDir: string;
  options: CoverageOptions;
}

export async function createCoverageContext(
  options: CoverageOptions
): Promise<CoverageContext> {
  const tempDir = await mkdtemp(join(tmpdir(), 'tryscript-coverage-'));
  return { tempDir, options };
}

export function getCoverageEnv(ctx: CoverageContext): Record<string, string> {
  return {
    NODE_V8_COVERAGE: ctx.tempDir,
  };
}

export async function generateCoverageReport(ctx: CoverageContext): Promise<void> {
  const args = [
    'report',
    '--temp-directory', ctx.tempDir,
    '--reports-dir', ctx.options.reportsDir,
    ...(ctx.options.src ? ['--src', ctx.options.src] : []),
    '--all',
    ...(ctx.options.include?.flatMap(i => ['--include', i]) ?? ['--include', 'dist/**']),
    ...ctx.options.reporters.flatMap(r => ['--reporter', r]),
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('c8', args, { stdio: 'inherit' });
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`c8 exited with ${code}`)));
    proc.on('error', reject);
  });
}

export async function cleanupCoverageContext(ctx: CoverageContext): Promise<void> {
  await rm(ctx.tempDir, { recursive: true, force: true });
}
```

**Changes to runner.ts:**

```typescript
// In createExecutionContext(), accept optional coverage env
export async function createExecutionContext(
  config: TryscriptConfig,
  testFilePath: string,
  coverageEnv?: Record<string, string>,  // NEW
): Promise<ExecutionContext> {
  // ... existing code ...

  const ctx: ExecutionContext = {
    // ...
    env: {
      ...process.env,
      ...config.env,
      ...coverageEnv,  // NEW: Add coverage env if provided
      NO_COLOR: config.env?.NO_COLOR ?? '1',
      // ...
    },
    // ...
  };

  return ctx;
}
```

**Changes to commands/run.ts:**

```typescript
interface RunOptions {
  // ... existing options ...
  coverage?: boolean;
  coverageDir?: string;
  coverageReporter?: string[];
}

// In registerRunCommand():
.option('--coverage', 'Enable code coverage collection')
.option('--coverage-dir <dir>', 'Coverage output directory (default: coverage-tryscript)')
.option('--coverage-reporter <reporter...>', 'Coverage reporters (default: text, html)')

// In runCommand():
async function runCommand(files: string[], options: RunOptions): Promise<void> {
  // Check c8 availability if coverage enabled
  let coverageCtx: CoverageContext | undefined;
  let coverageEnv: Record<string, string> = {};

  if (options.coverage) {
    if (!await isC8Available()) {
      logError('Coverage requires c8. Install with: npm install -D c8');
      process.exit(1);
    }

    coverageCtx = await createCoverageContext({
      enabled: true,
      reportsDir: options.coverageDir ?? 'coverage-tryscript',
      reporters: options.coverageReporter ?? ['text', 'html'],
    });
    coverageEnv = getCoverageEnv(coverageCtx);
  }

  // ... existing test running code ...
  // Pass coverageEnv to createExecutionContext()

  // After tests complete, generate report
  if (coverageCtx) {
    console.error('\nGenerating coverage report...');
    await generateCoverageReport(coverageCtx);
    await cleanupCoverageContext(coverageCtx);
  }

  process.exit(summary.totalFailed > 0 ? 1 : 0);
}
```

#### Option B: Re-execute Under c8

**Approach:**
When `--coverage` is passed, re-execute tryscript under c8:
```bash
c8 --temp-directory /tmp/xxx tryscript run tests/
```

**Disadvantages:**
- Requires re-exec with fork/spawn
- Less control over process lifecycle
- Harder to integrate coverage summary with test summary
- Circular dependency concerns

**Not recommended.**

### Files to Modify

| File | Changes |
|------|---------|
| `src/lib/coverage.ts` | NEW: Coverage context management and report generation |
| `src/lib/types.ts` | Add coverage config types |
| `src/lib/config.ts` | Add coverage schema and defaults |
| `src/cli/commands/run.ts` | Add `--coverage*` options, integrate coverage lifecycle |
| `src/lib/runner.ts` | Accept coverage env in createExecutionContext |
| `packages/tryscript/package.json` | Add c8 as peerDependency |
| `README.md` | Document coverage feature |

### Dependencies

- **c8**: Required as optional peer dependency
  - Already used as devDependency for testing tryscript itself
  - Users must install explicitly for coverage feature

### Testing Strategy

1. **Unit tests** for coverage module functions
2. **Integration tests** verifying coverage collection works
3. **Self-tests** (.tryscript.md) demonstrating coverage options
4. **Manual validation** with real CLI project

## Stage 3: Implementation Phases

### Phase 1: Core Coverage Infrastructure

- [ ] Create `src/lib/coverage.ts` with coverage context management
- [ ] Add coverage types to `src/lib/types.ts`
- [ ] Add coverage config schema to `src/lib/config.ts`
- [ ] Add c8 availability check utility
- [ ] Add unit tests for coverage module

### Phase 2: CLI Integration

- [ ] Add `--coverage` flag to run command
- [ ] Add `--coverage-dir` option
- [ ] Add `--coverage-reporter` option
- [ ] Integrate coverage context with test execution
- [ ] Generate coverage report after tests complete
- [ ] Display helpful error if c8 not installed

### Phase 3: Refinement and Documentation

- [ ] Add coverage section to config file support
- [ ] Add self-tests for coverage feature
- [ ] Update README with coverage documentation
- [ ] Update help output with coverage examples
- [ ] Add c8 as peerDependency in package.json

## Stage 4: Validation Stage

TBD - Will be filled after implementation.

## Open Questions

1. **Should coverage be a subcommand or flag?**
   - Decision: Flag (`--coverage`) - cleaner UX, matches vitest pattern

2. **Where should coverage temp files go?**
   - Decision: System temp directory, cleaned up after report generation

3. **Should we support all c8 options?**
   - Decision: Start with essential options (dir, reporters), add more if needed

4. **What about coverage thresholds?**
   - Decision: Future enhancement, not MVP

## Risks

1. **c8 API changes:** c8 CLI interface could change
   - Mitigation: Pin to major version in peerDependencies, test against it

2. **Cross-platform issues:** Coverage temp directory handling
   - Mitigation: Use Node's `tmpdir()` and proper path handling

3. **Performance impact:** Coverage collection adds overhead
   - Mitigation: Only enabled when `--coverage` flag used

## References

- [c8 documentation](https://github.com/bcoe/c8)
- [NODE_V8_COVERAGE](https://nodejs.org/docs/latest/api/cli.html#node_v8_coveragedir)
- [GitHub Issue #10](https://github.com/jlevy/tryscript/issues/10)
