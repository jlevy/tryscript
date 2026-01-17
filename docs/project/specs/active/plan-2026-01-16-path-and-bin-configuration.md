# Plan Spec: PATH and Binary Configuration

**Status**: COMPLETE

## Purpose

This plan designs features to make CLI testing cleaner and more ergonomic, particularly for
testing package binaries in sandbox mode. The goal is to enable tests that read like
documentation rather than implementation details.

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

Implement complementary features for cleaner binary invocation in tests:

| Phase | Feature | Value | Complexity |
|-------|---------|-------|------------|
| I | `path` option | Generic PATH control for any binary | Low |
| II | `packageBin` option | Zero-config for Node.js packages (deprecated) | Medium |
| III | `TRYSCRIPT_PACKAGE_ROOT` env var | Project root for manual path construction | Low |
| IV | `TRYSCRIPT_GIT_ROOT` env var | Git root for non-npm projects | Low |
| V | `TRYSCRIPT_PROJECT_ROOT` env var | Most specific of package/git root | Low |
| VI | `TRYSCRIPT_PACKAGE_BIN` env var | `node_modules/.bin` directory | Low |
| VII | Env var expansion in `path:` | Composable path construction | Low |

**Note:** The preferred approach for accessing `node_modules/.bin` is now `path: [$TRYSCRIPT_PACKAGE_BIN]` rather than `packageBin: true`. This is more composable and explicit.

## Backward Compatibility

| Area | Compatibility Level | Notes |
|------|---------------------|-------|
| Config schema | Additive | New optional fields only |
| Environment variables | Additive | New variables, no changes to existing |
| Test file syntax | Unchanged | No changes to test syntax |
| Default behavior | Unchanged | Features are opt-in |

---

## Phase I: `path` Configuration Option

### Overview

Add a `path` config option that prepends directories to the PATH environment variable,
making binaries in those directories available by name.

**Use cases**:
- Built binaries in `dist/`, `build/`, or custom locations
- Non-Node binaries (Rust, Go, Python, etc.)
- Utility scripts in project directories
- Pre-existing `node_modules/.bin` directory

### Configuration

**Frontmatter**:
```yaml
---
sandbox: true
path:
  - ../dist              # Relative to test file directory
  - ../node_modules/.bin # Access installed package bins
  - /usr/local/bin       # Absolute paths supported
---
```

**Config file** (`tryscript.config.ts`):
```typescript
export default defineConfig({
  path: ['../dist'],
});
```

### Behavior

1. Paths are resolved relative to the test file directory (not the sandbox CWD)
2. Resolved paths are prepended to PATH in order (first entry has highest priority)
3. Works with or without sandbox mode
4. Paths from frontmatter and config file are concatenated (frontmatter paths first)

### Implementation

**Files to modify**:

| File | Changes |
|------|---------|
| `src/lib/types.ts` | Add `path` to `TestConfigSchema` |
| `src/lib/config.ts` | Add `path` to interface, update `mergeConfig()` |
| `src/lib/runner.ts` | Build PATH in `createExecutionContext()` |

**Schema addition** (`types.ts`):
```typescript
export const TestConfigSchema = z.object({
  // ... existing fields ...
  path: z.array(z.string()).optional(),
});
```

**Interface addition** (`config.ts`):
```typescript
export interface TryscriptConfig {
  // ... existing fields ...

  /**
   * Directories to prepend to PATH (resolved relative to test file).
   * Makes executables in these directories available by name in commands.
   */
  path?: string[];
}
```

**Merge logic** (`config.ts`):
```typescript
export function mergeConfig(base: TryscriptConfig, frontmatter: TestConfig): TryscriptConfig {
  return {
    ...base,
    ...frontmatter,
    env: { ...base.env, ...frontmatter.env },
    patterns: { ...base.patterns, ...frontmatter.patterns },
    fixtures: [...(base.fixtures ?? []), ...(frontmatter.fixtures ?? [])],
    path: [...(frontmatter.path ?? []), ...(base.path ?? [])],  // frontmatter first
  };
}
```

