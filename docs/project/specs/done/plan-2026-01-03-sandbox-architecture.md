# Plan Spec: Sandbox Architecture Implementation

**Status: COMPLETED** (2026-01-03)

## Purpose

This plan covers the implementation of the simplified sandbox architecture for tryscript,
removing deprecated features and adding explicit sandbox isolation support.

**Architecture Doc**: `docs/project/architecture/current/arch-tryscript-language.md`

## Background

The tryscript design was reviewed and simplified to follow trycmd's explicit isolation model.
Key changes:
- Remove redundant `bin`, `binName`, `vars` options (use `env` instead, let shell handle `$VAR`)
- Remove magic `cwd: "temp"` keyword in favor of explicit `sandbox` option
- Add `sandbox: boolean | path` for explicit test isolation

This aligns with the "shell delegation" philosophy where commands run in a real shell and
tryscript doesn't preprocess variables or commands.

## Summary of Task

Implement the sandbox architecture changes across all tryscript components:

1. **Remove deprecated options**: `bin`, `binName`, `vars`, `cwd: "temp"` magic
2. **Add sandbox option**: `sandbox: boolean | path` for explicit isolation
3. **Update documentation**: `tryscript-reference.md` and CLI help
4. **Update all tests**: Remove deprecated feature tests, add sandbox tests

## Backward Compatibility

**Breaking Changes**: Yes, this is a new library without backward compatibility requirements.

| Area | Compatibility Level | Notes |
|------|---------------------|-------|
| `bin`/`binName` | Removed | Use `env: { CLI: ./path }` then `$CLI` |
| `vars` | Removed | Use `env` (shell handles `$VAR` expansion) |
| `cwd: "temp"` | Removed | Use `sandbox: true` |

## Stage 1: Planning Stage

### Features to Remove

| Option | Current Location | Why Removed |
|--------|-----------------|-------------|
| `bin` | config.ts, types.ts, runner.ts | Redundant with relative paths |
| `binName` | config.ts, types.ts, runner.ts | Redundant with `env` + shell vars |
| `vars` | config.ts, types.ts, runner.ts | Conflicts with shell's `$VAR` |
| `cwd: "temp"` | runner.ts:resolveCwd | Magic keyword, use `sandbox` |
| `expandVars()` | runner.ts | Shell handles `$VAR` expansion |

### Features to Add

| Feature | Description |
|---------|-------------|
| `sandbox: false` | Default: run in `cwd` directory (no isolation) |
| `sandbox: true` | Create empty temp dir, run commands there |
| `sandbox: ./path` | Copy path to temp dir, run commands there |

### Scope

**In Scope:**
- Remove deprecated options from types, config, runner
- Add sandbox option with boolean and path support
- Update tryscript-reference.md to match architecture doc
- Update existing tests to remove deprecated feature usage
- Add new tests for sandbox functionality

**Out of Scope:**
- CLI interface changes (no new flags)
- Reporter changes
- Any new features beyond sandbox

## Stage 2: Architecture Stage

### Files to Modify

```
packages/tryscript/src/lib/
├── types.ts          # Remove vars, bin, binName from schema; add sandbox
├── config.ts         # Remove Fixture interface docs referencing $VAR; add sandbox
├── runner.ts         # Remove expandVars, resolveCwd magic; add sandbox logic
└── matcher.ts        # No changes needed (patterns unchanged)

packages/tryscript/src/cli/
└── commands/run.ts   # Remove vars expansion in run loop

packages/tryscript/docs/
└── tryscript-reference.md  # Update to match architecture doc

packages/tryscript/tests/
├── runner.test.ts    # Update tests for sandbox
└── golden/           # Update golden tests
```

### Sandbox Implementation

