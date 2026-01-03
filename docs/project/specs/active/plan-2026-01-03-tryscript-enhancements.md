# Plan Spec: Tryscript Bug Fixes and Enhancements

## Purpose

This is a technical design doc for addressing critical bugs and implementing key
enhancements to make tryscript more powerful, flexible, and usable. The changes
prioritize eliminating pain points discovered through real-world usage while maintaining
backward compatibility.

**Related:** Based on bug report and enhancement proposals from user testing with markform.

## Background

Tryscript is a CLI golden testing tool that parses markdown files with console code
blocks, executes commands, and compares output against expected results. While the core
functionality works well, real-world usage has revealed:

1. **Two critical bugs** that make documented features non-functional
2. **Ergonomic issues** requiring excessive path repetition and awkward workarounds
3. **Missing features** that would significantly improve test authoring

Current test files require absolute paths everywhere, manual inline setup commands, and
redundant output verification across tests. A 265-line test file could be reduced to ~60
lines with proper tooling.

## Summary of Task

### Bug Fixes (Critical)

1. **Bug 1: `bin` config parsed but never used**
   - `binPath` is computed in `createExecutionContext()` but `executeCommand()` ignores it
   - Commands like `$ my-cli --help` fail when `bin: ./my-cli` is configured
   - Fix: Modify PATH or resolve command names before execution

2. **Bug 2: Commands always run in temp directory**
   - `executeCommand()` hardcodes `cwd: ctx.tempDir`
   - All relative paths break; users must use absolute paths everywhere
   - Fix: Add `cwd` config option to control working directory

### Enhancements (Prioritized)

**High Priority (Critical for usability):**
- `cwd` option: Run commands from test file's directory instead of temp
- `binName` option: Alias binary path to a clean command name

**Medium Priority (Significant quality-of-life):**
- Variables/aliases: Define reusable values in frontmatter (`vars:`)
- Fixtures: Copy files to temp directory before tests
- Before/after hooks: Setup and teardown scripts
- Skip/focus tests: Filter tests with `<!-- skip -->`, `<!-- only -->`
- Separate stdout/stderr: Distinct assertions for each stream

**Lower Priority (Nice to have):**
- Structured assertions: Validate JSON/YAML structure
- Regex patterns: Inline regex matching with `{{/\d+/}}`
- Config includes: Share common config across test files
- Multi-command state: Persist shell state across commands in a block
- Stdin support: Pipe input to commands

## Backward Compatibility

### API Changes

| Area | Compatibility | Notes |
|------|---------------|-------|
| CLI flags | Full | No changes to existing flags |
| Frontmatter | Full | All new options are optional |
| Test syntax | Full | Existing `$`, `?`, `...`, `[..]` unchanged |
| Config files | Full | New options with sensible defaults |

### Defaults

- `cwd`: Defaults to temp directory (current behavior)
- `binName`: Not set by default (current behavior)
- `vars`: Empty by default
- All new features are opt-in

### Migration

No migration required. Existing test files continue to work unchanged.

## Stage 1: Planning Stage

### Verified Bugs

**Bug 1: `bin` config not used** - CONFIRMED in `runner.ts:45-48,115`
```typescript
// binPath computed but never used
let binPath = config.bin ?? '';
if (binPath && !binPath.startsWith('/')) {
  binPath = join(testDir, binPath);
}
// ...
const proc = spawn(command, { shell: true, cwd: ctx.tempDir }); // ignores binPath
```

**Bug 2: Commands always in temp dir** - CONFIRMED in `runner.ts:117`
```typescript
const proc = spawn(command, { cwd: ctx.tempDir, ... }); // hardcoded
```

### Feature Requirements

**Must Have (Phase 1):**
1. Fix `bin` config to actually work
2. Add `cwd` option (`"."` = test file dir, `"temp"` = temp dir [default])
3. Add `binName` option to alias bin path to command name

**Should Have (Phase 2):**
4. Add `vars` for variable substitution in commands
5. Add `fixtures` for file setup
6. Add `before`/`after` hooks

**Could Have (Phase 3):**
7. Skip/focus with heading annotations
8. Separate stdout/stderr assertions
9. Structured output assertions (json-valid, yaml-valid)

### Out of Scope

- Regex patterns with named captures (complex parsing)
- Config includes (can use config file inheritance instead)
- Multi-command shell state (significant complexity)
- Stdin heredoc support (edge case)

### Acceptance Criteria

1. **Bug fixes:**
   - `bin: ./dist/bin.mjs` + `binName: mycli` → `$ mycli --help` works
   - `cwd: .` → commands run in test file directory, relative paths work

2. **Variables:**
   - `vars: { FORM: examples/test.md }` → `$ mycli $FORM` expands correctly

3. **Fixtures:**
   - Files copied to temp before tests, cleaned up after

4. **Hooks:**
   - `before:` script runs once before all tests
   - `after:` script runs once after all tests

5. **All existing tests pass unchanged**

## Stage 2: Architecture Stage

### Current Architecture

```
src/lib/
  config.ts    - Load/merge config from files and frontmatter
  types.ts     - TypeScript types and Zod schemas
  parser.ts    - Parse markdown, extract console blocks
  runner.ts    - Execute commands, manage temp dirs
  matcher.ts   - Compare actual vs expected output
  updater.ts   - Update golden files with actual output
  reporter.ts  - Format and display results
```

### Technical Design

#### Phase 1: Bug Fixes + Core Options

**1. Fix `bin` and add `binName` (config.ts, runner.ts)**

Update `TryscriptConfig` schema:
```typescript
export interface TryscriptConfig {
  bin?: string;
  binName?: string;  // NEW: alias for bin
  cwd?: '.' | 'temp' | string;  // NEW: working directory
  env?: Record<string, string>;
  // ...existing fields
}
```