**PATH building** (`runner.ts`):
```typescript
import { delimiter, resolve } from 'node:path';

function buildPath(configPaths: string[] | undefined, testDir: string): string {
  const existingPath = process.env.PATH ?? '';

  if (!configPaths || configPaths.length === 0) {
    return existingPath;
  }

  // Resolve paths relative to test file directory
  const resolvedPaths = configPaths.map((p) => resolve(testDir, p));

  return [...resolvedPaths, existingPath].join(delimiter);
}

// In createExecutionContext():
const ctx: ExecutionContext = {
  // ... existing fields ...
  env: {
    ...process.env,
    ...config.env,
    ...coverageEnv,
    NO_COLOR: config.env?.NO_COLOR ?? '1',
    FORCE_COLOR: '0',
    TRYSCRIPT_TEST_DIR: testDir,
    PATH: buildPath(config.path, testDir),  // New: custom PATH
  } as Record<string, string>,
};
```

### Tests

**Unit tests** (`runner.test.ts`):
- Empty `path` config returns original PATH
- Single path is prepended correctly
- Multiple paths prepended in order
- Relative paths resolved from test directory
- Absolute paths used as-is
- Path delimiter correct for platform

**Golden test** (`tests/path-option.tryscript.md`):
```yaml
---
sandbox: true
path:
  - cli-fixtures/bin
---

# Test: Binary from custom path

Binaries in path directories are available by name.

```console
$ hello-world
Hello from custom bin!
? 0
```
```

With fixture `tests/cli-fixtures/bin/hello-world`:
```bash
#!/bin/sh
echo "Hello from custom bin!"
```

### Documentation

Update `tryscript-reference.md`:

```markdown
### path

Directories to prepend to PATH, making executables available by name.

**Type**: `string[]`
**Default**: `undefined` (use system PATH)

Paths are resolved relative to the test file directory. This is useful for:
- Testing built binaries without full paths
- Adding utility scripts to PATH
- Using `node_modules/.bin` for installed packages

**Example**:
```yaml
---
sandbox: true
path:
  - ../dist           # Your built binary
  - ../scripts        # Utility scripts
---

# Now you can call binaries by name
```console
$ my-cli --version
1.0.0
```
```
```

### Acceptance Criteria

- [x] `path: [../dist]` adds `../dist` (resolved) to PATH
- [x] Multiple paths prepended in order specified
- [x] Paths resolve relative to test file, not sandbox CWD
- [x] Works with and without sandbox mode
- [x] Config file and frontmatter paths merge correctly
- [x] Documentation updated
- [x] Tests pass

---

## Phase II: `packageBin` Configuration Option

### Overview

Add a `packageBin` config option that automatically exposes `package.json` bin entries in
PATH by creating wrapper scripts. This provides zero-config binary access for Node.js
packages.

**Use cases**:
- Testing the CLI you're developing
- Zero-config setup for npm packages
- Matching `npx`/`pnpm exec` developer experience

### Configuration

**Frontmatter**:
```yaml
---
sandbox: true
packageBin: true
---
```

**Config file** (`tryscript.config.ts`):
```typescript
export default defineConfig({
  packageBin: true,
});
```

### Behavior

1. When `packageBin: true`, find nearest `package.json` walking up from test file
2. Parse the `bin` field (supports both string and object forms)
3. Create wrapper scripts in a temp `.bin` directory within the sandbox temp dir
4. Prepend `.bin` directory to PATH (before any `path` config entries)

**package.json bin formats supported**:

```json
// String form: command name = package name
{
  "name": "my-cli",
  "bin": "./dist/cli.mjs"
}
// Result: `my-cli` command available

// Object form: explicit command names
{
  "name": "my-package",
  "bin": {
    "cmd1": "./dist/cmd1.mjs",
    "cmd2": "./dist/cmd2.js"
  }
}
// Result: `cmd1` and `cmd2` commands available
```

### Implementation

**New file**: `src/lib/package-bin.ts`

