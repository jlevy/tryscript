# Plan Spec: PATH and Binary Configuration

## Purpose

This plan analyzes and designs features to make CLI testing cleaner and more ergonomic,
particularly for testing package binaries in sandbox mode. The goal is to enable tests that
read like documentation rather than implementation details.

**Related Issue**: [#32 - Feature: Add packageBin option to automatically expose package.json
bin entries in PATH](https://github.com/jlevy/tryscript/issues/32)

## Background

When testing CLI tools with tryscript in sandbox mode, users face a friction point: the
current working directory is a temporary sandbox, so relative paths to the binary don't work.
This leads to verbose, hard-to-read test commands:

```console
$ node $TRYSCRIPT_TEST_DIR/../dist/bin.mjs create "task"
✓ Created task
```

Ideally, tests should read like user documentation:

```console
$ bd create "task"
✓ Created task
```

### Current Workarounds

Users can use `before` hooks to create wrapper scripts:

```yaml
before: |
  printf '#!/bin/bash\nexec node "$TRYSCRIPT_TEST_DIR/../dist/bin.mjs" "$@"\n' > bd
  chmod +x bd
```

This works but requires boilerplate in every test file and obscures the test's intent.

### Design Philosophy

Following tryscript's existing philosophy:

- **Shell delegation**: Let the shell handle execution details (environment variables, PATH)
- **Zero magic**: Explicit configuration over implicit behavior
- **npm conventions**: Leverage existing standards where possible
- **Simple things simple, complex things possible**: Common cases should require minimal
  config, advanced cases should be achievable

## Summary of Task

Design and implement one or more features to enable cleaner binary invocation in tests:

1. **Analyze approaches** for PATH/binary configuration
2. **Recommend a phased implementation** starting with highest-value features
3. **Ensure flexibility** for both Node packages and other binaries

## Backward Compatibility

| Area | Compatibility Level | Notes |
|------|---------------------|-------|
| Config schema | Additive | New optional fields only |
| Environment variables | Additive | New variables, no changes to existing |
| Test file syntax | Unchanged | No changes to test syntax |
| Default behavior | Unchanged | Features are opt-in |

## Stage 1: Planning Stage

### Problem Analysis

**Core problem**: In sandbox mode, test commands cannot easily reference the package binary
because:

1. CWD is a temp directory (sandbox isolation)
2. `$TRYSCRIPT_TEST_DIR` points to test file location, not package root
3. PATH doesn't include the package's bin directory

**Use cases to support**:

1. **Node.js packages** with `bin` entries in package.json (most common)
2. **Built binaries** in `dist/`, `build/`, or custom locations
3. **Non-Node binaries** (Rust, Go, Python, etc.)
4. **Monorepo packages** where binary is in a different package
5. **Multiple binaries** in a single package

### Approaches Analyzed

#### Approach A: `packageBin` Option (Proposed in Issue #32)

Automatically expose package.json `bin` entries in PATH.

**Configuration**:
```yaml
---
sandbox: true
packageBin: true
---
```

**How it works**:
1. Find nearest `package.json` from test file directory
2. Read `bin` field (string or object form)
3. Create wrapper scripts or symlinks in a temp `.bin` directory
4. Prepend `.bin` directory to PATH

**Pros**:
- Zero-config for standard npm packages
- Uses existing npm convention
- Matches `npx`/`pnpm exec` developer experience
- Handles both `"bin": "./cli.js"` and `"bin": { "name": "./cli.js" }` forms

**Cons**:
- Node.js/npm specific
- Requires Node.js runtime for execution (even if binary is compiled)
- Doesn't help non-Node packages

**Complexity**: Medium (package.json parsing, wrapper generation)

---

#### Approach B: Enhanced Environment Variables

Add more environment variables to make path construction easier.

**New variables**:
```
TRYSCRIPT_PACKAGE_ROOT  - Root of nearest package.json
TRYSCRIPT_BIN_DIR       - Package's bin directory if defined
TRYSCRIPT_DIST          - Package's dist/build directory
```

**Example usage**:
```console
$ node $TRYSCRIPT_PACKAGE_ROOT/dist/bin.mjs create "task"
```

**Pros**:
- Simple to implement
- Works for any language
- No new configuration needed
- Backwards compatible

**Cons**:
- Still verbose commands
- Doesn't solve the ergonomics problem
- Variable names may not match actual project structure

**Complexity**: Low

---

#### Approach C: `path` Configuration Option

Allow users to prepend custom directories to PATH.

**Configuration**:
```yaml
---
sandbox: true
path:
  - ../dist           # Relative to test file
  - /usr/local/bin    # Absolute paths
---
```

**How it works**:
1. Resolve paths relative to test file directory
2. Prepend to PATH in execution environment

**Pros**:
- Language-agnostic
- Explicit control over PATH
- Works with any binary location
- Simple mental model

**Cons**:
- Requires manual configuration
- Doesn't handle Node.js `bin` field conventions
- User must know binary location

**Complexity**: Low

---

#### Approach D: `bin` Configuration (Command Aliases)

Allow explicit command-to-binary mappings.

**Configuration**:
```yaml
---
sandbox: true
bin:
  bd: ../dist/bin.mjs           # Generates wrapper script
  bd: node ../dist/bin.mjs      # Or explicit command
---
```

**How it works**:
1. For each entry, create executable wrapper in sandbox
2. Wrappers resolve paths relative to test directory

**Pros**:
- Explicit control
- Works with any runtime
- Can alias to complex commands

**Cons**:
- Duplicates package.json bin field
- More configuration to maintain
- Risk of drift from actual package setup

**Complexity**: Medium

---

#### Approach E: Before Hook Utilities

Provide helper functions for common patterns.

**Configuration**:
```yaml
---
sandbox: true
before: tryscript:expose-package-bin
---
```

Or shell functions:
```yaml
---
sandbox: true
before: |
  eval "$(tryscript --export-bin-helpers)"
---
```

**Pros**:
- Composable
- No new config fields
- Leverages existing `before` mechanism

**Cons**:
- Less discoverable
- More verbose than dedicated option
- Relies on shell-specific syntax

**Complexity**: Low to Medium

---

### Comparative Analysis

| Approach | Node Packages | Other Binaries | Ergonomics | Complexity |
|----------|---------------|----------------|------------|------------|
| A: packageBin | ★★★ | ✗ | ★★★ | Medium |
| B: Env vars | ★★ | ★★ | ★ | Low |
| C: path option | ★★ | ★★★ | ★★ | Low |
| D: bin aliases | ★★ | ★★★ | ★★★ | Medium |
| E: Hook utils | ★★ | ★★ | ★ | Low |

### Recommended Strategy

**Implement multiple complementary features** in phases, prioritizing high-value, low-risk
additions:

1. **Phase 1: `path` option** (Low complexity, high flexibility)
   - Works for all languages
   - Simple implementation
   - Provides immediate value

2. **Phase 2: `packageBin` option** (Medium complexity, best Node.js experience)
   - Zero-config for npm packages
   - Builds on Phase 1 infrastructure
   - Most requested feature

3. **Phase 3 (Optional): Additional environment variables**
   - `TRYSCRIPT_PACKAGE_ROOT` for advanced use cases
   - Backwards compatible enhancement

### Scope Definition

**In Scope**:
- `path` config option (array of paths to prepend to PATH)
- `packageBin` config option (boolean to auto-expose package.json bins)
- Documentation and examples
- Tests for new features

**Out of Scope**:
- Command aliases (`bin` config) - can be added later if needed
- Cross-package bin resolution in monorepos (defer to explicit `path`)
- Windows-specific handling beyond basic compatibility

**Non-Goals**:
- Replacing shell's PATH mechanism
- Auto-detecting binary locations without configuration
- Supporting every edge case of package.json bin field

## Stage 2: Architecture Stage

### Configuration Schema Changes

```typescript
// In config.ts
export interface TryscriptConfig {
  // ... existing fields ...

  /**
   * Directories to prepend to PATH (resolved relative to test file).
   * Makes binaries in these directories available by name.
   */
  path?: string[];

  /**
   * Auto-expose package.json bin entries in PATH.
   * When true, finds nearest package.json and makes its bin commands available.
   */
  packageBin?: boolean;
}
```

### Implementation Architecture

#### Phase 1: `path` Option

**Files to modify**:
- `packages/tryscript/src/lib/types.ts` - Add `path` to schema
- `packages/tryscript/src/lib/config.ts` - Add `path` to interface and merge logic
- `packages/tryscript/src/lib/runner.ts` - Prepend paths to PATH env var

**Implementation**:
```typescript
// In runner.ts createExecutionContext()
function buildPath(config: TryscriptConfig, testDir: string): string {
  const existingPath = process.env.PATH ?? '';

  if (!config.path || config.path.length === 0) {
    return existingPath;
  }

  // Resolve paths relative to test directory
  const resolvedPaths = config.path.map(p => resolve(testDir, p));

  return [...resolvedPaths, existingPath].join(delimiter);
}
```

#### Phase 2: `packageBin` Option

**Files to modify**:
- `packages/tryscript/src/lib/types.ts` - Add `packageBin` to schema
- `packages/tryscript/src/lib/config.ts` - Add `packageBin` to interface
- `packages/tryscript/src/lib/runner.ts` - Package.json detection and bin setup
- New: `packages/tryscript/src/lib/package-bin.ts` - Package.json bin utilities

**Implementation approach**:

1. **Find package.json**: Walk up from test file directory
2. **Parse bin field**: Handle both string and object forms
3. **Create bin directory**: Temp directory with wrapper scripts
4. **Generate wrappers**:
   - For `.js`/`.mjs` files: Node.js wrapper
   - For other files: Direct execution wrapper
5. **Prepend to PATH**: Add bin directory to PATH

```typescript
// New file: package-bin.ts
interface PackageBin {
  name: string;
  path: string;  // Absolute path to binary
}

export async function findPackageJson(startDir: string): Promise<string | null> {
  let dir = startDir;
  while (dir !== dirname(dir)) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      return pkgPath;
    }
    dir = dirname(dir);
  }
  return null;
}

export function parsePackageBin(pkgJson: unknown, pkgDir: string): PackageBin[] {
  const pkg = pkgJson as { name?: string; bin?: string | Record<string, string> };

  if (!pkg.bin) return [];

  if (typeof pkg.bin === 'string') {
    // "bin": "./cli.js" - use package name
    const name = pkg.name ?? 'cli';
    return [{ name, path: resolve(pkgDir, pkg.bin) }];
  }

  // "bin": { "cmd1": "./a.js", "cmd2": "./b.js" }
  return Object.entries(pkg.bin).map(([name, relPath]) => ({
    name,
    path: resolve(pkgDir, relPath),
  }));
}

export async function createBinWrappers(
  bins: PackageBin[],
  binDir: string,
): Promise<void> {
  await mkdir(binDir, { recursive: true });

  for (const bin of bins) {
    const wrapperPath = join(binDir, bin.name);
    const ext = extname(bin.path);

    // Generate appropriate wrapper
    let wrapper: string;
    if (['.js', '.mjs', '.cjs'].includes(ext)) {
      wrapper = `#!/bin/sh\nexec node "${bin.path}" "$@"\n`;
    } else {
      wrapper = `#!/bin/sh\nexec "${bin.path}" "$@"\n`;
    }

    await writeFile(wrapperPath, wrapper, { mode: 0o755 });
  }
}
```

### Environment Variable Additions (Phase 3)

```typescript
// In runner.ts
env: {
  ...process.env,
  ...config.env,
  NO_COLOR: config.env?.NO_COLOR ?? '1',
  FORCE_COLOR: '0',
  TRYSCRIPT_TEST_DIR: testDir,
  // New: package root if found
  ...(packageRoot && { TRYSCRIPT_PACKAGE_ROOT: packageRoot }),
},
```

### Test Strategy

**Unit tests**:
- `path` resolution (relative, absolute, mixed)
- `packageBin` parsing (string form, object form, no bin)
- PATH construction (prepending, delimiter handling)
- Wrapper generation (Node files, other files)

**Golden tests**:
- `path` option with sandbox
- `packageBin` with test package
- Combined `path` and `packageBin`
- Edge cases (missing package.json, empty bin field)

## Stage 3: Implementation Phase

### Phase 1: `path` Configuration Option

- [ ] Add `path` field to `TestConfigSchema` in types.ts
- [ ] Add `path` field to `TryscriptConfig` interface in config.ts
- [ ] Add `path` merging in `mergeConfig()` (concatenate arrays)
- [ ] Implement PATH building in runner.ts `createExecutionContext()`
- [ ] Add unit tests for path resolution
- [ ] Add golden test demonstrating `path` usage
- [ ] Update tryscript-reference.md documentation

### Phase 2: `packageBin` Configuration Option

- [ ] Create `packages/tryscript/src/lib/package-bin.ts`
- [ ] Implement `findPackageJson()` function
- [ ] Implement `parsePackageBin()` function
- [ ] Implement `createBinWrappers()` function
- [ ] Add `packageBin` field to schema and interface
- [ ] Integrate into runner.ts `createExecutionContext()`
- [ ] Add unit tests for package-bin.ts
- [ ] Add golden test with test package.json
- [ ] Update tryscript-reference.md documentation

### Phase 3: Environment Variable Enhancement (Optional)

- [ ] Add `TRYSCRIPT_PACKAGE_ROOT` environment variable
- [ ] Document new environment variable
- [ ] Add test coverage

## Outstanding Questions

1. **Windows compatibility**: Should wrappers be `.cmd` files on Windows?
   - Recommendation: Yes, detect platform and generate appropriate wrapper

2. **Monorepo support**: Should `packageBin` search parent directories?
   - Recommendation: Yes, walk up until package.json found (matches npm behavior)

3. **Binary detection**: For non-.js files, should we check if file is executable?
   - Recommendation: No, trust the package.json; user error if misconfigured

4. **TypeScript sources**: Should we support `"bin": "./src/cli.ts"` with tsx?
   - Recommendation: Out of scope for Phase 2; users can use `path` option

## Acceptance Criteria

### Phase 1 (`path` option)
- [ ] Tests can specify `path: [../dist]` to add directory to PATH
- [ ] Paths resolve correctly relative to test file
- [ ] Works with sandbox mode
- [ ] Documentation updated

### Phase 2 (`packageBin` option)
- [ ] Tests can specify `packageBin: true` to expose package.json bins
- [ ] Both string and object bin forms work
- [ ] Generated wrappers execute correctly
- [ ] Works with sandbox mode
- [ ] Documentation updated

### Phase 3 (Environment variables)
- [ ] `TRYSCRIPT_PACKAGE_ROOT` available when package.json found
- [ ] Documentation updated

## Example Usage After Implementation

### Simple Node Package Testing

```yaml
---
sandbox: true
packageBin: true
---

# Test: CLI Help

```console
$ my-cli --help
Usage: my-cli [options] [command]
...
? 0
```
```

### Custom Binary Location

```yaml
---
sandbox: true
path:
  - ../build/release
---

# Test: Rust CLI

```console
$ my-rust-cli --version
my-rust-cli 1.0.0
? 0
```
```

### Combined Approach

```yaml
---
sandbox: true
packageBin: true
path:
  - ../scripts  # Additional utility scripts
env:
  DEBUG: "1"
---
```