```typescript
// In runner.ts
interface ExecutionContext {
  tempDir: string;      // Always created (for cleanup)
  testDir: string;      // Directory containing test file
  cwd: string;          // Working directory (testDir, config.cwd, or sandbox)
  sandbox: boolean;     // Whether running in sandbox mode
  env: Record<string, string>;
  timeout: number;
  before?: string;
  after?: string;
  beforeRan?: boolean;
}

async function createExecutionContext(
  config: TryscriptConfig,
  testFilePath: string,
): Promise<ExecutionContext> {
  const rawTempDir = await mkdtemp(join(tmpdir(), 'tryscript-'));
  const tempDir = await realpath(rawTempDir);
  const testDir = resolve(dirname(testFilePath));

  let cwd: string;
  let sandbox = false;

  if (config.sandbox === true) {
    // Empty sandbox
    cwd = tempDir;
    sandbox = true;
  } else if (typeof config.sandbox === 'string') {
    // Copy directory to sandbox
    const srcPath = resolve(testDir, config.sandbox);
    await cp(srcPath, tempDir, { recursive: true });
    cwd = tempDir;
    sandbox = true;
  } else if (config.cwd) {
    // Run in specified directory
    cwd = resolve(testDir, config.cwd);
  } else {
    // Default: run in test file directory
    cwd = testDir;
  }

  // Copy fixtures to sandbox (only if sandbox enabled)
  if (sandbox && config.fixtures) {
    await setupFixtures(config.fixtures, testDir, tempDir);
  }

  return { tempDir, testDir, cwd, sandbox, env, timeout, before, after };
}
```

### Documentation Updates

The `tryscript-reference.md` must be updated to:
1. Remove `bin`, `binName`, `vars` from config options
2. Add `sandbox` option with examples
3. Update config file example
4. Clarify that shell handles `$VAR` expansion via `env`

## Stage 3: Implementation Phase

### Phase 1: Remove Deprecated Features

- [x] **types.ts**: Remove `bin`, `binName`, `vars` from TestConfigSchema
- [x] **config.ts**: Remove `bin`, `binName`, `vars` from TryscriptConfig interface
- [x] **config.ts**: Remove `vars` merging from mergeConfig()
- [x] **runner.ts**: Remove `expandVars()` function
- [x] **runner.ts**: Remove `binPath`, `binName`, `vars` from ExecutionContext
- [x] **runner.ts**: Remove `resolveCommand()` function (binName handling)
- [x] **runner.ts**: Remove `cwd: "temp"` magic in resolveCwd()
- [x] **run.ts**: No changes needed (vars expansion was in runner.ts)

### Phase 2: Add Sandbox Feature

- [x] **types.ts**: Add `sandbox` to TestConfigSchema (`z.union([z.boolean(), z.string()])`)
- [x] **config.ts**: Add `sandbox` to TryscriptConfig interface
- [x] **runner.ts**: Add `sandbox` to ExecutionContext
- [x] **runner.ts**: Implement sandbox logic in createExecutionContext()
- [x] **runner.ts**: Update fixtures to only copy when sandbox enabled
- [x] **runner.ts**: `[CWD]` pattern matches sandbox directory when enabled (via ctx.cwd)

### Phase 3: Update Documentation

- [x] **tryscript-reference.md**: Remove deprecated options (bin, binName, vars)
- [x] **tryscript-reference.md**: Add sandbox section with examples
- [x] **tryscript-reference.md**: Update config options table
- [x] **tryscript-reference.md**: Update config file example
- [x] **tryscript-reference.md**: Add fixtures section (requires sandbox)

### Phase 4: Update Tests

- [x] Update test files that use `bin`, `binName`, `vars` to use `env`
- [x] Update test files that use `cwd: temp` to use `sandbox: true`
- [x] Add unit test for `sandbox: true` (empty sandbox)
- [x] Add unit test for `sandbox: ./path` (copy to sandbox)
- [x] Update unit tests in runner.test.ts
- [x] Run all tests to verify no regressions (51 tests pass)

## Validation Checklist

- [x] All 51 unit tests pass
- [x] All golden tests pass
- [x] `tryscript docs` shows updated reference
- [x] `sandbox: true` creates empty temp dir
- [x] `sandbox: ./path` copies directory to temp
- [x] `cwd: ./path` runs directly (no sandbox)
- [x] `env` variables work with shell expansion
- [x] Fixtures copy correctly when sandbox enabled