```typescript
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, extname } from 'node:path';

export interface PackageBinEntry {
  /** Command name (what user types) */
  name: string;
  /** Absolute path to the binary file */
  path: string;
}

/**
 * Find nearest package.json by walking up from startDir.
 * Returns the path to package.json, or null if not found.
 */
export async function findPackageJson(startDir: string): Promise<string | null> {
  let dir = startDir;
  const root = dirname(dir);

  while (dir !== root) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      return pkgPath;
    }
    const parent = dirname(dir);
    if (parent === dir) break;  // Reached filesystem root
    dir = parent;
  }

  // Check root directory
  const rootPkg = join(dir, 'package.json');
  if (existsSync(rootPkg)) {
    return rootPkg;
  }

  return null;
}

/**
 * Parse package.json and extract bin entries.
 * Handles both string form ("bin": "./cli.js") and object form ("bin": {"name": "./cli.js"}).
 */
export function parsePackageBin(
  pkgJson: unknown,
  pkgDir: string,
): PackageBinEntry[] {
  const pkg = pkgJson as {
    name?: string;
    bin?: string | Record<string, string>;
  };

  if (!pkg.bin) {
    return [];
  }

  if (typeof pkg.bin === 'string') {
    // String form: use package name as command name
    const name = pkg.name?.replace(/^@[^/]+\//, '') ?? 'cli';  // Strip scope
    return [{ name, path: resolve(pkgDir, pkg.bin) }];
  }

  // Object form: explicit command names
  return Object.entries(pkg.bin).map(([name, relPath]) => ({
    name,
    path: resolve(pkgDir, relPath),
  }));
}

/**
 * Create executable wrapper scripts for bin entries.
 * Wrappers handle Node.js files specially (invoke with node).
 */
export async function createBinWrappers(
  bins: PackageBinEntry[],
  binDir: string,
): Promise<void> {
  await mkdir(binDir, { recursive: true });

  for (const bin of bins) {
    const wrapperPath = join(binDir, bin.name);
    const ext = extname(bin.path).toLowerCase();

    // Generate wrapper script
    // Node.js files need to be invoked with node
    // Other files (compiled binaries) can be executed directly
    const wrapper =
      ['.js', '.mjs', '.cjs'].includes(ext)
        ? `#!/bin/sh\nexec node "${bin.path}" "$@"\n`
        : `#!/bin/sh\nexec "${bin.path}" "$@"\n`;

    await writeFile(wrapperPath, wrapper, { mode: 0o755 });
  }
}

/**
 * Set up package bin wrappers and return the bin directory path.
 * Returns null if packageBin is false or no package.json found.
 */
export async function setupPackageBin(
  enabled: boolean | undefined,
  testDir: string,
  tempDir: string,
): Promise<string | null> {
  if (!enabled) {
    return null;
  }

  const pkgPath = await findPackageJson(testDir);
  if (!pkgPath) {
    return null;  // No package.json found, silently skip
  }

  const pkgDir = dirname(pkgPath);
  const pkgContent = await readFile(pkgPath, 'utf-8');
  const pkgJson = JSON.parse(pkgContent) as unknown;

  const bins = parsePackageBin(pkgJson, pkgDir);
  if (bins.length === 0) {
    return null;  // No bin entries
  }

  const binDir = join(tempDir, '.bin');
  await createBinWrappers(bins, binDir);

  return binDir;
}
```

**Schema addition** (`types.ts`):
```typescript
export const TestConfigSchema = z.object({
  // ... existing fields ...
  path: z.array(z.string()).optional(),
  packageBin: z.boolean().optional(),
});
```

**Interface addition** (`config.ts`):
```typescript
export interface TryscriptConfig {
  // ... existing fields ...
  path?: string[];

  /**
   * Auto-expose package.json bin entries in PATH.
   * When true, finds nearest package.json and creates wrapper scripts
   * for each bin entry, making them available as commands.
   */
  packageBin?: boolean;
}
```

**Integration** (`runner.ts`):
```typescript
import { setupPackageBin } from './package-bin.js';