Update `ExecutionContext`:
```typescript
export interface ExecutionContext {
  tempDir: string;
  testDir: string;
  cwd: string;  // NEW: resolved working directory
  binPath: string;
  binName?: string;  // NEW
  // ...
}
```

Update `executeCommand()` to:
1. Use `ctx.cwd` instead of hardcoded `ctx.tempDir`
2. If `binName` is set, prepend `binPath` to PATH or replace command prefix

**2. Add `cwd` option (runner.ts)**

```typescript
function resolveCwd(config: TryscriptConfig, testDir: string, tempDir: string): string {
  if (!config.cwd || config.cwd === 'temp') return tempDir;
  if (config.cwd === '.') return testDir;
  return resolve(testDir, config.cwd);
}
```

#### Phase 2: Variables and Fixtures

**3. Variable expansion (new: expander.ts)**

```typescript
export function expandVars(
  text: string,
  vars: Record<string, string>,
  ctx: ExecutionContext
): string {
  const builtins = {
    TEMP: ctx.tempDir,
    ROOT: ctx.testDir,
    CWD: ctx.cwd,
  };
  const allVars = { ...builtins, ...vars };
  return text.replace(/\$(\w+)/g, (_, name) => allVars[name] ?? `$${name}`);
}
```

Apply to:
- Commands before execution
- Fixture source/dest paths
- Hook scripts

**4. Fixtures (runner.ts)**

```typescript
interface Fixture {
  source: string;
  dest: string;
}

async function setupFixtures(fixtures: Fixture[], ctx: ExecutionContext): Promise<void> {
  for (const f of fixtures) {
    const src = expandVars(f.source, ctx.vars, ctx);
    const dst = expandVars(f.dest, ctx.vars, ctx);
    await cp(src, dst, { recursive: true });
  }
}
```

**5. Before/after hooks (runner.ts)**

```typescript
async function runHook(script: string, ctx: ExecutionContext): Promise<void> {
  const expanded = expandVars(script, ctx.vars, ctx);
  await executeCommand(expanded, ctx);
}
```

Call `before` hook before first test block, `after` hook after last block.

#### Phase 3: Advanced Features

**6. Skip/focus annotations (parser.ts)**

Parse heading annotations:
```typescript
interface TestBlock {
  // ...existing
  skip?: boolean;
  only?: boolean;
  tags?: string[];
}
```

Regex: `<!-- (skip|only|tag:\w+) -->`

**7. Separate stdout/stderr (runner.ts, types.ts)**

```typescript
interface CommandResult {
  stdout: string;
  stderr: string;
  combined: string;  // current behavior
  exitCode: number;
}
```

New assertion syntax:
- `! Error message` for stderr lines
- Or separate `stdout`/`stderr` code blocks

### Files to Modify

| File | Changes |
|------|---------|
| `types.ts` | Add new config fields, Fixture/Hook types |
| `config.ts` | Update schema, merge new fields |
| `runner.ts` | Fix bin, add cwd, fixtures, hooks |
| `parser.ts` | Variable expansion, skip/focus parsing |
| `matcher.ts` | Separate stdout/stderr matching |
| `expander.ts` | NEW: Variable expansion utilities |

### Testing Strategy

1. **Unit tests** for each new feature
2. **Self-tests** (.tryscript.md) demonstrating new features
3. **Backward compatibility** - all existing tests must pass unchanged

## Stage 3: Implementation Phases

### Phase 1: Critical Bug Fixes (Foundation)

- [ ] Fix `bin` config to actually resolve binaries
- [ ] Add `binName` option for command aliasing
- [ ] Add `cwd` option for working directory control
- [ ] Update types and config schemas
- [ ] Add unit tests for new options
- [ ] Add self-tests demonstrating fixes

### Phase 2: Variables and Fixtures

- [ ] Implement `vars` frontmatter option
- [ ] Implement `$VAR` expansion in commands
- [ ] Add built-in variables: `$TEMP`, `$ROOT`, `$CWD`
- [ ] Implement `fixtures` for file setup
- [ ] Implement `before`/`after` hooks
- [ ] Add unit tests and self-tests

### Phase 3: Test Filtering and Output

- [ ] Implement skip/focus annotations in headings
- [ ] Add CLI flags: `--skip`, `--only`, `--focus`
- [ ] Separate stdout/stderr capture
- [ ] Add `!` prefix syntax for stderr assertions
- [ ] Add unit tests and self-tests

### Phase 4: Structured Assertions (Future)

- [ ] Add `json-valid` assertion block
- [ ] Add `yaml-valid` assertion block
- [ ] Add JSONPath assertions (stretch goal)

## Stage 4: Validation Stage

TBD - Will be filled after implementation.

## Open Questions

1. **Variable syntax:** Should we use `$VAR` or `${VAR}` or both?
   - Recommendation: `$VAR` for simplicity, matching shell conventions

2. **cwd values:** Should `cwd: .` be the default for better ergonomics?
   - Recommendation: Keep `temp` as default for backward compatibility

3. **stderr syntax:** Is `!` prefix intuitive, or should we use explicit blocks?
   - Recommendation: Support both for flexibility

## Dependencies

None - all changes are internal to tryscript.

## Risks

1. **Variable expansion conflicts:** Shell variables in commands might conflict
   - Mitigation: Only expand vars defined in `vars:`, pass others through

2. **Breaking changes:** New parsing might affect edge cases
   - Mitigation: Comprehensive self-test coverage before release

3. **Complexity creep:** Too many features at once
   - Mitigation: Strict phasing, ship Phase 1 first
