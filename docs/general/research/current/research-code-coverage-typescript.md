# Code Coverage Best Practices for TypeScript with Vitest

## Research Date

2025-12-23 (initial), 2026-01-07 (updated with NODE_V8_COVERAGE investigation)

## Tool Versions Researched

| Tool | Version | Notes |
| --- | --- | --- |
| Vitest | 4.0.16 | Testing framework |
| @vitest/coverage-v8 | 4.0.16 | V8-based coverage (recommended) |
| TypeScript | 5.9.3 | Language version |
| c8 | 10.1.3 | V8 coverage CLI |
| monocart-coverage-reports | 2.12.9 | AST-aware coverage merging |
| tryscript | 0.1.2 | Golden testing with coverage support |

## Executive Summary

This document covers comprehensive code coverage strategies for TypeScript projects, including:

1. **Unit test coverage** with Vitest's built-in V8 provider
2. **CLI/subprocess coverage** using NODE_V8_COVERAGE and tryscript
3. **Multi-source coverage merging** for projects with both unit tests and CLI tests

Key finding: **Vitest 4.x works correctly with NODE_V8_COVERAGE**, allowing unified coverage collection from both vitest unit tests and CLI subprocess tests using `tryscript coverage`.

## V8 Coverage Architecture

### How NODE_V8_COVERAGE Works

Node.js has built-in V8 coverage collection via the `NODE_V8_COVERAGE` environment variable:

```bash
# Node writes coverage JSON files to the specified directory
NODE_V8_COVERAGE=/tmp/coverage node my-script.js
ls /tmp/coverage/
# coverage-12345-1234567890123-0.json
```

**Key characteristics:**
- Coverage files are written when the Node process exits
- Multiple processes writing to the same directory produces multiple files
- Files can be merged using tools like c8 or monocart
- Each file contains V8's raw coverage data (script URLs, function ranges, block counts)