export async function createExecutionContext(
  config: TryscriptConfig,
  testFilePath: string,
  coverageEnv?: Record<string, string>,
): Promise<ExecutionContext> {
  // ... existing setup ...

  // Set up package bin wrappers (Phase II)
  const packageBinDir = await setupPackageBin(config.packageBin, testDir, tempDir);

  // Build PATH: packageBin dir (highest priority) > config paths > system PATH
  const pathParts: string[] = [];
  if (packageBinDir) {
    pathParts.push(packageBinDir);
  }
  if (config.path && config.path.length > 0) {
    pathParts.push(...config.path.map((p) => resolve(testDir, p)));
  }
  pathParts.push(process.env.PATH ?? '');

  const ctx: ExecutionContext = {
    // ... existing fields ...
    env: {
      ...process.env,
      ...config.env,
      ...coverageEnv,
      NO_COLOR: config.env?.NO_COLOR ?? '1',
      FORCE_COLOR: '0',
      TRYSCRIPT_TEST_DIR: testDir,
      PATH: pathParts.join(delimiter),
    } as Record<string, string>,
  };

  return ctx;
}
```

### Tests

**Unit tests** (`package-bin.test.ts`):
- `findPackageJson()` finds package.json in current directory
- `findPackageJson()` walks up directory tree
- `findPackageJson()` returns null when not found
- `parsePackageBin()` handles string form
- `parsePackageBin()` handles object form with multiple entries
- `parsePackageBin()` strips scope from package name
- `parsePackageBin()` returns empty array when no bin field
- `createBinWrappers()` creates executable wrappers
- `createBinWrappers()` uses node for .js/.mjs/.cjs files
- `createBinWrappers()` uses direct exec for other files

**Golden test** (`tests/package-bin.tryscript.md`):

Create a test fixture with its own package.json:
```
tests/cli-fixtures/pkg-with-bin/
├── package.json
└── cli.mjs
```

`package.json`:
```json
{
  "name": "test-cli",
  "bin": {
    "test-cli": "./cli.mjs"
  }
}
```

`cli.mjs`:
```javascript
console.log('test-cli v1.0.0');
```

Test file (`tests/package-bin.tryscript.md`):
```yaml
---
sandbox: true
cwd: cli-fixtures/pkg-with-bin
packageBin: true
---

# Test: packageBin exposes package.json bins

```console
$ test-cli
test-cli v1.0.0
? 0
```
```

### Documentation

Update `tryscript-reference.md`:

```markdown
### packageBin

Automatically expose package.json bin entries in PATH.

**Type**: `boolean`
**Default**: `false`

When `true`, tryscript:
1. Finds the nearest `package.json` (walking up from test file)
2. Reads the `bin` field
3. Creates wrapper scripts for each entry
4. Adds them to PATH (highest priority)

This lets you test your CLI with the same command users will use:

**Example**:

Given `package.json`:
```json
{
  "name": "my-cli",
  "bin": "./dist/cli.mjs"
}
```

Test file:
```yaml
---
sandbox: true
packageBin: true
---

# Now the binary is available by name
```console
$ my-cli --help
Usage: my-cli [options]
```
```

Supports both bin formats:
- String: `"bin": "./cli.js"` → command name from package name
- Object: `"bin": {"cmd": "./cli.js"}` → explicit command names
```

### Acceptance Criteria

- [x] `packageBin: true` creates wrappers for package.json bin entries
- [x] String form bin uses package name as command
- [x] Object form bin supports multiple commands
- [x] Scoped package names handled correctly (`@scope/name` → `name`)
- [x] Wrappers invoke Node.js for .js/.mjs/.cjs files
- [x] Wrappers exec directly for other files
- [x] packageBin paths have priority over `path` config
- [x] No error when package.json not found (silent skip)
- [x] No error when bin field empty (silent skip)
- [x] Works with sandbox mode
- [x] Documentation updated
- [x] Tests pass

---

## Phase III: `TRYSCRIPT_PACKAGE_ROOT` Environment Variable

### Overview

Add a `TRYSCRIPT_PACKAGE_ROOT` environment variable that points to the directory containing
the nearest `package.json`. This enables manual path construction for advanced use cases.

**Use cases**:
- Custom binary locations not in package.json bin
- TypeScript source files (using tsx/ts-node)
- Complex monorepo setups
- Debugging and introspection

### Behavior

1. When creating execution context, find nearest `package.json` from test file
2. If found, set `TRYSCRIPT_PACKAGE_ROOT` to the directory containing it
3. If not found, variable is not set

### Implementation

**Integration** (`runner.ts`):

```typescript
import { findPackageJson } from './package-bin.js';

