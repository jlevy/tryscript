# Feature Validation: Built-in Code Coverage Support

## Purpose

This is a validation spec for the built-in code coverage support feature, which enables
tryscript users to collect code coverage from CLI subprocess execution.

**Feature Plan:** [plan-2026-01-04-builtin-coverage-support.md](plan-2026-01-04-builtin-coverage-support.md)

**GitHub Issue:** [#10](https://github.com/jlevy/tryscript/issues/10)

## Stage 4: Validation Stage

## Automated Validation (Testing Performed)

### Unit Testing

The following unit tests have been added in `tests/coverage.test.ts`:

| Test | Description |
|------|-------------|
| `resolveCoverageConfig returns defaults when no config provided` | Verifies default config values |
| `resolveCoverageConfig merges provided config with defaults` | Verifies partial config merging |
| `resolveCoverageConfig preserves all custom options` | Verifies full custom config |
| `createCoverageContext creates context with default options` | Verifies context creation |
| `createCoverageContext creates context with custom options` | Verifies custom context |
| `getCoverageEnv returns NODE_V8_COVERAGE pointing to temp dir` | Verifies env setup |
| `cleanupCoverageContext removes the temp directory` | Verifies cleanup |
| `cleanupCoverageContext handles non-existent directory gracefully` | Verifies error handling |
| `isC8Available returns true when c8 is available` | Verifies c8 detection |

**Test Results:** All 61 tests pass including 9 new coverage tests.

### Integration and End-to-End Testing

The existing CLI integration tests verify:
- Help output now includes `--coverage` flag documentation
- `--coverage-dir` and `--coverage-reporter` options are listed
- Run command still works correctly with all existing features

### Manual Testing Needed

The user should validate the following:

#### 1. Basic Coverage Collection

```bash
# Build the project first
pnpm build

# Run a simple test with coverage enabled
cd packages/tryscript
npx tryscript run --coverage tests/basic.tryscript.md

# Verify:
# - Coverage report is displayed in terminal
# - coverage-tryscript/ directory is created with HTML report
# - Open coverage-tryscript/index.html in browser to verify report
```

#### 2. Custom Output Directory

```bash
# Run with custom coverage directory
npx tryscript run --coverage --coverage-dir my-coverage tests/basic.tryscript.md

# Verify:
# - my-coverage/ directory is created (not coverage-tryscript/)
# - HTML report is in my-coverage/index.html
```

#### 3. Custom Reporters

```bash
# Run with only text reporter
npx tryscript run --coverage --coverage-reporter text tests/basic.tryscript.md

# Verify:
# - Only text output, no HTML report generated
```

#### 4. Error Handling Without c8

```bash
# Temporarily remove c8 from PATH (or use a fresh environment)
# Run with --coverage when c8 is not available

# Verify:
# - Clear error message: "Coverage requires c8. Install with: npm install -D c8"
# - Exit code is 1
```

#### 5. Help Output

```bash
npx tryscript run --help

# Verify the coverage options are documented:
# --coverage                 Enable code coverage collection (requires c8)
# --coverage-dir <dir>       Coverage output directory (default: coverage-tryscript)
# --coverage-reporter <reporter...>  Coverage reporters (default: text, html)
```

#### 6. Config File Support

Create a `tryscript.config.ts` with coverage settings:

```typescript
import { defineConfig } from 'tryscript';

export default defineConfig({
  coverage: {
    reportsDir: 'custom-cov',
    reporters: ['text', 'lcov'],
  },
});
```

Then run:
```bash
npx tryscript run --coverage tests/basic.tryscript.md

# Verify config options are used (custom-cov/ directory, lcov reporter)
```

## Open Questions

1. Should the `--coverage` flag also work with the `--update` mode? (Currently it should
   work but hasn't been explicitly tested in combination)

2. Is the default `dist/**` include pattern appropriate for most projects, or should it
   be more configurable via CLI?