**References:**
- [Node.js V8 Coverage Documentation](https://nodejs.org/api/cli.html#node_v8_coveragedir)
- [V8 Coverage Format](https://v8.dev/blog/javascript-code-coverage)

### Coverage Collection Methods

| Method | How It Works | Use Case |
|--------|--------------|----------|
| **Vitest --coverage** | Uses `node:inspector` API directly | Unit tests |
| **NODE_V8_COVERAGE** | Environment variable triggers file output | CLI/subprocess tests |
| **c8** | Sets NODE_V8_COVERAGE, spawns process, reads files | Wrapping any command |

## Vitest 4.x and NODE_V8_COVERAGE Investigation

### Background

[Vitest PR #2786](https://github.com/vitest-dev/vitest/pull/2786) changed vitest to use `node:inspector` directly for its own coverage collection instead of relying on NODE_V8_COVERAGE. This raised questions about whether vitest coverage could be captured via NODE_V8_COVERAGE for merging with subprocess coverage.

Previous research (see [Markform coverage merging research](https://github.com/jlevy/markform)) suggested that "Vite transforms and loads modules in a way that V8's native coverage collector cannot track."

### Investigation (2026-01-07)

**Test 1: Does vitest write to NODE_V8_COVERAGE?**

```bash
rm -rf /tmp/test-coverage
NODE_V8_COVERAGE=/tmp/test-coverage pnpm vitest run
ls -la /tmp/test-coverage/
```

**Results:** 12 files totaling ~10 MB were produced.

**Test 2: What do these coverage files contain?**

```python
# Inspect coverage file contents
for each coverage file:
    src_matches = files matching '/src/*.ts'      # TypeScript sources
    dist_matches = files matching '/dist/'         # Compiled JavaScript
```

**Results:**

| Coverage File | src/*.ts files | dist/ files |
|---------------|----------------|-------------|
| Main vitest process | 0 | 1 |
| Worker processes | 0 | 74+ |
| CLI subprocess spawns | 0 | 92 |

**Key Finding: NODE_V8_COVERAGE captures coverage for compiled `dist/` files, NOT original `src/*.ts` files.**

### Understanding the Coverage Flow

The complete picture of how coverage works:

```
┌─────────────────────────────────────────────────────────────────┐
│                    VITEST UNIT TESTS                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ vitest --coverage                                        │   │
│  │ Uses: node:inspector API                                 │   │
│  │ Captures: Vite-transformed code → maps to src/*.ts       │   │
│  │ Output: coverage/lcov.info (via @vitest/coverage-v8)     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    CLI SUBPROCESS TESTS                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ NODE_V8_COVERAGE=/tmp/cov node dist/bin.mjs             │   │
│  │ Uses: V8 native coverage                                 │   │
│  │ Captures: dist/*.mjs files                               │   │
│  │ Output: /tmp/cov/coverage-*.json                         │   │
│  │ Requires: sourcemaps to map back to src/*.ts             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    MERGED COVERAGE                              │
│  c8/monocart reads V8 JSON files → remaps via sourcemaps →     │
│  generates unified report showing src/*.ts coverage             │
└─────────────────────────────────────────────────────────────────┘
```

### Why It Works in tryscript

When running `tryscript coverage "pnpm vitest run" "node dist/bin.mjs run tests/"`:

1. **Vitest command**: NODE_V8_COVERAGE captures coverage from:
   - Vitest worker processes
   - **CLI integration tests** that spawn `node dist/bin.mjs` as subprocesses
   - The coverage is for `dist/` files, remapped to `src/` via sourcemaps

2. **Tryscript golden tests**: NODE_V8_COVERAGE captures coverage from:
   - Each `node dist/bin.mjs` subprocess spawned by tryscript
   - Again, `dist/` files remapped to `src/`

3. **Merged result**: c8/monocart combines all V8 coverage files and generates a unified report.

### Validation Test Results

```bash
pnpm test:coverage
# Runs: tryscript coverage --monocart "pnpm vitest run" "node dist/bin.mjs run tests/"
```

| Source | Coverage Files | Data Size | What's Captured |
|--------|---------------|-----------|-----------------|
| `pnpm vitest run` | 11 files | 8,194 KB | vitest workers + CLI integration subprocesses |
| `tryscript run tests/` | 59 files (new) | 23,477 KB | golden test subprocesses |
| **Merged total** | 70 files | 31,672 KB | **85.96% statements** |

### Reconciliation with Markform Research

The [Markform coverage merging research](https://github.com/jlevy/markform) identified important issues:

| Finding | Status | Notes |
|---------|--------|-------|
| Vitest uses `node:inspector`, not NODE_V8_COVERAGE | **Confirmed** | Vitest's own coverage uses inspector API |
| NODE_V8_COVERAGE can't capture vitest's coverage | **Partially correct** | It can't capture vitest's internal unit test coverage, but DOES capture subprocess coverage |
| Line count inflation (5x) with c8 vs vitest | **Confirmed** | Solved by using `--monocart` flag |
| Different V8-to-Istanbul converters cause discrepancy | **Confirmed** | `ast-v8-to-istanbul` vs `v8-to-istanbul` |

**Resolution**: The `--monocart` flag addresses line count inflation by using AST-aware counting (~90% alignment with vitest). For projects with CLI integration tests, NODE_V8_COVERAGE captures subprocess coverage even when vitest is the test runner.

## Coverage Metrics

### Essential Metrics

- **Statements**: Percentage of statements executed
- **Branches**: Percentage of conditional branches taken
- **Functions**: Percentage of functions called
- **Lines**: Percentage of lines executed

### Recommended Thresholds

| Metric | Starting | Target | Notes |
| --- | --- | --- | --- |
| Statements | 70% | 80-90% | Catch untested code paths |
| Branches | 65% | 75-85% | Critical for TypeScript with union types |
| Functions | 70% | 80-90% | Ensure all exported APIs are tested |
| Lines | 70% | 80-90% | General code execution coverage |

### Why Branch Coverage Matters for TypeScript

Branch coverage is especially important in TypeScript due to:

- Union types (`string | null`)
- Optional chaining (`obj?.prop`)
- Conditional types
- Type guards
- Nullish coalescing (`??`)

Low branch coverage often indicates untested error paths and edge cases.

## Coverage Configuration

### Include/Exclude Patterns

**Always Exclude:**

- Generated files (`**/_generated/**`, `**/*.generated.ts`)
- Type definitions (`**/*.d.ts`)
- Test files themselves (`**/*.test.ts`, `**/__tests__/**`)
- Config files (`**/*.config.ts`, `**/vitest.setup.ts`)
- Build outputs (`**/dist/**`, `**/node_modules/**`)
- Migration files (if not testing migrations)
- Mocks and fixtures (`**/__mocks__/**`, `**/__fixtures__/**`)

**Include:**

- Source code directories (`src/**/*.ts`, `lib/**/*.ts`)
- Exclude test files from coverage calculation

### Reporter Configuration

**Recommended Reporters:**

| Reporter | Purpose |
| --- | --- |
| `text` | Terminal output for CI/quick checks |
| `text-summary` | Brief summary in terminal |
| `html` | Detailed visual reports for local dev |
| `json` | Machine-readable for CI/CD integration |
| `json-summary` | Machine-readable summary (`coverage-summary.json`) for PR annotations |
| `lcov` | Standard format for Codecov/Coveralls |

## Vitest Configuration

### Installation

```bash
# npm
npm install -D vitest @vitest/coverage-v8

# pnpm
pnpm add -D vitest @vitest/coverage-v8
```

### Example Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        '**/_generated/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/tests/**',
        '**/__mocks__/**',
        '**/*.config.*',
        '**/vitest.setup.ts',
        '**/dist/**',
        '**/node_modules/**',
      ],
      include: ['src/**/*.ts', 'lib/**/*.ts'],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
      // Enable per-file threshold checking
      perFile: true,
    },
  },
});
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:coverage:watch": "vitest --coverage",
    "test:coverage:html": "vitest run --coverage && open coverage/index.html"
  }
}
```

## Multi-Source Coverage: Vitest + CLI Tests

### The Challenge

Many TypeScript projects have two types of tests:

1. **Unit tests** (vitest) - test internal functions and modules
2. **CLI/integration tests** (tryscript, subprocess) - test the built CLI binary

Both should contribute to a single coverage report.

### Recommended Solution: tryscript coverage command

The `tryscript coverage` command wraps multiple commands and merges their V8 coverage:

```bash
# Install dependencies
pnpm add -D c8 monocart-coverage-reports

# Run merged coverage
tryscript coverage --monocart \
  "pnpm vitest run" \
  "node dist/bin.mjs run 'tests/**/*.tryscript.md'"
```

**How it works:**

1. Creates a temporary directory for V8 coverage files
2. Sets `NODE_V8_COVERAGE` environment variable
3. Runs each command sequentially (all inherit the coverage env)
4. Shows file statistics after each command (warns if none produced)
5. Generates merged coverage report using c8/monocart

### Package.json Configuration (tryscript pattern)

```json
{
  "scripts": {
    "test": "vitest run",
    "test:self": "tsx src/bin.ts",
    "test:golden": "node dist/bin.mjs run 'tests/**/*.tryscript.md'",
    "test:coverage": "node dist/bin.mjs coverage --monocart \"pnpm vitest run\" \"node dist/bin.mjs run 'tests/**/*.tryscript.md'\""
  },
  "peerDependencies": {
    "c8": ">=10.0.0",
    "monocart-coverage-reports": ">=2.0.0"
  },
  "peerDependenciesMeta": {
    "c8": { "optional": true },
    "monocart-coverage-reports": { "optional": true }
  }
}
```

### Why Monocart?

Standard c8 uses V8's raw coverage data with `v8-to-istanbul`, which maps all source-mapped lines including non-executable ones (comments, blank lines, type declarations). Vitest uses `ast-v8-to-istanbul`, which parses the AST to identify only executable lines.

This creates significant discrepancies (documented in [Markform coverage merging research](https://github.com/jlevy/markform)):

| Metric | Standard c8 (v8-to-istanbul) | With --monocart | Vitest (ast-v8-to-istanbul) |
|--------|------------------------------|-----------------|----------------------------|
| Total lines | ~1700 (inflated ~5x) | ~460 | ~510 |
| Accuracy | ❌ Includes non-executable | ✅ ~90% match | ✅ baseline |

Monocart provides AST-aware line counting via [monocart-coverage-reports](https://github.com/cenfun/monocart-coverage-reports), producing line counts aligned with vitest.

**Why line count matters**: When merging coverage from vitest and subprocess tests, inflated line counts from c8 will skew the merged percentages. Using `--monocart` ensures both sources use comparable counting methods.

**References:**
- [monocart-coverage-reports](https://github.com/cenfun/monocart-coverage-reports)
- [c8 CLI](https://github.com/bcoe/c8)
- [v8-to-istanbul](https://github.com/istanbuljs/v8-to-istanbul) - standard converter
- [ast-v8-to-istanbul](https://www.npmjs.com/package/ast-v8-to-istanbul) - AST-aware converter used by vitest

### Debugging Coverage Issues

Use the `--verbose` flag to see coverage statistics after each command:

```bash
tryscript coverage --verbose "cmd1" "cmd2"
```

**Example output:**

```
=== Running command 1/2: pnpm vitest run ===
... (vitest output)
V8 coverage: 11 files (11 new), 8194.7 KB total

=== Running command 2/2: node dist/bin.mjs run tests/ ===
... (tryscript output)
V8 coverage: 70 files (59 new), 31671.9 KB total
```

If a command shows "0 files (0 new)", that command is not producing coverage data. This usually means:
- The command doesn't spawn Node.js processes
- The command uses a coverage provider that doesn't use NODE_V8_COVERAGE (see troubleshooting)

### Alternative: LCOV Merging

If you cannot use `tryscript coverage`, merge LCOV files manually:

```bash
# Step 1: Run vitest with coverage
vitest run --coverage

# Step 2: Run tryscript with coverage
tryscript run --coverage tests/

# Step 3: Merge LCOV files
lcov -a coverage/lcov.info -a coverage-tryscript/lcov.info -o coverage-merged/lcov.info
```

Tools for merging:
- `lcov` (Linux)
- `nyc merge`
- `istanbul-merge`

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
    fail_ci_if_error: true
```

### Fail Builds on Threshold Violations

Vitest automatically fails when thresholds are not met if configured:

```typescript
thresholds: {
  statements: 70,
  branches: 65,
  functions: 70,
  lines: 70,
}
```

## Sourcemap Requirements

**Critical**: Coverage reports map back to source files only if your build generates sourcemaps.

| Build Configuration | Coverage Report Shows |
|---------------------|----------------------|
| Sourcemaps disabled | `cli-BXvEEW6O.mjs` (34% coverage) |
| Sourcemaps enabled | `src/cli/commands/status.ts` (83% coverage) |

Enable sourcemaps in your build tool:

**tsdown / tsup:**
```typescript
export default defineConfig({
  sourcemap: true,
});
```

**esbuild:**
```typescript
build({
  sourcemap: true,
});
```

**tsc:**
```json
{
  "compilerOptions": {
    "sourceMap": true
  }
}
```

## Troubleshooting

### Command produces 0 coverage files

**Symptom:**
```
V8 coverage: 0 files (0 new), 0.0 KB total
No new coverage files from this command.
```

**Causes:**
1. Command doesn't spawn Node.js processes
2. Processes exit before coverage is written (crash, SIGKILL)
3. Using a tool that doesn't inherit NODE_V8_COVERAGE

**Solutions:**
- For non-Node commands: Use LCOV merging instead
- For crashes: Fix the underlying issue
- For tools with custom coverage: Use LCOV merging

### Coverage numbers don't match vitest

**Symptom:** CLI tests show different line counts than vitest

**Solution:** Use `--monocart` flag for AST-aware counting:

```bash
tryscript coverage --monocart "vitest run" "node dist/bin.mjs run tests/"
```

### Old vitest versions (pre-4.x)

Some older vitest versions may not write to NODE_V8_COVERAGE correctly. Upgrade to vitest 4.x+ or use LCOV merging.

## Development Workflow

### Coverage-Driven Development

1. **Identify Gaps**: Use HTML reports to visually identify untested code
2. **Prioritize Critical Paths**: Focus on high-risk, high-value code first
3. **Track Trends**: Monitor coverage over time, prevent regressions
4. **Code Review**: Require coverage reports in PR reviews

### Coverage Analysis Workflow

1. Run coverage after writing tests
2. Review HTML report for gaps
3. Write tests for uncovered code
4. Re-run coverage to verify improvement
5. Commit with confidence

## Common Pitfalls

### Don't Aim for 100% Coverage

- **Why**: Diminishing returns, can lead to brittle tests
- **Better**: Focus on meaningful coverage of critical paths
- **Target**: 80-90% is usually sufficient

### Don't Test Implementation Details

- Coverage should validate behavior, not internals
- Focus on public APIs and user-facing behavior

### Don't Ignore Branch Coverage

- TypeScript's type system creates many branches
- Union types, optional chaining, type guards all create branches
- Low branch coverage = untested error paths

### Don't Exclude Too Much

- Be selective about exclusions
- Generated code: exclude
- Utility functions: include
- Test helpers: exclude if not part of public API

## Prioritization Guidelines

### High Priority (Always Cover)

- Public API functions and methods
- Error handling paths
- Business logic and domain rules
- Security-related code
- Data validation

### Medium Priority

- Internal utilities used by multiple modules
- Configuration parsing
- Logging and monitoring code

### Lower Priority

- One-time migration scripts
- Debug utilities (development only)
- Generated code (exclude entirely)

## Test Organization

| Test Type | Pattern | Include in Coverage |
| --- | --- | --- |
| Unit | `**/*.test.ts` | Yes |
| Integration | `**/*.integration.test.ts` | Yes |
| Golden/CLI | `**/*.tryscript.md` | Yes (via tryscript coverage) |
| E2E | `**/*.e2e.test.ts` | No (exclude) |

## References

### Primary Documentation
- [Vitest Coverage Documentation](https://vitest.dev/guide/coverage.html)
- [Node.js NODE_V8_COVERAGE](https://nodejs.org/api/cli.html#node_v8_coveragedir)
- [tryscript Reference](../../tryscript-reference.md)

### Tools
- [c8 CLI](https://github.com/bcoe/c8) - V8 coverage CLI
- [monocart-coverage-reports](https://github.com/cenfun/monocart-coverage-reports) - AST-aware coverage
- [v8-to-istanbul](https://github.com/istanbuljs/v8-to-istanbul) - Standard V8→Istanbul converter
- [ast-v8-to-istanbul](https://www.npmjs.com/package/ast-v8-to-istanbul) - AST-aware converter (used by vitest)
- [@vitest/coverage-v8](https://github.com/vitest-dev/vitest/tree/main/packages/coverage-v8) - Vitest V8 provider

### Related Research
- [Vitest PR #2786 - Inspector-based coverage](https://github.com/vitest-dev/vitest/pull/2786) - Why vitest uses node:inspector
- [Markform coverage merging research](https://github.com/jlevy/markform/blob/main/docs/project/research/current/research-coverage-merging-cli-subprocesses.md) - Line count inflation analysis
- [V8 JavaScript Code Coverage](https://v8.dev/blog/javascript-code-coverage) - V8 coverage internals

### Best Practices
- [Code Coverage Best Practices](https://www.atlassian.com/continuous-delivery/software-testing/code-coverage)
- [Codecov Documentation](https://docs.codecov.com/)

## Changelog

### 2026-01-07 (Update 2)

- Merged findings from Markform coverage research document
- Added detailed analysis of what NODE_V8_COVERAGE actually captures (dist/ files, not src/*.ts)
- Added ASCII diagram explaining coverage flow
- Documented reconciliation between our findings and Markform research
- Added v8-to-istanbul vs ast-v8-to-istanbul explanation
- Expanded references section with categorization

### 2026-01-07

- Added NODE_V8_COVERAGE investigation proving vitest 4.x compatibility
- Added multi-source coverage section with tryscript coverage command
- Added monocart documentation and comparison table
- Added debugging and troubleshooting sections
- Added validation test results from tryscript repo

### 2025-12-23

- Initial research on vitest coverage configuration
- Basic thresholds and CI/CD integration