export async function createExecutionContext(
  config: TryscriptConfig,
  testFilePath: string,
  coverageEnv?: Record<string, string>,
): Promise<ExecutionContext> {
  // ... existing setup ...

  // Find package root for TRYSCRIPT_PACKAGE_ROOT (Phase III)
  const pkgPath = await findPackageJson(testDir);
  const packageRoot = pkgPath ? dirname(pkgPath) : undefined;

  // Set up package bin wrappers (Phase II)
  const packageBinDir = await setupPackageBin(config.packageBin, testDir, tempDir);

  // Build PATH
  const pathParts: string[] = [];
  if (packageBinDir) {
    pathParts.push(packageBinDir);
  }
  if (config.path && config.path.length > 0) {
    pathParts.push(...config.path.map((p) => resolve(testDir, p)));
  }
  pathParts.push(process.env.PATH ?? '');

  const ctx: ExecutionContext = {
    // ... existing fields ...
    env: {
      ...process.env,
      ...config.env,
      ...coverageEnv,
      NO_COLOR: config.env?.NO_COLOR ?? '1',
      FORCE_COLOR: '0',
      TRYSCRIPT_TEST_DIR: testDir,
      PATH: pathParts.join(delimiter),
      // Phase III: package root
      ...(packageRoot && { TRYSCRIPT_PACKAGE_ROOT: packageRoot }),
    } as Record<string, string>,
  };

  return ctx;
}
```

### Tests

**Golden test** (`tests/package-root-var.tryscript.md`):
```yaml
---
sandbox: true
---

# Test: TRYSCRIPT_PACKAGE_ROOT points to package root

```console
$ echo $TRYSCRIPT_PACKAGE_ROOT
[ROOT]
? 0
```
```

(Where `[ROOT]` matches the repository root containing package.json)

### Documentation

Update `tryscript-reference.md`:

```markdown
## Environment Variables

Tryscript provides these environment variables to test commands:

| Variable | Description |
|----------|-------------|
| `TRYSCRIPT_TEST_DIR` | Directory containing the test file |
| `TRYSCRIPT_PACKAGE_ROOT` | Directory containing nearest package.json (if found) |

**Example usage**:

```yaml
---
sandbox: true
---

# Access files relative to package root
```console
$ node $TRYSCRIPT_PACKAGE_ROOT/dist/cli.mjs --help
Usage: cli [options]
```
```
```

### Acceptance Criteria

- [x] `TRYSCRIPT_PACKAGE_ROOT` set when package.json found
- [x] Points to directory containing package.json (not the file itself)
- [x] Not set when no package.json found (no error)
- [x] Walks up directory tree like Phase II
- [x] Documentation updated
- [x] Tests pass

---

## Outstanding Questions

1. **Windows compatibility**: Should wrappers be `.cmd` files on Windows?
   - **Recommendation**: Defer to future work. Current implementation uses shell scripts
     which work in Git Bash, WSL, and most CI environments.

2. **Monorepo with multiple package.json**: Which one wins?
   - **Recommendation**: Nearest package.json (walking up from test file). This matches
     npm/pnpm behavior and is intuitive for monorepo users.

3. **TypeScript bin entries**: Should we support `"bin": "./src/cli.ts"`?
   - **Recommendation**: Out of scope. Users can use `path` to add tsx/ts-node to PATH,
     or build first. Keeps implementation simple.

4. **Empty bin field warning**: Should we warn when packageBin is true but bin is empty?
   - **Recommendation**: No warning, silent skip. Enables setting `packageBin: true` in
     global config without errors for packages without bins.

---

## Phase IV-VII: Extended Environment Variables and Path Expansion

### Overview

Additional phases were added to provide a more composable and project-agnostic approach:

- **Phase IV: `TRYSCRIPT_GIT_ROOT`** - Points to nearest `.git` directory for non-npm projects
- **Phase V: `TRYSCRIPT_PROJECT_ROOT`** - Most specific of package or git root (useful for any project type)
- **Phase VI: `TRYSCRIPT_PACKAGE_BIN`** - Points to `node_modules/.bin` if it exists
- **Phase VII: Env var expansion in `path:`** - Allows `$VAR` syntax in path entries

### TRYSCRIPT_GIT_ROOT

Finds the nearest directory containing `.git` by walking up from the test file. This enables project-root-relative paths in non-npm projects (Rust, Go, Python, etc.).

**Acceptance Criteria:**
- [x] Set when `.git` directory found
- [x] Points to directory containing `.git`
- [x] Walks up directory tree
- [x] Not set when no `.git` found (no error)

### TRYSCRIPT_PROJECT_ROOT

The "most specific" project boundary - whichever of `TRYSCRIPT_PACKAGE_ROOT` or `TRYSCRIPT_GIT_ROOT` is the deepest (longest path). This is useful for tests that should work in any project type.

**Acceptance Criteria:**
- [x] Set when either package.json or .git found
- [x] Picks the deeper path when both exist
- [x] Falls back to whichever exists when only one present

### TRYSCRIPT_PACKAGE_BIN

Points to `{TRYSCRIPT_PACKAGE_ROOT}/node_modules/.bin` if it exists. This replaces the need for `packageBin: true` in most cases.

**Acceptance Criteria:**
- [x] Set when `node_modules/.bin` exists
- [x] Not set if directory doesn't exist
- [x] Works in `path:` via env var expansion

### Environment Variable Expansion in `path:`

Path entries support standard shell variable syntax (`$VAR` or `${VAR}`) to reference any environment variable.

**Example:**
```yaml
path:
  - $TRYSCRIPT_PACKAGE_BIN   # Expands to node_modules/.bin
  - $TRYSCRIPT_GIT_ROOT/bin  # Expands to git root + /bin
  - $HOME/bin                # Lowercase vars supported
  - ${MY_CUSTOM_PATH}        # Braced syntax supported
```

**Acceptance Criteria:**
- [x] `$VAR` syntax expands any env var (lowercase or uppercase)
- [x] `${VAR}` braced syntax also supported
- [x] Tryscript env vars checked first, then process env vars
- [x] Undefined vars expand to empty string
- [x] Absolute paths (after expansion) used as-is
- [x] Relative paths resolved from test directory

---

## Implementation Order

| Phase | Feature | Dependencies | Effort |
|-------|---------|--------------|--------|
| I | `path` option | None | Low |
| II | `packageBin` option | None (can reuse `findPackageJson` from III) | Medium |
| III | `TRYSCRIPT_PACKAGE_ROOT` | `findPackageJson` (can be implemented with II) | Low |
| IV | `TRYSCRIPT_GIT_ROOT` | `findGitRoot` function | Low |
| V | `TRYSCRIPT_PROJECT_ROOT` | III, IV | Low |
| VI | `TRYSCRIPT_PACKAGE_BIN` | III | Low |
| VII | Env var expansion | VI | Low |

**Recommended order**: Phase I → II + III → IV + V → VI + VII

---

## Documentation Changes

### Files to Update

| File | Changes |
|------|---------|
| `packages/tryscript/docs/tryscript-reference.md` | Add `path`, `packageBin` config options; update env vars table |
| `packages/tryscript/README.md` | Add brief mention in features list |
| `packages/tryscript/docs/tryscript-reference.md` | Add "Testing CLIs" best practices section |

### New Documentation Section: Testing CLIs

Add a new section to `tryscript-reference.md` covering best practices for different CLI types:

```markdown
## Testing CLI Applications

Tryscript provides several ways to make CLI binaries available in tests. Choose the
approach that fits your project:

### Node.js / npm Packages (Recommended: `packageBin`)

For npm packages with a `bin` field in `package.json`, use `packageBin: true` for
zero-config setup:

**package.json**:
```json
{
  "name": "my-cli",
  "bin": "./dist/cli.mjs"
}
```

**Test file**:
```yaml
---
sandbox: true
packageBin: true
---

# Test: CLI responds to --help

```console
$ my-cli --help
Usage: my-cli [options] [command]

Options:
  -V, --version  output the version number
  -h, --help     display help for command
? 0
```
```

This approach:
- Automatically reads `package.json` bin entries
- Creates wrapper scripts that invoke Node.js
- Works exactly like `npx my-cli` or `pnpm exec my-cli`

### Rust CLIs

For Rust projects, add the build output directory to PATH:

**Project structure**:
```
my-rust-cli/
├── Cargo.toml
├── src/
│   └── main.rs
├── target/
│   └── release/
│       └── my-rust-cli    # Built binary
└── tests/
    └── cli.tryscript.md
```

**Test file** (`tests/cli.tryscript.md`):
```yaml
---
sandbox: true
path:
  - ../target/release
---

# Test: Version flag

```console
$ my-rust-cli --version
my-rust-cli 1.0.0
? 0
```

# Test: Basic functionality

```console
$ my-rust-cli process input.txt
Processing input.txt...
Done.
? 0
```
```

**Tip**: Run `cargo build --release` before tests, or add it to your test script:
```json
{
  "scripts": {
    "test": "cargo build --release && tryscript run"
  }
}
```

### Python CLIs

For Python projects using entry points or scripts:

**Option 1: Virtual environment bin directory**

```yaml
---
sandbox: true
path:
  - ../.venv/bin
---

# Test: CLI installed in venv

```console
$ my-python-cli --version
my-python-cli 1.0.0
? 0
```
```

**Option 2: Direct script invocation**

```yaml
---
sandbox: true
path:
  - ../src
env:
  PYTHONPATH: $TRYSCRIPT_PACKAGE_ROOT/src
---

# Test: Run as module

```console
$ python -m my_cli --help
Usage: my_cli [options]
? 0
```
```

**Option 3: Using the script directly**

```yaml
---
sandbox: true
path:
  - ../scripts
---

# Test: Executable script with shebang

```console
$ my-script.py --help
Usage: my-script.py [options]
? 0
```
```

Make sure your script has a shebang and is executable:
```python
#!/usr/bin/env python3
# scripts/my-script.py
```

### Go CLIs

For Go projects:

```yaml
---
sandbox: true
path:
  - ../bin        # Or wherever `go build -o` outputs
---

# Test: Go CLI

```console
$ my-go-cli version
v1.0.0
? 0
```
```

### Multiple Binaries

You can combine `packageBin` with `path` for projects with multiple tools:

```yaml
---
sandbox: true
packageBin: true          # Your main CLI from package.json
path:
  - ../scripts            # Additional utility scripts
  - ../tools/bin          # Third-party tools
---
```

PATH priority (highest to lowest):
1. `packageBin` wrappers
2. `path` entries (in order specified)
3. System PATH

### Environment Variables for Manual Paths

For complex setups, use environment variables:

| Variable | Description |
|----------|-------------|
| `TRYSCRIPT_TEST_DIR` | Directory containing the test file |
| `TRYSCRIPT_PACKAGE_ROOT` | Directory containing nearest package.json |

```yaml
---
sandbox: true
---

# Manual invocation using env vars

```console
$ node $TRYSCRIPT_PACKAGE_ROOT/dist/experimental-cli.mjs --help
Experimental CLI v0.1.0
? 0
```
```

### Config File for Project-Wide Settings

Set defaults in `tryscript.config.ts` to avoid repetition:

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  // All tests get these settings by default
  packageBin: true,
  path: ['./scripts'],
  sandbox: true,
});
```

Individual test files can override or extend:

```yaml
---
# Inherits packageBin: true and sandbox: true from config
path:
  - ../extra-tools   # Added to config's path
---
```
```

### Updated Config Options Table

Update the existing config options table in `tryscript-reference.md`:

```markdown
## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | test file dir | Working directory for commands |
| `sandbox` | `boolean \| string` | `false` | Run in isolated sandbox |
| `fixtures` | `(string \| Fixture)[]` | `[]` | Files to copy to sandbox |
| `before` | `string` | - | Script to run before first test |
| `after` | `string` | - | Script to run after all tests |
| `env` | `Record<string, string>` | `{}` | Environment variables |
| `timeout` | `number` | `30000` | Command timeout in ms |
| `patterns` | `Record<string, string \| RegExp>` | `{}` | Custom output patterns |
| **`path`** | `string[]` | `[]` | **Directories to prepend to PATH** |
| **`packageBin`** | `boolean` | `false` | **Auto-expose package.json bin entries** |
```

### Updated Environment Variables Section

```markdown
## Environment Variables

Tryscript sets these environment variables for test commands:

| Variable | Description |
|----------|-------------|
| `NO_COLOR` | Set to `"1"` by default (disable colors) |
| `FORCE_COLOR` | Set to `"0"` (disable forced colors) |
| `TRYSCRIPT_TEST_DIR` | Absolute path to directory containing the test file |
| `TRYSCRIPT_PACKAGE_ROOT` | Absolute path to directory containing nearest `package.json` (if found) |

Custom environment variables can be set via `env` config:

```yaml
---
env:
  DEBUG: "1"
  API_KEY: "test-key"
---
```
```

---

## Summary

After implementation, users can choose the approach that fits their needs:

**Node.js package (zero config)**:
```yaml
packageBin: true
```

**Rust/Go/compiled binary**:
```yaml
path:
  - ../target/release    # Rust
  - ../bin               # Go
```

**Python with venv**:
```yaml
path:
  - ../.venv/bin
```

**Combined (Node + utilities)**:
```yaml
packageBin: true
path:
  - ../scripts
```

**Manual (advanced)**:
```console
$ node $TRYSCRIPT_PACKAGE_ROOT/dist/cli.mjs
```
